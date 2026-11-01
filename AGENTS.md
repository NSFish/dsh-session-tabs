# dsh-session-tabs — agent 约定

这是一个 **DSH（DeepSeek Harness）客户端插件**：仓库根就是 npm 包根，浏览器侧行为全在 `lib/client.js`。
本文件给任何编码 agent（Codex / Claude Code / Cursor / DSH 自身）读；动手前先扫一遍下面的硬约束。

## 这个包的结构

| 文件 | 作用 |
|---|---|
| `package.json` | 插件清单：`dsh.bundle.patch`、`dsh.client.platform`、`exports["./client"]`、`icon`、`exports["./locale/*.json"]` |
| `cordis.patch.yml` | 让本包成为一条 enabled 的 Loader entry（没有它，浏览器半边不会被加载） |
| `index.mjs` | 宿主半边，故意保持惰性 |
| `lib/client.js` | **全部行为**：`window.__ModuleLoader__.load({ id: 'dsh-session-tabs', factory })` |
| `test/verify.mjs` | 自测：在 mock DOM 上加载**真实产物**（`node --test test/verify.mjs`） |
| `tools/publish-to-github.mjs` | 走 GitHub REST API 发布（空仓库会自动引导） |
| `tools/real-ui-check.mjs` | CDP 驱动真实 DSH WebUI 冒烟检查并截图 |
| `docs/lessons-drag-reorder.md` | 拖动排序的踩坑记录与验收清单（改拖拽交互前先读） |

## 动手前必须知道的硬约束

1. `ModuleLoader.load({ id })` 的 id **必须等于** `package.json` 的 `name`。
2. 客户端模块只做平铺导出 `exports.apply` / `exports.inject`，**绝不 `export default`**（会静默丢掉 `inject`）。
3. 凡读 `ctx.<service>` 必须先写进 `inject`；可选依赖用 `ctx.get(...)` 或 `ctx.inject([...], cb)`。
4. 不要用 CSS-module 哈希类名（`YDXeBa_*` 这类每次构建都变）；用 `[data-row-key^="session:"]`、插槽名、`aria-selected`、`body[data-ds-dark-theme]`、`<html lang>`。
5. 自己注入的 `<style>` 必须打 `data-plugin` / `data-plugin-css`。
6. 叠加在行上的样式要 `!important`（DSH 的 hover 用 `background` 简写会重置 `background-image`）。
7. 宿主插槽会「让位」（archived / 运行中 / 有状态点时 `sidebar.session.row.leading` 不渲染）→ 关键信息走行级属性兜底。
8. 快捷键要躲开输入法组字（`isComposing || keyCode === 229`）；桌面版浮层要 `-webkit-app-region: no-drag`。
9. `ctx.effect` 的 dispose 要清理干净：observer / 定时器 / 样式表 / 监听 / 浮层 / 调试全局。
10. 改完必须 `node --test test/verify.mjs` 全绿；真实界面用 `node tools/real-ui-check.mjs --global __dshSessionTabs` 验一次。
11. 拖拽类改动**不能只靠 mock DOM 验收**：手感（跟手、换位时机）必须在真实浏览器里逐点采样屏幕坐标。别在标签上留 `draggable`——它会让浏览器接管手势并停止派发 `pointermove`。细节见 `docs/lessons-drag-reorder.md`。
12. 克隆原生控件当图标时，**克隆承载样式的容器，不是 svg 本身**：旋转/位移可能写在外层 wrapper 的 inline style 上（`dsh-better-sidebar` 的底部开关就是 `rotate(-90deg)` 套在 span 上），只克隆 `svg` 会静默丢掉它。改完在真实浏览器里比一次 computed transform。
13. 启动期行为（目前只有「启动时收起左侧栏」）**必须幂等**：宿主只给 `ctx.layout.toggleSidebar()` 这个盲切换，读不到状态，所以判据是框架的 `data-sidebar-collapsed` 标记（没有 = 展开，且**框架不存在 ≠ 展开**）。「本次加载已折叠过」的标志必须挂在 `window` 上（`__dshSessionTabsBootCollapsed`），不能放模块作用域也不能放 `install()`：live patch reload 会把整个 bundle 重新求值，两种更近的作用域都会归零，第二次 apply 就会把读者刚打开的列又收回去。

更完整的契约、踩坑库与验收清单见 DSH 的 `dsh-plugin-authoring` skill
（装好之后：DSH 里 `/dsh-plugin-authoring`，Codex 里 `$dsh-plugin-authoring`；
也可以直接读那个 skill 目录下的 `references/`）。

## 常用命令

```sh
node --test test/verify.mjs                       # 自测（无依赖，秒级）
node tools/real-ui-check.mjs --global __dshSessionTabs  # 真实 GUI 冒烟 + 截图
GH_TOKEN=<PAT> npm run publish:github -- --release   # 推 GitHub + 打 tag + 建 Release
npm publish                                       # 发 npm（需 2FA OTP 或 bypass-2FA 令牌）
```
