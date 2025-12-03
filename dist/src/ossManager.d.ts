/**
 * Upload a file to S3 and return the URL.
 * @param filePath Local path to the file
 * @param originalName Original filename (optional)
 * @returns Public URL of the uploaded file
 */
export declare function uploadToOss(filePath: string, originalName?: string): Promise<string | null>;
export declare function isOssConfigured(): boolean;
