#!/usr/bin/env node
/**
 * PDF2All MCP Server
 *
 * An MCP server that provides PDF conversion tools:
 * - pdf_to_docx: Convert PDF to Word document
 * - pdf_to_excel: Convert PDF tables to Excel
 * - pdf_to_ppt: Convert PDF to PowerPoint
 * - pdf_to_jpg: Convert PDF pages to JPG images
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Python converter script path
const PYTHON_SCRIPT = path.join(__dirname, "..", "python", "converter.py");

// Tool definitions
const TOOLS = [
  {
    name: "pdf_to_docx",
    description:
      "[PDF2All] Convert PDF to DOCX (Word) format. Preserves layout, tables, and images. Supports files up to 100MB. Returns error for encrypted or corrupted PDFs.",
    inputSchema: {
      type: "object" as const,
      properties: {
        pdf_path: {
          type: "string",
          description: "Absolute path to the input PDF file",
        },
        output_path: {
          type: "string",
          description: "Optional: Output file path. If not provided, saves alongside the PDF.",
        },
        fast_mode: {
          type: "boolean",
          description: "Optional: Use fast mode for better performance (slightly lower quality). Default: false",
        },
      },
      required: ["pdf_path"],
    },
  },
  {
    name: "pdf_to_excel",
    description:
      "[PDF2All] Extract tables from PDF and save as Excel (.xlsx) file. Each table becomes a separate sheet. Supports OCR for image-based tables (requires Tesseract/RapidOCR). Works with both native PDF tables and scanned documents.",
    inputSchema: {
      type: "object" as const,
      properties: {
        pdf_path: {
          type: "string",
          description: "Absolute path to the input PDF file",
        },
        output_path: {
          type: "string",
          description: "Optional: Output file path. If not provided, saves alongside the PDF.",
        },
        pages: {
          type: "string",
          description: "Optional: Pages to process (e.g., '1,3,5' or '1-5' or 'all'). Default: 'all'",
        },
        use_ocr: {
          type: "boolean",
          description: "Optional: Use OCR for image-based tables. Set to true for scanned documents. Default: false (faster)",
        },
      },
      required: ["pdf_path"],
    },
  },
  {
    name: "pdf_to_ppt",
    description:
      "[PDF2All] Convert PDF to PowerPoint (.pptx) format. Each page becomes a slide with the page rendered as an image at 150 DPI. Ideal for presentations and slide decks.",
    inputSchema: {
      type: "object" as const,
      properties: {
        pdf_path: {
          type: "string",
          description: "Absolute path to the input PDF file",
        },
        output_path: {
          type: "string",
          description: "Optional: Output file path. If not provided, saves alongside the PDF.",
        },
        dpi: {
          type: "number",
          description: "Optional: Image resolution (75-300 DPI). Lower values = faster conversion. Default: 150",
        },
      },
      required: ["pdf_path"],
    },
  },
  {
    name: "pdf_to_jpg",
    description:
      "[PDF2All] Convert PDF pages to JPG images. Creates one image per page at web-standard resolution (72 DPI). Output files are named with page numbers (e.g., filename_page_1.jpg).",
    inputSchema: {
      type: "object" as const,
      properties: {
        pdf_path: {
          type: "string",
          description: "Absolute path to the input PDF file",
        },
        output_path: {
          type: "string",
          description: "Optional: Output directory or file path pattern. If not provided, saves alongside the PDF.",
        },
        dpi: {
          type: "number",
          description: "Optional: Image resolution (36-300 DPI). Lower values = faster conversion. Default: 72",
        },
        quality: {
          type: "number",
          description: "Optional: JPEG quality (1-95). Lower values = smaller files, faster conversion. Default: 85",
        },
      },
      required: ["pdf_path"],
    },
  },
];

/**
 * Execute Python converter script
 */
// Timeout for Python process (90 seconds for Cherry Studio compatibility)
const PYTHON_TIMEOUT = 90 * 1000;

async function executePythonConverter(
  action: string,
  pdfPath: string,
  outputPath?: string,
  fastMode?: boolean,
  dpi?: number,
  quality?: number,
  pages?: string,
  useOcr?: boolean
): Promise<{ success: boolean;[key: string]: unknown }> {
  return new Promise((resolve) => {
    const request = {
      action,
      pdf_path: pdfPath,
      ...(outputPath && { output_path: outputPath }),
      ...(fastMode !== undefined && action === "pdf_to_docx" && { fast_mode: fastMode }),
      ...(dpi !== undefined && (action === "pdf_to_ppt" || action === "pdf_to_jpg") && { dpi }),
      ...(quality !== undefined && action === "pdf_to_jpg" && { quality }),
      ...(pages !== undefined && action === "pdf_to_excel" && { pages }),
      ...(useOcr !== undefined && action === "pdf_to_excel" && { use_ocr: useOcr }),
    };

    const pythonProcess = spawn("python", [PYTHON_SCRIPT], {
      cwd: path.dirname(PYTHON_SCRIPT),
      env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" } // 确保Python输出不被缓冲且使用UTF-8
    });

    // Write request to stdin
    pythonProcess.stdin.write(JSON.stringify(request));
    pythonProcess.stdin.end();

    let stdout = "";
    let timedOut = false;

    // Set timeout
    const timeout = setTimeout(() => {
      timedOut = true;
      pythonProcess.kill("SIGTERM");
      resolve({
        success: false,
        error: "Conversion timed out. The file may be too large or complex.",
      });
    }, PYTHON_TIMEOUT);

    pythonProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    // Ignore stderr - libraries like pdf2docx output INFO logs there
    pythonProcess.stderr.on("data", () => { });

    pythonProcess.on("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) return;

      if (code !== 0) {
        resolve({
          success: false,
          error: `Python process exited with code ${code}`,
        });
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch {
        resolve({
          success: false,
          error: `Failed to parse Python output: ${stdout}`,
        });
      }
    });

    pythonProcess.on("error", (err) => {
      clearTimeout(timeout);
      if (timedOut) return;
      resolve({
        success: false,
        error: `Failed to spawn Python process: ${err.message}. Make sure Python is installed and in PATH.`,
      });
    });
  });
}



// ... (imports remain the same)

/**
 * Create and configure the MCP server
 */
function createServer(baseUrl?: string, publicDir?: string): Server {
  const server = new Server(
    {
      name: "pdf2all-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Validate tool name
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${name}. Available tools: ${TOOLS.map((t) => t.name).join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    // Extract arguments
    const pdfPath = (args as { pdf_path?: string })?.pdf_path;
    const outputPath = (args as { output_path?: string })?.output_path;
    const fastMode = (args as { fast_mode?: boolean })?.fast_mode;
    const dpi = (args as { dpi?: number })?.dpi;
    const quality = (args as { quality?: number })?.quality;
    const pages = (args as { pages?: string })?.pages;
    const useOcr = (args as { use_ocr?: boolean })?.use_ocr;

    if (!pdfPath) {
      return {
        content: [
          {
            type: "text",
            text: "Error: pdf_path is required",
          },
        ],
        isError: true,
      };
    }

    // Execute conversion
    const result = await executePythonConverter(name, pdfPath, outputPath, fastMode, dpi, quality, pages, useOcr);

    if (result.success) {
      // Build success message
      let message = result.message as string;
      const links: string[] = [];

      // Helper to copy file and generate link
      const processFile = (filePath: string) => {
        if (baseUrl && publicDir) {
          try {
            const fileName = path.basename(filePath);
            const destPath = path.join(publicDir, fileName);
            fs.copyFileSync(filePath, destPath);
            return `${baseUrl}/${fileName}`;
          } catch (e) {
            console.error(`Failed to copy file ${filePath} to public dir:`, e);
            return null;
          }
        }
        return null;
      };

      // For pdf_to_jpg, list output files
      if (name === "pdf_to_jpg" && result.output_paths) {
        const paths = result.output_paths as string[];
        message += `\n\nOutput files:\n${paths.map((p) => `- ${p}`).join("\n")}`;

        if (baseUrl && publicDir) {
          paths.forEach(p => {
            const link = processFile(p);
            if (link) links.push(link);
          });
        }
      } else if (result.output_path) {
        const p = result.output_path as string;
        message += `\n\nOutput file: ${p}`;

        if (baseUrl && publicDir) {
          const link = processFile(p);
          if (link) links.push(link);
        }
      }

      if (links.length > 0) {
        message += `\n\nDownload Links:\n${links.map(l => `- ${l}`).join("\n")}`;
      }

      return {
        content: [
          {
            type: "text",
            text: message,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Conversion failed: ${result.error}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Main entry point
 */
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Check for SSE mode
  const args = process.argv.slice(2);
  const isSSE = args.includes("--sse") || process.env.MCP_MODE === "sse";
  const port = process.env.PORT || 3000;

  if (isSSE) {
    const app = express();
    app.use(cors());

    // Setup static file serving
    const publicDir = path.join(__dirname, "..", "public");
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    app.use("/files", express.static(publicDir));

    const baseUrl = `http://localhost:${port}/files`;
    const server = createServer(baseUrl, publicDir);

    // We need a way to handle the POST messages.
    // Let's refactor to store transports.
    const transports = new Map<string, SSEServerTransport>();

    app.get("/sse", async (req, res) => {
      console.log("New SSE connection");
      const transport = new SSEServerTransport("/messages", res);
      const sessionId = transport.sessionId;
      console.log("Session ID:", sessionId);
      transports.set(sessionId, transport);

      await server.connect(transport);

      // Clean up on close
      req.on("close", () => {
        console.log("SSE connection closed:", sessionId);
        transports.delete(sessionId);
        server.close();
      });
    });

    app.post("/messages", async (req, res) => {
      const sessionId = req.query.sessionId as string;
      console.log("Received message for session:", sessionId);
      const transport = transports.get(sessionId);

      if (!transport) {
        console.log("Session not found in transports map. Available sessions:", [...transports.keys()]);
        res.status(404).send("Session not found");
        return;
      }

      await transport.handlePostMessage(req, res);
    });

    app.listen(port, () => {
      console.error(`PDF2All MCP Server running on SSE mode at http://localhost:${port}/sse`);
    });
  } else {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
