#!/usr/bin/env bash
# 构建镜像并推送到镜像仓库（Git Bash / Linux / macOS 均可运行）
#
# 前置：
#   1. Docker 已启动
#   2. 已登录目标仓库，例如：
#        docker login registry.cn-hangzhou.aliyuncs.com      # 阿里云 ACR
#        docker login docker.io                              # Docker Hub
#        docker login ghcr.io                                # GitHub 仓库
#
# 用法：
#   IMAGE=registry.cn-hangzhou.aliyuncs.com/yourns/funtabs:latest ./scripts/publish-image.sh
#   不带 IMAGE 时默认使用本地名 funtabs:latest（只构建不推送）

set -euo pipefail

IMAGE="${IMAGE:-funtabs:latest}"
PLATFORM="${PLATFORM:-linux/amd64}"

cd "$(dirname "$0")/.."

echo "==> 构建镜像 ${IMAGE} (${PLATFORM})"
docker build --platform "${PLATFORM}" -t "${IMAGE}" .

# 只有带仓库地址（含 /）时才推送，避免误推到本地镜像
if [[ "${IMAGE}" == *"/"* ]]; then
  echo "==> 推送镜像 ${IMAGE}"
  docker push "${IMAGE}"
  echo "==> 完成，NAS 上执行：docker pull ${IMAGE}"
else
  echo "==> 未检测到仓库地址，已跳过推送（仅本地构建）"
  echo "==> 需要推送请设置 IMAGE=仓库地址/命名空间/funtabs:latest"
fi
