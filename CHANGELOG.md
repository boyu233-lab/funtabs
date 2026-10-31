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
