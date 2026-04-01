#!/usr/bin/env node
/**
 * gai-cli-r2bucket - CLI tool for Cloudflare R2 bucket operations
 *
 * Usage:
 *   r2bucket list [--bucket=<name>] [--prefix=<prefix>]
 *   r2bucket upload <file> [--bucket=<name>] [--key=<key>]
 *   r2bucket download <key> [--bucket=<name>] [--output=<file>]
 *   r2bucket delete <key> [--bucket=<name>]
 *   r2bucket info <key> [--bucket=<name>]
 */

import {
    S3Client,
    ListObjectsV2Command,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { readFileSync, writeFileSync, existsSync, createWriteStream } from "fs";
import { basename, extname } from "path";
import { pipeline } from "stream/promises";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

function getClient() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accountId) throw new Error("R2_ACCOUNT_ID not set");
    if (!accessKeyId) throw new Error("R2_ACCESS_KEY_ID not set");
    if (!secretAccessKey) throw new Error("R2_SECRET_ACCESS_KEY not set");

    return new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
    });
}

function getBucket(flags) {
    const bucket = flags.bucket || process.env.R2_BUCKET_NAME;
    if (!bucket) throw new Error("Bucket name required: use --bucket=<name> or set R2_BUCKET_NAME");
    return bucket;
}

function parseFlags(args) {
    const flags = {
        bucket: null,
        prefix: null,
        key: null,
        output: null,
    };

    for (const arg of args) {
        if (arg.startsWith("--bucket=")) flags.bucket = arg.split("=")[1];
        else if (arg.startsWith("--prefix=")) flags.prefix = arg.split("=")[1];
        else if (arg.startsWith("--key=")) flags.key = arg.split("=")[1];
        else if (arg.startsWith("--output=")) flags.output = arg.split("=")[1];
    }

    return flags;
}

function printHelp() {
    console.log(`
r2bucket - CLI tool for Cloudflare R2 bucket operations

Usage:
  r2bucket list [--bucket=<name>] [--prefix=<prefix>]
  r2bucket upload <file> [--bucket=<name>] [--key=<key>]
  r2bucket download <key> [--bucket=<name>] [--output=<file>]
  r2bucket delete <key> [--bucket=<name>]
  r2bucket info <key> [--bucket=<name>]

Options:
  --bucket=<name>    Bucket name (default: R2_BUCKET_NAME env var)
  --prefix=<prefix>  Filter list by key prefix
  --key=<key>        Override object key for upload (default: filename)
  --output=<file>    Output file for download (default: key basename)
  --help, -h         Show this help message

Environment:
  R2_ACCOUNT_ID        Required. Cloudflare account ID
  R2_ACCESS_KEY_ID     Required. R2 API token access key
  R2_SECRET_ACCESS_KEY Required. R2 API token secret key
  R2_BUCKET_NAME       Optional. Default bucket name

Examples:
  r2bucket list
  r2bucket list --prefix=images/
  r2bucket upload ./photo.jpg
  r2bucket upload ./photo.jpg --key=uploads/photo.jpg
  r2bucket download uploads/photo.jpg
  r2bucket download uploads/photo.jpg --output=./local.jpg
  r2bucket delete uploads/photo.jpg
  r2bucket info uploads/photo.jpg
`);
}

async function cmdList(args) {
    const flags = parseFlags(args);
    const client = getClient();
    const bucket = getBucket(flags);

    console.error(`Listing: s3://${bucket}${flags.prefix ? `/${flags.prefix}` : ""}`);

    const objects = [];
    let continuationToken;

    do {
        const response = await client.send(new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: flags.prefix || undefined,
            ContinuationToken: continuationToken,
        }));

        for (const obj of response.Contents || []) {
            objects.push(obj);
        }

        continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    if (objects.length === 0) {
        console.log("(empty)");
        return;
    }

    console.log(`${"KEY".padEnd(60)} ${"SIZE".padStart(12)}  LAST MODIFIED`);
    console.log("-".repeat(100));
    for (const obj of objects) {
        const size = formatBytes(obj.Size);
        const date = obj.LastModified.toISOString().slice(0, 19).replace("T", " ");
        console.log(`${obj.Key.padEnd(60)} ${size.padStart(12)}  ${date}`);
    }
    console.log(`\n${objects.length} object(s)`);
}

async function cmdUpload(args) {
    const filePath = args.find((a) => !a.startsWith("--"));
    const flags = parseFlags(args);

    if (!filePath) { console.error("Error: file path is required"); process.exit(1); }
    if (!existsSync(filePath)) { console.error(`Error: file not found: ${filePath}`); process.exit(1); }

    const client = getClient();
    const bucket = getBucket(flags);
    const key = flags.key || basename(filePath);
    const body = readFileSync(filePath);

    console.error(`Uploading: ${filePath} → s3://${bucket}/${key}`);

    const contentType = getMimeType(filePath);

    await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
    }));

    console.log(`Uploaded: s3://${bucket}/${key} (${formatBytes(body.length)})`);
}

async function cmdDownload(args) {
    const key = args.find((a) => !a.startsWith("--"));
    const flags = parseFlags(args);

    if (!key) { console.error("Error: key is required"); process.exit(1); }

    const client = getClient();
    const bucket = getBucket(flags);
    const output = flags.output || basename(key);

    console.error(`Downloading: s3://${bucket}/${key} → ${output}`);

    const response = await client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: key,
    }));

    await pipeline(response.Body, createWriteStream(output));
    console.log(`Downloaded: ${output}`);
}

async function cmdDelete(args) {
    const key = args.find((a) => !a.startsWith("--"));
    const flags = parseFlags(args);

    if (!key) { console.error("Error: key is required"); process.exit(1); }

    const client = getClient();
    const bucket = getBucket(flags);

    console.error(`Deleting: s3://${bucket}/${key}`);

    await client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
    }));

    console.log(`Deleted: s3://${bucket}/${key}`);
}

async function cmdInfo(args) {
    const key = args.find((a) => !a.startsWith("--"));
    const flags = parseFlags(args);

    if (!key) { console.error("Error: key is required"); process.exit(1); }

    const client = getClient();
    const bucket = getBucket(flags);

    const response = await client.send(new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
    }));

    console.log(JSON.stringify({
        key,
        bucket,
        size: response.ContentLength,
        size_human: formatBytes(response.ContentLength),
        content_type: response.ContentType,
        last_modified: response.LastModified,
        etag: response.ETag,
        metadata: response.Metadata,
    }, null, 2));
}

const MIME_TYPES = {
    ".txt":  "text/plain",
    ".html": "text/html",
    ".htm":  "text/html",
    ".css":  "text/css",
    ".js":   "application/javascript",
    ".json": "application/json",
    ".xml":  "application/xml",
    ".csv":  "text/csv",
    ".md":   "text/markdown",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif":  "image/gif",
    ".svg":  "image/svg+xml",
    ".webp": "image/webp",
    ".ico":  "image/x-icon",
    ".pdf":  "application/pdf",
    ".zip":  "application/zip",
    ".mp3":  "audio/mpeg",
    ".mp4":  "video/mp4",
    ".webm": "video/webm",
};

function getMimeType(filePath) {
    return MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream";
}

function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

async function main() {
    const [, , subcmd, ...rest] = process.argv;

    if (!subcmd || subcmd === "--help" || subcmd === "-h") {
        printHelp();
        process.exit(0);
    }

    switch (subcmd) {
        case "list":     await cmdList(rest); break;
        case "upload":   await cmdUpload(rest); break;
        case "download": await cmdDownload(rest); break;
        case "delete":   await cmdDelete(rest); break;
        case "info":     await cmdInfo(rest); break;
        default:
            console.error(`Unknown command: ${subcmd}`);
            printHelp();
            process.exit(1);
    }
}

main().catch((error) => {
    console.error("Error:", error.message);
    process.exit(1);
});
