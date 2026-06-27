export type ClipProvider = 'instagram' | 'unknown';

export type ClipPostType = 'reel' | 'post' | 'story' | 'unknown';

export type ClipStatus =
  | 'idle'
  | 'resolving'
  | 'ready'
  | 'downloading'
  | 'downloaded'
  | 'unsupported'
  | 'error';

export type ParsedClipUrl = {
  originalUrl: string;
  normalizedUrl: string;
  provider: ClipProvider;
  postType: ClipPostType;
  shortcode?: string;
};

export type ClipMetadata = ParsedClipUrl & {
  caption: string;
  title: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
};

export type DownloadedClip = ClipMetadata & {
  localFileUri: string;
};
