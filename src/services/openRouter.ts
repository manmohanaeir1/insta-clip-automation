import { CaptionRefineSettings } from '../lib/captionRefineSettings';
import { debugError, debugStep } from '../lib/debugLog';

export type RefinedCaptionResult = {
  refinedCaption: string;
  shortCaption: string;
  hashtags: string[];
  notes?: string;
};

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MAX_TOKENS = 700;
const RETRY_MAX_TOKENS = 500;

export async function refineCaptionWithOpenRouter(
  caption: string,
  settings: CaptionRefineSettings,
  clipTitle?: string
): Promise<RefinedCaptionResult> {
  if (!settings.apiKey.trim()) {
    throw new Error('Add your OpenRouter API key in Settings first.');
  }

  debugStep('openrouter:refine-start', {
    captionLength: caption.length,
    model: settings.model,
    tone: settings.tone,
    length: settings.length,
    allowHashtags: settings.allowHashtags,
    allowMusicReferences: settings.allowMusicReferences
  });

  const response = await requestCaptionRefine(caption, settings, clipTitle, DEFAULT_MAX_TOKENS);

  debugStep('openrouter:refine-response', {
    status: response.status,
    ok: response.ok
  });

  let payload = await response.json();

  if (!response.ok && shouldRetryWithFewerTokens(response.status, payload)) {
    debugStep('openrouter:refine-retry', {
      previousMaxTokens: DEFAULT_MAX_TOKENS,
      retryMaxTokens: RETRY_MAX_TOKENS
    });

    const retryResponse = await requestCaptionRefine(caption, settings, clipTitle, RETRY_MAX_TOKENS);

    debugStep('openrouter:refine-retry-response', {
      status: retryResponse.status,
      ok: retryResponse.ok
    });

    payload = await retryResponse.json();

    if (!retryResponse.ok) {
      const message = payload?.error?.message || payload?.error || 'OpenRouter request failed';
      debugError('openrouter:refine-error', new Error(message), { status: retryResponse.status });
      throw new Error(message);
    }
  } else if (!response.ok) {
    const message = payload?.error?.message || payload?.error || 'OpenRouter request failed';
    debugError('openrouter:refine-error', new Error(message), { status: response.status });
    throw new Error(message);
  }

  const rawContent = payload?.choices?.[0]?.message?.content;
  const parsed = parseContent(rawContent);

  debugStep('openrouter:refine-success', {
    refinedLength: parsed.refinedCaption.length,
    shortLength: parsed.shortCaption.length,
    hashtagCount: parsed.hashtags.length
  });

  return parsed;
}

async function requestCaptionRefine(
  caption: string,
  settings: CaptionRefineSettings,
  clipTitle: string | undefined,
  maxTokens: number
): Promise<Response> {
  return fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.apiKey.trim()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://insta-clip.local',
      'X-OpenRouter-Title': 'Insta Clip'
    },
    body: JSON.stringify({
      model: settings.model.trim(),
      temperature: 0.7,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'system',
          content:
            'You refine Instagram captions. Keep the meaning accurate. Do not invent facts. Return only JSON matching the requested schema.'
        },
        {
          role: 'user',
          content: buildPrompt(caption, settings, clipTitle)
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'caption_refine',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              refinedCaption: { type: 'string' },
              shortCaption: { type: 'string' },
              hashtags: { type: 'array', items: { type: 'string' } },
              notes: { type: 'string' }
            },
            required: ['refinedCaption', 'shortCaption', 'hashtags', 'notes']
          }
        }
      }
    })
  });
}

function buildPrompt(caption: string, settings: CaptionRefineSettings, clipTitle?: string): string {
  const handle = settings.brandHandle.trim().replace(/^@+/, '');
  const cta = settings.ctaText.trim() || (handle ? `Follow @${handle} for more updates.` : '');

  return [
    `Source title: ${clipTitle || 'Instagram post'}`,
    `Tone: ${settings.tone}`,
    `Length: ${settings.length}`,
    `Allow hashtags: ${settings.allowHashtags ? 'yes' : 'no'}`,
    `Allow music/song references: ${settings.allowMusicReferences ? 'yes' : 'no'}`,
    `Preserve emoji: ${settings.preserveEmoji ? 'yes' : 'no'}`,
    `Brand handle: ${handle ? `@${handle}` : 'none'}`,
    `CTA line: ${cta || 'none'}`,
    '',
    'Rules:',
    '- Keep the message accurate and natural.',
    '- If the original caption is long, compress it into a short refinedCaption of about 300 to 500 characters total, including hashtags.',
    '- Keep refinedCaption concise: 1 to 2 short paragraphs plus hashtags.',
    '- Do not invent song lyrics or specific music if the caption does not mention them.',
    settings.allowHashtags
      ? '- Include 5 to 8 relevant hashtags at the end of refinedCaption. Use a mix of specific topic tags and broad viral/discovery tags such as #viral, #trending, or #fyp only when they fit the post.'
      : '- Hashtags are disabled, so do not include any hashtags in refinedCaption.',
    '- If a CTA is provided, include it naturally at the end.',
    '- Return a short caption variant and a refined caption variant.',
    '',
    'Original caption:',
    caption
  ].join('\n');
}

function parseContent(content: unknown): RefinedCaptionResult {
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content) as RefinedCaptionResult;
      return normalizeResult(parsed);
    } catch {
      return normalizeResult({
        refinedCaption: content.trim(),
        shortCaption: content.trim().slice(0, 140),
        hashtags: [],
        notes: 'Model returned plain text instead of JSON.'
      });
    }
  }

  if (content && typeof content === 'object') {
    return normalizeResult(content as RefinedCaptionResult);
  }

  throw new Error('OpenRouter returned an empty response.');
}

function shouldRetryWithFewerTokens(status: number, payload: unknown): boolean {
  if (status !== 402) {
    return false;
  }

  const message =
    typeof payload === 'object' && payload !== null && 'error' in payload
      ? String(
          typeof payload.error === 'object' && payload.error !== null && 'message' in payload.error
            ? payload.error.message
            : payload.error
        )
      : '';

  return message.toLowerCase().includes('fewer max_tokens');
}

function normalizeResult(input: RefinedCaptionResult): RefinedCaptionResult {
  return {
    refinedCaption: (input.refinedCaption || '').trim(),
    shortCaption: (input.shortCaption || '').trim(),
    hashtags: Array.isArray(input.hashtags) ? input.hashtags.map((tag) => tag.trim()).filter(Boolean) : [],
    notes: (input.notes || '').trim()
  };
}
