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

### 4. Cloud Deployment Guide (Important)

If you are deploying in a cloud environment (e.g., Railway, Zeabur, Alipay Mini Program Cloud), please note:

*   **Python Environment**: Most Node.js cloud environments **do not include Python**.
*   **Recommended**: Use **Docker** for deployment. This project includes a `Dockerfile` that automatically installs Node.js 18 + Python 3 + all dependencies.
*   **Alternative (npx)**: This project includes a `postinstall` script that attempts to run `pip install` automatically in environments that support Python. If deployment fails, please check if Python 3.8+ is installed in the cloud environment.

**Docker Deployment Example (docker-compose.yml)**:

```yaml
services:
  pdf2all:
    build: .
    environment:
      - S3_ENDPOINT=...
      - S3_ACCESS_KEY_ID=...
      - S3_SECRET_ACCESS_KEY=...
      - S3_BUCKET=...
```

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