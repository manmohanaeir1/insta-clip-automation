# Insta-Clip: Auto-Download & Auto-Populate Setup

This project implements a **professional auto-download and auto-population system** similar to Buffer, Later, and other SaaS social media tools.

## Architecture Overview

```
User Pastes Link
       ↓
Resolve Metadata (Backend)
       ↓
Preview Content
       ↓
Click "Auto-Import"
       ↓
Download Media to Backend Storage
       ↓
Frontend Fetches File as Blob
       ↓
Auto-Populate Form (video + caption)
       ↓
User Confirms & Opens Instagram
```

## Quick Start

### 1. Install yt-dlp

```bash
# macOS
brew install yt-dlp

# Ubuntu/Debian
sudo apt install yt-dlp

# Windows (with Python)
pip install yt-dlp
```

Verify installation:
```bash
yt-dlp --version
```

### 2. Start Backend

```bash
# Terminal 1: Backend (from insta-clip/backend)
npm install
npm start
```

The backend will run on `http://localhost:3000` by default.

You'll see:
```
[SERVER] Insta-Clip backend running on http://localhost:3000
[SERVER] POST /extract          - Extract metadata only
[SERVER] POST /media-imports    - Download and store media
[SERVER] GET  /media-imports/:token/download - Retrieve stored file
[SERVER] GET  /health           - Health check
```

### 3. Run Mobile App

```bash
# Terminal 2: Mobile app (from insta-clip root)
npm start
```

The app will auto-connect to the backend on `http://localhost:3000`.

## How It Works

### Flow: Paste → Preview → Auto-Import → Open Instagram

1. **Paste/Share Link**
   - User pastes Instagram Reel/Post URL

2. **Check/Resolve** (Click "Check" button)
   - Backend uses `yt-dlp` to extract metadata
   - App shows preview, caption, and media type
   - Fast operation (metadata only, no file download)

3. **Auto-Import** (Click "Auto-Import" button)
   - Backend downloads the full video/image
   - Stores in temporary token-based directory
   - Returns download URL + caption + metadata
   - Frontend fetches file as Blob/Buffer
   - **Form auto-populates with video + caption**
   - Button changes to "Populated" (disabled)

4. **Open Instagram** 
   - User reviews auto-populated caption
   - Clicks "Open Instagram"
   - Caption copied to clipboard
   - Share sheet opens with video attached
   - User pastes caption in Instagram composer

## The Two API Endpoints

### Simple Mode: POST /extract
- **Use for**: Preview only, no download
- **Speed**: Fast (1-2 seconds)
- **Returns**: Media URL, caption, thumbnail
- **Storage**: None (links directly to Instagram CDN)

### Full Mode: POST /media-imports
- **Use for**: Auto-download & auto-populate
- **Speed**: Medium (3-10 seconds depending on file size)
- **Returns**: Download token, local storage URL, caption
- **Storage**: Temporary (auto-cleanup recommended)

## Frontend Integration

### Using Auto-Import in Your Component

```typescript
import { importMediaFromLink, cleanupMediaImport } from './src/lib/mediaImport';

// Call when user clicks "Auto-Import"
const importData = await importMediaFromLink(url, 'instagram');

// Auto-populate form state
setCaption(importData.caption);
setDownloadedClip({
  ...clip,
  caption: importData.caption,
  localFileUri: importData.localPath
});

// Later, cleanup when user dismisses or app closes
await cleanupMediaImport(importData.token);
```

See `src/lib/mediaImport.ts` for full implementation.

## File Structure

```
insta-clip/
├── backend/                           # Node.js backend service
│   ├── index.js                      # Express app with yt-dlp integration
│   ├── package.json                  # Backend dependencies
│   ├── storage/media/               # Temporary media storage
│   │   └── {uuid}/                  # One directory per import
│   │       └── instagram-{uuid}.mp4 # Downloaded media file
│   └── README.md                     # Backend documentation
│
├── src/
│   ├── lib/
│   │   ├── debugLog.ts              # Logging utility
│   │   ├── instagramUrl.ts          # URL parsing
│   │   └── mediaImport.ts           # Auto-import logic (NEW)
│   │
│   ├── services/
│   │   ├── clipResolver.ts          # Metadata extraction via backend
│   │   └── instagramShare.ts        # Share to Instagram
│   │
│   └── types/clip.ts                # TypeScript types
│
├── App.tsx                           # Main UI with Auto-Import button
├── SETUP.md                          # This file
└── .env.example                      # Environment config template
```

## Environment Variables

Create `.env` or `.env.local`:

```bash
# Development (local backend)
EXPO_PUBLIC_BACKEND_URL=http://localhost:3000

# Production (deployed backend)
# EXPO_PUBLIC_BACKEND_URL=https://your-backend-domain.com
```

## Troubleshooting

### Backend won't start
```bash
# Check if yt-dlp is installed
which yt-dlp
yt-dlp --version

# If not installed, install it
brew install yt-dlp  # macOS
sudo apt install yt-dlp  # Linux
```

### App can't connect to backend
- Make sure backend is running on `http://localhost:3000`
- Check that your IP/hostname is correct in `EXPO_PUBLIC_BACKEND_URL`
- On Android emulator, use `10.0.2.2:3000` instead of `localhost:3000`

### Media extraction fails
- Post may be private or blocked
- Instagram may have changed their structure (yt-dlp update needed)
- Run: `pip install --upgrade yt-dlp`

### Auto-import button is disabled
- No clip loaded (paste a link first)
- Media already auto-populated
- Backend is still processing

## Performance Tips

1. **Fast Network**: Media download speed depends on file size (max 100MB)
2. **Caching**: Backend doesn't cache by default; add Redis for production
3. **Cleanup**: Old media files accumulate in `backend/storage/media/`
   - Set up a cron job to delete files > 24 hours old
   - Or add manual cleanup endpoint

## Production Deployment

For production use:

1. **Deploy Backend**
   ```bash
   # Push backend code to your server
   # Install dependencies: npm install
   # Use process manager: pm2, systemd, or Docker
   ```

2. **Update Environment**
   ```bash
   EXPO_PUBLIC_BACKEND_URL=https://your-api.example.com
   ```

3. **Add Security**
   - Enable HTTPS
   - Add rate limiting
   - Add authentication (API keys)
   - Enable CORS for your domain only

4. **Add Cleanup Job**
   ```javascript
   // In backend/index.js
   setInterval(() => {
     // Delete media older than 24 hours
   }, 3600000);
   ```

## Design Pattern Reference

This implementation follows the same UX pattern as:
- **Buffer** - Auto-preview social content
- **Later** - Drag-drop scheduling with auto-captions
- **Hootsuite** - Auto-populate from content library
- **Airtable Forms** - Auto-fill with linked records

The key innovation: **Download to backend storage → Fetch as blob → Auto-populate form**

This eliminates:
- Manual file selection dialogs
- Copy-paste workflows
- Multi-step form filling

## Next Steps

1. ✅ Backend with yt-dlp integration
2. ✅ Auto-import function with blob handling
3. ✅ Form auto-population
4. ⏳ (Optional) Add TikTok support
5. ⏳ (Optional) Add Redis caching
6. ⏳ (Optional) Add user authentication
7. ⏳ (Optional) Add download history/favorites

## Questions?

See `backend/README.md` for backend-specific details or check the implementation in:
- `src/lib/mediaImport.ts` - Frontend auto-import logic
- `backend/index.js` - Backend download & storage logic
- `App.tsx` - UI integration
