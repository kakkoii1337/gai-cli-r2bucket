---
name: r2bucket
description: "CLI tool for Cloudflare R2 bucket operations. Use when: uploading, downloading, listing, or deleting objects in an R2 bucket. Requires: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY env vars."
homepage: https://github.com/kakkoii1337/gai-cli-r2bucket
---

# r2bucket

CLI tool for Cloudflare R2 bucket operations. Uses the S3-compatible API via `@aws-sdk/client-s3`.

## Requirements

- Node.js >= 18.0.0
- Cloudflare account with R2 enabled
- R2 API token (see Configuration)

## Installation

```bash
npm install -g gai-cli-r2bucket
```

Or run directly:

```bash
npx gai-cli-r2bucket list
```

## Configuration

### 1. Create an R2 API Token

1. Go to **Cloudflare Dashboard → R2 → Manage R2 API Tokens**
2. Click **Create API Token**
3. Select **Object Read & Write** permissions
4. Copy the **Access Key ID** and **Secret Access Key** (shown once)
5. Get your **Account ID** from the Cloudflare dashboard sidebar

### 2. Set Environment Variables

In a `.env` file (or export to your shell):

```
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=your_default_bucket
```

## Usage

```bash
r2bucket list [--bucket=<name>] [--prefix=<prefix>]
r2bucket upload <file> [--bucket=<name>] [--key=<key>]
r2bucket download <key> [--bucket=<name>] [--output=<file>]
r2bucket delete <key> [--bucket=<name>]
r2bucket info <key> [--bucket=<name>]
```

### Options

- `--bucket=<name>` - Bucket name (default: `R2_BUCKET_NAME` env var)
- `--prefix=<prefix>` - Filter list by key prefix
- `--key=<key>` - Override object key on upload (default: filename)
- `--output=<file>` - Output path for download (default: key basename)
- `--help, -h` - Show help message

### Examples

```bash
# List all objects
r2bucket list

# List with prefix filter
r2bucket list --prefix=images/

# Upload a file
r2bucket upload ./photo.jpg
r2bucket upload ./photo.jpg --key=uploads/photo.jpg

# Download a file
r2bucket download uploads/photo.jpg
r2bucket download uploads/photo.jpg --output=./local.jpg

# Delete a file
r2bucket delete uploads/photo.jpg

# Get file metadata
r2bucket info uploads/photo.jpg
```

## Output

### list

```
KEY                                                          SIZE  LAST MODIFIED
----------------------------------------------------------------------------------------------------
uploads/photo.jpg                                         1.2 MB  2026-04-01 10:00:00
uploads/video.mp4                                        45.3 MB  2026-04-01 11:00:00

2 object(s)
```

### info

```json
{
  "key": "uploads/photo.jpg",
  "bucket": "my-bucket",
  "size": 1234567,
  "size_human": "1.2 MB",
  "content_type": "image/jpeg",
  "last_modified": "2026-04-01T10:00:00.000Z",
  "etag": "\"abc123\"",
  "metadata": {}
}
```
