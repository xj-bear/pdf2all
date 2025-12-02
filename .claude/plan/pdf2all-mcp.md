# PDF2All MCP 开发计划

## 项目概述

创建一个 MCP (Model Context Protocol) 工具，使用 npm/npx 打包分发，提供 PDF 转换功能。

## 技术架构

```
┌─────────────────────────────────────────────────┐
│              MCP Server (TypeScript)            │
│  @modelcontextprotocol/sdk + zod                │
│  ┌───────────────────────────────────────────┐  │
│  │  Tools:                                   │  │
│  │  - pdf_to_docx                            │  │
│  │  - pdf_to_excel                           │  │
│  │  - pdf_to_ppt                             │  │
│  │  - pdf_to_jpg                             │  │
│  └───────────────────────────────────────────┘  │
│                      │                          │
│                      ▼                          │
│         spawn Python subprocess                 │
└─────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│           Python Converter Scripts              │
│  - pdf2docx (PDF → DOCX)                        │
│  - pdfplumber (PDF → Excel)                     │
│  - PyMuPDF + python-pptx (PDF → PPT)            │
│  - PyMuPDF (PDF → JPG)                          │
└─────────────────────────────────────────────────┘
```

## 功能规格

| 功能 | 描述 | 约束 |
|------|------|------|
| PDF → DOCX | 保留格式、表格、图片 | 文件 ≤100MB |
| PDF → Excel | 提取表格到 xlsx | 无表格时返回错误 |
| PDF → PPT | 每页转为幻灯片 | 150 DPI |
| PDF → JPG | 每页转为图片 | 72 DPI (web) |

## 错误处理

- 文件大小超过 100MB：返回错误提示
- 加密 PDF：返回 "PDF is encrypted" 提示
- 损坏 PDF：返回 "PDF appears to be corrupted" 提示

## 执行状态

- [x] 阶段 1：项目初始化
- [x] 阶段 2：Python 转换模块
- [x] 阶段 3：MCP Server 实现
- [x] 阶段 4：构建与测试

## 测试结果

| 测试项 | 状态 |
|--------|------|
| PDF → DOCX | ✅ 通过 |
| PDF → Excel | ✅ 通过 |
| PDF → PPT | ✅ 通过 |
| PDF → JPG | ✅ 通过 |
| MCP tools/list | ✅ 通过 |
