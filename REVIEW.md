# Xtab 项目体检报告

> 生成时间：2026-10-31 · 当前版本：v1.1.0（含本次修复后为 v1.1.1）
> 代码规模：75 个 JS/JSX 文件，约 15,500 行（前端 ~14,400 行 + 后端 ~660 行）
> 技术栈：React 18 + Redux Toolkit + antd 5 + ejected CRA（webpack 5）· 后端 Node 20 + Express 4 · 单容器部署

---

## 一、冗余与可精简代码

### 1.1 孤儿文件（全仓无任何 import，可整文件删除）

| 文件 | 说明 |
|---|---|
| `src/module/utils.jsx` | `applyDrag` / `generateItems`，拖拽已改用 react-sortablejs |
| `src/module/searchShowArticle.jsx` | 笔记搜索组件，0 引用 |
| `src/module/emptyCard.jsx` | 骨架屏占位，0 引用 |
| `src/module/recommendAdd.jsx` | 推荐网址列表，仅存在于 `addNewCard.jsx` 注释 |
| `src/module/officalWallpaper.jsx` + `wallpaperSource.jsx` | 预置壁纸墙，仅存在于 `changeWallpaper.jsx` 注释 |
| `src/common/getDomainColor.jsx`、`rgbToHex.jsx` | 仅存在于注释引用 |
| `src/module/setupTests.jsx` | jest 配置指向 `src/setupTests.js`，路径不匹配，从未加载 |

### 1.2 导出但无人使用

`fetch.jsx` 的 `debounce` / `postOnce` / `post`（整条调用链已死）、
`variable.jsx` 的 `uploadImages` / `uploadFavicon`（实际走 `nasStore.uploadImage`）、
`dataIO.js` 的 `DOC_KEY` / `readLocalNewData` / `writeLocalNewData`（仅本文件用，去 export 即可）、
`wallpaperService.js` 的 `preloadImage`、`weatherService.js` 的 `fetchWeather`。

### 1.3 无效 props 与常量 state

| 位置 | 问题 |
|---|---|
| `home.jsx` → `settings.jsx` | 传了 `setNum` / `setGridWidth`，接收方未解构 |
| `home.jsx` → `tabsManager.jsx` | 传了 `localData`，接收方直接读 localStorage |
| `home.jsx` → `addNewCard.jsx` | 传了 `funtabsData`，接收方未解构 |
| `home.jsx` → `showList.jsx` / `searchTools.jsx` | 传了 `gridWidthNum` / `linkList`，未解构 |
| `showList.jsx:38` | `const [click] = useState(0)` 恒为 0，导致 `article.jsx:93`、`localWeather.jsx:306` 的 `click === 1` 分支永远不可达 |
| `searchTools.jsx:47` | `const [trigger] = useState("hover")` 恒值 |
| `home.jsx:294` | `notification` 占位（注释自述"保留占位"），连同 import 与 `{contextHolder}` 可删 |
| `showStyle/*.jsx` | `folderDisabled` / `setClick` 一路下传但无组件解构 |

### 1.4 重复实现（建议合并）

| 重复项 | 位置 | 建议 |
|---|---|---|
| `request()` 两份 | `fetch.jsx:23` 与 `fetchClear.jsx:4` | 合并为 `request(url, cfg, {silent, progress})` |
| `debounce()` 两份且语义不同 | `fetch.jsx:90`（会 resolve 被覆盖调用）vs `fetchClear.jsx:47`（静默丢弃） | 统一为前者，避免行为不一致 |
| 颜色工具命名失真 | `hexToRgb.jsx` 实际返回黑/白前景色，不是 RGB | 重命名为 `getContrastText`，与 `showLabelFontColor` 一起并入 `common/color.js` |
| 编辑态三元组 | `cursorControl` / `pointerEventsControl` 结构同构 | 合并为 `editModeValue(edit, editing, normal)` |
| 展示参数读取三份 | `showRadius` / `showBoxShadow` / `showLabelFontColor` | 合并为 `common/display.js` |
| `localStorage.funtabs` 解析两份 | `home.jsx:70` 与 `dataIO.js:14` | 复用 `dataIO.readLocalNewData` |
| `setItemEvent` 处理重复 | `home.jsx:579` 与 `676`（扩展分支） | 抽公共 handler |

### 1.5 残留与噪声

- **console.log 3 处**：`hotEventList.jsx:164`、`home.jsx:616`、`home.jsx:711`
- **静默吞异常**：`hotEventList.jsx:186`、`editCard.jsx:480`
- **注释掉的代码块 8 处**：`changeWallpaper.jsx`（389、524、1027）、`addNewCard.jsx`（537、700）、`editCard.jsx:663`、`home.jsx:640`、`markdown.jsx:5`
- **未使用依赖 5 个**：`jquery`、`lunar-typescript`、`lunisolar`、`antd-style`、`react-draggable`（另 `buffer` / `stream` 疑未使用，需构建验证）
- **未使用静态资源 13 个**：`public/logo.svg`、`icons/217fun.svg`、`icons/fsou2.svg`、`images/` 下 10 个（含 4 个打赏二维码 `alipay/wx/wxpay/donateBackground`）
- **未使用 CSS 类 9 个**：`funtabs.css` 的 `folder-grid` / `dots-class` / `dock` / `modal-confirm` / `edit-show-div` / `changeList-button` / `components-card-style` / `more-products-grid`，`clock.css` 的 `secondsclass`

### 1.6 已在本轮修复的问题

| 问题 | 处理 |
|---|---|
| `editCard.jsx:472` 残留 `saveWebInfo` 遥测函数与调用（上报书签给作者服务器） | **已删除**（含 `postClear` 导入） |
| 导出会剔除但打开备份弹窗会误删自托管配置 | 已于 v1.1.0 修复（白名单 + 保留 Token） |
| `workbox-webpack-plugin` 因 `src/service-worker` 缺失永不生效 | 待定：要么删除，要么补 PWA（见第四节） |

---

## 二、完整部件清单与调用关系

### 2.1 后端（server/index.js，单文件 660 行）

**路由全表**

| 方法 | 路径 | 鉴权 | 作用 |
|---|---|---|---|
| GET | `/api/health` | 否 | 健康检查，返回 version / dataFormat |
| GET | `/api/data` | 是 | 读取整份文档 |
| PUT | `/api/data` | 是 | 写回；`?force=1` 跳过冲突；冲突返回 409；写前留 `.bak` |
| GET | `/api/data/raw` | 是 | 下载原始 YAML/JSON |
| POST | `/api/data/import` | 是 | 上传 YAML/JSON 文本直写 |
| POST | `/api/upload` | 是 | 图片上传 → `data/uploads/` |
| GET | `/api/wallpaper/bing` | 是 | Bing 每日图代理，只返回 URL |
| GET | `/api/webtitle` | 是 | 抓网页标题（只读前 256KB） |
| GET | `/api/favicon` | 是 | 抓图标并缓存到 `data/favicons/` |
| GET | `/api/hotEvent/:type` | 是 | 热搜聚合（8 源），10 分钟缓存 |
| GET | `/api/fanyi` | 是 | 翻译代理（MyMemory） |
| — | `/uploads/*`、`/favicons/*` | 否 | 静态文件，30 天缓存 |
| — | `/*` GET | 否 | SPA 回退（中间件形式，兼容 Express 4/5） |

**关键机制**：`writeDoc()` 原子写（tmp + rename）；`migrateIfNeeded()` 首次启动自动 json↔yaml 迁移（原文件保留）；内存限流桶；`trust proxy`；`API_TOKEN` 为空则不鉴权（仅限内网）。

**数据目录**

```
data/
├── funtabs.yaml        # 真相源（默认）
├── funtabs.yaml.bak    # 上一版本
├── uploads/            # 上传的图片
└── favicons/           # 站点图标缓存
```

### 2.2 前端部件清单

| 目录 | 职责 | 文件数 |
|---|---|---|
| `src/module/` | 业务模块：主页容器、各类设置弹窗、卡片编辑 | 30 |
| `src/common/` | 数据层（nasStore / idbCache / dataIO）+ 工具 | 25 |
| `src/component/` | 卡片小组件：热榜/天气/记事/Markdown/翻译/时间进度/节假日/笔记 | 9 |
| `src/showStyle/` | 4 种卡片样式分发器 | 4 |
| `src/redux/` | store + 3 个 slice（cloudSync / deviceType / moreSettings） | 4 |

**核心模块一句话说明**

- `home.jsx`（约 1200 行）：状态中枢，启动时 `nasLoad()` 用 NAS 覆盖本地，保存时 `saveData()` 回写，监听 `setItemEvent` / `funtabsSync`，渲染同步状态角标
- `nasStore.js`：NAS 存储层（load/save/retrySync/ping/uploadImage），8 秒超时，事件广播
- `dataIO.js`：统一数据出入口（pushToNas / pullFromNas / downloadRawFromNas / importRawToNas / validateImport）
- `idbCache.js`：IndexedDB 缓存，不可用时退 localStorage
- `getLocalData.jsx`：导出前按白名单清理 localStorage（**新增 key 必须登记，否则会被删**）
- `wallpaperService.js` / `weatherService.js`：Bing 代理 → picsum 兜底；Open-Meteo + 共享轮询
- `obsidian.js`：A 通道 `obsidian://adv-uri` + C 通道 File System Access

### 2.3 数据流（以"添加书签"为例）

```
用户点新增 → addNewCard.jsx → setLinkList（内存）
                            → saveLinkList() → localStorage.funtabs
                            → setItemEvent → home.jsx 同步布局 state
用户点"完成编辑" → home.jsx:editFunction(0) → saveData()
        → 重读 localStorage 最新快照 → nasSave(newData, updatedAt)
        → nasStore: 先落 IndexedDB → PUT /api/data
        → 后端：冲突检测 → 写 .bak → 原子写 funtabs.yaml
```

**离线降级**：读失败 → IndexedDB → localStorage；写失败 → 留本地标 `pending`，`online` 事件自动补传；天气/热搜/壁纸各有缓存兜底。

**冲突处理**：`updatedAt` 不一致返回 409，前端标红提示，用户可通过备份恢复或重置强制覆盖（`pushToNas` 走 force）。

### 2.4 外部依赖调用

| 能力 | 走同源代理 | 上游 |
|---|---|---|
| 热搜、翻译、每日壁纸、网页标题、网站图标 | ✅ 同源 `/api/*` | 60s API / MyMemory / Bing / 目标站点 |
| 天气 | ❌ 直连 | Open-Meteo（免 key，支持 CORS） |
| 节假日 | ❌ 直连 | timor.tech |
| 搜索联想、搜索引擎跳转 | ❌ 直连 | 百度 |
| 书签导入的图标 | ❌ 直连 | api.iowen.cn |
| 壁纸兜底、预置壁纸 | ❌ 直连 | picsum.photos |
| 文章正文抓取 | ⚠️ 同源但**后端未实现** | —（功能降级） |

### 2.5 状态存放位置

| 位置 | 存什么 |
|---|---|
| **NAS YAML** | 真相源：`layout`（布局）+ `tabs[]/items[]`（分类与卡片） |
| **IndexedDB** | `funtabsDoc`（离线副本）、`obsidianConfig`、`obsidianVaultHandle` |
| **localStorage** | 本机外观配置（壁纸/字体色/圆角/搜索框…）+ `nasBaseUrl` / `nasToken` + 各组件缓存（`note<id>`、`weather_<id>`、`om_weather_*`、`festival_*`、`hotEventData`、`dailyWallpaper`） |

---

## 三、项目优缺点自评

### 优点

1. **数据主权彻底归还用户**：NAS 磁盘 YAML 是唯一真相源，浏览器只做缓存；已移除百度统计、`saveWebInfo` 遥测、作者服务器全部依赖、捐赠/推广入口
2. **存储架构经得起断网**：NAS → IndexedDB → localStorage 三级降级，写操作先落本地再回传，`online` 事件自动补写，冲突有检测而非静默覆盖
3. **运维成本低**：单容器、单端口、单数据目录；镜像 216MB；`docker compose pull && up -d` 一行升级，数据卷不受影响
4. **数据文件人性化**：YAML 可直接编辑、可进 git、可脚本化导入导出，`/api/data/raw` 与 `/api/data/import` 让备份不依赖浏览器状态
5. **功能完整度高**：4 种卡片样式、8 类小组件、拖拽排序、自由全屏、分类管理、书签 HTML 导入导出、Obsidian 双通道集成，上游原有能力基本保留
6. **安全默认值正确**：`API_TOKEN` + 内存限流 + `TRUST_PROXY` + 原子写 + `.bak`；自托管设置独立页面，不在主页暴露 NAS 地址

### 缺点

1. **前端架构偏重、状态分散**：`home.jsx` 1200 行承担全部布局状态；同一份数据存在 React state / localStorage / IndexedDB / Redux 四处，`setItemEvent` 事件桥接是补丁式设计，改一处容易牵连
2. **保存时机反直觉**：新增/删除卡片只写本地，必须点"完成编辑"才回写 NAS，用户容易以为已保存
3. **样式与资源陈旧**：`index.css` 252KB 单文件；4 个 `showStyle` 组件高度重复（每个都重新列一遍 8 个组件分支）；13 个无用静态资源仍在打包
4. **零测试**：`npm test` 指向 CRA 默认脚本，全仓无一个测试用例；数据迁移、YAML 转换、合并去重这些高风险逻辑没有回归保障
5. **无 PWA / 无多端适配**：`workbox` 插件装了但因缺 `src/service-worker` 从未生效；移动端只有 phoneCard 样式，无独立交互
6. **外部依赖仍有 6 处直连**：天气、节假日、搜索联想、书签图标、picsum —— 断网或上游变更会直接影响；与"全部同源"的目标有差距
7. **单用户、无审计**：无登录体系，`API_TOKEN` 是唯一防线；无操作日志，误删无法追溯（只有一份 `.bak`）
8. **性能隐患**：`showList` 已改为按需挂载，但热榜 3 分钟轮询、天气多卡片订阅、`react-flip-toolkit` 全量动画在卡片多时仍有开销；首屏无骨架屏（`emptyCard.jsx` 恰好是死代码）

---

## 四、后期待完善清单

### P0（数据安全与正确性，建议优先）

| # | 事项 | 说明 |
|---|---|---|
| 1 | **多版本备份** | 目前只有一份 `.bak`。改为每次写入另存 `data/backups/funtabs-<ts>.yaml`，保留最近 20 份 + 每天保留 1 份，新增 `GET /api/backups` 列表与下载 |
| 2 | **冲突可视化解决** | 现在冲突只提示"去设置里覆盖"。应弹出对比（本地 vs NAS 的 updatedAt / 卡片数），提供"用 NAS 覆盖本地 / 用本地覆盖 NAS"二选一 |
| 3 | **自动保存** | 新增/删除卡片后延迟 3~5 秒自动 `saveData()`，并在角标显示"已自动保存"，消除"以为保存了"的陷阱 |
| 4 | **补 `/api/article` 或隐藏入口** | 文章卡片"自动获取内容"当前必然失败（后端无该路由）。二选一：实现简易正文提取，或隐藏按钮并提示手动粘贴 |
| 5 | **YAML 写入校验** | 导入时应校验 `items[].type` 是否在白名单内、`link` 是否合法 URL，避免脏数据导致渲染崩溃 |

### P1（可维护性与工程化）

| # | 事项 | 说明 |
|---|---|---|
| 6 | **清理死代码** | 按第一节 1.1/1.2/1.5 清单删除 7 个孤儿文件、5 个未用依赖、13 个静态资源、9 个 CSS 类、3 处 console |
| 7 | **合并重复工具** | 两份 `request` / 两份 `debounce` → 一个 `common/http.js`；颜色与展示参数 → `common/color.js` + `common/display.js` |
| 8 | **拆分 `home.jsx`** | 抽 `useLayoutSettings()`（布局 state）、`useNasSync()`（同步状态机）、`HomeHeader` / `HomeGrid`，目标降到 400 行内 |
| 9 | **补测试** | 优先覆盖：`docToYamlText/yamlTextToDoc` 往返、`mergeArr` 去重、`getLocalData` 白名单、`validateImport`；再补组件冒烟测试 |
| 10 | **状态单一化** | 逐步去掉 `setItemEvent` 桥接，改由集中 store 或显式回调驱动；`moreSettings` slice 持久化收进 slice 内部 |
| 11 | **CI 与发布流程** | GitHub Actions：构建 → 测试 → 自动打 tag → 推镜像；版本号从 `package.json` 注入前端与后端，消除三处手工同步 |

### P2（功能与体验）

| # | 事项 | 说明 |
|---|---|---|
| 12 | **PWA / 离线安装** | 补 `src/service-worker.js` 让 workbox 生效，或直接移除插件；加 manifest（现在是 MV3 扩展 manifest，语义错位） |
| 13 | **外部依赖同源化** | 节假日、书签图标、搜索联想改走后端代理，可配置 `OFFLINE_MODE=1` 时全部禁用外部请求 |
| 14 | **多用户/只读分享** | 至少提供"只读分享链接"（无 Token 只可读 `content`），以及简单的登录态（复用 API_TOKEN 做 Cookie） |
| 15 | **移动端体验** | 长按编辑、拖拽在触屏上体验差；建议 phoneCard 下改为"设置模式"批量操作 |
| 16 | **批量编辑** | 提供"批量改图标 / 批量移动到分类 / 批量删除"，配合 YAML 编辑已可实现一半 |
| 17 | **搜索与快捷键** | 站内卡片搜索（按 label/link 过滤，Ctrl+K 唤起），跳转卡片 |
| 18 | **导入导出增强** | 支持 Chrome/Edge 书签 HTML 直接导入（已有）、导出为 YAML 时保留注释说明，支持导出单个分类 |
| 19 | **观测性** | 简单的操作日志（谁在何时改了什么，写入 `data/logs/`）、错误上报到本地文件而非第三方 |
| 20 | **国际化** | 目前硬编码中文；至少把 UI 文案抽到 `locales/zh-CN.json` |

### 不建议做

- 引入重型状态管理重写（收益低于风险）
- 多用户权限体系（与"单用户自托管"定位冲突，用只读分享替代）
- 服务端渲染（部署形态是 NAS 单容器，SPA 足够）

---

## 附：本轮已随报告落地的修改

- 删除 `editCard.jsx` 中残留的 `saveWebInfo` 遥测函数与调用（含无用 `postClear` 导入）
- 版本升至 **v1.1.1**，镜像已推送 `boyu233/xtab:latest` 与 `:1.1.1`
