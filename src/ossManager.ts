import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

let client: S3Client | null = null;

try {
    if (process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY && process.env.S3_ENDPOINT && process.env.S3_BUCKET) {
        client = new S3Client({
            region: process.env.S3_REGION || "auto",
            endpoint: process.env.S3_ENDPOINT,
            credentials: {
                accessKeyId: process.env.S3_ACCESS_KEY_ID,
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            },
            forcePathStyle: false // Set to true if bucket name should be in path (e.g. minio), false for virtual host (e.g. AWS/Bitiful)
        });
        console.error("S3 Client initialized successfully.");
    } else {
        console.error("S3 configuration missing. Skipping S3 initialization.");
    }
} catch (e) {
    console.error("Failed to initialize S3 client:", e);
}

/**
 * Upload a file to S3 and return the URL.
 * @param filePath Local path to the file
 * @param originalName Original filename (optional)
 * @returns Public URL of the uploaded file
 */
export async function uploadToOss(filePath: string, originalName?: string): Promise<string | null> {
    if (!client || !process.env.S3_BUCKET) {
        return null;
    }

    try {
        const fileContent = fs.readFileSync(filePath);
        const ext = path.extname(filePath);
        const name = originalName ? path.basename(originalName, ext) : 'file';
        // Generate a unique object name: pdf2all/date/uuid-name.ext
        const dateStr = new Date().toISOString().split('T')[0];
        const objectKey = `pdf2all/${dateStr}/${uuidv4()}-${name}${ext}`;

        const command = new PutObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: objectKey,
            Body: fileContent,
            ContentType: getContentType(ext)
        });

        await client.send(command);

        // Return the URL
        // Priority: S3_PUBLIC_DOMAIN > Constructed URL
        if (process.env.S3_PUBLIC_DOMAIN) {
            // Ensure domain doesn't end with slash and key doesn't start with slash (it usually doesn't)
            const domain = process.env.S3_PUBLIC_DOMAIN.replace(/\/$/, "");
            return `${domain}/${objectKey}`;
        }

        // Fallback construction: https://<bucket>.<endpoint_host>/<key>
        // Note: This assumes virtual-host style. 
        // If endpoint includes protocol (https://), we need to parse it.
        try {
            const endpointUrl = new URL(process.env.S3_ENDPOINT!);
            const host = endpointUrl.host;
            const protocol = endpointUrl.protocol;
            return `${protocol}//${process.env.S3_BUCKET}.${host}/${objectKey}`;
        } catch (e) {
            return null;
        }

    } catch (e) {
        console.error("Failed to upload to S3:", e);
        return null;
    }
}

export function isOssConfigured(): boolean {
    return !!client;
}

function getContentType(ext: string): string {
    switch (ext.toLowerCase()) {
        case '.pdf': return 'application/pdf';
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.png': return 'image/png';
        case '.zip': return 'application/zip';
        case '.docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        case '.xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        case '.pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        default: return 'application/octet-stream';
    }
}
