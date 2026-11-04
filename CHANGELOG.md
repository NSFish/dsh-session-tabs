# Changelog

## 0.1.7-fork.11 — 2026-11-04

- **红绿灯右边多出的「底部面板」图标，根因找到并修复。** 插件隐藏宿主「打开右侧栏」按钮用的是 `display:none`（`data-dsh-session-tabs-native-hidden`），而 `dsh-better-sidebar` 的空白会话备用开关（dock-fallback）靠量这个按钮的 rect 定位——隐藏元素量出 0×0，坐标算成负数，触发 macOS 下限，按钮被钉到硬编码的 `(left=88, top=4)`，正好落在红绿灯右边。用交通灯反推截图里图标的位置 `(94.8, 10.8)`，与预测的图标墨迹位置 `(95.5, 11.5)` 差不到 1px；并在隔离 profile（Edge headless + CDP + 真实 `dsh-better-sidebar`）里复现了完整链条：锚点 rect 全 0 → fallback 落 `(4,4)`（headless 无桌面壳，`data-platform` 缺失时下限为 4；真实桌面壳为 88）。
- 修复：给「活着的」右打开按钮（前景、且面板未报告打开）改挂新属性 `data-dsh-session-tabs-native-ghost`——`visibility:hidden` + `pointer-events:none`：画不出来、点不到，但**仍参与布局**，rect 保持真实，better-sidebar 量到正确坐标后把备用开关放回右上角原位。失效的打开按钮（面板已报告打开，此时角落锚点是原生收起按钮、dock 也不渲染）维持 `display:none` 不变；底部面板按钮与宿主「新建会话 +」也维持真隐藏——加号一旦改成占位，fork.7 修过的「标签条左侧多出一块空白」就会回来。
- 隔离 profile 端到端验证：fallback 从 `(4,4)` 回到 `(1348,58)`（锚点 `1384-8-28`，与宿主角落按钮对齐）；点标签条右侧栏按钮 → 面板正常打开、dock 消失；再点收起 → dock 回到原位；ghost 元素 `visibility:hidden`、`pointer-events:none`、命中测试不返回它。50 条测试全绿，新增回归断言「活锚点必须 ghost 而非 display:none」「面板打开后 ghost 撤销」「dispose 释放 ghost」。
- 「删标签栏左侧加号导致此 bug」的记忆经查不成立：隐藏锚点的代码从最初版本 `b36a9ac` 就在，git 里删的是窗口座位（红绿灯右侧）里宿主的「新建会话 +」，与标签栏加号不在一处。此现象只在**空白会话 + 右面板收起 + 标签条接管标题栏**三者同时成立时出现，之前大概率一直存在，只是很少在这个状态下看左上角。

## 0.1.7-fork.10 — 2026-11-03

- **左上角图标「重叠」不是两个控件打架。** 那个位置在 macOS 侧栏收起时是宿主的窗口座位（`shell.leading`），里面只有「打开侧边栏」一个按钮（「新建会话」已被 fork.6 隐藏）。真正的问题是那个图标被拉成了竖长方形：它的上边缘顶进了激活标签 16px 的左上圆角弧线里，两个形状糊在一起，看着像叠了。跟「删会话」没有因果关系——删掉当前会话后插件按 fork.8 补一个空白会话，新标签的左圆角正好落在被拉长的图标右边。
- 根因是宿主没给座位里的 svg 定尺寸：它在一个 28px 的 flex 按钮里，谁要是写了 `svg{height:auto}`（主题的全局 svg 规则、或更大的继承字号），16×16 的本征盒子就交给 flex 去拉伸，纵向被撑开。现在把盒子钉死：`width:16px;height:16px!important;flex:0 0 auto`。
- 选择器用 `:has([data-dsh-session-tabs-column])` 当门，而不是往宿主上挂类名：座位是框架的子节点、不是标签条的子节点，只能从祖先读标签条的标记。这个标记只在标签条接管这一行时存在、卸载时移除，所以原生模式下宿主的尺寸完全不受影响，同一座位里其他插件的图标也不会被改。
- 真实 Chromium（Edge headless + CDP，强制 `data-platform=darwin`，加载真实产物）验证：基线 16×16 @ x94 y17，座位右边缘 116、首标签 128，间隙 18px；注入模拟主题的 `height:auto!important;flex:1 1 auto` 后仍是 16×16、位置不动。50 条测试全绿，新增回归断言 `:has()` 门、钉死的盒子与 `flex:0 0 auto`；把规则删掉测试就红。

## 0.1.7-fork.9 — 2026-11-01

- **启动时默认收起左侧栏。** 宿主的左栏宽度只存在内存里（`ui-layout` 的 store `init` 写死 `sidebar: 280`），刷新就重置，而且没有任何设置项能改——它对外只暴露一个 `ctx.layout.toggleSidebar()`，是「盲切换」，既不能指定方向也读不到状态。所以这件事只能由插件在启动时做一次。
- 新增偏好 `dsh-session-tabs.prefs.v1`（独立 key，不与标签列表混存：一个是「窗口怎么开」，一个是「记住哪些会话」，坏掉互不牵连），字段 `collapseSidebar`，默认 `false`（保持宿主行为）。解析全程防御式：值不可用一律回落到默认，不阻塞启动。
- 判定依据是框架的 `data-sidebar-collapsed` 标记（宿主只在**收起**时打这个属性，没有就是展开），而不是靠猜。因此只在列真的开着时才消耗一次 toggle；列已经收着（窄屏、或者读者手快先点了）就什么都不做。这样即使插件被二次 apply（live patch reload / HMR），也不会把已经收起的列又翻回去。
- 框架是异步提交的，启动那一刻可能还没有它。此时**不**当作「展开」（那会盲切一次），而是按 50ms 一轮、最多 40 轮的重试等它落地；卸载时清理该定时器。「本次加载只折叠一次」的标志挂在 `window` 上（`__dshSessionTabsBootCollapsed`），既不是模块作用域也不是 install 作用域：live patch reload 会把整个 bundle 重新求值、模块作用域归零，install 作用域同样会归零，两种位置都会让第二次 apply 把读者刚打开的列又收回去。
- 侧栏底部加了一个开关（`dsh-session-tabs:boot`，紧挨原生的标签/原生视图切换），因为宿主没有对应设置项，没有这个控件的话这个偏好就只有开发者能改。打开时立即生效（收起列），关闭时只忘记意图、不动当前列。
- 真实 Chromium（Edge headless + 真实 DOM + CDP）验证：偏好开 → 启动后 `data-sidebar-collapsed` 存在、`toggleSidebar` 恰好被调 1 次、标签栏和样式各 1 份、无异常；刷新后仍然只调 1 次；偏好关 → 一次都不调、列保持展开。49 条测试全绿。
- 测试夹具补了三处：暴露 `frame`、给 `layout` 加 `toggleSidebar`、把 `localStorage` 始终接成 fixture 的 map（原来只在 seed 标签时才接，偏好写入会被静默丢弃）。

## 0.1.7-fork.8 — 2026-10-31

- **删除当前会话后，标签栏和页面对不上了。** 删除当前会话时，宿主（`dsh-session-manager`）会调 `uiWorkspace.clearMain()` 清空主视图，于是 `current(list)` 返回 `null`；但插件里 `lastMain` 仍指着那个已被删掉的 id，`sync` 又因为「没有当前会话」直接跳过更新——结果页面停在空白的「新会话」页，标签栏既不新增也不清空，而且内部还选中着一个已经不存在的会话（关标签、方向键换标签都会打向这个幽灵）。
- 现在两条一起处理：主视图消失且 `lastMain` 已不在列表里时，先把选中状态清掉；再按你选的方案自动新建一个空会话，让标签栏和页面重新对上——页面还是那个「新会话」，但这次背后真的有一个会话，标签栏选中它。
- `startSession` 会同步发布新的会话列表、重入 `sync`，所以加了 `pendingNew` 重入保护，否则一次删除会连着创建好几个空会话。真实 Chromium 验证：删掉 `a` 后标签栏是 `["b","c","blank1"]`、新空会话被选中且带标签、只创建了一个。44 条测试全绿。
- 只在「页面确实没有会话」（`!id`）时才触发；普通切换永远不会走到这个分支。

## 0.1.7-fork.7 — 2026-10-31

- **收掉隐藏加号留下的空白。** fork.6 把宿主的「新建会话」藏了，但标签栏仍然按宿主固定的 `--dsh-frame-leading-clearance`（160px）留白——那个值量的是整条座位带宽，包括已经被藏掉的按钮，所以左边空出一块。现在改成按座位的实时右边缘测量（`座位 right - 框架 left`），留白跟着座位真实占宽走：实测座位从 72px 缩到 32px 后，留白从 160px 变成 112px。
- 只在标签栏真的显示时覆盖。原生视图和禁用插件时撤掉覆盖，把宿主的固定值还回去——留着覆盖会把宿主为自己控件预留的空间悄悄缩小。
- 座位宽度会随侧栏动画变化，所以把座位也纳入 ResizeObserver，尺寸一变就重测。
- 真实 Chromium 验证：启用时 `padding-inline-start: 112px`、座位宽 32px；禁用后覆盖撤掉、座位恢复 72px；重新启用又回到 112px。43 条测试全绿，其中一条新的回归专门断言「留白来自座位实测，不是固定的 160px」。
- 测试夹具的 `style` 从普通对象换成带 CSSOM 的 Proxy（原来 `setProperty` 会抛错，报出来是个莫名其妙的 `null !== ''`），`cloneNode` 也改成逐属性拷贝（`{...style}` 只能复制 Proxy 暴露的键，复制不到内部属性）。

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
