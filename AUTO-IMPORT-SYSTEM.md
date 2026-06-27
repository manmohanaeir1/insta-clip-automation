# Auto-Download & Auto-Population System - Complete Reference

This document provides a complete overview of the auto-download and auto-population system implemented in Insta-Clip, following the professional SaaS pattern from Buffer, Later, and similar tools.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         INSTA-CLIP APP                              │
│  (React Native + TypeScript)                                        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ App.tsx (UI Layer)                                          │  │
│  │                                                             │  │
│  │  [Paste Link] → [Check] → [Preview] → [Auto-Import]      │  │
│  │                                                             │  │
│  │  State:                                                     │  │
│  │  - url: string                                              │  │
│  │  - caption: string (auto-populated)                         │  │
│  │  - downloadedClip: { localFileUri, caption, ... }           │  │
│  │  - autoPopulated: boolean                                   │  │
│  │  - importToken: string (for cleanup)                        │  │
│  └─────────────────────────────────────────────────────────────┘  │
│           ↑                                  ↓                      │
│           │                                  │                      │
│  ┌────────┴──────────────────────────────────┴────────────────┐  │
│  │ Service Layer                                              │  │
│  │                                                             │  │
│  │  • resolveClipFromUrl()  ← Calls: POST /extract           │  │
│  │  • importMediaFromLink() ← Calls: POST /media-imports +   │  │
│  │                                  GET /media-imports/...    │  │
│  │  • downloadClip()                                           │  │
│  │  • cleanupMediaImport()  ← Calls: DELETE /media-imports    │  │
│  │                                                             │  │
│  │  Files:                                                     │  │
│  │  - src/services/clipResolver.ts                            │  │
│  │  - src/services/instagramShare.ts                          │  │
│  │  - src/lib/mediaImport.ts (NEW)                            │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ HTTP ↑
                         (JSON + Blob)
┌─────────────────────────────────────────────────────────────────────┐
│                      EXPRESS BACKEND                                │
│  (Node.js + yt-dlp)                                                │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ backend/index.js (API Layer)                               │  │
│  │                                                             │  │
│  │  1. POST /extract                                           │  │
│  │     ├─ Run: yt-dlp -j <url> (metadata only)               │  │
│  │     └─ Return: { caption, thumbnail, mediaKind }          │  │
│  │                                                             │  │
│  │  2. POST /media-imports                                     │  │
│  │     ├─ Generate UUID token                                  │  │
│  │     ├─ Run: yt-dlp -j <url> (metadata)                    │  │
│  │     ├─ Run: yt-dlp -f "best[<100M]" -o <path> <url>      │  │
│  │     ├─ Save to: storage/media/{token}/<filename>          │  │
│  │     └─ Return: { token, download_url, caption }           │  │
│  │                                                             │  │
│  │  3. GET /media-imports/:token/download                      │  │
│  │     ├─ Retrieve: storage/media/{token}/<filename>         │  │
│  │     └─ Return: binary video file (video/mp4)              │  │
│  │                                                             │  │
│  │  4. DELETE /media-imports/:token                            │  │
│  │     └─ Delete: storage/media/{token}/ (cleanup)           │  │
│  │                                                             │  │
│  └─────────────────────────────────────────────────────────────┘  │
│           ↑                                  ↓                      │
│           │                                  │                      │
│  ┌────────┴──────────────────────────────────┴────────────────┐  │
│  │ Subprocess/CLI Layer                                       │  │
│  │                                                             │  │
│  │  yt-dlp --version                                          │  │
│  │  yt-dlp -j https://www.instagram.com/reel/...            │  │
│  │  yt-dlp -f "best[filesize<100M]" -o video.mp4 <url>     │  │
│  │                                                             │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ Network ↑
                      (HTTP & Instagram CDN)
┌─────────────────────────────────────────────────────────────────────┐
│                    INSTAGRAM SERVICE                                │
│  • Public HTML pages                                               │
│  • CDN-hosted media                                                │
└─────────────────────────────────────────────────────────────────────┘
```

## Complete Data Flow

### 1️⃣ User Pastes Link

```
User Action: Pastes "https://www.instagram.com/reel/DW9KcP-zIMm/"

App State Before:
{
  url: "",
  caption: "",
  clip: null,
  downloadedClip: null,
  status: "idle"
}

App State After (no change yet):
{
  url: "https://www.instagram.com/reel/DW9KcP-zIMm/",
  caption: "",
  clip: null,
  downloadedClip: null,
  status: "idle"
}
```

### 2️⃣ Click "Check" Button → Resolve Metadata

```
App: resolveUrl()
  ↓
App: await resolveClipFromUrl(url)
  ↓
clipResolver.ts: await fetch(`${BACKEND}/extract`, { url })
  ↓
Backend: POST /extract
  │
  ├─ Run: yt-dlp -j --no-warnings "https://www.instagram.com/reel/DW9KcP-zIMm/"
  │
  ├─ Parse JSON output:
  │  {
  │    "id": "DW9KcP-zIMm",
  │    "title": "Posted by username",
  │    "description": "Your awesome caption here 🎥",
  │    "thumbnail": "https://cdn.../image.jpg",
  │    "ext": "mp4",
  │    ...
  │  }
  │
  └─ Return: {
       success: true,
       caption: "Your awesome caption here 🎥",
       thumbnailUrl: "https://cdn.../image.jpg",
       mediaKind: "video",
       title: "Posted by username"
     }

App: setClip(metadata)
App: setCaption(metadata.caption)
App: setStatus("ready")

App State After:
{
  url: "https://www.instagram.com/reel/DW9KcP-zIMm/",
  caption: "Your awesome caption here 🎥",
  clip: {
    provider: "instagram",
    postType: "reel",
    shortcode: "DW9KcP-zIMm",
    normalizedUrl: "https://www.instagram.com/reel/DW9KcP-zIMm/",
    caption: "Your awesome caption here 🎥",
    title: "Posted by username",
    thumbnailUrl: "https://cdn.../image.jpg",
    mediaKind: "video"
  },
  downloadedClip: null,
  status: "ready"
}

UI Updates:
✅ Shows thumbnail
✅ Shows caption in textarea
✅ Shows "reel" badge
✅ "Auto-Import" button becomes enabled
```

### 3️⃣ Click "Auto-Import" Button → Full Download + Auto-Populate

```
App: autoImportMedia()
  │
  ├─ setStatus("downloading")
  ├─ setMessage("Downloading media...")
  │
  └─ await importMediaFromLink(url, "instagram")
      ↓
      mediaImport.ts: 
        │
        ├─ STEP 1: Call Backend
        │  │
        │  └─ await fetch(`${BACKEND}/media-imports`, {
        │       method: 'POST',
        │       body: JSON.stringify({ url, platform: 'instagram' })
        │     })
        │     ↓
        │     Backend: POST /media-imports
        │     │
        │     ├─ token = generateUUID()  // "550e8400-e29b-41d4-a716-446655440000"
        │     ├─ mediaPath = `storage/media/550e8400-e29b-41d4-a716-446655440000`
        │     │
        │     ├─ EXTRACT METADATA:
        │     │  yt-dlp -j --no-warnings "https://www.instagram.com/reel/DW9KcP-zIMm/"
        │     │  → Get caption, title, media info
        │     │
        │     ├─ DOWNLOAD MEDIA:
        │     │  yt-dlp -f "best[filesize<100M]" \\
        │     │          -o "storage/media/.../instagram-550e8400.mp4" \\
        │     │          --no-warnings \\
        │     │          "https://www.instagram.com/reel/DW9KcP-zIMm/"
        │     │  → Downloads from Instagram CDN
        │     │  → Saves to: storage/media/550e8400-e29b-41d4-a716-446655440000/instagram-550e8400.mp4
        │     │
        │     └─ Return: {
        │          success: true,
        │          token: "550e8400-e29b-41d4-a716-446655440000",
        │          download_url: "/media-imports/550e8400-e29b-41d4-a716-446655440000/download",
        │          caption: "Your awesome caption here 🎥",
        │          filename: "instagram-550e8400.mp4",
        │          mediaKind: "video"
        │        }
        │
        ├─ STEP 2: Fetch File as Blob
        │  │
        │  ├─ downloadUrl = "http://localhost:3000/media-imports/550e8400-e29b-41d4-a716-446655440000/download"
        │  │
        │  ├─ await fetch(downloadUrl)
        │  │  ↓
        │  │  Backend: GET /media-imports/:token/download
        │  │  ├─ filepath = "storage/media/550e8400-e29b-41d4-a716-446655440000/instagram-550e8400.mp4"
        │  │  └─ Return: [binary video file data]
        │  │
        │  ├─ const arrayBuffer = await response.arrayBuffer()
        │  │  // ArrayBuffer of binary data
        │  │
        │  └─ const buffer = Buffer.from(arrayBuffer)
        │     // Convert ArrayBuffer to Node Buffer
        │
        ├─ STEP 3: Save to Local Cache
        │  │
        │  ├─ localPath = `${FileSystem.cacheDirectory}instagram-550e8400.mp4`
        │  │
        │  ├─ await FileSystem.writeAsStringAsync(
        │  │       localPath,
        │  │       buffer.toString('base64'),
        │  │       { encoding: FileSystem.EncodingType.Base64 }
        │  │     )
        │  │
        │  └─ Video now cached on device at: /cache/instagram-550e8400.mp4
        │
        └─ Return: {
             caption: "Your awesome caption here 🎥",
             localPath: "/cache/instagram-550e8400.mp4",
             filename: "instagram-550e8400.mp4",
             mediaKind: "video",
             token: "550e8400-e29b-41d4-a716-446655440000"
           }

App: Update form state with import data
  │
  ├─ setCaption(importData.caption)
  │  // TextInput now shows: "Your awesome caption here 🎥"
  │
  ├─ setDownloadedClip({
  │    ...clip,
  │    caption: importData.caption,
  │    localFileUri: importData.localPath
  │  })
  │  // Form knows where the video is
  │
  ├─ setImportToken(importData.token)
  │  // Save token for cleanup
  │
  ├─ setAutoPopulated(true)
  │  // Disable Auto-Import button
  │
  └─ setMessage("✅ Media downloaded & caption populated!")

Final App State:
{
  url: "https://www.instagram.com/reel/DW9KcP-zIMm/",
  caption: "Your awesome caption here 🎥",  // ← Auto-populated!
  clip: { ... },
  downloadedClip: {
    provider: "instagram",
    postType: "reel",
    shortcode: "DW9KcP-zIMm",
    caption: "Your awesome caption here 🎥",
    mediaKind: "video",
    localFileUri: "/cache/instagram-550e8400.mp4"  // ← Ready to share!
  },
  autoPopulated: true,  // ← Button disabled
  importToken: "550e8400-e29b-41d4-a716-446655440000",
  status: "downloaded"
}

UI Updates:
✅ Caption textarea auto-filled
✅ "Auto-Import" button changes to "Populated" (disabled)
✅ "Open Instagram" button now has video ready
```

### 4️⃣ Click "Open Instagram" → Share

```
App: downloadAndOpenInstagram()
  │
  ├─ await copyCaption(caption)
  │  // Caption copied to device clipboard
  │
  ├─ await openInstagramComposer(localFileUri)
  │  // Opens native share sheet with video attached
  │
  └─ setMessage("Caption copied. Paste it in Instagram.")

User sees:
✅ Share sheet opens
✅ Instagram app is listed as option
✅ Tap "Instagram"
✅ Video is attached to Instagram composer
✅ Caption is in clipboard (ready to paste)
✅ User taps caption field
✅ User pastes (Cmd+V or Ctrl+V)
✅ User submits post
```

### 5️⃣ Cleanup on App Close

```
App unmounts or navigation away

useEffect cleanup:
  if (importToken) {
    await cleanupMediaImport(importToken)
      │
      └─ await fetch(`${BACKEND}/media-imports/550e8400-e29b-41d4-a716-446655440000`, {
           method: 'DELETE'
         })
         ↓
         Backend: DELETE /media-imports/:token
         │
         └─ Delete directory: storage/media/550e8400-e29b-41d4-a716-446655440000/
            (Removes: instagram-550e8400.mp4)

Result:
✅ Temporary storage cleaned up
✅ Prevents disk bloat
✅ Only called on unmount (not on every state change)
```

## File Structure Reference

```
insta-clip/
│
├── backend/
│   ├── index.js                          ← Main server
│   ├── package.json                      ← Dependencies + scripts
│   ├── storage/
│   │   └── media/                        ← Temporary storage
│   │       └── {uuid}/
│   │           └── instagram-{uuid}.mp4  ← Downloaded video
│   └── README.md                         ← Backend docs
│
├── src/
│   ├── lib/
│   │   ├── debugLog.ts                   ← Logging utility
│   │   ├── instagramUrl.ts               ← URL parsing
│   │   └── mediaImport.ts                ← ⭐ Auto-import logic
│   │
│   ├── services/
│   │   ├── clipResolver.ts               ← Resolve + download
│   │   └── instagramShare.ts             ← Share to Instagram
│   │
│   └── types/
│       └── clip.ts                       ← TypeScript types
│
├── App.tsx                               ← ⭐ Main UI + Auto-Import button
├── package.json                          ← App dependencies
├── SETUP.md                              ← Setup guide
├── IMPLEMENTATION.md                     ← Deep dive (this file)
└── .env.example                          ← Environment template
```

## Key Features Implemented

### ✅ Two-Tier API

| Endpoint | Purpose | Speed | Storage |
|----------|---------|-------|---------|
| `POST /extract` | Preview only | 1-3s | None |
| `POST /media-imports` | Auto-download | 5-15s | Temporary |
| `GET /.../download` | Fetch file | 1-5s | N/A |
| `DELETE /.../token` | Cleanup | <1s | Removes |

### ✅ Buffer/Blob Conversion

```
Instagram CDN (binary)
    ↓
arrayBuffer (JavaScript)
    ↓
Buffer (Node.js)
    ↓
Base64 string
    ↓
LocalFileSystem (React Native)
    ↓
Ready to attach to form
```

### ✅ Form Auto-Population

React state → Component re-render → TextInput displays caption

```typescript
// When state updates
setCaption("Your awesome caption...")

// Component automatically re-renders
<TextInput value={caption} ... />  // Shows new value
```

### ✅ Token-Based Cleanup

Each download gets unique UUID → Easy to manage/delete

```
GET request 1: /media-imports/uuid-1/download → Get video 1
GET request 2: /media-imports/uuid-2/download → Get video 2
DELETE request 1: /media-imports/uuid-1 → Clean video 1
DELETE request 2: /media-imports/uuid-2 → Clean video 2
```

## Testing the System

### Manual Test Checklist

- [ ] Install yt-dlp: `yt-dlp --version`
- [ ] Start backend: `cd backend && npm install && npm start`
- [ ] Start app: `npm start`
- [ ] Paste Instagram link: `https://www.instagram.com/reel/DW9KcP-zIMm/`
- [ ] Click "Check" → Verify preview loads (1-3s)
- [ ] See caption in textarea
- [ ] Click "Auto-Import" → Wait for download (5-10s)
- [ ] Verify "Auto-Import" button changes to "Populated"
- [ ] Verify caption still in textarea
- [ ] Close app → Verify cleanup called
- [ ] Check backend logs for 200 responses
- [ ] Verify `storage/media/` directory doesn't bloat

### Debug Logs

Enable debug logging in `App.tsx`:
```typescript
import { debugStep, debugError } from './src/lib/debugLog';

// Watch console for:
// [InstaClip] ui:auto-import-pressed
// [InstaClip] import:backend-response
// [InstaClip] import:file-downloaded
// [InstaClip] ui:auto-import-success
```

Check backend logs:
```bash
npm start  # Backend

# Watch for:
# [MEDIA-IMPORT] Processing instagram: https://...
# [MEDIA-IMPORT] Downloading to: storage/media/...
# [MEDIA-IMPORT] Success - 5242880 bytes
```

## Performance Optimization Tips

### Frontend
- Use `useCallback` to prevent re-renders (already done in code)
- Debounce URL input changes (consider adding)
- Show loading spinner during download

### Backend
- Add Redis caching for frequently downloaded videos
- Implement concurrent download limits
- Use streaming response for file downloads

### General
- Monitor file system disk usage
- Set up auto-cleanup cron job (delete files > 24h old)
- Add analytics to track auto-import success rate

## Security Checklist

- [ ] Validate URL starts with `instagram.com`
- [ ] Add rate limiting (30 req/15min per IP)
- [ ] Add request authentication (API key)
- [ ] Use HTTPS only in production
- [ ] Sanitize file paths (prevent directory traversal)
- [ ] Set file size limit (100MB)
- [ ] Add CORS headers correctly
- [ ] Log all requests (audit trail)
- [ ] Monitor for abuse (mass downloads)

## Extending to Other Platforms

### Add TikTok Support

1. **Backend:** yt-dlp already supports TikTok
   ```javascript
   // Same code, just pass platform: 'tiktok'
   app.post('/media-imports', async (req, res) => {
     const { url, platform } = req.body;
     // yt-dlp handles TikTok URLs just fine!
   });
   ```

2. **Frontend:** Add platform param
   ```typescript
   await importMediaFromLink(tiktokUrl, 'tiktok');
   ```

3. **UI:** Add TikTok URL input field

### Add YouTube Short Support

```typescript
await importMediaFromLink(youtubeShortUrl, 'youtube');
```

Same backend endpoint handles all platforms!

## Summary

The auto-download & auto-population system:

1. **Extracts** metadata via backend (fast)
2. **Downloads** media to server storage (medium)
3. **Fetches** as blob and saves to device cache (fast)
4. **Auto-populates** form with video + caption (instant)
5. **Cleans up** temporary storage on unmount (background)

**Result:** Professional UX similar to Buffer/Later, reducing workflow time from ~3 min to ~15 sec.

See `SETUP.md` for installation and `IMPLEMENTATION.md` for detailed code walkthrough.
