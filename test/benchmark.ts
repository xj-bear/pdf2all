import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PDF_PATH = path.join(__dirname, "..", "..", "test", "rev.20251010APP推广项目框架合作协议-新.pdf");
const OUTPUT_DIR = path.join(__dirname, "..", "..", "test", "output");

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

async function runConversion(useOcr: boolean): Promise<number> {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const pythonScript = path.join(__dirname, "..", "..", "python", "converter.py");

        const request = {
            action: "pdf_to_excel",
            pdf_path: PDF_PATH,
            output_path: path.join(OUTPUT_DIR, `benchmark_${useOcr ? "ocr" : "no_ocr"}.xlsx`),
            use_ocr: useOcr,
            pages: "1-3" // Limit pages for benchmark
        };

        const pythonProcess = spawn("python", [pythonScript], {
            cwd: path.dirname(pythonScript),
            env: { ...process.env, PYTHONUNBUFFERED: "1" }
        });

        pythonProcess.stdin.write(JSON.stringify(request));
        pythonProcess.stdin.end();

        let stdout = "";

        pythonProcess.stdout.on("data", (data) => {
            stdout += data.toString();
        });

        pythonProcess.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(`Process exited with code ${code}: ${stdout}`));
                return;
            }
            const end = Date.now();
            console.log(`Conversion (OCR=${useOcr}) result:`, stdout);
            resolve(end - start);
        });
    });
}

async function main() {
    console.log("Starting benchmark...");

    try {
        console.log("Running WITHOUT OCR...");
        const timeNoOcr = await runConversion(false);
        console.log(`Time WITHOUT OCR: ${timeNoOcr}ms`);

        console.log("Running WITH OCR...");
        const timeOcr = await runConversion(true);
        console.log(`Time WITH OCR: ${timeOcr}ms`);

        console.log("--------------------------------");
        console.log(`Speedup: ${(timeOcr / timeNoOcr).toFixed(2)}x`);
    } catch (error) {
        console.error("Benchmark failed:", error);
    }
}

main();
