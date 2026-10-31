# Changelog

## 0.1.7-fork.6 — 2026-10-31

- **去掉重复的加号。** macOS 上左侧栏收起时，宿主会在窗口左上角挂一个 `shell.leading` 座位，里面是它自己的两个按钮：「展开侧栏」和「新建会话」（后者是圆圈里带十字的图标）。插件又把标签栏让出 160px 避开它，结果同一行出现两个加号，功能还完全一样（都调 `uiWorkspace.startSession`）。现在只隐藏宿主那个「新建会话」，保留旁边的「展开侧栏」——后者是侧栏收起时唯一的重新展开入口。
- 识别方式：宿主这两个按钮既没有 data 属性，类名又是构建哈希，所以只能认图标。新建会话图标是气泡轮廓里一个十字（`M8 5V11` / `M5 8H11`），展开侧栏是面板矩形（`M13.5 1.5H2.5…` + `M8 1.5V14.5`）。**不能按 aria-label 匹配**——那是本地化的，切语言就失效。
- 隐藏只在标签栏真的显示时生效：原生视图、禁用插件、卸载时都会把按钮还给宿主。真实 Chromium 验证：启用时宿主按钮 `display:none`、侧栏开关仍可点、插件的 `+` 仍能创建会话；禁用后宿主按钮恢复可见；重新启用后又隐藏。42 条测试全绿。
- 测试夹具补了 `outerHTML`（原来没有，图标匹配会静默匹配不到任何东西）。

## 0.1.7-fork.5 — 2026-10-31

- **修掉 fork.1 把 `+` 一起拦掉的问题。** fork.1 加的「标签要挣得」门槛原本是为了防止空会话无条件占位，但它连用户主动点 `+` 也一起拦了：点 `+` 后标签栏毫无变化，要等发出第一条消息才出现标签。现在空会话在**屏幕上的时候**就占标签，切走时若还没发过消息则自动移除；发过消息的（进入 running/pending，或不再是 blank）切走后仍保留。
- 实现上有个顺序问题：`shown()` 的判据是「是不是当前屏幕上的会话」，所以必须先采纳新的主视图（`lastMain = id`）再剪枝，否则同一趟里会用旧会话的身份去判定新 `+` 出来的空标签，把它当场剪掉。
- 真实 Chromium 三项验证：点 `+` 立刻 3→4 个标签；切到已有标签后回到 3 个（未使用的空标签退场）；发过消息的空标签切走后仍保留。41 条测试全绿，其中 5 条按新契约重写（它们失败是**正确的失败**）。

## 0.1.7-fork.4 — 2026-10-31

- **删掉插件自己的滚动记忆，交给宿主。** fork.3 把这份记忆改成「记意图」，症状修好了，但它本来就是重复的：`ui-chat` 已经把每个会话的位置存在挂载点之外的 `chatScrollPositions`（按 `sessionId`），并且在底部时存 `null`、恢复时直接 `followTail()` 落到当前底部，读历史时存语义锚点按锚点还原。插件的第二份记忆只是把它盖掉。切会话时聊天视图确实会重新挂载（`ui-renderer` 的 `StrictSessionEntry` 用 `sessionGenerationKeyOf` 做 key），位置能活下来靠的就是宿主那张表。
- 一并删除：controller 里的 `scrolls` 表和 `beforeNavigate`/`afterNavigate` 钩子、scrollport 查找、意图监听、六次有界重试链，以及断言这套行为的 12 条测试（54 → 41 条）。测试里不该留插件已经不拥有的契约。
- 验证边界：宿主这套行为是读 `app.asar` 里 `ui-chat` / `ui-conversation` / `ui-renderer` 三个包确认的，没有驱动正在运行的应用（它没开调试端口）。切标签的实际表现留待日常使用中观察。

## 0.1.7-fork.3 — 2026-10-31

- **切回会话时总是显示最新内容。** 之前切回一个在后台长过的会话，会停在旧位置，要手动往下滚。原因不是偏移量算错，而是记错了该记的东西：插件为每个会话存一个绝对的 `scrollTop`，切走时存、切回时无条件写回。这套做法只在「内容在后台没变」时成立——后台会话会继续产出，尾部往下长，写回旧像素值就停在最新消息上方（离开时 1500、后台长到 3200、切回仍写 1500，距底差 1200px）。现在记的是意图：离开时在底部（距底 ≤25px，与宿主 `ui-chat` 的 `ScrollFollow` 阈值一致）就记「跟随尾部」，切回时落到**当前**的尾部；离开时在历史中间就记具体偏移，原样还原。旧格式的数字条目仍按普通偏移还原。
- 这条也解释了为什么它像是插件引入的：宿主本来就有这套语义策略（`followingTail`，在尾部时 `chatScroll.save(null)`），插件的第二份像素记忆把它盖掉了——同一个决定有两个主人。
- 真实 Chromium 双向量过：尾部离开 → 后台 2000→3200 → 切回，尾部间隙 0.5px；中间离开（top 400）→ 后台 2000→5043 → 切回，仍是 400。只验前者会把反向 bug（读历史时被拽到底部）放进来。
- 54 条测试全绿；两条新回归在旧实现上会失败。

## 0.1.7-fork.2 — 2026-10-31

- **底部面板图标的旋转找回来了。** 顶栏右侧那两个代理按钮，右边那个（打开右侧边栏）一直正常，左边那个（打开底部面板）显示成一个侧躺的左侧栏图标——正是本插件启用后才出现的差别。原因不在 CSS，而在克隆：`dsh-better-sidebar` 画底部开关时，把共用的左侧栏 `svg` 套在一个 span 里，把 `rotate(-90deg)` 写在那个 span 的 inline style 上（React 不能把 transform 直接放到 svg 上）。代理按钮当初只克隆了 `svg`，这层包装连同样式一起丢掉了。右侧那个没事，是因为它的镜像 `scaleX(-1)` 写在 svg 自己的 class 上，克隆 svg 就带走了。现在改成克隆「等于 svg 或包着 svg」的那个子节点，整棵带样式一起走。
- 顺带把代理按钮的尺寸规则收窄成直接子元素（`>svg`）：包装层自己声明 15px，原来的 `… svg{width:16px}` 会把里面那个 16px 的 svg 塞进 15px 的盒子。
- 测试夹具的 `cloneNode` 现在复制 inline `style`（真实 `cloneNode` 本来就会），否则「克隆保住了旋转」根本无从断言。新增一条回归：只克隆 svg 时它会失败。52 条测试全绿。
- 真实 Chromium 复核：原生包装层与代理包装层都是 `rotate(-90deg)` → `matrix(0,-1,1,0,0,0)`，而只克隆 svg 时 computed 为 `none`。

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
