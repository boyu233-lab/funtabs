# 自托管版说明（NAS 为数据真相源）

本分支在原 funtabs 基础上做了自托管改造：**所有数据保存在 NAS 磁盘**，浏览器本地只留一份离线缓存。

## 架构

```
浏览器（起始页）
   │  /api/data（读写）
   ▼
NAS 上的 Node 服务  ──►  NAS 磁盘 data/funtabs.json（原子写 + .bak 备份）
   │
   └─► 离线时读浏览器 IndexedDB 缓存，联网后自动回写 NAS
```

## 一键部署（Docker）

```bash
docker compose up -d
```

访问 `http://<NAS_IP>:8099`。数据落在 `./data/`，备份就是拷贝这个文件。

## 部署方式二：镜像仓库（推荐长期更新）

在本机构建后推送到镜像仓库，NAS 只负责拉取，不用在 NAS 上跑 webpack。

**1）本机构建并推送**

```bash
docker login registry.cn-hangzhou.aliyuncs.com   # 阿里云 ACR；Docker Hub 用 docker.io
IMAGE=registry.cn-hangzhou.aliyuncs.com/<命名空间>/funtabs:latest ./scripts/publish-image.sh
```

**2）NAS 上拉取运行**

在 NAS 建一个目录（如 `docker/funtabs`），放入 `docker-compose.image.yml` 并建 `.env`：

```
IMAGE=registry.cn-hangzhou.aliyuncs.com/<命名空间>/funtabs:latest
```

```bash
docker compose -f docker-compose.image.yml up -d
```

**3）以后更新**

```bash
docker compose -f docker-compose.image.yml pull
docker compose -f docker-compose.image.yml up -d
```

> 架构提示：脚本默认构建 `linux/amd64`，适用于 x86 群晖（带 + 机型）。
> 若 NAS 是 ARM 机型，改用 `PLATFORM=linux/arm64 ./scripts/publish-image.sh`
> （跨架构构建较慢，要求 Docker 已开启 buildx）。

## 镜像仓库选型

| 仓库 | 登录地址 | 特点 |
|---|---|---|
| 阿里云 ACR 个人版 | `registry.cn-hangzhou.aliyuncs.com` | 国内拉取快、免费、可设私有，推荐 |
| Docker Hub | `docker.io` | 最通用，国内 NAS 拉取可能慢或失败 |
| GHCR | `ghcr.io` | 与 GitHub 仓库打通，国内拉取偏慢 |

`docker-compose.yml` 关键配置（两种部署方式通用）：

| 变量 | 说明 |
|---|---|
| `PORT` | 服务端口，默认 8099 |
| `DATA_DIR` | 数据目录，容器内默认 `/app/data` |
| `API_TOKEN` | 可选。设置后所有写接口需要 `Authorization: Bearer <token>` |

## 本地开发

```bash
npm install --legacy-peer-deps
npm run build     # 产物在 build/
npm run server    # 启动后端，托管 build/ 静态文件
```

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/data` | 读取数据 |
| PUT | `/api/data` | 写入数据；带 `?force=1` 跳过冲突检测 |
| POST | `/api/upload` | 上传图片（base64），落盘后返回 URL |
| GET | `/api/wallpaper/bing` | Bing 每日壁纸代理（解决跨域，只返回 URL） |

写入时若客户端 `updatedAt` 与服务端不一致会返回 `409` 并附带服务端版本，
前端据此提示冲突；`force=1` 可强制覆盖。

## 相对于上游的改动

### 数据正确性（原项目的 bug）
- `common/mergeArr.jsx`：导入书签去重时 `splice` 删除旧项后不再 push 新项，导致两份数据一起丢失
- `component/markdown.jsx`：编辑器未接 `value` / `onChange`，编辑内容永远保存不了
- `common/fetch.jsx`：`post` 使用模块级共享 debounce，被覆盖的 Promise 永远悬挂；写操作改为不去抖
- `module/home.jsx`：保存时使用挂载时的旧快照，会覆盖其他模块期间写入的数据
- `module/home.jsx`：`parseInt(key) || 兜底`，首个分类 key 为 0 时永远走默认值
- `module/searchTools.jsx`：点击搜索建议用 `key.slice(-1)` 取索引（≥10 会错位）并解构 undefined

### 性能与内存
- 7 处 `removeEventListener` 传入新的匿名函数，监听器根本删不掉；统一改用 `AbortController` 管理
- `module/showList.jsx`：Slider 一次性挂载所有分类的全部卡片，改为只挂载当前及相邻分类
- `module/home.jsx`：数据 JSON.parse 从「每次渲染执行」改为初始化一次
- 天气卡片各自跑 2 分钟定时器，改为全局共享订阅 + 单一轮询

### 自托管能力
- 新增 `server/`：Express 后端，NAS 磁盘存储 + 原子写 + 备份 + 冲突检测
- 新增 `src/common/nasStore.js`：NAS 优先、离线降级、联网回写
- 新增 `src/common/idbCache.js`：IndexedDB 缓存
- 天气改为 Open-Meteo（免费免 key、支持 CORS、中文地名），不再依赖作者服务器
- 壁纸改为网络图片 URL（Bing 每日图经后端代理，失败回退 Picsum），不再把 base64 塞进 localStorage

### Obsidian 集成（双通道，均无需后端）
- **A 通道**：Advanced URI，把内容一键追加到当天日记 / 指定笔记的标题下，支持剪贴板传值规避 URL 长度限制
- **C 通道**：File System Access API，授权一次 vault 目录后直接读写 `.md` 文件（仅 Chrome / Edge）
- 入口：页面右下角悬浮按钮
