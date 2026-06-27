# Insta-Clip Backend

Minimal Node.js/Express backend for Instagram media extraction and download using `yt-dlp`.

This backend implements a robust pattern for auto-downloading and auto-populating media similar to professional platforms like Buffer and Later.

## Architecture

### Two-Tier Approach

1. **Simple Extraction** (`POST /extract`)
   - Fast metadata-only extraction
   - Returns media URL, caption, and thumbnail
   - No file storage (media accessed directly)

2. **Full Download** (`POST /media-imports`)
   - Downloads and stores media in temporary storage
   - Returns a download token and local storage URL
   - Frontend fetches file and populates form automatically
   - Implements the same pattern as the PHP/React project in this design reference

## Setup

### Prerequisites

- Node.js 16+ 
- `yt-dlp` installed globally
  ```bash
  # macOS
  brew install yt-dlp
  
  # Ubuntu/Debian
  sudo apt install yt-dlp
  
  # Or install via pip
  pip install yt-dlp
  ```

### Installation

1. Install dependencies:
   ```bash
   cd backend
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

   The server will start on `http://localhost:3000` by default.

   To use a different port:
   ```bash
   PORT=5000 npm start
   ```

## API Endpoints

### 1. POST /extract

**Fast metadata extraction** (no file download)

Ideal for: previewing content before committing to download

**Request:**
```json
{
  "url": "https://www.instagram.com/reel/DW9KcP-zIMm/"
}
```

**Success Response:**
```json
{
  "success": true,
  "videoUrl": "https://...",
  "mediaUrl": "https://...",
  "thumbnailUrl": "https://...",
  "caption": "Your caption here",
  "mediaKind": "video",
  "title": "Instagram Reel"
}
```

### 2. POST /media-imports

**Download media and auto-populate** (with file storage)

Implements the auto-download & auto-populate pattern for seamless UX.

**Request:**
```json
{
  "url": "https://www.instagram.com/reel/DW9KcP-zIMm/",
  "platform": "instagram"
}
```

**Response (Step 1: Request Download):**
```json
{
  "success": true,
  "token": "550e8400-e29b-41d4-a716-446655440000",
  "download_url": "/media-imports/550e8400-e29b-41d4-a716-446655440000/download",
  "caption": "Your caption...",
  "filename": "instagram-550e8400.mp4",
  "mime_type": "video/mp4",
  "mediaKind": "video",
  "filesize": 5242880
}
```

**Step 2: Fetch File (Frontend)**

The frontend then:
```javascript
// 1. Fetch the binary file using the download_url
const fileRes = await fetch(downloadUrl);
const blob = await fileRes.blob();

// 2. Convert blob to File object
const file = new File([blob], "instagram-550e8400.mp4", { type: "video/mp4" });

// 3. Auto-populate form state
setForm(prev => ({
  ...prev,
  video: file,
  caption: response.data.caption
}));
```

### 3. GET /media-imports/:token/download

**Retrieve stored media file**

Returns the binary video file.

```bash
# Browser or fetch API
GET http://localhost:3000/media-imports/550e8400-e29b-41d4-a716-446655440000/download
```

### 4. DELETE /media-imports/:token

**Cleanup stored media**

Called when user dismisses import or app closes.

```bash
DELETE http://localhost:3000/media-imports/550e8400-e29b-41d4-a716-446655440000
```

### 5. GET /health

Health check endpoint.

```json
{
  "ok": true,
  "timestamp": "2026-06-27T10:30:00Z"
}
```

## Storage

Media files are stored in `backend/storage/media/:token/:filename`

Each download gets a unique UUID token. Files are automatically deleted when:
- User calls the DELETE endpoint
- Manual cleanup (TODO: add TTL-based auto-cleanup)

## Frontend Integration

### Using the Auto-Import Function

```typescript
import { importMediaFromLink } from './src/lib/mediaImport';

// Call from any component
const importData = await importMediaFromLink(url, 'instagram');

// Auto-populate form
setForm(prev => ({
  ...prev,
  video: importData.localPath,
  caption: importData.caption,
  mediaKind: importData.mediaKind
}));

// Later, cleanup
await cleanupMediaImport(importData.token);
```

### Environment Configuration

**Development (local backend):**
```bash
# .env or .env.local
EXPO_PUBLIC_BACKEND_URL=http://localhost:3000
```

**Production (deployed backend):**
```bash
# .env.production
EXPO_PUBLIC_BACKEND_URL=https://your-backend-url.com
```

## Design Pattern: Auto-Download & Auto-Populate

This backend implements the same UX pattern used by professional social media tools:

1. **User Action** → Paste Instagram link
2. **Backend Processing** → Extract metadata + download file  
3. **File Storage** → Save to temporary token-based directory
4. **Frontend Fetch** → Download file as blob/buffer
5. **Form Population** → Auto-fill video + caption in form
6. **User Confirmation** → Review and send

This creates a seamless experience without manual file selection dialogs.

## Troubleshooting

- **"yt-dlp: command not found"** - Install `yt-dlp` globally
- **Connection refused** - Make sure backend is running
- **Post extraction fails** - May be a private post, blocked account, or Instagram structure change
- **File too large** - Default limit is 100MB (can be adjusted in code)
- **Cleanup fails** - Non-critical; files will accumulate over time

## Production Considerations

For production deployment, add:

1. **Cleanup Job** - Remove files older than N hours
   ```javascript
   // Add to backend/index.js
   setInterval(() => {
     // Scan storage/media and delete old dirs
   }, 3600000); // Every hour
   ```

2. **Rate Limiting** - Prevent abuse
   ```javascript
   const rateLimit = require('express-rate-limit');
   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000,
     max: 30
   });
   app.use('/media-imports', limiter);
   ```

3. **Caching** - Store extracted URLs temporarily
4. **Authentication** - Add API key or JWT validation
5. **Logging** - Send logs to external service (Sentry, etc.)

## References

- [yt-dlp Documentation](https://github.com/yt-dlp/yt-dlp)
- Design pattern inspired by Buffer, Later, and other SaaS social tools
- Express.js: https://expressjs.com/
