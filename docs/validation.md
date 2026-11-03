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

## Scroll-restoration correction and macOS check (0.1.5) — superseded

> The scroll memory described in this section was removed in 0.1.7-fork.4; the host owns
> session scroll position itself (see "Fork: scroll memory removed" below). The checks are
> kept as a record of what was verified at the time.

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

## Fork: deleting the current session (0.1.7-fork.8)

Deleting the session on screen goes through `dsh-session-manager`, which calls `uiWorkspace.clearMain()` after a successful delete. That drops the `mainView` retention, so `current(list)` returns `null` while the host still renders an empty 新会话 page. The strip had two problems at once: `sync` bailed out because there was no current session, and `lastMain` still pointed at the deleted id — so the row neither added nor pruned anything, and closing/arrow-key logic kept targeting a session that no longer existed.

Both are fixed in `sync`:

- When `!id && lastMain && !list.byId[lastMain]`, the stale selection is cleared first.
- Then the plugin asks the host for a real blank (`startBlank`), so the row and the page agree: the strip selects a tab and the host renders the same draft, instead of a page with no session behind it.

`startSession` publishes the new session list synchronously and re-enters `sync`, so `pendingNew` guards the call: without it a single delete would chain several blanks.

Measured in a real Chromium against the real bundle, deleting the active session `a`:

```
before: ids ["a","b","c"]   active a
after:  ids ["b","c","blank1"]   active blank1 (blank === true)   tabs 3
```

`DELETED_SESSION_NOT_SELECTED`, `FRESH_BLANK_HAS_TAB` and `NO_CASCADE` all hold. All 44 tests pass; the regression fails against the previous behaviour, where `active` stayed on the deleted id.

## Fork: the seat glyph keeps its square box (0.1.7-fork.10)

Reported as "after I deleted a session, the icons in the top-left corner overlap". The overlap is not between two controls: the seat's sidebar-toggle glyph had grown taller than wide, and its top edge climbed into the active tab's 16px corner arc, so the two shapes read as one smeared mark. Deleting the session on screen has no bearing on it — the strip replaces the sessionless page with a real blank (fork.8), and that fresh tab's corner arc is what the oversized glyph then ran into.

The seat belongs to the frame, but its glyph is a plain svg inside a 28px flex button with no size rule of its own. Anything that forces `height:auto` (a theme's blanket svg rule, a larger inherited font size) leaves the intrinsic 16x16 box to the flex line, which stretches it vertically. The plugin now pins the box:

```css
html:has([data-dsh-session-tabs-column]) [data-shell-leading] button>svg{
  width:16px;height:16px!important;flex:0 0 auto}
```

`:has()` is the gate rather than a class on the host, because the seat is a child of the frame, not of the strip: the selector has to read the strip's marker from an ancestor. The marker `data-dsh-session-tabs-column` is written exactly while the strip is on screen and removed on disposal, so native mode keeps the host's own metrics and no other plugin's icon in the same seat is resized.

Measured in a real Chromium (Edge headless, CDP, macOS frame forced with `data-platform=darwin`, real bundle loaded):

```
baseline:                 glyph 16x16 at x94 y17   seat right 116   first tab x128   gap 18px
hostile theme rule:       width:auto;height:auto;flex:1 1 auto        -> still 16x16, unmoved
hostile !important:       height:auto!important;flex:1 1 auto          -> still 16x16, unmoved
```

The seat holds exactly two svgs (toggle and New Session); the New Session one is `display:none` from the fork.6 suppression, so no second icon is painted there. All 50 tests pass. The new regression asserts the `:has()` gate, the pinned box and the `flex:0 0 auto`; deleting the rule makes it fail, and the gate's disposal half fails if the marker is left behind.

Acceptance note: the installed desktop app exposes no debug port, so the GUI measurements above ran against the live web seam (`127.0.0.1:60535`) in a separate headless browser. The auth cookie was read from the desktop profile and used once per probe; it was not written to the repository.

## Fork: leading inset follows the seat (0.1.7-fork.7)

Hiding the host's duplicate New Session button left the strip padding at the host's fixed `--dsh-frame-leading-clearance` (160px, 84px fullscreen), which measures the seat's whole band including the button that is now hidden — hence a visible gap. The strip now derives its own `--dsst-leading` from the seat's live geometry (`seat.right - frame.left`) and its padding rule prefers it:

```css
padding-inline-start: var(--dsst-leading, var(--dsh-frame-leading-clearance, 0px))
```

The override is applied only while the strip is the thing on screen. Native mode and a disabled plugin drop it, because leaving it behind would quietly shrink the reservation the host made for its own controls. The seat is also added to the ResizeObserver: its width animates with the sidebar, and a stale inset would show as a gap that grows and shrinks on its own.

Measured in a real Chromium with the seat in its native shape and the real bundle loaded:

```
strip enabled:    seatWidth 32   padding-inline-start 112px  (--dsst-leading 112px)
strip disabled:   seatWidth 72   padding-inline-start 0px    (override removed)
strip re-enabled: seatWidth 32   padding-inline-start 112px
```

All 43 tests pass. The new regression asserts the inset comes from the seat rather than the fixed 160px; it fails if the measurement is dropped. The mock fixture's `style` became a CSSOM proxy and `cloneNode` copies inline properties explicitly — a bare object threw on `setProperty`, and `{...style}` could not see the properties stored inside the proxy.

## Fork: duplicate `+` suppressed (0.1.7-fork.6)

On macOS with the sidebar collapsed, `ui-layout` mounts the frame's `shell.leading` seat (`darwin && sidebarCollapsed`) at `top:11px; left:88px`, and `ui-sidebar`'s `HeaderLeadingControls` occupies it with two buttons: sidebar-toggle and New Session. The strip pads itself by the published `--dsh-frame-leading-clearance` (160px) so it clears that seat — which put the host's New Session button and the strip's own `+` in the same row, both calling `uiWorkspace.startSession()`.

The plugin now hides only the host's New Session button and leaves the sidebar toggle alone, since that toggle is the only way to reopen a collapsed sidebar.

Identification is by glyph, because neither button carries a data attribute and both class names are build-hashed:

```
New Session    IconNewChatOutlineRegular  bubble outline + M8 5V11 / M5 8H11
Sidebar toggle IconPanelLeftOutlineRegular panel rect     + M8 1.5V14.5
```

Matching on `aria-label` was rejected: the label is localized (`新建会话` / `New session`) and would break on a language switch.

Measured in a real Chromium with the seat mounted in its native shape and the real bundle loaded:

```
strip enabled:      hostNewHidden true   hostNewVisible none    toggleVisible block  stripPlus flex
strip disabled:     hostNewHidden false  hostNewVisible block   toggleVisible block
strip re-enabled:   hostNewHidden true   hostNewVisible none    toggleVisible block
strip + clicked:    uiWorkspace.startSession calls = 1
```

Native mode, disabling the plugin and disposal all restore the host button. All 42 tests pass, including a new regression that fails if the suppression matches the toggle instead of the duplicate. The mock fixture gained `outerHTML`; without it the glyph match silently found nothing.

## Fork: `+` earns a tab again (0.1.7-fork.5)

The 0.1.7-fork.1 rule ("a tab is earned, not granted") was right about automatic blank tabs and wrong about the explicit `+`. It hid the fresh 新会话 tab too, so pressing `+` looked like a no-op until the first message was sent. `shown()` now also accepts the blank while it is the session on screen:

```js
if (id === lastMain) return true;   // the reader pressed `+`, so this blank is wanted
```

Two ordering consequences, both load-bearing:

- `sync()` must adopt the new main view (`lastMain = id`) *before* pruning, because `shown()` reads `lastMain`. Pruning first judged the fresh blank against the session it replaced and retired it in the same pass that created it.
- An unused blank is retired when the reader switches away; a blank that produced work (`running`/`pending`, or no longer `blank`) keeps its tab.

Verified in a real Chromium against the real bundle, with a `startSession` stub that mirrors the host (connect a blank, then navigate to it):

```
at rest:                      ids ["a","b","c"]
after +:                      ids ["a","b","c","blank1"]   active blank1
after switching to b:         ids ["a","b","c"]            blank1 retired
worked blank, switch away:    ids ["a","b","c","blank2"]   blank2 kept
```

All 41 tests pass. Five assertions were rewritten to the new contract — they failed first, which is the correct failure, not a regression to work around.

## Fork: scroll memory removed (0.1.7-fork.4)

The plugin's own scroll memory is gone. It was a second, pixel-based memory layered on top of the host's semantic policy, and it caused the "returning to a session shows an old position instead of the newest message" report: a background session keeps growing, so the remembered absolute `scrollTop` lands above the newest message.

The host already handles this correctly on its own, which the removed code was masking:

- A session switch remounts the chat view — `StrictSessionEntry` keys the subtree by `sessionGenerationKeyOf(binding)`, so component-local state does not survive a switch.
- `ui-chat` keeps `chatScrollPositions` (a `Map` keyed by `sessionId`) outside the remounted subtree, so the position survives.
- What it stores is intent, not a coordinate: at the tail it saves `null`, and `ChatReading.restore()` with `saved === null` calls `followTail()`, landing on the *current* tail. Reading history stores a semantic anchor (`capturePosition()`), which is restored by anchor rather than by offset, so content growth does not move the reader.

Removed with it: the `scrolls` map and the `beforeNavigate`/`afterNavigate` hooks in the controller, the scrollport lookup, the intent listeners, the bounded retry chain, and the 12 tests that asserted that behaviour. Tests went from 54 to 41; the suite is green and no longer claims a scroll contract the plugin does not own.

What this does not cover: the host behaviour above was established by reading the shipped bundles in `app.asar` (`ui-chat`, `ui-conversation`, `ui-renderer`), not by driving the user's running app, which exposes no debug port. Tab switching was left to be observed in normal use.


## Fork: start-up sidebar collapse (0.1.7-fork.9)

The host keeps the left column's width in memory only: `ui-layout`'s store `init` hard-codes `sidebar: 280`, and its README lists "panel geometry is transient state — a reload restores the sidebar defaults" as a known limitation. There is no setting for it. The only lever the layout service exposes is `ctx.layout.toggleSidebar()`, a blind toggle with no direction argument and no readable state, so the plugin cannot ask the host whether the column is open.

The decision therefore comes from the DOM. `AppFrame` publishes `data-sidebar-collapsed` on its grid container whenever the column is shut (on narrow viewports that means "rail not expanded"), and leaves it off otherwise, so the attribute's presence is a truthful "currently collapsed" signal. Two consequences shape the implementation:

- **Absent frame ≠ expanded.** React commits the frame in the same pass that mounts the plugin, but a boot that measures before it lands sees no frame at all. Treating that as "expanded" would spend a toggle on a column nobody had seen. The boot retry polls every 50 ms for up to 40 rounds and stops on dispose; a detached frame (`isConnected === false`) counts as absent for the same reason.
- **Once per page load, marked on `window`.** The "already decided" flag is `window.__dshSessionTabsBootCollapsed`, not module or install scope. A live patch reload re-evaluates the whole bundle — module scope resets — and an install-scoped flag would also reset. Either would let the second pass collapse a column the reader had already opened by hand. The marker is deliberately left behind on dispose: the claim it records is about this page load, not about this fiber.

Verified in real Chromium (Edge headless, real DOM, CDP-driven) rather than only in the mock DOM. The harness mounted the actual `lib/client.js` against a frame that models the host's toggle by flipping the marker, and asserted: with the preference on, boot calls `toggleSidebar` exactly once, `data-sidebar-collapsed` is present afterwards, one strip and one stylesheet, and no console exceptions; a page reload calls it once again (the host has forgotten the width, so the column genuinely starts open); with the preference off, it is never called and the column stays expanded. All 49 actual-bundle tests pass.

The fixture gained three things the contract needs: `frame` exposed, `layout.toggleSidebar` on the mock service, and `localStorage` always wired to the fixture's map. That last one was a real hole — it used to be stubbed only when a test seeded tabs, so a preference write was silently discarded and the assertion would have passed against a no-op.

What this does not cover: the user's running desktop app exposes no debug port and its Web GUI answered `dsh web authentication required`, so acceptance was done in an isolated Chromium copy of the same page structure, not in the installed application. The marker name (`data-sidebar-collapsed`) and the "absent means expanded" reading are host implementation details, not a public contract; a host upgrade that renames or inverts it would need a plugin update.

## Limits

The center strip uses the stable `data-slot="main"` hook because DSH has no dedicated public tab-strip slot. Host layout/API changes can require a plugin update. All panels continue using native controls; missing optional native controls remain unavailable.

The existing `dsh-better-sidebar` desktop combination has a separately observed `ws://app/sidebar/ws/agent-opens` compatibility issue under `dsh-app://app/`. It also occurred without this tab plugin and was not repaired here. Do not infer full compatibility with every third-party desktop combination from the isolated checks.

Dark-theme CSS is implemented but was not separately GUI-accepted in this release. Tab switching still depends on native session loading, and visited session bindings retain memory. No unlimited-tab, fixed-memory, persistent-draft-across-restart or uniform-latency guarantee is made.

---

中文：本版本已通过真实产物测试、独立 Web 与 Electron 界面验收；右栏动画期间固定保留打开入口位置，避免底部按钮挤入点击目标。公开截图只含合成数据。CI 的跨平台测试不等于所有系统均经过 GUI 验收。宿主升级、第三方插件组合、暗色界面与大规模标签使用仍需按上述边界判断。
