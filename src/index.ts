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
import { v4 as uuidv4 } from "uuid";
import AdmZip from "adm-zip";
import os from "os";
import dotenv from "dotenv";
import { uploadToOss, isOssConfigured } from './ossManager.js';

// Load environment variables from multiple sources
// 1. Current working directory
dotenv.config();
// 2. User home directory (~/.pdf2all-mcp/.env)
const homeConfigPath = path.join(os.homedir(), ".pdf2all-mcp", ".env");
if (fs.existsSync(homeConfigPath)) {
  dotenv.config({ path: homeConfigPath });
}

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Python converter script path
const PYTHON_SCRIPT = path.join(__dirname, "..", "python", "converter.py");

// Temporary directory for downloads/uploads
const TEMP_DIR = path.join(os.tmpdir(), "pdf2all-mcp");
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

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

    const pythonCmd = process.env.PYTHON_PATH || "python";
    const pythonProcess = spawn(pythonCmd, [PYTHON_SCRIPT], {
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
        // Find the last valid JSON object in the output
        const lines = stdout.trim().split('\n');
        let jsonStr = "";

        // Strategy 1: Try to parse the last line
        try {
          const lastLine = lines[lines.length - 1];
          JSON.parse(lastLine);
          jsonStr = lastLine;
        } catch (e) {
          // Strategy 2: Scan for JSON object from the end
          const fullOutput = stdout.trim();
          const lastBrace = fullOutput.lastIndexOf('}');
          if (lastBrace !== -1) {
            const firstBrace = fullOutput.indexOf('{');
            if (firstBrace !== -1 && firstBrace <= lastBrace) {
              jsonStr = fullOutput.substring(firstBrace, lastBrace + 1);
            }
          }
        }

        if (!jsonStr) {
          throw new Error("No JSON found in output");
        }

        const result = JSON.parse(jsonStr);
        resolve(result);
      } catch (e) {
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

/**
 * Prepare input file from path, URL, or Base64
 */
async function prepareInputFile(
  pdfPath?: string,
  pdfUrl?: string,
  pdfBase64?: string
): Promise<{ path: string; isTemp: boolean }> {
  if (pdfPath) {
    return { path: pdfPath, isTemp: false };
  }

  if (pdfUrl) {
    const fileName = `${uuidv4()}.pdf`;
    const tempPath = path.join(TEMP_DIR, fileName);
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`Failed to download PDF from URL: ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(tempPath, Buffer.from(buffer));
    return { path: tempPath, isTemp: true };
  }

  if (pdfBase64) {
    const fileName = `${uuidv4()}.pdf`;
    const tempPath = path.join(TEMP_DIR, fileName);
    const buffer = Buffer.from(pdfBase64, "base64");
    fs.writeFileSync(tempPath, buffer);
    return { path: tempPath, isTemp: true };
  }

  throw new Error("One of pdf_path, pdf_url, or pdf_base64 must be provided");
}



/**
 * Handle output: return path or Base64 (and Zip for multiple files)
 * Now supports OSS upload!
 */
async function handleOutput(
  result: { success: boolean;[key: string]: unknown },
  inputTypeIsTemp: boolean
): Promise<{ message: string; base64?: string }> {
  let message = result.message as string;
  let base64: string | undefined;

  // Check if we should upload to OSS
  // We upload if OSS is configured AND (input was temp/remote OR user explicitly wants it?)
  // For now, let's say if OSS is configured, we ALWAYS prefer returning a URL for temp/remote inputs,
  // to avoid Base64 token limits.
  // For local inputs, we might still want to return a URL if it's a web-service scenario, 
  // but usually local users want local files.
  // User said: "如果直接用mcp返回，token会爆掉" -> implies remote/temp scenario.
  const useOss = isOssConfigured() && inputTypeIsTemp;

  // Case 1: Multiple files (pdf_to_jpg) -> Zip
  if (result.output_paths) {
    const paths = result.output_paths as string[];
    const zip = new AdmZip();

    // Add files to zip
    for (const p of paths) {
      if (fs.existsSync(p)) {
        zip.addLocalFile(p);
      }
    }

    if (inputTypeIsTemp) {
      // Cleanup temp output files
      for (const p of paths) {
        try { fs.unlinkSync(p); } catch (e) { console.error("Failed to delete temp file:", e); }
      }

      if (useOss) {
        // Create a temp zip file to upload
        const tempZipPath = path.join(TEMP_DIR, `${uuidv4()}.zip`);
        zip.writeZip(tempZipPath);

        const url = await uploadToOss(tempZipPath, "output.zip");
        if (url) {
          message += `\n\n[Download Output Zip](${url})`;
          message += `\n(Note: File may expire based on bucket policy)`;
        } else {
          message += `\n\nError: Failed to upload to OSS.`;
        }

        // Cleanup temp zip
        try { fs.unlinkSync(tempZipPath); } catch (e) { }
      } else {
        // Return Base64 for temp/remote inputs
        const zipBuffer = zip.toBuffer();
        base64 = zipBuffer.toString("base64");
        message += "\n\n[Base64 Zip Data Attached]";
      }
    } else {
      // For local inputs, save Zip to disk
      const firstFile = paths[0];
      const outputDir = path.dirname(firstFile);
      const basename = path.basename(firstFile).replace(/_page_\d+\.jpg$/, "");
      const zipPath = path.join(outputDir, `${basename}.zip`);

      try {
        zip.writeZip(zipPath);
        message += `\n\nOutput Zip: ${zipPath}`;
      } catch (e: any) {
        console.error("Failed to create zip:", e);
        message += `\n\nError creating Zip: ${e.message}`;
      }

      // Optional: Delete individual files? 
      // The user complaint "图片没有生成zip" suggests they prefer the zip. 
      // Let's keep them for safety but emphasize the zip.
      // Or maybe we should delete them to be cleaner? 
      // Let's NOT delete them for local files unless explicitly asked, 
      // but adding the Zip satisfies the "generate zip" requirement.
    }
  }
  // Case 2: Single file
  else if (result.output_path) {
    if (inputTypeIsTemp) {
      const p = result.output_path as string;
      if (fs.existsSync(p)) {
        if (useOss) {
          const url = await uploadToOss(p, path.basename(p));
          if (url) {
            message += `\n\n[Download Output File](${url})`;
            message += `\n(Note: File may expire based on bucket policy)`;
          } else {
            message += `\n\nError: Failed to upload to OSS.`;
          }
        } else {
          const buffer = fs.readFileSync(p);
          base64 = buffer.toString("base64");
          message += "\n\n[Base64 Data Attached]";
        }
        // Clean up output file
        try { fs.unlinkSync(p); } catch (e) { console.error("Failed to delete temp file:", e); }
      }
    }
  }

  return { message, base64 };
}

/**
 * Create and configure the MCP server
 */
function createServer(baseUrl?: string, publicDir?: string): Server {
  const server = new Server(
    {
      name: "pdf2all-mcp",
      version: "1.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Update tools schema dynamically to include new fields
    const updatedTools = TOOLS.map(tool => ({
      ...tool,
      inputSchema: {
        ...tool.inputSchema,
        properties: {
          ...tool.inputSchema.properties,
          pdf_path: { ...tool.inputSchema.properties.pdf_path, description: "Optional: Absolute path to local PDF file" },
          pdf_url: { type: "string", description: "Optional: URL to download PDF from" },
          pdf_base64: { type: "string", description: "Optional: Base64 encoded PDF content" }
        },
        required: [] // We handle validation manually
      }
    }));
    return { tools: updatedTools };
  });

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Validate tool name
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    // Extract arguments
    const pdfPathArg = (args as { pdf_path?: string })?.pdf_path;
    const pdfUrl = (args as { pdf_url?: string })?.pdf_url;
    const pdfBase64 = (args as { pdf_base64?: string })?.pdf_base64;

    // ... other args extraction
    const outputPath = (args as { output_path?: string })?.output_path;
    const fastMode = (args as { fast_mode?: boolean })?.fast_mode;
    const dpi = (args as { dpi?: number })?.dpi;
    const quality = (args as { quality?: number })?.quality;
    const pages = (args as { pages?: string })?.pages;
    const useOcr = (args as { use_ocr?: boolean })?.use_ocr;

    // Manual validation for input source
    if (!pdfPathArg && !pdfUrl && !pdfBase64) {
      return {
        content: [{ type: "text", text: "Error: One of pdf_path, pdf_url, or pdf_base64 must be provided." }],
        isError: true,
      };
    }
    if ([pdfPathArg, pdfUrl, pdfBase64].filter(Boolean).length > 1) {
      return {
        content: [{ type: "text", text: "Error: Only one of pdf_path, pdf_url, or pdf_base64 can be provided." }],
        isError: true,
      };
    }

    try {
      // Prepare input
      const { path: inputPath, isTemp } = await prepareInputFile(pdfPathArg, pdfUrl, pdfBase64);

      // Execute conversion
      // Note: If isTemp is true, we might want to ensure output path is also temp if not specified?
      // The python script defaults to saving alongside input. If input is in temp, output will      // Execute conversion
      const result = await executePythonConverter(name, inputPath, outputPath, fastMode, dpi, quality, pages, useOcr);
      console.error("DEBUG: result keys:", Object.keys(result));
      if (result.output_paths) console.error("DEBUG: output_paths length:", (result.output_paths as any[]).length);

      // Clean up input temp file
      if (isTemp) {
        try { fs.unlinkSync(inputPath); } catch (e) { console.error("Failed to delete input temp file:", e); }
      }

      if (result.success) {
        // Handle output (Base64/Zip logic)
        const { message, base64 } = await handleOutput(result, isTemp);

        const content: any[] = [{ type: "text", text: message }];

        if (base64) {
          content.push({
            type: "text",
            text: base64
          });
        } else {
          // Existing Link Logic (only if not temp/base64)
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

          const links: string[] = [];

          // For pdf_to_jpg, list output files
          if (name === "pdf_to_jpg" && result.output_paths) {
            const paths = result.output_paths as string[];
            content[0].text += `\n\nOutput files:\n${paths.map((p) => `- ${p}`).join("\n")}`;

            if (baseUrl && publicDir) {
              paths.forEach(p => {
                const link = processFile(p);
                if (link) links.push(link);
              });
            }
          } else if (result.output_path) {
            const p = result.output_path as string;
            content[0].text += `\n\nOutput file: ${p}`;

            if (baseUrl && publicDir) {
              const link = processFile(p);
              if (link) links.push(link);
            }
          }

          if (links.length > 0) {
            content[0].text += `\n\nDownload Links:\n${links.map(l => `- ${l}`).join("\n")}`;
          }
        }

        return { content };
      } else {
        return {
          content: [{ type: "text", text: `Conversion failed: ${result.error}` }],
          isError: true,
        };
      }
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
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
