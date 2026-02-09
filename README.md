# ambient.belsterns.com

**ambient.belsterns.com** is an AI-first, AI-native Project Management Agent capable of running projects end-to-end. Think of it as Cursor or Claude Code, but for Project Management—currently focusing on Agile Scrum-based software projects.

This repository implements the multipart video upload infrastructure for ambient.belsterns.com, providing a resilient upload flow to S3 for large files (MP4), with job state persistence in Postgres.

## Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local dev without Docker)
- AWS Account with S3 Bucket

## Setup

1. Copy example env file:
   ```bash
   cp env.example .env
   ```
2. Configure `.env` with your AWS credentials and bucket name.

## IAM Policy

Ensure your AWS credentials have the following permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:CreateMultipartUpload",
                "s3:AbortMultipartUpload",
                "s3:ListMultipartUploadParts",
                "s3:UploadPart",
                "s3:CompleteMultipartUpload",
                "s3:HeadObject",
                "s3:GetObject",
                "s3:PutObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::YOUR_BUCKET_NAME",
                "arn:aws:s3:::YOUR_BUCKET_NAME/uploads/*"
            ]
        }
    ]
}
```
*Note: `s3:ListBucket` is required for `ListMultipartUploads` used in the finalize step.*

## Running with Docker

### Production Mode

1. Build and start services:
   ```bash
   docker-compose up --build
   ```
   This starts:
   - Next.js app on `http://localhost:3000`
   - Postgres DB (not exposed to host)
   - Runs migrations automatically

2. Visit `http://localhost:3000/upload` to test the upload.

### Development Mode (with Hot Reload)

1. Start development environment:
   ```bash
   npm run dev:docker
   ```
   Or with rebuild:
   ```bash
   npm run dev:docker:build
   ```

2. The development server will:
   - Mount your source code for hot reload
   - Run `next dev` with file watching
   - Auto-reload on code changes
   - Use the same database and network setup

3. Visit `http://localhost:3000/upload` - changes will hot reload automatically.

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start Postgres (e.g., via Docker):
   ```bash
   docker-compose up -d db
   ```
3. Run migrations:
   ```bash
   npm run migrate
   ```
4. Start dev server:
   ```bash
   npm run dev
   ```

## API Endpoints

- `POST /api/uploads/new`: Initialize upload.
- `POST /api/uploads/:upload_id/finalize`: Complete upload.

## Testing

1. Go to `/upload`.
2. Select a large MP4 file (> 10MB to trigger multipart).
3. Observe upload progress.
4. On completion, check S3 for the file and the database `jobs` table for the row.

## S3 CORS Configuration

For multipart uploads to work correctly, your S3 bucket must expose the `ETag` header in its CORS configuration:

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["PUT", "POST", "DELETE", "GET"],
        "AllowedOrigins": ["*"],
        "ExposeHeaders": ["ETag"]
    }
]
```

**Important**: Without `ExposeHeaders: ["ETag"]`, the browser cannot read the ETag from S3 responses, causing upload failures.

## Implementation Details

- **Client-Direct Upload**: File parts are uploaded directly to S3 using presigned URLs.
- **Resilience**: Client retries individual parts on failure.
- **Idempotency**: Finalize step is idempotent; if the object exists, it returns success without duplicating jobs.
- **Database**: Postgres tracks upload jobs and their state.
- **File Organization**: Uploads are stored in `ambient.belsterns.com/uploads/{upload_id}/original.mp4` within the configured S3 bucket.

## Architecture

This upload system is part of the larger ambient.belsterns.com platform, which uses AI agents to manage Agile Scrum software projects. The upload flow enables:

- Video meeting recordings and screen captures
- Large file handling for project artifacts
- Asynchronous processing pipeline (ffmpeg, transcription, etc.)

## Worker (Phase 2 & 3: Transcode + ASR)

A background worker service performs:
1. **Transcoding**: MP4 → MP3 (ffmpeg)
2. **ASR**: MP3 → Text (Multiple providers supported via factory pattern)

### ASR Provider Support

The worker uses a **factory pattern** to support multiple ASR providers. Switch providers via environment variables:

**Supported Providers:**
- **`gemini`** - Google Gemini (gemini-2.5-pro, gemini-2.5-flash)
- **`openai`** - OpenAI Whisper (whisper-1)

**Configuration:**
```bash
# In your .env file:
ASR_PROVIDER=openai              # Choose: 'gemini' or 'openai'

# Google Gemini
GEMINI_API_KEY=your_key
GEMINI_MODEL_NAME=gemini-2.5-pro

# OpenAI
OPENAI_API_KEY=your_key
OPENAI_MODEL_NAME=whisper-1
```

### Worker Flow
1. **Polls** Postgres every 5 seconds for jobs with `state='queued'`
2. **Logs** queue status
3. **Claims** job atomically
4. **Processes** based on `meta.next_step`:
   - `transcode`: Downloads MP4, transcodes to MP3, uploads to S3, updates job to `next_step='asr'`
   - `asr`: Downloads MP3, calls configured ASR provider, saves JSON+Text to S3, updates job to `state='done'`

### Job States & Pipeline

| State | next_step | Description |
|-------|-----------|-------------|
| `queued` | `transcode` | Ready for transcoding |
| `processing_transcode` | `transcode` | Currently transcoding |
| `queued` | `asr` | Transcoding complete, ready for ASR |
| `processing_asr` | `asr` | Sending to Gemini |
| `done` | `asr_completed` | All processing complete |
| `failed` | - | Failed after 3 retry attempts |

### Database Schema

**transcripts table:**
- `id` (serial, PK)
- `upload_id` (UUID, FK → jobs)
- `provider` (text): 'gemini'
- `s3_key_raw` (text): Path to raw JSON response
- `s3_key_text` (text): Path to clean text file
- `meta` (JSONB): verified, model name, etc.

### Running the Worker
The worker is included in `docker-compose.yml`. It starts automatically with:
```bash
docker-compose up --build
```

### Environment Variables
Ensure `.env` includes:
```bash
# ASR Provider Selection
ASR_PROVIDER=openai              # 'gemini' or 'openai'

# Google Gemini
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL_NAME=gemini-2.5-pro

# OpenAI
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL_NAME=whisper-1

# Optional
ASR_TIMEOUT_MS=180000
```

## TODOs

- Integrate with ambient.belsterns.com project management workflows
