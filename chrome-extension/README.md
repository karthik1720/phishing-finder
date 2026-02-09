# Phishing Finder Chrome Extension

A Chrome extension that detects and blocks phishing websites using AI-powered analysis via Google Gemini.

## Features

- **Real-time URL scanning**: Automatically checks every URL you visit
- **AI-powered detection**: Uses Google Gemini LLM to identify phishing sites
- **Shared database**: Results are shared across all users for faster detection
- **Smart caching**: Previously checked URLs are instantly verified
- **User-friendly UI**: Clear scanning and blocking pages with explanations

## Setup

### Prerequisites

1. **Backend API**: The extension requires the Next.js backend API to be running
   - Make sure the backend is running on `http://localhost:3000` (or update the API URL in extension settings)
   - Ensure the database is set up and migrations are run
   - Set `GEMINI_API_KEY` in your `.env` file

2. **Database Migration**: Run Prisma migrations to create the `UrlCheck` table:
   ```bash
   npm run prisma:migrate
   npm run prisma:generate
   ```

### Installation

1. **Load the extension in Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `chrome-extension` folder

2. **Configure API URL** (if needed):
   - The extension defaults to `http://localhost:3000/api/check-url`
   - To change this, you can modify the `DEFAULT_API_URL` in `api-client.js` and `background.js`
   - Or use the extension's storage API to set a custom URL (future feature)

## How It Works

1. **Navigation Interception**: The extension intercepts all web requests using Chrome's `webRequest` API
2. **URL Checking**: Each URL is checked against the shared PostgreSQL database
3. **AI Analysis**: If not in the database, the URL is sent to Gemini for analysis
4. **Result Storage**: The result is stored in the database for future checks
5. **User Feedback**: 
   - Shows a scanning page while checking new URLs
   - Blocks navigation if phishing is detected
   - Allows navigation if the site is safe

## File Structure

- `manifest.json`: Extension configuration and permissions
- `background.js`: Service worker that intercepts requests and checks URLs
- `content.js`: Content script for page-level detection (optional)
- `api-client.js`: Functions for communicating with the backend API
- `scanning.html/js`: UI shown while scanning a URL
- `blocked.html/js`: UI shown when a phishing site is detected
- `popup.html`: Extension popup UI
- `styles.css`: Shared styles for extension pages

## Permissions

The extension requires:
- `webRequest` & `webRequestBlocking`: To intercept and block navigation
- `tabs`: To manage tab navigation
- `storage`: To cache API URL configuration
- `<all_urls>`: To check all websites

## Development

### Testing

1. Start the backend server: `npm run dev`
2. Load the extension in Chrome
3. Visit a test URL to see the scanning page
4. Check the browser console for any errors

### Troubleshooting

- **Extension not working**: Check that the backend API is running and accessible
- **API errors**: Verify `GEMINI_API_KEY` is set in your `.env` file
- **Database errors**: Ensure Prisma migrations have been run
- **CORS issues**: Make sure the backend allows requests from `chrome-extension://` origin

## Future Enhancements

- Admin console for tracking and managing URL checks
- User-configurable API URL via options page
- Whitelist/blacklist management
- Statistics and reporting dashboard
- Browser action popup with recent checks

