import * as SecureStore from 'expo-secure-store';

export type CaptionTone = 'clean' | 'playful' | 'polished' | 'bold' | 'balanced';
export type CaptionLength = 'short' | 'balanced' | 'detailed';

export type CaptionRefineSettings = {
  apiKey: string;
  model: string;
  brandHandle: string;
  ctaText: string;
  allowHashtags: boolean;
  allowMusicReferences: boolean;
  preserveEmoji: boolean;
  tone: CaptionTone;
  length: CaptionLength;
};

const STORAGE_KEY = 'insta-clip.openrouter-settings.v1';

export const defaultCaptionRefineSettings: CaptionRefineSettings = {
  apiKey: '',
  model: '~openai/gpt-latest',
  brandHandle: '',
  ctaText: '',
  allowHashtags: true,
  allowMusicReferences: true,
  preserveEmoji: true,
  tone: 'balanced',
  length: 'balanced'
};

export async function loadCaptionRefineSettings(): Promise<CaptionRefineSettings> {
  const raw = await SecureStore.getItemAsync(STORAGE_KEY);

  if (!raw) {
    return defaultCaptionRefineSettings;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CaptionRefineSettings>;
    return {
      ...defaultCaptionRefineSettings,
      ...parsed,
      apiKey: parsed.apiKey ?? '',
      model: parsed.model ?? defaultCaptionRefineSettings.model,
      brandHandle: parsed.brandHandle ?? '',
      ctaText: parsed.ctaText ?? '',
      allowHashtags: parsed.allowHashtags ?? defaultCaptionRefineSettings.allowHashtags,
      allowMusicReferences: parsed.allowMusicReferences ?? defaultCaptionRefineSettings.allowMusicReferences,
      preserveEmoji: parsed.preserveEmoji ?? defaultCaptionRefineSettings.preserveEmoji,
      tone: (parsed.tone ?? defaultCaptionRefineSettings.tone) as CaptionTone,
      length: (parsed.length ?? defaultCaptionRefineSettings.length) as CaptionLength
    };
  } catch {
    return defaultCaptionRefineSettings;
  }
}

export async function saveCaptionRefineSettings(settings: CaptionRefineSettings): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(settings));
}

export async function clearCaptionRefineSettings(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEY);
}

export function buildDefaultCta(brandHandle: string): string {
  const trimmedHandle = normalizeHandle(brandHandle);

  if (!trimmedHandle) {
    return '';
  }

  return `Follow @${trimmedHandle} for more updates.`;
}

export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@+/, '').replace(/\s+/g, '');
}
