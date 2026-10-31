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
| `API_TOKEN` | **公网必填**。设置后所有写接口需要 `Authorization: Bearer <token>` |
| `TRUST_PROXY` | 前置反向代理时设为 `1`，否则限流会把所有来源当同一 IP |
| `RATE_LIMIT` | 单 IP 每 5 分钟请求上限，默认 600，`0` 关闭限流 |

## 公网访问

### 必须做的三件事

**1）设置 API_TOKEN**

```bash
openssl rand -hex 32
```

把结果填进 compose 的 `API_TOKEN`，然后在**独立设置页**里填同样的值，点「测试连接」确认显示「已连接」：

```
https://你的域名/selfhost      # 或 http://192.168.1.x:8099/selfhost
```

> 设置页已从主页移除入口（主页不再显示「自托管设置」悬浮按钮），
> 需要改配置时直接在地址栏输入 `/selfhost` 进入，避免在日常页面上暴露 NAS 地址与 Token。

未设置 token 时，任何人都能读写你的书签数据。实测校验结果：

| 场景 | 返回 |
|---|---|
| 不带 token 读 / 写 | 401 |
| token 错误 | 401 |
| token 正确 | 200 |

**2）必须上 HTTPS**

公网 HTTP 下所有请求（含 API Token、书签数据）都是明文传输，存在被窃听与篡改的风险。
请务必为域名配置 HTTPS 证书。

**3）正确设置 TRUST_PROXY**

前置了群晖反向代理、nginx 或 Cloudflare Tunnel 时，服务端看到的来源 IP 全是代理地址。
不设 `TRUST_PROXY=1`，限流会把所有访问当成同一个 IP，正常用几分钟就被 429 拦掉。

### 三种外网方案

| 方案 | 做法 | 适合 |
|---|---|---|
| **Tailscale / WireGuard**（推荐） | NAS 和手机电脑都装客户端，用内网 IP 直接访问 | 只有自己用，安全性最高，零端口暴露 |
| **Cloudflare Tunnel** | `cloudflared` 容器 + 免费域名，自带 HTTPS | 没有公网 IP，也不想开路由器端口 |
| **群晖反向代理** | 控制面板 → 登录门户 → 高级 → 反向代理，配好证书 | 已有域名和公网 IP |

### Lucky 反代 + 自有域名（推荐）

Lucky 自带 ACME，能自动签发并续期 Let's Encrypt 证书，配合自有域名是最省事的方案。

**第 1 步：申请证书**

Lucky → 「SSL/TLS 证书」→ 添加证书：

| 项 | 值 |
|---|---|
| 证书颁发 | ACME |
| 域名 | `nav.你的域名.com` |
| 验证方式 | **优先选 DNS**（填 DNS 服务商的 API Token） |
| 备注 | HTTP 验证需要 80 端口从公网可达，国内家宽通常被封 |

DNS 验证的好处是不依赖 80 端口，家宽环境也能签发成功。

**第 2 步：添加反向代理规则**

Lucky → 「Web 服务」→ 添加规则：

| 项 | 值 |
|---|---|
| 规则名称 | funtabs |
| 服务类型 | 反向代理 |
| 监听端口 | `443`（若被封改用 `8443` 等非标端口） |
| 启用 TLS | 开，选第 1 步申请的证书 |
| 前端域名 | `nav.你的域名.com` |
| 后端地址 | `http://127.0.0.1:8099` |

**第 3 步：让外部能到 Lucky**

- 有公网 IP：路由器做端口映射，`443`（或 `8443`）→ Lucky 所在设备
- 无公网 IP：用 Lucky 的 **STUN 穿透** 拿到可用端口，注意访问时要带端口
- 动态 IP：Lucky 的 DDNS 会自动更新解析

**第 4 步：改 compose 的两个变量**

```yaml
- TRUST_PROXY=1      # 必须！否则限流把所有请求当成 Lucky 一个 IP
- API_TOKEN=<生成的随机串>
```

`TRUST_PROXY=1` 后服务端才会读取 Lucky 传来的 `X-Forwarded-For` 拿到真实来源 IP。

**必须避开的三个坑**

1. **后端地址别写成 https**：Lucky 负责对外 HTTPS，回源走 http 即可，写成 https 会因证书问题失败
2. **别加会覆盖 Authorization 的自定义请求头**：Lucky 默认会透传，若你在「自定义请求头」里手动加了 `Authorization`，会把前端带的 token 顶掉，导致全部 401
3. **80/443 被封时访问要带端口**：`https://nav.你的域名.com:8443`，这是国内家宽的常态，不是配置错了

> 额外一层保险：Lucky 的 Web 服务规则里可以开启访问控制（Basic Auth），
> 让反向代理这一层先拦一道，funtabs 本身就不用暴露在公网路径上。

### 其他方案

群晖反向代理要点：来源协议 HTTPS、来源端口 443、目的地 `http://localhost:8099`，
并在「自定义标头」里确认保留了 `Authorization`（默认会透传，不要手动删掉）。

> 不建议直接把 8099 端口转发到公网：裸 HTTP、无证书、容易被扫描器盯上。

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
| GET | `/api/webtitle?url=` | 抓取目标网页标题（添加书签时自动填标题） |
| GET | `/api/favicon?url=` | 抓取并缓存网站图标到 `data/favicons/`，返回本地 URL |
| GET | `/api/hotEvent/:type` | 热搜聚合（weibo/douyin/bili/toutiao/tieba/baidu/zhihu/sspai），上游为 60s API，可用 `HOT_API_BASE` 指向自托管实例 |
| GET | `/api/data/raw?format=yaml\|json` | 下载 NAS 上的原始数据文件，导出的一定是真相源 |
| POST | `/api/data/import` | 上传 YAML/JSON 文本，服务端解析校验后写入 |
| GET | `/api/fanyi?text=` | 翻译代理（MyMemory 免费 API，自动识别中英互译） |

> 以上接口已完全替代原作者服务器 api.funtabs.cn 的对应能力；
> 广告、捐赠、遥测上报（saveWebInfo）、百度统计均已从代码中移除。

写入时若客户端 `updatedAt` 与服务端不一致会返回 `409` 并附带服务端版本，
前端据此提示冲突；`force=1` 可强制覆盖。

## 数据文件：YAML（推荐）或 JSON

主数据文件就是 NAS 上的 **`data/funtabs.yaml`**，可直接用文本编辑器批量改网址，
也能放进 git 做版本管理。结构如下：

```yaml
version: 4
updatedAt: 1730361600000
layout:            # 卡片与网格布局
  widthNum: 160
  heightNum: 64
  cardStyle: defaultCard
  radius: 12
tabs:              # 分类
  - key: 0
    label: 常用
    type: folder
    items:         # 该分类下的网址
      - label: 百度
        link: https://www.baidu.com
        type: link
        size: "11"
```

**改完如何生效**（两种方式任选）：

1. 网页「关于 → 备份/恢复数据 → 下载 YAML / 上传 YAML 写入 NAS」
2. 命令行直连接口（公网需带 Token）：

```bash
# 导出
curl -H "Authorization: Bearer 你的TOKEN" \
  "https://你的域名/api/data/raw?format=yaml" -o funtabs.yaml

# 导入（把文件内容作为 JSON 字符串的 content 字段提交）
python - <<'PY'
import json, urllib.request
content = open("funtabs.yaml", encoding="utf-8").read()
req = urllib.request.Request(
    "https://你的域名/api/data/import",
    data=json.dumps({"format": "yaml", "content": content}).encode(),
    headers={"Content-Type": "application/json", "Authorization": "Bearer 你的TOKEN"},
)
print(urllib.request.urlopen(req).read().decode()[:200])
PY
```

**格式切换**：环境变量 `DATA_FORMAT=yaml`（默认）或 `json`。首次启动时若目标格式文件不存在，
会自动从另一种格式转换过来，**原文件保留不删**。每次写入都会另存一份上一版本 `funtabs.yaml.bak`。

## 从 WeTab / iTab 迁移数据

WeTab 导出的备份是它自己的 JSON 结构，不能直接导入。仓库提供了转换工具 `tools/wetab2xtab.py`（零第三方依赖，Python 3.6+ 直接运行）。

**第一步：从 WeTab 导出**
WeTab 界面 → 右上角头像 / 个人信息 → 导出数据，得到一个 JSON（或 `.txt`）文件。
> 如果 WeTab 里的书签本来就是从浏览器导入的，更省事的办法是直接从 Chrome/Edge 的书签管理器导出 `bookmarks.html`——脚本同样支持，且结构更标准。

**第二步：转换**

```bash
# 生成一份全新的 xtab-import.yaml
python tools/wetab2xtab.py WeTab备份.json -o xtab-import.yaml

# 或者：追加到你现有的数据文件后面，保留已有书签（推荐）
python tools/wetab2xtab.py WeTab备份.json --append-to /volume1/docker/xtab/data/funtabs.yaml
```

脚本会自动探测备份结构（无需关心具体字段名）、按分类归组、按规范化 URL 去重，并打印解析统计。
图标字段刻意留空，交给 Xtab 后端按域名重新抓取，避免沿用已失效的外链。

**第三步：导入**
Xtab → 顶栏「更多」→「备份恢复数据」→「上传 YAML 写入 NAS」。

**注意**
- 上传会**整体覆盖** NAS 上的现有数据，操作前先点「下载 YAML」备份一份。
- 用 `--append-to` 时脚本只做文本追加，改完同样需要上传回去才生效。
- 若脚本报告「没有解析出任何书签」，说明该备份结构超出自动识别范围，把导出文件发来补一条专用解析规则即可。

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

### 移除 Obsidian 集成
早期版本提供过 Obsidian 双通道集成（Advanced URI 唤起 + File System Access 直连 vault）。
实测体验不佳（授权易失效、跨设备不可用、依赖浏览器专属 API），已于 v1.2.0 整体移除。
