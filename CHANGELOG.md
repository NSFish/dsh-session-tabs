# Changelog

## 0.1.7-fork.1 — 2026-10-31

个人 fork，针对两处日常手感问题：

- **空白新会话不再占标签。** 之前任何成为主视图的会话都会无条件入列，包括 `blank` 的空新会话——点一次 `＋` 就多一个永远没用、也永远走不掉的标签。现在标签要「挣得」：空会话只在发出第一条消息（进入运行中或待确认）后才出现，`＋` 只是取消选中。被放弃的空会话不会复活，已持久化的旧空标签也会在下一次 sync 时清掉。同时修了由此暴露的保留/释放回环：屏幕上那个空会话不再每次通知都被 retain 一次又 release 一次。
- **拖拽改成 Chrome 式浮起跟手。** 之前的问题分三层，逐个修掉：
  1. 标签上挂着 `draggable`，浏览器一按下移动就启动原生拖动并**停止派发 pointermove**，指针逻辑一个事件都收不到——手感自然和原来一模一样。去掉它，并在标签栏内主动拒绝 `dragstart`，防止上游再挂回来。
  2. 画面更新要等 16 ms 的合并渲染。改成拖到新位置时先同步搬节点、再提交状态，两者用同一个落点，不会出现「状态变了但看着没动」。
  3. 最关键的一点：被拖的标签**自己不动**，只有指针跨过另一个标签的中点时才瞬移换位——所以拖起来只看到高亮，别的什么也没有。现在被拖的标签会浮起来贴着指针走（按按下的那一点对齐，不是让左边缘吸附光标），其他标签实时让出空位；松手时浮起取消，标签落进自己撑开的空位。拖动期间临时放开列表的水平裁剪，标签拖到边缘也不会被裁掉。
  4. 拖动中激活标签底部的接缝（那条线加两侧反向圆角）现在跟着被拖的标签走，而不是停在原处或干脆隐藏。两处要点：接缝按激活标签的实时盒子绘制，浮起时那个盒子已经含了位移，所以天然跟随；但它原本会被裁剪到标签栏的滚动可视区（防止滚出视野的标签画出杂线），拖动期间必须跳过这个裁剪，否则标签一浮出边界接缝就被截住。另外拖动期间接缝只由手势代码重算——渲染、尺寸观察、滚动这些其它调用点会在「清掉位移」和「重新锚定」之间读到布局槽位而不是浮起位置，把接缝拽回空位。顺带修了滚动监听把事件对象当成 `force` 参数传进去的隐患。
  5. 拖动结束后激活标签底部的接缝（那条线和两侧反向圆角）会停在错位的地方，要等下一次无关渲染（比如切 tab）才恢复。原因：接缝是按激活标签的屏幕坐标算的，而拖动时标签被 `translateX` 位移过，松手清掉位移后没有重算。现在拖动期间直接隐藏接缝（浮起的标签本来就不在原位，量出来一定是错的），松手先清手势状态再重算，并在下一帧再补一次（清 transform 要等下一次布局才生效）。
  5. 拖动中的标签不再有任何高亮：既没有浮起阴影，也没有悬停底色。悬停底色这条尤其要紧——指针整个手势都压在标签上，那条 `:hover` 规则会让它从按下亮到松手；现在拖动期间把它的 `::before` 关掉。反馈只保留「标签跟着指针走」本身。
  6. 换位的判定基准错了两轮，最后才定下来：先拿**指针**比邻居中点（按得靠右时要拖过头才动），再改成**标签中心比邻居中心**——但等宽标签下中心对中心和「整块压上去」是同一个位置，所以看起来仍然要整块越过去。最终改成**前缘到达邻居中线**（也就是半个邻居被盖住）就换位：向右拖用右边缘，向左拖用左边缘，双向对称。抓取点在按下那一刻记下，快速拖动也不会算错。
- 测试从 43 条增到 46 条：新增空会话入列、保留不抖动、指针拖动三条回归；四条旧断言按新行为改写。`node --test test/verify.mjs` 全绿。

## 0.1.6 — 2026-10-15

- Fix a renderer-freezing MutationObserver feedback loop when a global page such as the plugin manager unmounts the chat view.
- Change the strip hidden attribute only when needed, release the detached chat-body reference in native/global views, and ignore self-generated mutations during synchronous remount detection.
- Add a regression that models native hidden-attribute notifications. All 43 tests pass, and four plugin-manager/chat round trips remain responsive in an isolated Intel macOS Desktop.

## 0.1.5 — 2026-10-14

- Windows acceptance pass: fix dev tooling so the isolated profile and real-UI checks run without
  admin rights (symlink → junction fallback), with hoisted npm layouts (nearest `@deepseek-ai`
  scope detection), and without an explicit `--chrome` flag (Windows Chrome/Edge path probing).
- Tab switching no longer retains the target session on the click path: the synchronous
  `retainedBy` publish re-rendered the whole sidebar during the native navigation. The
  background-keepalive reference is still taken, once navigation has settled. Measured on
  Windows: six alternating switches dropped from 5 frame gaps > 32 ms and a 55 ms long task to
  zero gaps and zero long tasks.
- Re-mark the flexed conversation body synchronously when React swaps the conversation tree.
  Previously the override was missing until the next coalesced refresh (≥ 16 ms), which let the
  strip push the composer below the fold in new or switched sessions — visible on slower
  Windows layouts. Measured: 0 of 73 samples missing the override, previously 1 per switch.
- Restore the remembered scroll position with bounded retries while the transcript height is
  still settling, instead of a single 100 ms shot that could clamp and then visibly jump.
- Yield scroll restoration immediately to transcript wheel, touch, pointer and scrolling-key
  input, including input before the first attempt. Keep composer/IME input independent, ignore
  hidden or different-session scrollports, and clean up retries/listeners on navigation or disposal.
- Keep retrying briefly when history remains temporarily short, stop once the saved position is
  reached, and add deterministic timed regressions plus an isolated macOS Desktop input check.
- Relax the panel-relay assertion timing in the real-UI check (Windows sidebar animations settle
  slower than 200 ms).

## 0.1.4 — 2026-10-14

- Prepare the first public GitHub/npm release with MIT licensing, bilingual install instructions, native-UI validation notes and a synthetic screenshot. Keep local evidence out of public distributions.
- Reserve the right opener's toolbar slot throughout sidebar animations, so the bottom-workbench button cannot move into its click target.
- During a native opener remount gap, show a disabled placeholder in the reserved slot; restore forwarding when the foreground native control is ready.
- Track native panel attributes immediately, prioritize active-session panel state, and ignore hidden retained headers.
- Match both buttons to 28px native targets and one center line; preserve the bottom icon's native 16px size and the right icon's 15px size.
- Add delayed-handoff and hidden-source regression cases, plus frame sampling and repeated-click real UI checks.

## 0.1.3 — 2026-10-14

- Replace the text-glyph view switch with the selected window-shaped line icon and expose its pressed state.
- Hide the center right-sidebar proxy while the sidebar is expanded; keep only the original collapse control at the window's right edge.
- Match the right opener to native sizing: 28px button and 15px icon. Preserve native control ownership and restore the opener after collapse.
- Add a regression case for open/collapse/reopen transitions and focused real-UI verification.

## 0.1.2 — 2026-10-13

- Apply the approved Obsidian-style connected tabs: bright active surface, darker strip, shared inactive hover background, and curved lower joins outside the scrolling list.
- Remove the tab options button; align vector new/close icons, hide idle indicators, and retain native sidebar/panel navigation.
- Keep the native-view footer entry; preserve reopening via Cmd/Ctrl + Shift + T scoped to the tab strip, with IME guarding.
- Retain existing DOM reuse and coalesced updates. No new end-to-end performance guarantee or daily-profile installation.

## 0.1.1 — 2026-10-13

- Place new/options controls immediately after the tabs, with workbench/right-sidebar controls at the row's right edge.
- Relay native panel clicks and copy native icons/state without moving React-managed controls; restore originals in native view and on disposal.
- Reuse tab DOM by identity, remove the fixed delay from direct actions, coalesce background notifications and storage writes.
- Add regression checks for DOM/focus preservation and panel-control delegation, plus real GUI latency observations.
- Keep delivery in the isolated test profile; overall latency remains variable and the previously recorded desktop better-sidebar limitation remains.

## 0.1.0 — 2026-10-13

- Add a single-client native center tab strip, without iframe or sidebar replacement.
- Native navigation, new/close/reopen, reorder, localized status and native-view toggle.
- Preserve visited native session bindings for drafts; closed busy tabs continue until idle.
- Restore lightweight tab IDs; guard bad storage, IME, cross-window focus and cleanup.
- Add real-bundle controller/DOM tests and isolated profile with a local delayed streaming model.
- Local delivery only; no daily profile installation or public publication.
