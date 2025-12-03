import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_INDEX = path.join(__dirname, "..", "src", "index.js");
const TEST_DIR = path.join(__dirname, "..", "..", "test");
// Test cases
const tests = [
    // { file: "text.pdf", tool: "pdf_to_excel", args: {} },
    // { file: "系数.pdf", tool: "pdf_to_docx", args: {} },
    // { file: "高校观赛团数据整理.pdf", tool: "pdf_to_ppt", args: {} },
    // { file: "rev.20251010APP推广项目框架合作协议-新.pdf", tool: "pdf_to_jpg", args: { useBase64: true } },
    // Use Local Path input for JPG to test Zip file creation (Local scenario)
    { file: "rev.20251010APP推广项目框架合作协议-新.pdf", tool: "pdf_to_jpg", args: { useBase64: false } }
];
async function runSingleTest(test) {
    return new Promise((resolve, reject) => {
        const pdfPath = path.join(TEST_DIR, test.file);
        if (!fs.existsSync(pdfPath)) {
            console.log(`Skipping ${test.file} - not found`);
            resolve();
            return;
        }
        console.log(`\n--- Testing ${test.file} with ${test.tool} (Base64: ${!!test.args.useBase64}) ---`);
        const child = spawn("node", [DIST_INDEX], {
            stdio: ["pipe", "pipe", "inherit"],
            env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" }
        });
        let outputBuffer = "";
        let completed = false;
        child.stdout.on("data", (data) => {
            outputBuffer += data.toString();
            const lines = outputBuffer.split("\n");
            for (const line of lines) {
                if (line.trim().startsWith("{") && line.trim().endsWith("}")) {
                    try {
                        const json = JSON.parse(line);
                        if (json.result) {
                            console.log("Result Message Length:", json.result.content[0].text.length);
                            if (json.result.content[0].text.includes("Output Zip:")) {
                                console.log("FOUND 'Output Zip:' in message!");
                                const zipLine = json.result.content[0].text.split('\n').find((l) => l.includes("Output Zip:"));
                                console.log(zipLine);
                            }
                            else {
                                console.log("NOT FOUND 'Output Zip:' in message.");
                                // Print last 500 chars
                                console.log("Last 500 chars:", json.result.content[0].text.slice(-500));
                            }
                            // Check for Zip/Base64 output
                            const content = json.result.content || [];
                            const base64Item = content.find((c) => c.text && c.text.length > 1000);
                            const message = content[0]?.text || "";
                            console.log("Result Message Length:", json.result.content[0].text.length);
                            console.log("Result Message Length:", json.result.content[0].text.length);
                            if (message.includes("Output Zip:")) {
                                console.log("SUCCESS: Local Zip file output detected.");
                                const zipLine = message.split('\n').find((l) => l.includes("Output Zip:"));
                                console.log(zipLine);
                            }
                            else if (message.includes("Error creating Zip:")) {
                                console.error("FAILURE: Zip creation failed.");
                                console.log(message);
                            }
                            else if (content.length > 1 && content[1].text.length > 1000) {
                                // Base64 output is usually the second item
                                console.log("SUCCESS: Base64 output detected (likely Zip or File).");
                            }
                            else if (test.tool === "pdf_to_jpg" && !test.args.useBase64) {
                                console.warn("WARNING: Expected Zip file output for local pdf_to_jpg but didn't find it in message.");
                                console.log("Last 500 chars:", message.slice(-500));
                            }
                            completed = true;
                            child.kill();
                            resolve();
                        }
                        else if (json.error) {
                            console.error("Error:", json.error);
                            completed = true;
                            child.kill();
                            resolve();
                        }
                    }
                    catch (e) { }
                }
            }
        });
        const request = {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
                name: test.tool,
                arguments: {
                    ...test.args
                }
            }
        };
        if (test.args.useBase64) {
            const fileBuffer = fs.readFileSync(pdfPath);
            request.params.arguments.pdf_base64 = fileBuffer.toString("base64");
            delete request.params.arguments.useBase64;
        }
        else {
            request.params.arguments.pdf_path = pdfPath;
        }
        child.stdin.write(JSON.stringify(request) + "\n");
        // Timeout
        setTimeout(() => {
            if (!completed) {
                console.error("Timeout waiting for response");
                child.kill();
                resolve();
            }
        }, 120000); // 120s timeout for large files
    });
}
async function runAll() {
    for (const test of tests) {
        await runSingleTest(test);
    }
}
runAll();
