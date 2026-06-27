# Quick Visual Guide: Auto-Download & Auto-Populate

## The Problem

Traditional workflow:
```
😩 Download Video
😩 Navigate File System  
😩 Select File
😩 Copy Caption
😩 Paste Caption
😩 Open Instagram
😩 Attach Video
😩 Paste Caption Again

Total: ~3-5 minutes, 8+ manual steps
```

## The Solution

Auto-import workflow:
```
✅ Paste Link
✅ Click "Check" (1-3s) → Preview loads
✅ Click "Auto-Import" (5-10s) → Download in background
✅ Form auto-fills (video + caption)
✅ Click "Open Instagram" → Share sheet opens
✅ Paste Caption
✅ Confirm

Total: ~15 seconds, 5 steps
```

## System Components

### 1. Backend (Node.js + yt-dlp)
```
┌────────────────────────────────────┐
│  Express Server (port 3000)        │
│                                    │
│  POST /extract → metadata only     │
│  POST /media-imports → full dl     │
│  GET /.../download → file binary   │
│  DELETE /.../token → cleanup       │
│                                    │
│  Uses yt-dlp to access Instagram   │
│  Stores videos in: storage/media/  │
└────────────────────────────────────┘
```

### 2. Frontend (React Native)
```
┌────────────────────────────────────┐
│  App.tsx (Main Screen)             │
│                                    │
│  [Paste Link Input]                │
│  [Check] [Auto-Import]             │
│  [Caption TextInput]               │
│  [Open Instagram] button           │
│                                    │
│  State:                            │
│  - url                             │
│  - caption (auto-populated)        │
│  - downloadedClip (auto-populated) │
│  - autoPopulated (button state)    │
└────────────────────────────────────┘
```

### 3. Service Layer
```
src/lib/mediaImport.ts

importMediaFromLink(url, platform)
  1. POST /media-imports → get token + download_url
  2. GET download_url → fetch file as Blob
  3. Write to local cache
  4. Return { caption, localPath }

cleanupMediaImport(token)
  DELETE /media-imports/:token
```

## Step-by-Step Flow

### Step 1: Resolve (Fast)
```
User: Pastes URL
    ↓
App: Click "Check"
    ↓
Backend: yt-dlp -j <url>
    ↓
Return: { caption, thumbnail, metadata }
    ↓
UI: Show preview + caption

⏱️ Time: 1-3 seconds
```

### Step 2: Auto-Import (Medium)
```
User: Click "Auto-Import"
    ↓
Backend: yt-dlp -f "best[<100M]" -o <file> <url>
    ↓
Save: storage/media/{uuid}/instagram.mp4
    ↓
Return: { token, download_url, caption }
    ↓
Frontend: Fetch file from download_url
    ↓
Convert: ArrayBuffer → Buffer → Base64
    ↓
Write: Local cache at /tmp/instagram-uuid.mp4
    ↓
Return: { caption, localPath }
    ↓
App: Update state with caption + video

⏱️ Time: 5-15 seconds
UI: Caption TextInput now has caption
UI: "Auto-Import" button → "Populated" (disabled)
```

### Step 3: Share (Instant)
```
User: Click "Open Instagram"
    ↓
App: Copy caption to clipboard
    ↓
App: Open share sheet with video
    ↓
Instagram: Opens with video attached
    ↓
User: Pastes caption (Cmd+V)
    ↓
User: Confirms post

⏱️ Time: 10-20 seconds
✅ Done!
```

## Code Locations

| Feature | File | Function |
|---------|------|----------|
| Backend server | `backend/index.js` | All endpoints |
| Resolve metadata | `src/services/clipResolver.ts` | `resolveClipFromUrl()` |
| Auto-import | `src/lib/mediaImport.ts` | `importMediaFromLink()` |
| Cleanup | `src/lib/mediaImport.ts` | `cleanupMediaImport()` |
| UI + state | `App.tsx` | `autoImportMedia()` |
| Auto-populate | `App.tsx` | State update in callback |

## Network Requests

### Request 1: Check Link
```
POST http://localhost:3000/extract
Content-Type: application/json

{
  "url": "https://www.instagram.com/reel/..."
}

← 200 OK
{
  "success": true,
  "caption": "Your caption...",
  "thumbnailUrl": "https://...",
  "mediaKind": "video"
}
```

### Request 2a: Download (Backend)
```
POST http://localhost:3000/media-imports
Content-Type: application/json

{
  "url": "https://www.instagram.com/reel/...",
  "platform": "instagram"
}

← 200 OK
{
  "success": true,
  "token": "550e8400-e29b-41d4-a716-446655440000",
  "download_url": "/media-imports/550e8400.../download",
  "caption": "Your caption...",
  "filename": "instagram-550e8400.mp4"
}
```

### Request 2b: Fetch File
```
GET http://localhost:3000/media-imports/550e8400.../download

← 200 OK
[binary video data: ...........]
```

### Request 3: Cleanup
```
DELETE http://localhost:3000/media-imports/550e8400-e29b-41d4-a716-446655440000

← 200 OK
{
  "success": true,
  "message": "Media deleted"
}
```

## Storage Structure

```
backend/storage/media/
├── 550e8400-e29b-41d4-a716-446655440000/
│   └── instagram-550e8400.mp4 (downloaded video)
├── 660f9511-f30c-52e5-b827-557766551111/
│   └── instagram-660f9511.mp4
└── ...more directories...

Each directory = one auto-import
Gets deleted after user closes app or manually cleaned up
```

## Device Storage

```
/tmp/cache/ (app cache directory)
├── instagram-550e8400.mp4 (cached locally)
├── instagram-660f9511.mp4
└── ...more cached videos...

Persists until app cache is cleared by OS
```

## State Flow in App

```
Initial
├─ url: ""
├─ caption: ""
├─ clip: null
├─ downloadedClip: null
├─ autoPopulated: false
└─ status: "idle"

After User Pastes Link
├─ url: "https://www.instagram.com/reel/..."
├─ caption: ""
├─ clip: null
├─ downloadedClip: null
├─ autoPopulated: false
└─ status: "idle"

After User Clicks "Check"
├─ url: "https://www.instagram.com/reel/..."
├─ caption: "Your caption here"  ← Updated!
├─ clip: { ...metadata }        ← Updated!
├─ downloadedClip: null
├─ autoPopulated: false
└─ status: "ready"

After User Clicks "Auto-Import"
├─ url: "https://www.instagram.com/reel/..."
├─ caption: "Your caption here"
├─ clip: { ...metadata }
├─ downloadedClip: {            ← Updated!
│    localFileUri: "/tmp/...",
│    caption: "Your caption here",
│    mediaKind: "video"
│  }
├─ autoPopulated: true          ← Updated!
├─ importToken: "550e8400-..."  ← Updated!
└─ status: "downloaded"
```

## Environment Setup

```bash
# 1. Install yt-dlp
brew install yt-dlp

# 2. Start backend
cd backend
npm install
npm start

# 3. Start app
npm start

# 4. Test
- Paste: https://www.instagram.com/reel/DW9KcP-zIMm/
- Click Check (wait 1-3s)
- See preview
- Click Auto-Import (wait 5-10s)
- See caption auto-fill
- Done!
```

## Comparison: Before vs After

### Before (Manual)
```
Paste → Wait → Check → Wait → Download → File dialog
→ Select folder → Confirm → Copy caption → Open Instagram
→ Select video → Attach → Paste caption → Confirm post

Steps: 12+
Time: 3-5 minutes
Friction: High (many manual steps)
```

### After (Auto-Import)
```
Paste → Check → Auto-Import → Open Instagram → Paste → Post

Steps: 5
Time: 15-20 seconds
Friction: Low (mostly automated)
```

## Success Indicators

✅ Check if working:
```
Backend logs show:
[MEDIA-IMPORT] Processing instagram: https://...
[MEDIA-IMPORT] Downloading to: storage/media/...
[MEDIA-IMPORT] Success - XXXXX bytes

App logs show:
[InstaClip] import:backend-response { status: 200, ok: true }
[InstaClip] import:file-downloaded { size: XXXXX }
[InstaClip] ui:auto-import-success { token: "...", filename: "..." }

UI shows:
✅ Caption appears in TextInput
✅ "Auto-Import" button disabled
✅ Message: "Media downloaded & caption populated!"
```

## Common Issues

| Issue | Solution |
|-------|----------|
| yt-dlp: command not found | `brew install yt-dlp` |
| Connection refused (3000) | Start backend: `npm start` in backend/ |
| Auto-import fails | Check backend logs, may be private post |
| Button disabled | Already auto-populated or no clip loaded |
| File not downloading | Check network, max 100MB limit |

## What's Next?

Potential features to add:
- [ ] Support for TikTok URLs
- [ ] Support for YouTube Shorts
- [ ] Caption history/favorites
- [ ] Download counter
- [ ] Share to other platforms (Twitter, etc.)
- [ ] Redis caching for performance
- [ ] User authentication
- [ ] Web interface (complementary to mobile app)

---

**Learn More:**
- `SETUP.md` - Installation guide
- `IMPLEMENTATION.md` - Deep technical walkthrough
- `AUTO-IMPORT-SYSTEM.md` - Complete system reference
- `backend/README.md` - API documentation
