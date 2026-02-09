# Phishing Finder Setup Guide

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This will install `@google/generative-ai` and other dependencies.

### 2. Set Up Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp env.example .env
```

Required variables:
- `DATABASE_URL`: PostgreSQL connection string
- `GEMINI_API_KEY`: Your Google Gemini API key
- `GEMINI_MODEL_NAME`: Model to use (default: `gemini-2.0-flash-exp`)

### 3. Set Up Database

Run Prisma migrations to create the `UrlCheck` table:

```bash
npm run prisma:migrate
npm run prisma:generate
```

### 4. Start Backend Server

```bash
npm run dev
```

The API will be available at `http://localhost:3000/api/check-url`

### 5. Load Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `chrome-extension` folder

### 6. Test the Extension

1. Visit any website (e.g., `https://example.com`)
2. You should see a scanning page briefly
3. The page will redirect to the original URL if safe
4. If phishing is detected, you'll see a blocked page

## Architecture

### Backend (Next.js API)

- **Route**: `/api/check-url` (POST)
- **Function**: Checks URL against database, calls Gemini if needed
- **Database**: PostgreSQL with Prisma ORM
- **AI**: Google Gemini LLM for phishing detection

### Chrome Extension

- **Background Script**: Intercepts web requests
- **Scanning Page**: Shows while checking URLs
- **Blocked Page**: Shows when phishing is detected
- **Content Script**: Optional page-level detection

## Database Schema

The `UrlCheck` model stores:
- `url`: Normalized URL (unique)
- `isPhishing`: Boolean result
- `confidence`: Optional confidence score
- `reason`: AI explanation
- `checkedAt`: Timestamp of check
- `createdAt`/`updatedAt`: Audit timestamps

## API Endpoint

### POST `/api/check-url`

**Request:**
```json
{
  "url": "https://example.com"
}
```

**Response:**
```json
{
  "isPhishing": false,
  "reason": "Legitimate website",
  "confidence": 0.95,
  "cached": true
}
```

## Troubleshooting

### Extension not working
- Ensure backend is running on `http://localhost:3000`
- Check browser console for errors
- Verify extension is enabled in `chrome://extensions/`

### API errors
- Verify `GEMINI_API_KEY` is set correctly
- Check backend logs for errors
- Ensure database is accessible

### Database errors
- Run `npm run prisma:migrate` to create tables
- Verify `DATABASE_URL` is correct
- Check PostgreSQL is running

## Next Steps

- Build admin console for tracking URL checks
- Add statistics and reporting
- Implement user preferences
- Add whitelist/blacklist management

