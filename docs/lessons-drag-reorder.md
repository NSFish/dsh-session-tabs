# 拖动排序：踩过的坑与验收方法

这份记录来自一次真实的改造：把一个 HTML5 拖放式标签栏换成指针拖放（Chrome 式浮起跟手），
并把「空白新会话占标签」一起修掉。留下来是因为这里每一条都**不是猜出来的**，都是被
真实浏览器或用户截图当场证伪之后才改对的；下次再碰拖拽类交互，照这个清单走能少绕弯路。

## 一、结论先行：拖动要成立，三件事缺一不可

| 要素 | 缺了会怎样 |
|---|---|
| 元素上不能有 `draggable` | 浏览器启动原生拖动并**停止派发 pointermove**，你的指针逻辑一个事件都收不到 |
| 位移必须**每次都从布局槽位重新算** | 反复移动会累积偏移，长距离拖动后标签跑飞 |
| 判定换位的基准要选对 | 基准错了，手感就是「要整块压上去才动」，怎么调阈值都不对 |

## 二、逐条坑

### 1. `draggable` 会静默吃掉整个手势

标签上留着 `cell.draggable = true` 时，按下并移动会让 Chromium 进入原生 HTML5 拖动。
接管之后 pointermove 不再派发——**不是「收不到」，而是浏览器认为这个指针已经被拖动会话占用了**。

症状极具误导性：你以为自己写的指针逻辑没生效，其实是它根本没被调用。第一版改完用户
反馈「拖动起来没什么区别」，原因就是这一行没删。修法是删掉 `draggable`，并在标签栏内
主动拒绝 `dragstart`，防止上游或别的插件把它挂回来：

```js
host.addEventListener('dragstart', e => { if (e.target.closest?.('[data-dsst-tab]')) e.preventDefault(); });
```

### 2. 「中心对中心」≠「半个被盖住」

这是本次最难发现的一条，因为两种说法听起来都像浏览器行为，但数值上差一倍：

- 标签等宽时，**A 的中心越过 B 的中心**需要 A 移动整整一个标签宽度（78px）；
- **A 的右边缘到达 B 的中心**只需要移动半个宽度（41px）。

只改前者时，用户看到的就是「必须把整块标签压到邻居身上才换位」。正确的手感是后者，
而且它和「邻居被盖住一半」是同一个条件——用户描述得比代码更准。

双向要对称：向右拖用右边缘当前缘，向左拖用左边缘当前缘，两种方向用同一条比较：

```js
var lead = drag.rightward ? rect.right : rect.left;
for (i…) if (lead < mid) break;   // 前缘还没到邻居中线，就仍排在它前面
```

方向本身由一像素的移动决定，一次抖动不会把阈值翻到指针底下。

### 3. 抓取点要在 pointerdown 时记，不能在激活时算

拖拽有激活阈值（这里是横向 4px）。如果在**激活那一刻**才去算「按在标签内部哪个位置」，
快速拖动时第一帧的指针已经离按下点很远了，算出来的抓取偏移是错的，标签会跳一下。

按下时记，激活时直接用：

```js
drag = { grab: e.clientX - rect.left, … };   // pointerdown
// 移动时：标签左边缘应落在 x - grab，所以位移 = x - grab - 布局左边缘
```

### 4. 位移每次从布局重新推导，不要累加

浮起跟手的位移必须满足：**清掉 transform → 读布局左边缘 → 重新应用**。
`getBoundingClientRect()` 的结果**包含 transform**，所以不先清零就会把上一次的位移
当成布局位置，越拖越偏。`offsetLeft` 不受 transform 影响，但它在 offsetParent 上的
基准不总是标签栏，所以「清零再量」更稳。

```js
function floatCell(x){
  cell.style.transform = '';                    // 回到布局位置
  const slot = cell.getBoundingClientRect().left;
  cell.style.transform = `translateX(${x - grab - slot}px)`;
}
```

同样的道理：换位之后标签跳到了新的槽位，必须再调一次 `floatCell`，否则它会跟着槽位
一起跳走，指针还停在原处。

### 5. 量出来的东西要有唯一的主人

接缝（激活标签底部那条线加两侧反向圆角）是按标签的屏幕盒子画的。浮起时那个盒子已经
含了位移，所以**天然跟随**——不需要特殊处理。但有两个陷阱：

- **裁剪**：接缝原本被裁到标签栏的滚动可视区（防止滚出视野的标签画出杂线）。拖动时
  标签一浮出边界，接缝就被截住。拖动期间必须跳过这个裁剪。
- **多个调用点抢着算**：渲染、`ResizeObserver`、滚动监听都会调 `placeJoin()`。其中任何一个
  落在「清掉位移」和「重新锚定」之间的窗口里，读到的都是布局槽位而不是浮起位置，会把
  接缝拽回空位。做法是给 `placeJoin(force)` 加一个 guard：拖动期间只允许手势自己传
  `force=true` 来测量。

```js
if (!force && drag && drag.active && drag.cell === activeCell) return;
```

顺带修掉一个同类隐患：滚动监听不能把事件对象当参数直接传进去（`addEventListener('scroll',
placeJoin)` 会把事件对象当作 `force`，非空即真，绕过 guard）。用命名包装函数，
add 和 remove 也要用同一个引用。

### 6. 拖动中不要高亮

指针整个手势都压在标签上，那条 `:hover` 规则会让它从按下亮到松手。拖动期间把悬停填充
关掉（`::before { display: none }`），并去掉浮起阴影。反馈只保留「标签跟着指针走」本身。

### 7. 松手时先清手势状态，再重算装饰

`dragEnd` 里如果先 `placeJoin()` 再 `drag = null`，接缝会因为 guard 判定「仍在拖动中」
而直接返回、保持隐藏。顺序必须是：**存下引用 → 清状态 → 处理 → 重算**。清 transform
还要等下一次布局才生效，所以下一帧再补一次重算（`requestAnimationFrame` 要判存在）。

## 三、空白会话不该占标签

原实现把「任何成为主视图的会话」无条件推进标签列表，包括 `blank` 的空新会话——点一次
`＋` 就多一个永远没用、也永远不走掉的标签。改成「标签要挣得」：

```js
function shown(id){
  const row = list.byId[id];
  if (!row) return false;
  if (!row.blank) return true;
  const live = status(id);                       // running / pending 才算数
  return live === 'running' || live === 'pending';
}
```

**由此暴露的回环**：空会话没有标签，却仍会被 `retain()` 拿保活引用；释放循环看到它
「不在 ids 里」就立刻 `release()`，而 release 会重新发布计数、再触发一次 sync，于是
retain/release 无限循环，测试直接 OOM。修法是把「屏幕上的那个会话」也纳入保留条件：

```js
if (!list.byId[id] || (id !== lastMain && !state.ids.includes(id) && !busy)) release(id);
```

教训是通用的：**凡是「某状态既不在集合里、又必须继续持有」的地方，释放条件都要单独写，
不能让集合成员资格成为唯一判据。**

## 四、验证方法：别靠截图猜

本次最大的效率损失是「看着截图猜原因」。三个真正解决问题的时刻，都来自直接测量：

### 1. 用真实 Chromium 驱动真实产物

`test/verify.mjs` 跑在 mock DOM 上，只能证明逻辑对；手感类问题必须上真实浏览器。
仓库外的临时夹具（页面伪造四个 service + 真 `lib/client.js`，Edge 的 CDP 端口发真实鼠标
事件）逐点采样，才看清了「中心到 139 才换位」这种数量级差异。

关键手法：**每移动一小步就采样一次 DOM 顺序和标签的屏幕盒子**，而不是只在松手后看结果。

### 2. 缓存类怀疑要能一步证伪

「改了没生效」的排查顺序（每条都便宜）：

```sh
# 1. 文件与安装位置是不是同一个文件
stat -f "%i %N" ~/.dsh/profiles/desktop/node_modules/<pkg>/lib/client.js <repo>/lib/client.js
# 2. 应用启动时间 vs 文件 mtime
ps -o lstart -p $(lsof -nP -iTCP:<port> -sTCP:LISTEN | awk 'NR==2{print $2}')
# 3. 宿主有没有第二份副本
grep -rln "<独有标记>" ~/.dsh | grep -v node_modules
```

三条都对得上，就该怀疑**判定逻辑本身**，而不是缓存。本次三次「没改」里，两次是我把
数学写错了，一次是把用户描述当成「已生效但手感不对」。

DSH 的客户端 bundle 由宿主按 `mtimeMs/ctimeMs/size` 派生 revision，页面只在 revision
变化时替换模块；`link:` 安装时仓库文件原地改动会被 HMR 捕获，但**整页重载才是确定路径**。

### 3. 不要替用户操作他的应用

尝试 `osascript ... to quit` 时被退出确认对话框拦下（`-128 用户已取消`）。桌面应用退出
可能有确认流程，替用户杀进程既冒风险又可能丢状态；这类操作交给用户，自己只给准确的
操作说明。同理，不要让人去开一个默认不存在的控制台——先确认宿主有没有 DevTools 入口。

## 五、测试夹具的坑（会让「测试全绿」变成假信号）

mock DOM 的缺口会同时造成假阳性和假阴性，本次踩到四个：

| 缺口 | 后果 |
|---|---|
| 节点没有 `style` 对象 | 设置 `transform` 直接抛错 |
| 没有 `getBoundingClientRect()` | 拖动逻辑读到 undefined，静默走错分支 |
| `querySelector` 只匹配**单个**属性选择器 | `[data-dsst-tab][data-active=true]` 恒为 null，测试以为没有激活标签 |
| 布局不会自动流动 | 手工塞 `_rect` 时漏字段（如 `right`），`width` 算出 `NaN` |
| `cloneNode` 不复制 `style` | 真实 `cloneNode` 会复制 inline style；夹具丢掉了，于是「克隆保住了旋转」测不出来 |

修法是把夹具做成**够真**：节点带 `style`；父容器标了 `_flowX` 就按子元素顺序自动算
位置，并叠加子元素自己的 `translateX`；所有矩形都从 `left + width` 推导，不读别人给的
`right`。这样「拖动中标签在哪」才是真话。

另一条：**契约变了要同步改断言**。改成「空会话不占标签」后，四条旧断言写死了「点 `＋`
多一个标签」，它们失败是**正确的失败**，应当按新契约重写，而不是想办法让它们继续绿。

## 六、验收清单（下次直接照跑）

```sh
node --test test/verify.mjs        # 逻辑层：全绿
```

真实浏览器逐点采样，至少确认四件事：

1. 拖动中标签**实时跟手**（每 20px 采样一次屏幕位置，与指针同步）；
2. 换位发生在**前缘到达邻居中线**（不是整块压上去）；
3. 拖动中**无高亮**（`box-shadow: none`、`::before` 不显示）；
4. 装饰（接缝）在拖动中**跟着走**、松手后**仍对齐**（`joinLeft === cellLeft`）。

以及反向拖动：往回拖必须原样退回，不能单向卡住。

## 七、代理控件：只克隆 `svg` 会丢掉旋转

本插件把原生的两个面板按钮换成自己画的代理按钮，图标是克隆原生按钮里的 `svg`。
底部面板的图标因此**少了 90° 旋转**，显示成一个侧躺的左侧栏图标；右侧那个却正常。

原因是两个图标的做法不一样：

- 右侧 opener 的镜像（`scaleX(-1)`）写在 svg 自己的 class 上，克隆 svg 就带走了；
- 底部开关的旋转写在 svg **外层 span 的 inline `style`** 上
  （`dsh-better-sidebar/src/client/icons.tsx` 的 `IconPanelBottomOutline16`），
  React 没法把 `transform` 直接放到 svg 上，所以套了一层。只克隆 svg 等于把这层丢了。

所以图标要克隆的是**承载样式的那个容器**：从原生按钮的子节点里找「等于 svg 或包着 svg」
的那个，整棵克隆。真实 Chromium 读数：

```
原生外层 span: inlineTransform=rotate(-90deg)   computed=matrix(0,-1,1,0,0,0)
代理外层 span: inlineTransform=rotate(-90deg)   computed=matrix(0,-1,1,0,0,0)
只克隆 svg:    inlineTransform=''                computed=none        ← 原来的 bug
```

两个连带教训：

1. **样式可能不在你以为的那个节点上。** 「这个按钮的图标」不等于「这个按钮里的 svg」，
   多一层包装就会漏。改这类地方先看原生 DOM 的形状，不要凭标签名假设。
2. **尺寸规则要跟着改成直接子元素。** 代理按钮原本写 `.dsst-panel-button[data-dsst-action=bottom] svg{width:16px}`，
   这会把包装层里那 16px 的 svg 塞进一个 15px 的盒子里，缩放后糊掉。改成 `>svg`：
   外层由原生自己声明尺寸，内层 svg 不参与。

夹具那边对应补了一条：`cloneNode` 原来不复制 `style`，于是「克隆保住了旋转」根本无法被测出来
（连 `style.transform` 都读不到）。真实 `cloneNode` 是复制 inline style 的，夹具必须跟上。

## 八、别用像素代替「意图」，更别和宿主抢同一件事

「切回会话还要手动往下滚」这个问题的根因，不是插件哪里写错了偏移量，而是它**记错了该记的东西**——
而且这件事根本不该由它来记。

插件为每个会话记了 `scrollTop`（一个绝对像素值），切走时存、切回时无条件写回。
这套做法只在「内容在后台没有变化」时成立。实际上后台会话会继续产出，尾部会往下长：

```
离开时：scrollTop=1500，内容高 2000，视口 500  → 正好在最底部
后台：内容长到 3200
切回：写回 1500                                → 距离新底部差 1200px，看到的是旧消息
```

先把它改成「记意图」能修好症状（在底部就记「跟随尾部」，切回落到当前尾部；在历史中间才记偏移）。
但更好的答案是**整段删掉**，因为宿主本来就做对了，插件那份是纯重复：

- 切会话时聊天视图是**重新挂载**的（`ui-renderer` 的 `StrictSessionEntry` 用
  `sessionGenerationKeyOf(binding)` 做 React key），所以组件内状态不跨会话；
- `ui-chat` 把位置存在挂载点之外的 `chatScrollPositions`（按 `sessionId` 的 `Map`），所以位置能活过重挂载；
- 它存的是**意图**：在底部存 `null`，恢复时 `saved === null` 直接 `followTail()` 落到当前底部；
  读历史时存**语义锚点**（`capturePosition()`），按锚点还原，内容长高也不跑。

两条通用教训：

1. **当你想「还原用户当时的状态」，先问那个状态是不是一个坐标。** 坐标会随内容变化失效，
   意图（跟随 / 停留）才稳定。
2. **删功能之前先确认宿主有没有做。** 这里是读 `app.asar` 里 `ui-chat` / `ui-conversation` /
   `ui-renderer` 三个包确认的，不是猜的。和第五节「量出来的东西要有唯一的主人」是同一类错误：
   同一个决定有两个主人，谁写回谁就把对方盖掉。

删掉之后 12 条相关测试一并删掉（54 → 41 条），因为它们断言的是插件自己那份记忆，
宿主不需要。测试里不该留一个插件已经不拥有的契约。

边界说明：以上是读产物代码确认的，没有驱动用户正在运行的应用（它没开调试端口）。
这种情况下的诚实做法是明确说出验证到了哪一步，而不是让用户以为已经端到端验过。
