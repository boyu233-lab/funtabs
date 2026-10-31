# 阶段一：构建前端
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

# 阶段二：运行后端 + 静态产物
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8099
ENV DATA_DIR=/app/data
COPY package.json ./
RUN npm install express --no-audit --no-fund
COPY server ./server
COPY --from=builder /app/build ./build
RUN mkdir -p /app/data/uploads
VOLUME ["/app/data"]
EXPOSE 8099
CMD ["node", "server/index.js"]
