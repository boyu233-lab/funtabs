# 阶段一：构建前端
FROM node:20-alpine AS builder
WORKDIR /app
# .npmrc 必须和安装命令同一批复制进来，否则 npm install 阶段读不到 legacy-peer-deps
COPY package.json package-lock.json* .npmrc* ./
RUN npm install --legacy-peer-deps --no-audit --no-fund
COPY . .
RUN npm run build

# 阶段二：运行后端 + 静态产物
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8099
ENV DATA_DIR=/app/data
# 运行时只装后端真正用到的两个包：express 提供接口，yaml 负责数据文件的解析与序列化。
# 两点注意：
# 1. 不能把项目的 package.json 复制进来，否则 npm install 会解析整棵依赖树
#    并因 peer 冲突（react-mde 等）失败
# 2. 必须锁定 express 4.x：v5 起 app.get("*") 非法，SPA 回退路由会直接崩
RUN npm init -y > /dev/null && npm install express@^4.19.2 yaml@^2.4.5 --no-audit --no-fund
COPY server ./server
COPY --from=builder /app/build ./build
RUN mkdir -p /app/data/uploads
VOLUME ["/app/data"]
EXPOSE 8099
CMD ["node", "server/index.js"]
