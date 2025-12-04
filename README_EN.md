# pdf2all Universal Converter (v1.1.1)

A powerful MCP (Model Context Protocol) server that provides comprehensive PDF conversion tools. Convert PDFs to Word, Excel, PPT, and JPG images with ease.

## ✨ Features

- **PDF to Word (docx)**: Preserve formatting, tables, and images
- **PDF to Excel (xlsx)**: Intelligent table extraction with OCR support (built-in RapidOCR, no additional software required)
- **PDF to PPT (pptx)**: Convert each page to presentation slides
- **PDF to Images (jpg)**: High-quality conversion of each page
- **Cloud Storage Support**: Automatically upload conversion results to S3-compatible storage (AWS, MinIO, Bitiful, etc.) and return download links, avoiding Base64 transmission that may cause token overflow

## 🚀 Quick Start

### Method 1: Run directly with npx

```bash
npx -y pdf2all-mcp
```

### Method 2: Install locally

```bash
npm install -g pdf2all-mcp
pdf2all-mcp
```

## ⚙️ Configuration (Important)

To use cloud storage functionality and ensure Python environment works properly, you need to configure environment variables.

### 1. Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `S3_ENDPOINT` | Optional* | S3-compatible service endpoint URL (**required for cloud storage**) | `https://s3.bitiful.net` |
| `S3_ACCESS_KEY_ID` | Optional* | Access Key ID (**required for cloud storage**) | `your_access_key` |
| `S3_SECRET_ACCESS_KEY` | Optional* | Secret Access Key (**required for cloud storage**) | `your_secret_key` |
| `S3_BUCKET` | Optional* | Storage bucket name (**required for cloud storage**) | `pdf2all` |
| `S3_REGION` | Optional | Region (default `auto`) | `auto` or `us-east-1` |
| `S3_PUBLIC_DOMAIN` | Optional | Custom download domain (for shorter download links) | `https://cdn.example.com` |
| `PYTHON_PATH` | Optional | Specify Python interpreter path (defaults to system `python`) | `D:\env\python\python.exe` |

> **\* Note**: If S3-related variables are not configured, the server will run in **local mode**.
> - **Local file input**: Generate files directly locally
> - **URL/Base64 input**: Return Base64 encoding of files (Note: Large files may cause LLM token overflow, S3 configuration recommended)

### 2. Multi-Platform Configuration Guide

#### Claude Code / Claude Desktop

Configure in `claude_desktop_config.json`:

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

Add in Cursor's MCP settings:

*   **Name**: pdf2all
*   **Type**: command
*   **Command**: `npx -y pdf2all-mcp`
*   **Environment Variables**: Add the above S3 and PYTHON_PATH variables

#### Windsurf

In Windsurf's configuration file or MCP management interface:

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

In `mcp-config.json`:

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

### 3. Local Configuration File (Alternative)

If you prefer not to modify client configurations, you can create a configuration file in your **home directory**:

**Windows**: `C:\Users\YourUsername\.pdf2all-mcp\.env`
**macOS/Linux**: `~/.pdf2all-mcp/.env`

Example file content:

```env
S3_ENDPOINT=https://s3.bitiful.net
S3_ACCESS_KEY_ID=xxx
S3_SECRET_ACCESS_KEY=xxx
S3_BUCKET=pdf2all
PYTHON_PATH=D:\env\python\python.exe
```

### 4. Deployment Guide
This project supports multiple deployment methods. Please choose the one that best fits your environment.

#### Method A: Docker Image Deployment (Recommended)
The simplest and most stable method. Supports all cloud platforms (Railway, Zeabur, Alibaba Cloud, etc.).

1.  **Create `docker-compose.yml`**:

    ```yaml
    services:
      pdf2all:
        # Use official image (replace with your image address or use build: . for local build)
        # image: yourusername/pdf2all-mcp:latest
        build: . 
        container_name: pdf2all-mcp
        restart: always
        ports:
          - "3000:3000"
        environment:
          - NODE_ENV=production
          - PORT=3000
          # S3 Configuration (Optional, for cloud storage)
          - S3_ENDPOINT=https://s3.bitiful.net
          - S3_REGION=auto
          - S3_ACCESS_KEY_ID=your_access_key
          - S3_SECRET_ACCESS_KEY=your_secret_key
          - S3_BUCKET=pdf2all
    ```

2.  **Start Service**:
    ```bash
    docker-compose up -d
    ```

#### Method B: Source Deployment (Git)
Suitable for 1Panel, Baota Panel, or manual deployment.

1.  **Clone Repository**:
    ```bash
    git clone https://github.com/yourusername/pdf2all-mcp.git
    cd pdf2all-mcp
    ```

2.  **Start (using Docker)**:
    Use the included `docker-compose.yml`:
    ```bash
    docker-compose up -d --build
    ```

3.  **Start (without Docker)**:
    *Requires Node.js 18+ and Python 3.8+ installed on the system*
    ```bash
    npm install
    npm run build
    npm start
    ```

#### Method C: npx One-Click Run (Local/Lightweight)
Suitable for local testing or simple Node.js environments.

```bash
npx -y pdf2all-mcp
```
*Note: This method may fail in cloud environments that do not include Python.*

### 5. Automated Build (GitHub Actions)
This project includes GitHub Actions configuration (`.github/workflows/docker-publish.yml`).
Simply push your code to GitHub, and it will automatically build the Docker image and push it to Docker Hub.

**Configuration Steps**:
1.  In your GitHub repository, go to **Settings** -> **Secrets and variables** -> **Actions** and add:
    *   `DOCKER_USERNAME`: Your Docker Hub username
    *   `DOCKER_PASSWORD`: Your Docker Hub Access Token
2.  Push to the `main` branch, and GitHub Actions will run automatically.

## 🛠️ Dependencies

- **Node.js**: >= 18
- **Python**: >= 3.8
  - Install dependencies: `pip install -r python/requirements.txt`
  - Includes: `pdf2docx`, `pdfplumber`, `rapidocr_onnxruntime`, etc.
  - **OCR Note**: This project uses `RapidOCR` (based on ONNX), **no need to install** Tesseract software, just install Python dependencies

## 📝 Usage Examples

In your MCP client, you can ask:

- "Convert this PDF to Word document: [file path/URL]"
- "Extract tables from this PDF to Excel for me"
- "Convert each page of this PDF to images and package them for me"

## 📄 License

MIT