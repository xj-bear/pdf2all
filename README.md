# pdf2all全能转换器 (v1.1.4)

这是一个功能强大的 MCP (Model Context Protocol) 服务器，提供全能的 PDF 转换工具。支持将 PDF 转换为 Word、Excel、PPT 和 JPG 图片。

## ✨ 功能特性

- **PDF 转 Word (docx)**: 保持排版、表格和图片。
- **PDF 转 Excel (xlsx)**: 智能提取表格，支持 OCR (内置 RapidOCR，无需额外安装软件)。
- **PDF 转 PPT (pptx)**: 将每一页转换为幻灯片。
- **PDF 转图片 (jpg)**: 高清转换每一页。
- **云端存储支持**: 自动将转换结果上传到 S3 兼容存储桶（AWS, MinIO, Bitiful 等），并返回下载链接，避免 Base64 传输导致 Token 溢出。

## 🚀 快速开始

### 方式 1: 使用 npx 直接运行

```bash
npx -y pdf2all-mcp
```

### 方式 2: 安装到本地

```bash
npm install -g pdf2all-mcp
pdf2all-mcp
```

## ⚙️ 配置说明 (重要)

为了使用云端存储功能和确保 Python 环境正常，你需要配置环境变量。

### 1. 环境变量列表

| 变量名 | 是否必填 | 说明 | 示例 |
|--------|----------|------|------|
| `S3_ENDPOINT` | 选填* | S3 兼容服务的 Endpoint URL (**开启云存储必填**) | `https://s3.bitiful.net` |
| `S3_ACCESS_KEY_ID` | 选填* | Access Key ID (**开启云存储必填**) | `your_access_key` |
| `S3_SECRET_ACCESS_KEY` | 选填* | Secret Access Key (**开启云存储必填**) | `your_secret_key` |
| `S3_BUCKET` | 选填* | 存储桶名称 (**开启云存储必填**) | `pdf2all` |
| `S3_REGION` | 选填 | 区域 (默认 `auto`) | `auto` 或 `us-east-1` |
| `S3_PUBLIC_DOMAIN` | 选填 | 自定义下载域名 (用于生成更短的下载链接) | `https://cdn.example.com` |
| `PYTHON_PATH` | 选填 | 指定 Python 解释器路径 (默认使用系统 `python`) | `D:\env\python\python.exe` |

> **\* 说明**: 如果不配置 S3 相关变量，服务器将以**本地模式**运行。
> - **本地文件输入**: 直接在本地生成文件。
> - **URL/Base64 输入**: 返回文件的 Base64 编码（注意：大文件可能会导致 LLM Token 溢出，建议配置 S3）。

### 2. 多平台配置指南

#### Claude Code / Claude Desktop

在 `claude_desktop_config.json` 中配置：

```json
{
  "mcpServers": {
    "pdf2all": {
      "command": "npx",
      "args": ["-y", "pdf2all-mcp"],
      "env": {
        "S3_ENDPOINT": "https://s3.bitiful.net",
        "S3_ACCESS_KEY_ID": "your_key",
        "S3_SECRET_ACCESS_KEY": "your_secret",
        "S3_BUCKET": "pdf2all",
        "PYTHON_PATH": "python"
      }
    }
  }
}
```

#### Cursor

在 Cursor 的 MCP 设置中添加：

*   **Name**: pdf2all
*   **Type**: command
*   **Command**: `npx -y pdf2all-mcp`
*   **Environment Variables**: 添加上述 S3 和 PYTHON_PATH 变量。

#### Windsurf

在 Windsurf 的配置文件或 MCP 管理界面中：

```json
{
  "mcpServers": {
    "pdf2all": {
      "command": "npx",
      "args": ["-y", "pdf2all-mcp"],
      "env": {
        "S3_ENDPOINT": "...",
        "S3_ACCESS_KEY_ID": "...",
        "S3_SECRET_ACCESS_KEY": "...",
        "S3_BUCKET": "...",
        "PYTHON_PATH": "python"
      }
    }
  }
}
```

#### Antigravity (Gemini)

在 `mcp-config.json` 中：

```json
{
  "mcpServers": {
    "pdf2all": {
      "command": "node",
      "args": ["/path/to/pdf2all/dist/src/index.js"],
      "env": {
        "S3_ENDPOINT": "...",
        "S3_ACCESS_KEY_ID": "...",
        "S3_SECRET_ACCESS_KEY": "...",
        "S3_BUCKET": "...",
        "PYTHON_PATH": "D:\\env\\python\\python.exe"
      }
    }
  }
}
```

### 3. 使用本地配置文件 (备选)

如果你不方便修改客户端配置，也可以在你的**用户主目录**下创建一个配置文件：

**Windows**: `C:\Users\你的用户名\.pdf2all-mcp\.env`
**macOS/Linux**: `~/.pdf2all-mcp/.env`

文件内容示例：

```env
S3_ENDPOINT=https://s3.bitiful.net
S3_ACCESS_KEY_ID=xxx
S3_SECRET_ACCESS_KEY=xxx
S3_BUCKET=pdf2all
PYTHON_PATH=D:\env\python\python.exe
```

### 4. 部署指南 (Deployment Guide)

本项目支持多种部署方式，请根据您的环境选择最合适的一种。

#### 方式 A: Docker 镜像部署 (推荐)

最简单、最稳定的部署方式。支持所有云平台 (Railway, Zeabur, 阿里云等)。

1.  **创建 `docker-compose.yml` 文件**:

    ```yaml
    services:
      pdf2all:
        # 使用官方镜像 (请替换为您构建的镜像地址，或使用 build: . 本地构建)
        # image: yourusername/pdf2all-mcp:latest
        build: . 
        container_name: pdf2all-mcp
        restart: always
        ports:
          - "3000:3000"
        environment:
          - NODE_ENV=production
          - PORT=3000
          # S3 配置 (可选，用于云端存储)
          - S3_ENDPOINT=https://s3.bitiful.net
          - S3_REGION=auto
          - S3_ACCESS_KEY_ID=your_access_key
          - S3_SECRET_ACCESS_KEY=your_secret_key
          - S3_BUCKET=pdf2all
    ```

2.  **启动服务**:
    ```bash
    docker-compose up -d
    ```

#### 方式 B: 源码部署 (Git)

适用于 1Panel、宝塔面板或手动部署。

1.  **克隆仓库**:
    ```bash
    git clone https://github.com/yourusername/pdf2all-mcp.git
    cd pdf2all-mcp
    ```

2.  **启动 (使用 Docker)**:
    直接使用项目自带的 `docker-compose.yml`：
    ```bash
    docker-compose up -d --build
    ```

3.  **启动 (不使用 Docker)**:
    *需确保系统已安装 Node.js 18+ 和 Python 3.8+*
    ```bash
    npm install
    npm run build
    npm start
    ```

#### 方式 C: npx 一键运行 (本地/轻量级)

适用于本地快速测试或支持 Node.js 的简单环境。

```bash
npx -y pdf2all-mcp
```
*注意：此方式在不含 Python 的云环境中可能会失败。*

### 5. 自动化构建 (GitHub Actions)

本项目已包含 GitHub Actions 配置 (`.github/workflows/docker-publish.yml`)。
只要将代码推送到 GitHub，它就会自动构建 Docker 镜像并推送到 Docker Hub。

**配置步骤**:
1.  在 GitHub 仓库的 **Settings** -> **Secrets and variables** -> **Actions** 中添加：
    *   `DOCKER_USERNAME`: 您的 Docker Hub 用户名
    *   `DOCKER_PASSWORD`: 您的 Docker Hub 访问令牌 (Access Token)
2.  推送到 `main` 分支，GitHub Actions 会自动运行。

## 🛠️ 依赖要求

- **Node.js**: >= 18
- **Python**: >= 3.8
  - 需安装依赖: `pip install -r python/requirements.txt`
  - 包含: `pdf2docx`, `pdfplumber`, `rapidocr_onnxruntime` 等。
  - **OCR 说明**: 本项目使用 `RapidOCR` (基于 ONNX)，**无需安装** Tesseract 软件，安装 Python 依赖即可使用。

## 📝 使用示例

在 MCP 客户端中，你可以这样问：

- "把这个 PDF 转成 Word 文档：[文件路径/URL]"
- "帮我提取这个 PDF 里的表格到 Excel"
- "把这个 PDF 的每一页都转成图片，并打包给我"

## 📄 许可证

MIT
