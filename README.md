# Insta Clip

React Native app concept for taking a copied/shared Instagram link, downloading the media locally where possible, extracting the caption, and opening Instagram's Reel/Post composer with the downloaded media ready to use.

This first version is a local-only utility app. It does not need login, authentication, a database, cloud sync, user accounts, or a backend API.

## Product Goal

The app should let a user:

1. Copy an Instagram Reel/Post URL or share the URL into this app.
2. Resolve the URL into downloadable media metadata inside the app where possible.
3. Download the video/image locally.
4. Extract or clean the caption text.
5. Open Instagram's create/share flow with the downloaded media attached.
6. Make the caption available for quick paste or pre-fill where platform support allows it.

## Important Platform Reality

Instagram does not provide a public, reliable API that allows third-party apps to directly create a Reel/Post with both media and caption fully pre-populated.

The realistic implementation is:

- Attach media to Instagram through native share intents / share sheets.
- Copy the extracted caption to the clipboard.
- Show a small instruction screen telling the user to paste the caption inside Instagram.

Directly auto-posting or bypassing Instagram's composer is not a safe architecture. It can violate platform rules, break without warning, or require unsupported private APIs.

## High-Level Architecture

```text
User copies/shares supported media URL
        |
        v
React Native App
        |
        +--> URL Intake
        |       - Clipboard watcher
        |       - Native share extension / intent receiver
        |       - Manual URL paste input
        |
        +--> Local Link Resolver
        |       - Validate supported URL
        |       - Extract shortcode or shared URL metadata
        |       - Resolve media/caption locally where possible
        |       - Fall back to a clear unsupported/private-post message
        |
        +--> Download Manager
        |       - Download video/image into app cache
        |       - Track progress
        |       - Retry failed downloads
        |
        +--> Caption Processor
        |       - Extract caption text
        |       - Remove unwanted tracking text
        |       - Optional hashtag cleanup
        |
        +--> Composer Handoff
                - Save media to temporary/shareable location
                - Copy caption to clipboard
                - Open Instagram share target
```

## Recommended Tech Stack

- React Native with TypeScript
- Expo Dev Client or bare React Native if native share extensions are required
- React Navigation for screens
- Zustand or Redux Toolkit for app state
- `react-native-share` for opening Instagram/share targets
- `@react-native-clipboard/clipboard` for copying captions
- `react-native-fs` or Expo FileSystem for media downloads
- Native Android share intent support
- iOS Share Extension if share-to-app support is needed

## No Backend For MVP

The first version should be an internal local app only.

No MVP backend pieces:

- No auth.
- No account system.
- No database.
- No cloud storage.
- No server-side download jobs.
- No saved history unless stored temporarily on the device.

The app only handles:

- Copied/shared link intake.
- Local URL validation.
- Local media/caption resolution when possible.
- Temporary local download/cache.
- Caption copy to clipboard.
- Instagram handoff.

## About `yt-dlp`

`yt-dlp` is the best extractor/downloader engine, but it is not a normal React Native library. For this no-backend MVP, there are three realistic options:

- Use app-only direct download when the shared URL exposes usable media data.
- For Android internal builds, experiment with bundling/running a native `yt-dlp`/Python-based helper, accepting extra app size and maintenance.
- For iOS, avoid depending on local `yt-dlp`; iOS app sandboxing and App Store rules make this much harder.

If full `yt-dlp` support for many sites becomes required later, add a backend at that time. Do not design auth or storage now.

## Mobile App Modules

### 1. URL Intake

Supported entry points:

- Manual paste inside the app.
- Detect URL from clipboard after user opens the app.
- Android share intent: user taps Instagram share button and chooses this app.
- iOS share extension: user shares the URL into this app.

The app should normalize and validate URLs locally.

Supported URL examples:

- `https://www.instagram.com/reel/{shortcode}/`
- `https://www.instagram.com/p/{shortcode}/`
- `https://instagram.com/reel/{shortcode}/`
- Other URLs can be added later only if they can be resolved locally.

### 2. Local Link Resolver

The local resolver parses the URL and tries to extract usable media and caption data without a backend.

Basic flow:

```text
input URL
  -> normalize URL
  -> identify provider and post type
  -> fetch/parse publicly available metadata where possible
  -> return local clip metadata
```

Expected states:

- Idle
- Resolving
- Resolved
- Unsupported URL
- Private/deleted post
- Network error
- Download failed
- Local extraction unavailable

### 3. Download Manager

The download manager stores media in a temporary local app folder.

Responsibilities:

- Create a stable local filename.
- Show progress.
- Verify file size after download.
- Keep only recent downloads.
- Clear temporary files.

### 4. Caption Processor

Caption handling should be simple first:

- Preserve original line breaks.
- Trim empty leading/trailing lines.
- Optionally remove known tracking text.
- Copy final caption to clipboard before opening Instagram.

Later improvements:

- Hashtag presets.
- Mention cleanup.
- AI caption rewriting.
- Multi-language caption support.

### 5. Instagram Handoff

Use native sharing APIs:

- Android: share intent targeting Instagram package where possible.
- iOS: share sheet / document interaction controller / Instagram-compatible share flow.

Expected behavior:

1. Downloaded media is passed to Instagram.
2. Caption is copied to clipboard.
3. App shows "Caption copied. Paste it in Instagram." before handoff.

## Suggested Screens

- Home screen: paste URL, detect copied Instagram link, recent clips.
- Resolve preview screen: thumbnail, author, caption preview, download button.
- Download progress screen: progress, cancel, retry.
- Ready screen: media preview, editable caption, "Open in Instagram" button.
- Settings screen: auto-copy caption, cleanup options, cache cleanup.

## Data Flow

```text
Supported media URL
  -> normalizeUrl()
  -> validateSupportedUrl()
  -> resolveUrlLocally(url)
  -> downloadMediaToCache(media.url)
  -> processCaption(caption)
  -> copyCaptionToClipboard(caption)
  -> shareMediaToInstagram(localFilePath)
```

## MVP Scope

Build the first version with:

- Manual paste URL input.
- Clipboard/share-link intake.
- Local resolver for supported Instagram links.
- Single video download for Instagram Reels first.
- Caption preview and edit.
- Copy caption to clipboard.
- Open Instagram/share sheet with downloaded video.

Do later:

- iOS share extension.
- Android direct share intent receiver.
- Carousel posts.
- Image posts.
- More locally resolvable platforms.
- Optional backend plus `yt-dlp` only if local extraction is not enough.
- Auto caption rewriting.

## Legal And Policy Notes

This app should only be used for content the user owns or has permission to reuse. Instagram content downloading and reposting can involve copyright, privacy, and platform policy issues.

Avoid:

- Auto-posting without user confirmation.
- Bypassing Instagram restrictions.
- Using private Instagram APIs in the mobile app.
- Downloading from platforms or accounts where the user does not have permission.

Prefer:

- User-controlled downloads.
- Clear permission messaging.
- Temporary local cache.
- Terms and privacy policy before public release.

## Implementation Phases

### Phase 1: App Foundation

- Create React Native TypeScript project.
- Add navigation.
- Add paste URL screen.
- Add URL validation helpers.

### Phase 2: Local Resolver

- Handle common Instagram URL formats.
- Extract shortcode, provider, and post type.
- Try local metadata/media extraction.
- Add error responses for private/deleted/unsupported URLs.

### Phase 3: Download And Preview

- Download media to local app cache.
- Show thumbnail/video preview.
- Show editable caption.
- Add retry/cancel behavior.

### Phase 4: Instagram Handoff

- Copy caption to clipboard.
- Share downloaded media to Instagram/share sheet.
- Add clear user guidance before opening Instagram.

### Phase 5: Native Share Intake

- Add Android share intent receiver.
- Add iOS share extension.
- Route shared URLs into the same resolver flow.

## Open Decisions

- Use Expo Dev Client or bare React Native?
- Should downloaded files be saved to gallery or app cache only?
- Should temporary clips auto-delete after Instagram handoff?
- Should Android internal builds experiment with local `yt-dlp`, or should MVP only support direct local extraction?
