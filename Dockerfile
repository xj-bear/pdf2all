# Use Node.js 18 as the base image
FROM node:18-slim

# Replace apt sources with Aliyun mirror for China
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list 2>/dev/null || true && \
    sed -i 's/security.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list 2>/dev/null || true && \
    sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true && \
    sed -i 's/security.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true

# Install Python 3, pip, and system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# Install dependencies (using Taobao mirror)
RUN npm config set registry https://registry.npmmirror.com && npm install

COPY . .

# Install Python dependencies (using Aliyun mirror)
RUN pip3 install --no-cache-dir -r python/requirements.txt --break-system-packages -i https://mirrors.aliyun.com/pypi/simple/

# Build TypeScript
RUN npm run build

# Prune devDependencies to save space
RUN npm prune --production

ENV PORT=10001
ENV NODE_ENV=production
ENV PYTHON_PATH=python3

EXPOSE 10001

CMD ["npm", "run", "start:sse"]
