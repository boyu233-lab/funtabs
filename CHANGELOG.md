# Xtab 修改日志（CHANGELOG）

本项目 fork 自开源项目 **funtabs**，在此基础上做了自托管化、去广告化与稳定性改造，并更名为 **Xtab**。
版本号遵循语义化版本：`主版本.次版本.修订号`。所有日期为 Asia/Shanghai。

---

## 版本号规则与查看方式

发版时必须同步修改三处（已在代码注释中标注）：

| 位置 | 用途 |
| --- | --- |
| `src/common/version.js` → `APP_VERSION` | 前端角标与自托管面板展示 |
| `server/index.js` → `APP_VERSION` | `/api/health` 对外暴露 |
| `package.json` → `version` | 构建产物元信息 |

同时在本文件追加一条记录。

**确认线上跑的是哪个版本：**

```bash
# 1) 页面右下角角标直接显示，例如 Xtab v1.0.1（悬浮可见构建日期）
# 2) 接口查看（无需 Token）
curl https://你的域名/api/health
# => {"ok":true,"service":"xtab","version":"1.0.1","time":...}

# 3) NAS 上确认镜像 digest
docker images --digests | grep xtab
```

---

## [1.3.3] — 2026-10-31

### 修复

- **Cloudflare 防护站点抓取标题返回垃圾内容**：目标站点（如 nodeseek.com）启用
  Cloudflare 人机验证时，`/api/webtitle` 会把挑战页的 "Just a moment..." 当成真实
  标题返回并写入书签。现在识别 `cf-mitigated: challenge` 响应头、403+cloudflare
  组合与挑战页标题特征，返回 `cloudflare_blocked` 错误，前端提示手动填写。

### 新增

- **图标兜底增加 DuckDuckGo 源**：CF 防护站点直连抓取（含 /favicon.ico）一律 403，
  Google s2 在国内网络常不可达；新增 `https://icons.duckduckgo.com/ip3/<域名>.ico`
  候选源（自带图标缓存），位于直连与 Google 之间。新增环境变量
  `FAVICON_DDG_FALLBACK`（默认 1，设 0 关闭）。

---

## [1.3.2] — 2026-10-31

### 新增

- **设置页同时显示后端真实版本**：自托管设置（/selfhost）「版本」一栏在原有前端打包
  版本之外，新增通过 `/api/health` 获取的后端版本；前后端不一致时给出
  「容器未更新或页面有缓存」的黄色警告，无需 SSH 即可判断升级是否生效。

### 修复

- **书签搜索框占位文字不可见**：深色壁纸上 antd 默认占位符颜色过暗，输入文字、
  清除按钮一并调整为浅色可读，聚焦时增加浅色描边。

### 其他

- `docker-compose.hub.yml` 增加 `pull_policy: always`，`up -d` 时自动拉取最新镜像，
  避免本地残留旧 latest 导致「拉取了却一直是旧版」。

---

## [1.3.1] — 2026-10-31

### 新增

- **书签即时搜索**：浏览态下书签网格上方提供小型搜索框（sticky 定位），按名称 / 网址
  即时过滤当前分类的书签，清空即恢复；仅 PC 浏览态启用，编辑态与移动端不显示。
- **左侧导航栏交互优化（对标 WeTab）**：默认收窄为纯图标栏（rail），鼠标悬停侧栏时
  分类名称向右滑出展开，当前分类名称常显；分类项由竖排改为「图标 + 文字」横排。

### 修复

- **搜索过滤与编辑/删除的下标错位风险**：搜索条件原本误用 `edit === ""`（编辑态）判定，
  导致过滤恰在编辑态激活——过滤后卡片数组下标与 `content` 真实下标错位，此时删除/编辑
  会误操作其他书签。已统一改为 `edit === "none"`（浏览态，无编辑入口），并在
  `ReactSortable` 的 `setList` 中增加防御：过滤期间拒绝写回，杜绝子集覆盖完整数据。

### 其他

- 删除 `selfHostPage.jsx` 未使用的 `Title` 导入；`cdp.js` / `cdp-shot.js` 移入 `tools/`。

---

## [1.3.0] — 2026-10-31

### 新增

- **左侧竖向分类导航（仿 WeTab）**：分类标签可从顶部横向 Tabs 切换为固定在屏幕左侧的
  竖向玻璃拟态导航栏，垂直居中、当前分类高亮（左侧指示条）、支持拖拽卡片时悬停切换分类。
  - 新增组件 `src/module/sideTabs.jsx`，样式在 `funtabs.css`（`.side-tabs` 系列）
  - 切换入口：编辑模式 → 顶部工具条「导航位置」选择 顶部 / 左侧
  - 新增布局字段 `tabPosition`（`top` / `left`），存进 `funtabs.yaml` 的 `layout`，
    **随 NAS 同步，换设备保持一致**
  - 只有一个分类时自动隐藏（与顶部 Tabs 行为一致）
  - **窄屏（<900px）自动回退顶部 Tabs**，避免遮挡卡片

## [1.2.0] — 2026-10-31

### 移除功能
- **删除 Obsidian 集成**：实测体验不佳——Advanced URI 通道依赖本地 Obsidian 常驻与插件配合，File System Access 通道授权易失效、仅 Chrome/Edge 可用、换设备需重新授权。整体移除：
  - 删除 `src/common/obsidian.js`、`src/module/obsidianPanel.jsx`
  - 首页右下角移除 Obsidian 悬浮按钮
  - 自托管设置面板的「安全上下文」提示改为通用的 HTTPS 安全建议（原表述是关于 File System Access API 的）

### 其他
- 新增 `tools/wetab2xtab.py`：WeTab / iTab 备份转 Xtab YAML，支持浏览器书签 HTML，支持追加模式保留现有数据

## [1.1.2] — 2026-10-31

### 安全修复（详见 SECURITY-AUDIT.md）

**高危**
- **回显型 SSRF**：`/api/webtitle`、`/api/favicon` 会按传入 URL 抓取网页并回显结果，攻击者可借 NAS 探测内网（群晖 DSM、路由器、云元数据 `169.254.169.254`）。新增 `assertSafeTarget()`，DNS 解析后逐 IP 校验，拦截私有网段、链路本地、CGNAT、IPv6 私有地址及 `localhost`/`.local`。新增 `ALLOW_PRIVATE_NET=1` 供内网书签抓取显式放行（默认 0）。
- **同源存储型 XSS**：SVG 可内嵌 `<script>`，上传的 `.svg` 以 `image/svg+xml` 同源提供，直接访问即执行脚本，可窃取 `localStorage` 中的 `nasToken` 进而读写全部书签。静态响应统一加 `X-Content-Type-Options: nosniff`，`.svg` 强制附加 `Content-Security-Policy: default-src 'none'; ...; sandbox`。

**中危**
- 移除 `api.iowen.cn` 第三方图标服务：导入浏览器书签时会把全部收藏域名提交给第三方，改为走自建后端 `/api/favicon?url=...&redirect=1`。
- Google favicon 兜底可关闭：新增 `FAVICON_GOOGLE_FALLBACK=0`。
- `auth()` 改用 `crypto.timingSafeEqual` 恒定时间比较，避免 token 逐字节爆破。
- 未设置 `API_TOKEN` 时启动打印醒目警告。

### 审计结论
无后门、无遥测、无硬编码密钥、无 RCE、无 `eval`/`child_process`、无恶意安装钩子。详见 `SECURITY-AUDIT.md`。

## [1.1.1] — 2026-10-31

### 修复
- 删除 `editCard.jsx` 中残留的 `saveWebInfo` 遥测函数与调用（会把书签上报到 `variable.saveWebInfo`，
  该字段虽已删除但仍留下调用点），连带移除无用的 `postClear` 导入
- 新增 `REVIEW.md`：代码冗余审计、完整部件清单与数据流、优缺点自评、后续待办清单

---

## [1.1.0] — 2026-10-31

### 新增：YAML 主数据文件（对标 homepage 的可编辑配置）
- 数据文件默认改为 **`/app/data/funtabs.yaml`**，结构与 homepage 类似，人工可读可改：
  ```yaml
  version: 1
  updatedAt: 1730361600000
  layout:
    cardStyle: defaultCard
    widthNum: 160
    heightNum: 64
  tabs:
    - key: 0
      label: 常用
      type: folder
      items:
        - label: 百度
          link: https://www.baidu.com
          type: link
  ```
- 新增环境变量 `DATA_FORMAT=yaml|json`（默认 yaml）；首次启动若目标格式文件不存在，
  会自动从另一种格式转换过来，**原文件保留不删**
- 新增接口：`GET /api/data/raw?format=yaml|json`（直接下载 NAS 原始文件）、
  `POST /api/data/import`（上传 YAML/JSON 文本由服务端解析写入）
- 前端「备份/恢复数据」新增「下载 YAML」「上传 YAML 写入 NAS」两个入口
- `/api/health` 增加 `dataFormat` 字段
- Dockerfile 运行时增加 `yaml` 依赖

### 修复：导入导出与备份恢复在自托管下的失效问题
- **恢复的数据不会写回 NAS**：原实现只写 localStorage，刷新时 NAS 会把旧数据推回来，
  表现为"导入无效"。现在恢复/导入/重置全部走新的 `pushToNas()`（force 覆盖）
- **打开备份弹窗会清空自托管配置**：`getLocalData()` 会把不在白名单的键删除，
  而 `nasBaseUrl` / `nasToken` / `dailyWallpaper` 都没登记，
  结果就是打开一次备份弹窗，NAS 地址与 Token 被清空、同步直接 401。
  已补齐白名单，且导出时不包含 Token 等凭据
- **重置数据在自托管下完全无效**：只清了 localStorage，现已改为把默认数据写回 NAS
  + 清空离线缓存，并加了危险操作提示
- **导入浏览器书签后不同步 NAS**（刷新即丢）：合并完成后自动回写
- 导出文件名含 `:`（`toISOString()`），Windows 下载会被系统改名或失败 → 改为 `2026-10-31_19-20-33`
- 导出"浏览器书签 HTML"时内容是 JSON 转义后的字符串（带引号与反斜杠），不可直接导入浏览器
  → 改为直接输出原始 HTML
- 导入无校验、且先 `localStorage.clear()`，误粘贴任意 JSON 就会清空数据 →
  新增 `validateImport()` 结构校验，并保留自托管配置
- 导入时的 `JSON.parse` reviver 会把 ISO 时间字符串转成 Date 对象，
  再 `setItem` 后变成 `Mon Oct 31 2026 ...` 格式，破坏部分字段 → 已移除
- 新增 `src/common/dataIO.js` 统一数据出入口；`idbCache` 增加 `cacheClear()`

---

## [1.0.2] — 2026-10-31

### 移除
- **反馈功能**：顶栏「反馈」按钮跳转到作者自建的腾讯问卷（`txc.qq.com/products/501945`），自托管版本不再保留任何外链反馈入口，已整体删除

### 变更
- **自托管设置改为独立页面**：主页右下角不再显示「自托管设置」悬浮按钮，
  避免在日常浏览页面上暴露 NAS 地址与 API Token
  - 新增独立页面 `/selfhost`（别名 `/settings`），在地址栏输入即可进入
  - 新增 `src/module/selfHostPage.jsx`；`SelfHostPanel` 增加 `standalone` 模式（脱离 Modal 直接渲染）
  - 路由守卫白名单支持 `/selfhost`、`/settings`，其余未知路径仍重定向到首页
  - 服务端 SPA 回退已支持直接刷新该路径

---

## [1.0.1] — 2026-10-31

### 修复
- **更新镜像后页面仍是旧版**：`index.html` 之前被设置 1 小时浏览器缓存，重新部署后浏览器继续加载旧入口 HTML（引用旧 JS），导致已删除的"更新提醒"弹窗等内容仍然出现。
  - `index.html` 与 SPA 回退响应改为 `Cache-Control: no-cache`（每次回源校验）
  - 带内容哈希的 JS/CSS/图片改为 `public, max-age=604800, immutable`（不影响加载速度）
  - 其余静态资源 1 小时

### 新增
- **版本号体系**：新增 `src/common/version.js` 作为版本单一来源
- 首页右下角新增版本角标（`Xtab v1.0.1`），悬浮显示构建日期
- 自托管设置面板新增「版本」一栏
- `/api/health` 返回 `version` 字段，便于脚本化核对部署版本
- 新增本文件 `CHANGELOG.md`

---

## [1.0.0] — 2026-10-31

Xtab 首个版本。fork 自 funtabs，目标形态：**单用户、自托管、数据全部落在自己的 NAS**。

### 架构
- 新增 Node + Express 后端 `server/index.js`，单容器同时提供静态前端与 API，端口 8099
- 数据真相源从浏览器 localStorage 改为 **NAS 磁盘 `data/funtabs.json`**：
  - 原子写（临时文件 + rename）+ `.bak` 备份
  - `updatedAt` 冲突检测，冲突返回 409，可用 `?force=1` 强制覆盖
- 新增 **IndexedDB 离线缓存**（突破 localStorage 5MB 限制）：
  - NAS 不可达时读取本地缓存并在页面标注"离线模式"
  - 恢复连通后自动回写，状态提示可点击重试
- 上传图片统一走 `/api/upload`，落在 `data/uploads`；站点图标经 `/api/favicon` 代理并缓存到 `data/favicons`
- 新增 Docker 多阶段构建 `Dockerfile`，产出 `linux/amd64` 镜像
- 新增 `docker-compose.hub.yml`：直接拉取 `docker.io/boyu233/xtab:latest`，含 `API_TOKEN` / `TRUST_PROXY` / `RATE_LIMIT` / `TZ` 环境变量与 healthcheck
- 后端内置零依赖内存限流、`TRUST_PROXY` 支持（适配 Lucky / nginx 反代）

### 隐私与去广告
- 移除 `public/index.html` 内嵌的百度统计脚本
- 删除 `saveWebInfo` 遥测函数（原实现会把用户书签数据上报作者服务器）
- 移除对作者服务器 `api.funtabs.cn` 的全部依赖，所有接口改为同源自建
- 移除"更新提醒"弹窗、通知推送与捐赠入口
- 删除顶栏广告菜单：关注我们 / 隐私政策 / QQ 群 / 官网 / 雨云 / 捐赠 / 更新记录
- 默认书签中的"雨云"推广链接替换为 Xtab 项目地址
- 默认书签图标统一改为本地 `/api/favicon?url=` 代理，不再请求作者 OSS
- 官方壁纸源：作者 OSS 的 6 张图改为 picsum 种子图

### 自托管能力
- **天气**：改用 Open-Meteo（免 API Key、支持公网自动定位）+ 城市搜索 + 全局共享轮询，避免多组件重复请求
- **壁纸**：Bing 每日壁纸经后端代理（规避浏览器跨域），悬浮按钮可开关每日壁纸
- **热搜**：改用 60s API（开源，可自托管），服务端 10 分钟缓存，支持 `HOT_API_BASE` 指向自建实例
- **翻译**：改用 MyMemory 公共接口
- 新增**自托管设置面板**：服务地址 + API Token + 一键测试连接 + 安全上下文提示

### Obsidian 集成（A + C 双通道）
- A 通道：`obsidian://adv-uri` 唤起本地 Obsidian 并追加当天日记
- C 通道：File System Access API 直连 vault 读写 `.md`（需 HTTPS 安全上下文）
- 非安全上下文或用户未授权时**静默降级**，不弹错误、不影响其它功能

### 缺陷修复
- `mergeArr.jsx` 去重逻辑丢失数据
- `fetch.jsx` post 去抖导致 Promise 悬挂（改为不去抖）
- `home.jsx`：`saveData` 使用旧快照、localStorage 重复解析、`parseInt(key) ||` 误判 0
- `home.jsx` 7 处 `removeEventListener` 匿名函数泄漏 → 统一改用 `AbortController`
- `showList` 全量渲染所有分类 → 改为只渲染当前及相邻分类
- `markdown.jsx` 缺失 `value` / `onChange` 受控属性
- `searchTools.jsx` 搜索历史解构崩溃
- Express 5 下 `app.get("*")` 非法致容器启动崩溃 → 改为中间件形式 SPA 回退，并锁定 `express@^4.19.2`
- `.env` 中 `//` 注释不被 dotenv / compose 识别 → 改为 `#`
- Docker 构建 ERESOLVE 依赖冲突 → `.npmrc` 提前在 `npm install` 前 COPY 进镜像
- Windows 下 `VAR=x cmd` 前缀不可用、构建期 `dotenv-expand` v10 具名导出崩溃 → 调整 `config/env.js`

### 已知问题
- 通过 `/api/webtitle` 抓取部分站点（如百度）标题时会因对方反爬偶发失败，其它站点正常
- 存量数据中的旧预置书签（例如"雨云"推广）属于用户数据，镜像升级不会自动清除，需在页面中手动删除一次

---

## 升级方式（NAS）

```bash
cd /volume1/docker/xtab   # 存放 docker-compose.hub.yml 的目录
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

数据卷 `./data` 不受升级影响。升级后建议浏览器按 `Ctrl + Shift + R` 强制刷新一次，
并核对右下角版本号是否已更新。
