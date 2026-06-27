import * as FileSystem from 'expo-file-system/legacy';
import { ClipMetadata, DownloadedClip } from '../types/clip';
import { isSupportedClip, parseClipUrl } from '../lib/instagramUrl';

export class UnsupportedLocalExtractionError extends Error {
  constructor(message = 'This link cannot be downloaded locally yet.') {
    super(message);
    this.name = 'UnsupportedLocalExtractionError';
  }
}

export async function resolveClipFromUrl(input: string): Promise<ClipMetadata> {
  const parsed = parseClipUrl(input);

  if (!isSupportedClip(parsed)) {
    throw new UnsupportedLocalExtractionError('Paste an Instagram Reel or Post link.');
  }

  return {
    ...parsed,
    title: parsed.postType === 'reel' ? 'Instagram Reel' : 'Instagram Post',
    caption: '',
    thumbnailUrl: undefined,
    mediaUrl: undefined
  };
}

export async function downloadClip(metadata: ClipMetadata): Promise<DownloadedClip> {
  if (!metadata.mediaUrl) {
    throw new UnsupportedLocalExtractionError(
      'Local media extraction is not implemented yet for this Instagram link.'
    );
  }

  const fileExtension = metadata.mediaUrl.includes('.mp4') ? 'mp4' : 'media';
  const filename = `${metadata.provider}-${metadata.shortcode ?? Date.now()}.${fileExtension}`;
  const cacheDirectory = FileSystem.cacheDirectory;

  if (!cacheDirectory) {
    throw new Error('File cache is not available on this device.');
  }

  const destination = `${cacheDirectory}${filename}`;

  const result = await FileSystem.downloadAsync(metadata.mediaUrl, destination);

  return {
    ...metadata,
    localFileUri: result.uri
  };
}
