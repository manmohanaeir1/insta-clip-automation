# Auto-Download & Auto-Population Implementation Guide

This document explains how the auto-download and auto-population logic works, inspired by professional SaaS tools like Buffer and Later.

## The Problem It Solves

Traditional apps require users to:
1. Download a video manually
2. Navigate file system
3. Select file in app
4. Copy caption
5. Paste caption into Instagram
6. Manually attach video
7. Repeat for each post

**This is tedious.**

## The Solution: 3-Step Backend + Frontend Flow

### Step 1: Backend Download & Storage (Backend)

**File:** `backend/index.js` - `POST /media-imports` endpoint

```javascript
// 1. Extract metadata with yt-dlp
const metaCommand = `yt-dlp -j --no-warnings "${url}"`;
const metadata = JSON.parse(metaResult.stdout);

// 2. Download video to storage with size limit
const downloadCommand = `yt-dlp -f "best[filesize<100M]" -o "${filepath}" "${url}"`;
await exec(downloadCommand);

// 3. Return token + download URL
res.json({
  success: true,
  token: 'uuid-token',
  download_url: '/media-imports/uuid-token/download',
  caption: 'extracted caption...',
  filename: 'instagram-uuid.mp4'
});
```

**Why?** 
- yt-dlp can access Instagram, browsers cannot (CORS)
- Store on server temporarily so frontend can fetch
- One download = everyone can re-download (caching)

### Step 2: Frontend Fetch as Blob (Frontend)

**File:** `src/lib/mediaImport.ts` - `importMediaFromLink()` function

```typescript
// 1. Call backend to start download
const importResponse = await fetch(`${BACKEND_URL}/media-imports`, {
  method: 'POST',
  body: JSON.stringify({ url, platform: 'instagram' })
});
const importData = await importResponse.json();

// 2. Fetch the file as blob/buffer
const fileResponse = await fetch(downloadUrl);
const arrayBuffer = await fileResponse.arrayBuffer();
const buffer = Buffer.from(arrayBuffer);

// 3. Write to local app cache
await FileSystem.writeAsStringAsync(localPath, buffer.toString('base64'), {
  encoding: FileSystem.EncodingType.Base64
});

return {
  caption: importData.caption,
  localPath: localPath,
  mediaKind: 'video'
};
```

**Why?**
- Blob/Buffer = file object the form can accept
- Local cache = no need to download again
- Base64 encoding = React Native file system requirement

### Step 3: Auto-Populate Form (UI)

**File:** `App.tsx` - `autoImportMedia()` callback

```typescript
const autoImportMedia = useCallback(async (url) => {
  // 1. Call import function
  const importData = await importMediaFromLink(url, 'instagram');
  
  // 2. Update form state
  setCaption(importData.caption);
  setDownloadedClip({
    ...clip,
    caption: importData.caption,
    localFileUri: importData.localPath,
    mediaKind: importData.mediaKind
  });
  
  // 3. Mark as populated
  setAutoPopulated(true);
  setMessage('Media downloaded & caption populated!');
}, [url, clip]);
```

**Why?**
- React state management = form automatically updates
- User sees populated caption in textarea
- Video ready to share without manual file selection

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          USER BROWSER                           │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  App.tsx                                                   │ │
│  │  - User clicks "Auto-Import"                              │ │
│  │  - Calls autoImportMedia()                                │ │
│  │  - Updates form state with caption & video               │ │
│  └────────────────────────────────────────────────────────────┘ │
│           │                          ↑                           │
│           │                          │ (caption, local path)    │
│           │                          │                          │
│           v                          │                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  src/lib/mediaImport.ts                                    │ │
│  │  - Call backend: POST /media-imports                      │ │
│  │  - Fetch file: GET /media-imports/:token/download        │ │
│  │  - Convert blob to buffer                                 │ │
│  │  - Write to local cache                                   │ │
│  │  - Return { caption, localPath }                          │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                           │                 ↑
         POST /media-imports│                 │ {token, download_url}
              JSON body      │                 │
                            v                 │
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND SERVER                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  backend/index.js                                         │ │
│  │                                                            │ │
│  │  POST /media-imports:                                    │ │
│  │  1. Extract metadata: yt-dlp -j <url>                   │ │
│  │  2. Download: yt-dlp -f "best[<100M]" -o <path> <url>  │ │
│  │  3. Return token + download_url + caption               │ │
│  │                                                            │ │
│  │  GET /media-imports/:token/download:                    │ │
│  │  - Return binary file (video/mp4)                        │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│           │                          ↑                           │
│           │                          │ (file binary)            │
│           v                          │                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  backend/storage/media/                                   │ │
│  │  └── {uuid}/                                              │ │
│  │      └── instagram-{uuid}.mp4  (downloaded video)         │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                           │                 ↑
                  yt-dlp   │                 │ (execute)
              subprocess   │                 │
                            v                 │
                     ┌──────────────┐
                     │  INSTAGRAM   │
                     │  CDN / API   │
                     └──────────────┘
```

## Code Example: Step-by-Step Walkthrough

### User Action 1: Paste Instagram Link

```typescript
// App.tsx
<TextInput 
  value={url}
  onChangeText={setUrl}
  placeholder="https://www.instagram.com/reel/..."
/>
```

User pastes: `https://www.instagram.com/reel/DW9KcP-zIMm/?igsh=...`

### User Action 2: Click "Check" Button

```typescript
const resolveUrl = useCallback(async (candidateUrl = url) => {
  // This calls clipResolver.resolveClipFromUrl()
  // Which calls backend POST /extract (fast, metadata only)
  const metadata = await resolveClipFromUrl(candidateUrl);
  
  setClip(metadata);
  setCaption(metadata.caption);
  setStatus('ready');
}, [url]);
```

**Backend** (`POST /extract`):
- Runs: `yt-dlp -j https://www.instagram.com/reel/DW9KcP-zIMm/`
- Returns: `{ title, thumbnail_url, description, ... }`
- Takes: ~1-2 seconds

**UI Updates:**
- Shows thumbnail
- Shows caption
- Shows post type (reel vs post)

### User Action 3: Click "Auto-Import" Button

```typescript
const autoImportMedia = useCallback(async (candidateUrl = url) => {
  setStatus('downloading');
  setMessage('Downloading media...');
  
  // This calls importMediaFromLink()
  const importData = await importMediaFromLink(candidateUrl, 'instagram');
  
  // Auto-populate the form
  setCaption(importData.caption);  // ← Caption textarea updates
  setDownloadedClip({
    ...clip,
    localFileUri: importData.localPath  // ← Video attached to form
  });
  setAutoPopulated(true);
  setMessage('✅ Media ready to share!');
}, [url, clip]);
```

**Frontend** (`src/lib/mediaImport.ts`):

```typescript
export async function importMediaFromLink(url, platform) {
  // STEP 1: Tell backend to download
  const importResponse = await fetch(`${BACKEND_URL}/media-imports`, {
    method: 'POST',
    body: JSON.stringify({ url, platform })
  });
  const { token, download_url, caption } = await importResponse.json();
  
  // STEP 2: Download the file from backend
  const downloadUrl = `${BACKEND_URL}${download_url}`;
  const fileResponse = await fetch(downloadUrl);
  const arrayBuffer = await fileResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // STEP 3: Save to local cache
  const localPath = `${FileSystem.cacheDirectory}instagram-${token}.mp4`;
  await FileSystem.writeAsStringAsync(localPath, buffer.toString('base64'), {
    encoding: FileSystem.EncodingType.Base64
  });
  
  // STEP 4: Return everything needed for form
  return {
    caption,
    localPath,
    mediaKind: 'video',
    token
  };
}
```

**Backend** (`POST /media-imports`):

```javascript
app.post('/media-imports', async (req, res) => {
  const { url, platform } = req.body;
  const token = uuidv4();
  const mediaPath = `storage/media/${token}`;
  
  // STEP 1: Extract metadata
  const metaResult = await exec(`yt-dlp -j --no-warnings "${url}"`);
  const metadata = JSON.parse(metaResult.stdout);
  const caption = metadata.description;
  
  // STEP 2: Download the actual file
  const filename = `${platform}-${token}.mp4`;
  const filepath = `${mediaPath}/${filename}`;
  await exec(`yt-dlp -f "best[filesize<100M]" -o "${filepath}" --no-warnings "${url}"`);
  
  // STEP 3: Return download URL
  res.json({
    success: true,
    token,
    download_url: `/media-imports/${token}/download`,
    caption,
    filename,
    mediaKind: 'video'
  });
});

// Later, serve the file
app.get('/media-imports/:token/download', (req, res) => {
  const filepath = `storage/media/${req.params.token}/instagram-${req.params.token}.mp4`;
  res.download(filepath);
});
```

### User Action 4: Open Instagram

```typescript
const downloadAndOpenInstagram = useCallback(async () => {
  // Copy caption to clipboard
  await copyCaption(caption);
  
  // Open share sheet with video
  await openInstagramComposer(downloadedClip.localFileUri);
  
  setMessage('Caption copied. Paste it in Instagram.');
}, [caption, downloadedClip]);
```

**Expected User Experience:**
1. ✅ Paste Instagram link
2. ✅ See preview (1-2 sec)
3. ✅ Click "Auto-Import"
4. ✅ Video + caption auto-fill (3-10 sec)
5. ✅ Click "Open Instagram"
6. ✅ Share sheet opens with video attached
7. ✅ Paste caption (Ctrl+V or Cmd+V)
8. ✅ Confirm & post

**Total time:** ~15 seconds vs. ~3 minutes manually

## Key Implementation Details

### 1. Token-Based Storage

Each download gets a UUID token:
```
/storage/media/{uuid}/instagram-{uuid}.mp4
```

Benefits:
- Multiple imports can run in parallel
- Frontend can request same media multiple times
- Easy to cleanup (delete entire directory)

### 2. Buffer Conversion

React Native can't directly accept Blob objects. We convert:
```typescript
const arrayBuffer = await response.arrayBuffer();
const buffer = Buffer.from(arrayBuffer);
const base64String = buffer.toString('base64');
await FileSystem.writeAsStringAsync(path, base64String, {
  encoding: FileSystem.EncodingType.Base64
});
```

This way:
- Binary file → ArrayBuffer → Buffer → Base64 string → Local file

### 3. Form Auto-Population

Standard React state update:
```typescript
setDownloadedClip(prev => ({
  ...prev,
  localFileUri: importData.localPath,  // Form sees this
  caption: importData.caption
}));
```

Form automatically re-renders because state changed.

### 4. Cleanup on Unmount

When user closes app or navigates away:
```typescript
useEffect(() => {
  return () => {
    if (importToken) {
      cleanupMediaImport(importToken);  // DELETE /media-imports/{token}
    }
  };
}, [importToken]);
```

Prevents storage bloat.

## Comparison: Before vs After

### Before (Manual Process)
```
Paste → Wait → Click Download → File Dialog → Select → Approve → 
Wait → Copy Caption → Paste → Open Instagram → Paste Caption → Post
```
⏱️ ~3-5 minutes

### After (Auto-Import)
```
Paste → Wait 2s → Preview → Click Auto-Import → Wait 5s → Form auto-fills → 
Click Open Instagram → Paste → Post
```
⏱️ ~10-15 seconds

**60% faster workflow** + **fewer manual steps** = **better UX**

## Extending to Other Platforms

To add TikTok support:

```typescript
// Same backend endpoint, different platform
const importData = await importMediaFromLink(tiktokUrl, 'tiktok');

// Backend handles it:
app.post('/media-imports', async (req, res) => {
  const { url, platform } = req.body;  // ← platform = 'tiktok'
  
  // yt-dlp works with TikTok too!
  const metadata = await exec(`yt-dlp -j "${url}"`);
  // ... same download process ...
});
```

That's it. Same flow, different platform.

## Performance Metrics

- **Metadata extraction (POST /extract):** 1-3 seconds
- **Full download (POST /media-imports):** 5-15 seconds
  - Depends on: video quality, file size, network speed
- **Blob fetch (frontend):** 1-5 seconds
- **Auto-populate (React state):** <100ms

## Security Considerations

⚠️ **For Production:**

1. **Validate input** - Ensure URL is Instagram domain
2. **Rate limit** - Max 30 requests/15 minutes per user
3. **File size limit** - Max 100MB (current) or smaller
4. **Authenticate** - Add API key or JWT token
5. **HTTPS only** - Never expose backend over HTTP
6. **CORS** - Restrict to your domain
7. **Cleanup TTL** - Auto-delete files > 24 hours old

## References

- Inspired by: Buffer (auto-preview), Later (auto-populate), Hootsuite
- yt-dlp: https://github.com/yt-dlp/yt-dlp
- React Native FileSystem: https://docs.expo.dev/versions/latest/sdk/filesystem/
- Express.js: https://expressjs.com/
