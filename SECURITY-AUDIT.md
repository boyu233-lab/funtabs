# Xtab 安全审计报告

审计对象：`boyu233/xtab`（fork 自 funtabs 的自托管书签主页）
审计版本：v1.1.1（审计基线）→ v1.1.2（修复后）
审计日期：2026-10-31
审计方法：全量静态代码扫描（外联地址/危险函数/凭据硬编码/依赖与构建链）+ 容器内动态验证（PoC 实测）
审计范围：`src/`（前端）、`server/`（后端 Express）、`public/`、`Dockerfile`、`package.json`、compose 配置

---

## 结论速览

| 审计问题 | 结论 | 等级 |
| --- | --- | --- |
| 1. 是否存在向非本机传送数据 | **存在，但均为功能必需的公开服务调用，无用户数据外泄**；发现 1 处真实隐私外联（书签域名提交第三方） | 中 → 已修复 |
| 2. 是否存在直接远程操控主机的漏洞 | **无 RCE**；但存在**回显型 SSRF**（可借你的 NAS 探测内网）与**同源存储型 XSS**（可导致数据被远控读写） | 高 → 已修复 |
| 3. 是否存在泄密程序 | **无后门、无遥测、无隐藏上传、无硬编码密钥**；无统计/监控/信标代码 | 安全 |

**关键判断：项目没有作者预留的后门或恶意代码。** 上一轮已清除的百度统计与 `saveWebInfo` 遥测，本次复核确认**调用点也已删除**（此前只删了定义），产物中无残留。所有发现的问题均属"自托管服务常见的设计缺陷"，非恶意行为。

---

## 一、数据外联审计（问题 1）

### 1.1 全量外联域名清单

对 `src/`、`server/`、`public/`、`config/` 做 URL 全量提取，剔除 `w3.org`（XML 命名空间，非网络请求）、`github.com`（注释与文档链接）后的**真实网络目标**：

| 域名 | 位置 | 传送内容 | 是否含用户数据 | 判定 |
| --- | --- | --- | --- | --- |
| `api.open-meteo.com`<br>`geocoding-api.open-meteo.com` | `src/common/weatherService.js` | 城市名 | 仅你配置的城市 | 必要、可接受 |
| `cn.bing.com` | `server/index.js` 壁纸代理 | 无 | 否 | 必要 |
| `picsum.photos` | `src/module/header.jsx` 随机壁纸 | 无 | 否 | 必要 |
| `60s.viki.moe` | `server/index.js` 热搜 | 无 | 否 | 公共实例，建议自托管 |
| `api.mymemory.translated.net` | `server/index.js` 翻译 | **你输入的待翻译文本** | 是（主动输入） | 注意 |
| `timor.tech` | `src/common/variable.jsx` 节假日 | 年份 | 否 | 可接受 |
| `www.baidu.com`<br>`weathernew.pae.baidu.com` | `src/component/localWeather.jsx` | 城市名 | 极少 | 点击天气卡片时才跳转 |
| `www.google.com/s2/favicons` | `server/index.js` 图标兜底 | **收藏站点的域名** | **是** | 中危 → 已可关闭 |
| `api.iowen.cn` | `src/common/transformToJson.jsx` | **浏览器书签的全部域名** | **是** | 中危 → **已移除** |

### 1.2 发现的问题

**【中危｜已修复】导入浏览器书签时，把全部收藏域名提交给第三方**
- 位置：`src/common/transformToJson.jsx:43、75`
- 行为：解析书签 HTML 时为每条书签拼 `https://api.iowen.cn/favicon/<域名>.png`。导入 200 条书签 = 向第三方暴露 200 个域名，等同于交出你的浏览兴趣画像。
- 修复：改为走自建后端 `/api/favicon?url=...&redirect=1`，域名只到你的 NAS。

**【中危｜已提供开关】Google favicon 兜底暴露域名**
- 位置：`server/index.js` `/api/favicon`，取不到图标时回落到 Google 的 `s2/favicons` 服务。
- 修复：新增 `FAVICON_GOOGLE_FALLBACK=0` 可完全关闭（关闭后取不到图标仅返回 404，不影响使用）。

**【提示】翻译接口会把你输入的文本发给 MyMemory**
- 位置：`server/index.js` `/api/fanyi`
- 若翻译的是笔记/私密内容需注意；该接口为主动触发，非后台行为。

### 1.3 数据同步链路核验（重点）

针对"是否有隐藏的数据上传通道"，单独核验了 `src/common/nasStore.js`：

- `getBaseUrl()` 未配置时返回**空字符串**（即同源），**无任何硬编码兜底地址**
- 全部请求目标为 `${getBaseUrl()}/api/*`，指向你自己的服务
- 结论：**不存在把书签偷偷同步到作者服务器的通道**

---

## 二、远程操控风险审计（问题 2）

### 2.1 命令执行类：未发现（安全）

全量扫描 `eval`、`new Function`、`child_process`、`execSync`、`spawn`、`vm` 模块：
**0 处命中**。后端无系统命令调用，无动态代码执行，无 `require(用户输入)`。
→ **不存在直接远程操控主机（RCE）的漏洞。**

### 2.2 【高危｜已修复】回显型 SSRF：可借 NAS 探测内网

- 位置：`server/index.js` 的 `/api/webtitle`、`/api/favicon`
- 成因：两者按用户传入的 URL 发起请求，**仅校验协议为 http/https**，未限制目标地址，并把抓取结果（页面标题）原样回显。
- 实测 PoC（审计时容器内验证，修复前）：

```bash
# 后端抓取宿主机内网页面并原样回显标题
curl "http://<xtab>/api/webtitle?url=http://host.docker.internal:8899/ssrf.html"
→ INTERNAL_SECRET_PANEL        # 内网页面标题被读出
```

- 危害：任何持有 `API_TOKEN` 的人（或公网未设 token 时的任何人）可用你的 NAS 作为跳板，扫描并读取内网服务——群晖 DSM 管理页、路由器后台、云元数据 `169.254.169.254` 等，而这些地址从外网本不可达。
- 修复：新增 `assertSafeTarget()`，对目标域名做 DNS 解析后逐个 IP 校验，拦截私有网段（10/8、172.16/12、192.168/16、127/8、169.254/16、100.64/10、CGNAT、组播）、IPv6 私有段（fc00::/7、fe80::/10、::1 及 IPv4 映射）、`localhost` / `.local` / `.internal`，并拒绝非 http(s) 协议。
- 兼容性：**内网书签抓取需要显式放行**，新增 `ALLOW_PRIVATE_NET=1`（默认 0）。若你收藏了 `192.168.x.x` 的服务并希望自动抓标题/图标，需开启此项。
- 修复后实测：

```
http://host.docker.internal:8899/  → {"error":"private_address"}
http://127.0.0.1:8099/             → {"error":"private_address"}
http://169.254.169.254/latest/     → {"error":"private_address"}
file:///etc/passwd                 → {"error":"invalid_url"}
https://www.baidu.com/             → 百度一下，你就知道     （正常放行）
```

### 2.3 【高危｜已修复】同源存储型 XSS：可窃取 Token 并远控数据

- 位置：`POST /api/upload`、`GET /api/favicon` 的落盘文件，经 `/uploads`、`/favicons` 同源静态提供
- 成因：SVG 是 XML，可内嵌 `<script>`；上传接口接受 `image/svg` 并以 `.svg` 落盘，静态服务以 `image/svg+xml` 提供，直接访问该文件即执行脚本。
- 实测 PoC（修复前）：

```bash
curl -X POST /api/upload -d '{"dataUrl":"data:image/svg;base64,PHN2Zy...PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pjwvc3ZnPg=="}'
→ {"ok":true,"url":"/uploads/...-poc.svg"}
curl -I /uploads/...-poc.svg
→ Content-Type: image/svg+xml        # 同源，脚本可执行
```

- 完整攻击链：上传恶意 SVG → 诱导访问（或作为壁纸/图标引用）→ 同源脚本读取 `localStorage` 中的 `nasToken` → 调用 `/api/data` **读取并覆盖你全部书签**。
- 修复：静态响应统一加 `X-Content-Type-Options: nosniff`；对 `.svg` 强制附加
  `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox`
  ——CSP 使 SVG 内的脚本无法执行，同时不影响其作为图片正常显示。
- 修复后实测：响应头已带 CSP 与 nosniff，脚本不执行。

### 2.4 【中危｜已修复】Token 比较非恒定时间

- 位置：`server/index.js` `auth()`
- 成因：`header === \`Bearer ${API_TOKEN}\`` 为逐字符短路比较，理论上可通过响应耗时逐字节爆破 token。
- 修复：改用 `crypto.timingSafeEqual`（配合长度预检）。

### 2.5 【配置类｜已加警告】未设 API_TOKEN 时全接口免鉴权

- 成因：`if (!API_TOKEN) return next();`——不设 token 即完全开放。公网部署若遗漏配置，任何人可读写全部数据。
- 修复：启动时打印醒目警告日志；compose 中已标注【必填】。

### 2.6 【低危｜未修，可选】`window.open` 未加 `noopener`

11 处 `window.open(url, linkOpen)` 未声明 `noopener`，新页面理论上可通过 `window.opener` 反向操作来源页。现代浏览器对部分场景已有默认防护，风险较低，可后续统一处理。

---

## 三、泄密程序审计（问题 3）

### 3.1 后门与遥测：未发现（安全）

| 检查项 | 结果 |
| --- | --- |
| 统计/监控代码（百度统计、GA、Sentry、Clarity 等） | **0 处** |
| `public/index.html` 外部 `<script>` | **0 处**（仅内联脚本与本地 manifest） |
| 隐蔽数据上报（`sendBeacon`、`navigator.send`、隐藏 `new Image` 打点） | **0 处** |
| 隐藏 iframe / 动态 script 注入 | **0 处** |
| 硬编码密钥、AKIA、ghp_、sk- 等凭据 | **0 处** |
| `eval` / 动态执行 | **0 处** |
| npm 安装钩子（`preinstall`/`postinstall`） | **0 处**，无供应链执行风险 |
| Dockerfile 异常行为 | 无，仅安装 `express` + `yaml`，无 curl 下载执行 |

### 3.2 上一轮清理复核

- 百度统计脚本：已移除，产物无残留 ✅
- `saveWebInfo` 遥测（上报书签至作者服务器）：本轮发现**调用点仍残留在 `src/module/editCard.jsx`**，已于上一版删除；本次复核确认函数体与 `postClear` 导入均已清除 ✅
- 作者对 `api.funtabs.cn` / OSS 壁纸 / 雨云推广 / 捐赠入口的依赖：全量扫描 **0 处残留** ✅

### 3.3 敏感数据存放

| 数据 | 存放位置 | 风险 |
| --- | --- | --- |
| `nasToken`（API Token） | 浏览器 `localStorage` | 同源 XSS 可窃取（已通过 CSP 缓解 SVG 途径）；建议后续改用 httpOnly Cookie 或 SessionStorage |
| 书签数据 | NAS `data/funtabs.yaml` | 权限依赖宿主机目录权限 |
| 上传图片 | NAS `data/uploads/` | 同源静态可读，无鉴权（与书签同域，token 保护范围外） |

> 补充发现：`/uploads`、`/favicons` 为**免鉴权**静态目录（未挂 `auth`）。任何知道文件名的人可直取，但文件名含 8 位随机十六进制，不可枚举，实际风险低。

---

## 四、修复清单（v1.1.2 已实施）

| # | 问题 | 等级 | 修复方式 | 文件 |
| --- | --- | --- | --- | --- |
| 1 | 回显型 SSRF | 高 | `assertSafeTarget()` + DNS 解析后 IP 网段校验 + `ALLOW_PRIVATE_NET` 开关 | `server/index.js` |
| 2 | 同源存储型 XSS（SVG） | 高 | 静态响应头加 CSP + nosniff | `server/index.js` |
| 3 | 书签域名外泄第三方 | 中 | 移除 `api.iowen.cn`，改走自建 `/api/favicon?redirect=1` | `src/common/transformToJson.jsx`、`server/index.js` |
| 4 | Google favicon 兜底暴露域名 | 中 | 新增 `FAVICON_GOOGLE_FALLBACK=0` 开关 | `server/index.js` |
| 5 | Token 非恒定时间比较 | 中 | `crypto.timingSafeEqual` | `server/index.js` |
| 6 | 未设 Token 时静默全开 | 中 | 启动告警日志 | `server/index.js` |

新增环境变量：`ALLOW_PRIVATE_NET`（默认 0）、`FAVICON_GOOGLE_FALLBACK`（默认 1）

---

## 五、给你的加固建议

```bash
# 1. 更新到修复版本
docker compose -f docker-compose.hub.yml pull && docker compose -f docker-compose.hub.yml up -d

# 2. 确认已设置强 Token（公网必做）
openssl rand -hex 32

# 3. 只在内网监听，不让外部绕过 Lucky 反代直连后端
#    compose 里改：- "127.0.0.1:8099:8099"

# 4. 若书签里有内网地址且需要自动抓标题/图标，才加：
#    - ALLOW_PRIVATE_NET=1

# 5. 完全不外传域名（牺牲部分站点的图标）：
#    - FAVICON_GOOGLE_FALLBACK=0
```

**仍未处理、建议后续排期**
1. Token 存 `localStorage` → 改 httpOnly Cookie 或至少 SessionStorage
2. `/uploads`、`/favicons` 静态目录加签名校验或统一鉴权
3. `window.open` 统一补 `noopener`
4. 备份只有一份 `.bak` → 多版本备份（与 P0 待办合并）
