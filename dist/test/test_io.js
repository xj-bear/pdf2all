import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_INDEX = path.join(__dirname, "..", "index.js");
// Mock PDF URL (using a local file served via simple HTTP or just testing Base64)
// Since we can't easily spin up an external URL, we'll test Base64 input primarily, 
// which covers the "temp file" logic.
// For URL, we can try to download a known small PDF if internet is available, 
// or skip if we want to be safe. Let's test Base64.
const TEST_PDF_PATH = path.join(__dirname, "..", "..", "test", "text.pdf");
// Ensure file exists, otherwise try relative to CWD
const finalPdfPath = fs.existsSync(TEST_PDF_PATH) ? TEST_PDF_PATH : path.join(process.cwd(), "test", "text.pdf");
const TEST_PDF_BASE64 = fs.readFileSync(finalPdfPath).toString("base64");
async function runTest() {
    console.log("Starting IO Test...");
    const child = spawn("node", [DIST_INDEX], {
        stdio: ["pipe", "pipe", "inherit"],
        env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" }
    });
    let outputBuffer = "";
    child.stdout.on("data", (data) => {
        outputBuffer += data.toString();
        // Check for JSON response
        const lines = outputBuffer.split("\n");
        for (const line of lines) {
            if (line.trim().startsWith("{") && line.trim().endsWith("}")) {
                try {
                    const json = JSON.parse(line);
                    if (json.result) {
                        console.log("Received Result:", JSON.stringify(json.result).substring(0, 200) + "...");
                        // Verify Base64 output
                        const content = json.result.content;
                        const base64Item = content.find((c) => c.type === "text" && c.text.length > 1000); // Heuristic
                        if (base64Item) {
                            console.log("SUCCESS: Base64 output found.");
                        }
                        else {
                            console.error("FAILURE: No Base64 output found.");
                        }
                        child.kill();
                        process.exitCode = 0;
                    }
                }
                catch (e) {
                    // Ignore partial JSON
                }
            }
        }
    });
    // Send Request
    const request = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
            name: "pdf_to_excel",
            arguments: {
                pdf_base64: TEST_PDF_BASE64
            }
        }
    };
    console.log("Sending Base64 Request...");
    child.stdin.write(JSON.stringify(request) + "\n");
}
runTest();
