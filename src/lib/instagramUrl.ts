import { ParsedClipUrl } from '../types/clip';

const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);

export function normalizeInputUrl(input: string): string {
  const trimmed = input.trim();
  const firstUrl = trimmed.match(/https?:\/\/[^\s]+/i)?.[0] ?? trimmed;
  const urlWithScheme = /^https?:\/\//i.test(firstUrl) ? firstUrl : `https://${firstUrl}`;

  try {
    const url = new URL(urlWithScheme);
    url.hash = '';

    const trackingParams = [
      'igsh',
      'igshid',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term'
    ];

    trackingParams.forEach((param) => url.searchParams.delete(param));

    return url.toString();
  } catch {
    return trimmed;
  }
}

export function parseClipUrl(input: string): ParsedClipUrl {
  const normalizedUrl = normalizeInputUrl(input);

  try {
    const url = new URL(normalizedUrl);
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split('/').filter(Boolean);

    if (!INSTAGRAM_HOSTS.has(host)) {
      return {
        originalUrl: input,
        normalizedUrl,
        provider: 'unknown',
        postType: 'unknown'
      };
    }

    const first = parts[0];
    const shortcode = parts[1];

    if ((first === 'reel' || first === 'reels') && shortcode) {
      return {
        originalUrl: input,
        normalizedUrl,
        provider: 'instagram',
        postType: 'reel',
        shortcode
      };
    }

    if (first === 'p' && shortcode) {
      return {
        originalUrl: input,
        normalizedUrl,
        provider: 'instagram',
        postType: 'post',
        shortcode
      };
    }

    if (first === 'stories') {
      return {
        originalUrl: input,
        normalizedUrl,
        provider: 'instagram',
        postType: 'story',
        shortcode: parts[2]
      };
    }

    return {
      originalUrl: input,
      normalizedUrl,
      provider: 'instagram',
      postType: 'unknown'
    };
  } catch {
    return {
      originalUrl: input,
      normalizedUrl,
      provider: 'unknown',
      postType: 'unknown'
    };
  }
}

export function isSupportedClip(parsed: ParsedClipUrl): boolean {
  return parsed.provider === 'instagram' && (parsed.postType === 'reel' || parsed.postType === 'post');
}
