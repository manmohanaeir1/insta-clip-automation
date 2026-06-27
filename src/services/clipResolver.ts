import * as FileSystem from 'expo-file-system/legacy';
import { ClipMetadata, DownloadedClip } from '../types/clip';
import { isSupportedClip, parseClipUrl } from '../lib/instagramUrl';
import { debugError, debugStep } from '../lib/debugLog';
import { getBackendUrl } from '../lib/backendUrl';

export class UnsupportedLocalExtractionError extends Error {
  constructor(message = 'This link cannot be downloaded locally yet.') {
    super(message);
    this.name = 'UnsupportedLocalExtractionError';
  }
}

export async function resolveClipFromUrl(input: string): Promise<ClipMetadata> {
  debugStep('resolve:start', { input });
  const parsed = parseClipUrl(input);
  debugStep('resolve:parsed-url', parsed);

  if (!isSupportedClip(parsed)) {
    debugStep('resolve:unsupported-url', {
      provider: parsed.provider,
      postType: parsed.postType,
      normalizedUrl: parsed.normalizedUrl
    });
    throw new UnsupportedLocalExtractionError('Paste an Instagram Reel or Post link.');
  }

  // Use backend service for extraction via yt-dlp
  let backendMetadata;
  try {
    backendMetadata = await extractFromBackend(parsed.normalizedUrl);
    debugStep('resolve:backend-success', {
      mediaKind: backendMetadata.mediaKind,
      hasMediaUrl: Boolean(backendMetadata.mediaUrl),
      hasThumbnailUrl: Boolean(backendMetadata.thumbnailUrl),
      captionLength: backendMetadata.caption?.length || 0
    });
  } catch (error) {
    debugError('resolve:backend-failed', error);
    throw new UnsupportedLocalExtractionError(
      'Could not extract media. The post may be private, deleted, or blocked by Instagram.'
    );
  }

  if (!backendMetadata.mediaUrl) {
    throw new UnsupportedLocalExtractionError(
      'Could not find downloadable media. The post may be private, login-only, or blocked by Instagram.'
    );
  }

  const metadata = {
    ...parsed,
    caption: backendMetadata.caption || '',
    ext: backendMetadata.ext,
    httpHeaders: backendMetadata.httpHeaders,
    mediaKind: backendMetadata.mediaKind,
    mediaUrl: backendMetadata.mediaUrl,
    thumbnailUrl: backendMetadata.thumbnailUrl,
    title: backendMetadata.title || (parsed.postType === 'reel' ? 'Instagram Reel' : 'Instagram Post')
  };

  debugStep('resolve:success', {
    postType: metadata.postType,
    shortcode: metadata.shortcode,
    mediaKind: metadata.mediaKind,
    captionLength: metadata.caption.length
  });

  return metadata;
}

async function extractFromBackend(url: string): Promise<any> {
  const backendUrl = getBackendUrl();
  debugStep('backend:extract-start', { url, backendUrl });

  try {
    const response = await fetch(`${backendUrl}/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url })
    });

    debugStep('backend:response', {
      status: response.status,
      ok: response.ok
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Backend extraction failed');
    }

    return data;
  } catch (error) {
    debugError('backend:extract-error', error);
    throw error;
  }
}

export async function downloadClip(metadata: ClipMetadata): Promise<DownloadedClip> {
  debugStep('download:start', {
    shortcode: metadata.shortcode,
    mediaKind: metadata.mediaKind,
    hasMediaUrl: Boolean(metadata.mediaUrl)
  });

  if (!metadata.mediaUrl) {
    throw new UnsupportedLocalExtractionError(
      'No downloadable media URL was found for this Instagram link.'
    );
  }

  const fileExtension = getFileExtension(metadata);
  const filename = `${metadata.provider}-${metadata.shortcode ?? Date.now()}.${fileExtension}`;
  const cacheDirectory = FileSystem.cacheDirectory;

  if (!cacheDirectory) {
    throw new Error('File cache is not available on this device.');
  }

  const destination = `${cacheDirectory}${filename}`;
  debugStep('download:destination-ready', {
    filename,
    destination,
    mediaUrlLength: metadata.mediaUrl.length
  });

  try {
    const result = await FileSystem.downloadAsync(metadata.mediaUrl, destination, {
      headers: metadata.httpHeaders
    });
    const fileInfo = await FileSystem.getInfoAsync(result.uri);

    debugStep('download:success', {
      status: result.status,
      uri: result.uri,
      exists: fileInfo.exists,
      size: fileInfo.exists ? fileInfo.size : undefined,
      headers: Object.keys(result.headers ?? {}).join(',')
    });

    if (result.status < 200 || result.status >= 300 || !fileInfo.exists) {
      throw new Error(`Phone download failed with status ${result.status}`);
    }

    return {
      ...metadata,
      localFileUri: result.uri
    };
  } catch (error) {
    debugError('download:failed', error, {
      shortcode: metadata.shortcode,
      mediaKind: metadata.mediaKind
    });
    throw error;
  }
}

function getFileExtension(metadata: ClipMetadata): string {
  if (metadata.ext) {
    return metadata.ext.replace(/^\./, '');
  }

  if (metadata.mediaKind === 'video') {
    return 'mp4';
  }

  if (metadata.mediaUrl?.match(/\.(jpe?g)(?:\?|$)/i)) {
    return 'jpg';
  }

  if (metadata.mediaUrl?.match(/\.(png)(?:\?|$)/i)) {
    return 'png';
  }

  return metadata.postType === 'reel' ? 'mp4' : 'jpg';
}
