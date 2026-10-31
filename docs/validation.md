# Validation and compatibility / 验证范围

## Global-page freeze fix (0.1.6)

Version 0.1.6 was checked on 2026-10-15 against DSH 0.2.0-rc.2. It fixes the 0.1.5 tab-strip observer repeatedly remounting a detached chat body when a global page opens. Reassigning the same native hidden attribute can still queue a mutation, so the old feedback loop could prevent the entire renderer from handling input or timers.

The corrected runtime changes hidden state only when necessary, clears the chat-body reference while a global/native view owns the center, and excludes its own mutations from synchronous remount detection. The new regression queues native-style hidden mutations: the 0.1.5 bundle fails; the fix settles and returns to chat correctly. All 43 actual-bundle tests pass.

An isolated Intel macOS Electron copy loaded the corrected runtime and completed four plugin-manager/chat round trips. The plugin list loaded, a 25 ms heartbeat continued, and returning to chat restored the strip and body marker. The diagnostic mutation safety cap was never reached. The runtime bytes match the locally accepted repair. Private profiles, screenshots, logs and credentials are excluded from publication.

The 0.1.5 results below remain historical compatibility evidence; Windows performance figures are contributor-reported and were not remeasured for this fix.

Version 0.1.5 targets DSH 0.2.0-rc.2. Windows results below were supplied by the PR contributor on 2026-10-14 (win32 x64, real Electron desktop plus an isolated Web profile). The maintainer checked the corrected bundle on an isolated Intel macOS Electron copy on 2026-10-15. Daily profiles and the installed application were not modified.

## Contributor-reported Windows acceptance (0.1.5)

- The isolated Web profile ran the full `--tabs-ui-check` pass, and frame/long-task sampling around tab switches: six alternating switches produced 0 frame gaps above 32 ms and 0 long tasks (0.1.4 on the same machine: 5 gaps and one 55 ms long task).
- During session creation and tab switches, the flexed conversation body stayed marked in 73 of 73 samples (0.1.4 lost the override for one frame per remount, which let the strip push the composer below the fold).
- The real Electron desktop (win32, 40 px custom titlebar, `data-windows-titlebar`) rendered one strip at the expected position with a fully visible composer and zero plugin console errors.
- Install/uninstall was exercised on a byte-for-byte copy of a real desktop profile: after removal the profile directory hashes matched the baseline, `package.json` was byte-identical, `cordis*.yml` were untouched and no `node_modules` residue remained.

## Automated checks

The tests load the actual `lib/client.js` factory with a minimal DOM fixture. They cover loader metadata, lifecycle cleanup, native navigation, draft ownership, closed busy-session retention, storage parsing, cross-window focus, native-view fallback, DOM reuse, panel delegation, hidden retained session headers and delayed native-opener handoffs. Run:

```sh
node --test test/verify.mjs
```

CI runs this suite on Ubuntu, Windows and macOS with Node 22 and 24. This matrix checks plugin logic; it does not imply GUI acceptance on every operating system.

## Scroll-restoration correction and macOS check (0.1.5)

- All 42 tests pass locally, including a clamped first attempt followed by temporarily unchanged history height and later content growth. Virtual time advances through individual retries rather than flushing all timers before the content changes.
- Wheel, touch, pointer and scrolling-key input cancel restoration before its first attempt or between retries. Composer/IME input is excluded; width-control wheel forwarding is included. Unobserved scroll-position changes also stop retries.
- Restoration uses only a foreground scrollport belonging to the selected session. Remounted chat regions acquire fresh listeners, and navigation, native mode and disposal remove pending work and listeners. Retry work ends after at most six attempts (about 1.9 seconds).
- The isolated Mac Desktop loaded the corrected runtime and passed tab/native-view switching, right-sidebar open/collapse, equal native/proxy control dimensions, one strip, one native main view, no iframe, and visible-composer checks.
- With synthetic long content in that Desktop copy, a native wheel event after returning to a tab moved the transcript to a new position. The position remained unchanged after the full retry window. No model request was needed for this check.
- The contributor's Windows performance figures were not independently remeasured on macOS. These checks establish the scroll correction and native layout compatibility, not a uniform tab-switch latency guarantee.

## Real UI

- An isolated Web profile used synthetic sessions and a local delayed-streaming model to check tab switching, independent background work, close/reopen behavior and native sidebar preservation.
- For the 0.1.4 fix, the Web profile also loaded `dsh-better-sidebar` to compare its original bottom-workbench control with the top-row proxy. Both use a 28px target and a 16px bottom icon, aligned with the native 28px right-sidebar control and its 15px icon.
- Repeated open/collapse clicks during three animation cycles produced 253 sampled frames with no bottom/right target overlap or bottom-workbench misclick. The temporarily disabled remount placeholder is covered separately by the delayed-handoff regression test.
- An isolated Electron copy checked native/tab view switching, opening and collapsing the right sidebar, and identical open/collapse control coordinates and dimensions. It loaded the native right sidebar and this plugin; bottom-workbench verification used the Web combination above.
- Both environments retained one native main view, one tab strip and no iframe. The public image is a crop of the real Web UI with synthetic session names. Private profiles, recordings, authentication URLs and raw evidence stay outside the public source and npm package.

## Fork: pointer drag and blank-session tabs (0.1.7-fork.1)

The drag gesture was rebuilt on 2026-10-31 against a personal macOS desktop install of DSH 0.2.1-rc.5 (Chromium 156). Two behaviours changed, both verified in a real browser rather than only in the mock DOM:

- A dragged tab now floats under the pointer instead of sitting still until it crosses a midpoint. Measured by sampling the DOM order and the tab's on-screen box every 20 px: the tab's left edge tracked the pointer throughout, and the swap fired when its leading edge reached the neighbour's centre (a 60 px drag for equal-width tabs), not after a full tab-width.
- A blank 新会话 no longer earns a tab. Only a session that is running or awaiting interaction appears; the persisted list is pruned of stale blanks on the next sync.

Real-browser checks covered four invariants: live following, the half-covered swap threshold, no highlight during the gesture (no lift shadow, no hover fill), and the active-tab join tracking the dragged tab (`joinLeft === cellLeft` at every sample) and staying aligned after release. Reverse dragging unwinds the order symmetrically. All 51 actual-bundle tests pass; the four earlier assertions that hard-coded "`+` adds a tab" were rewritten to the new contract.

The gesture needs no native `draggable`: leaving it on hands the pointer to the browser's HTML5 drag, which stops delivering `pointermove`. See [lessons-drag-reorder.md](lessons-drag-reorder.md) for the traps, the diagnostic order, and the acceptance checklist.

## Fork: bottom-panel proxy glyph (0.1.7-fork.2)

The proxy for the bottom-panel toggle lost its rotation, showing a sideways left-panel mark while the right opener looked correct. Cause: `dsh-better-sidebar` renders the bottom toggle as the shared left-panel `svg` wrapped in a span whose inline style carries `rotate(-90deg)` (React cannot put a transform on the svg itself), and the proxy cloned only the `svg`. The right opener survived because its mirroring is a `scaleX(-1)` class on the svg itself.

The proxy now clones the first child that is, or contains, the svg — i.e. the styled container. Verified in a real Chromium against a page that injects the natives in their native shape:

```
native wrapper: inline transform rotate(-90deg)  computed matrix(0,-1,1,0,0,0)
proxy  wrapper: inline transform rotate(-90deg)  computed matrix(0,-1,1,0,0,0)
bare svg clone: inline transform ''               computed none   (the old behaviour)
```

The proxy's own size rule was narrowed to `>svg` so the 16px svg inside a 15px wrapper is no longer inflated by the proxy's button rule. The mock fixture's `cloneNode` now copies `style`, because the real one does — without it the regression could not be asserted. All 52 tests pass, including a new one that fails when only the svg is cloned.


## Limits

The center strip uses the stable `data-slot="main"` hook because DSH has no dedicated public tab-strip slot. Host layout/API changes can require a plugin update. All panels continue using native controls; missing optional native controls remain unavailable.

The existing `dsh-better-sidebar` desktop combination has a separately observed `ws://app/sidebar/ws/agent-opens` compatibility issue under `dsh-app://app/`. It also occurred without this tab plugin and was not repaired here. Do not infer full compatibility with every third-party desktop combination from the isolated checks.

Dark-theme CSS is implemented but was not separately GUI-accepted in this release. Tab switching still depends on native session loading, and visited session bindings retain memory. No unlimited-tab, fixed-memory, persistent-draft-across-restart or uniform-latency guarantee is made.

---

中文：本版本已通过真实产物测试、独立 Web 与 Electron 界面验收；右栏动画期间固定保留打开入口位置，避免底部按钮挤入点击目标。公开截图只含合成数据。CI 的跨平台测试不等于所有系统均经过 GUI 验收。宿主升级、第三方插件组合、暗色界面与大规模标签使用仍需按上述边界判断。
