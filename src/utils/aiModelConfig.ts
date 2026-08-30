import { GoogleGenAI, Schema } from '@google/genai';

export const SELECTED_MODEL_STORAGE_KEY = 'user_gemini_selected_model';
export const FALLBACK_MODEL_QUEUE_STORAGE_KEY = 'user_gemini_fallback_model_queue';

export interface GeminiModelInfo {
  id: string;
  name: string;
  category: string;
  badge: string;
  badgeColor: string;
  description: string;
  isFreeTierCompatible: boolean;
  rank: number;
}

/**
 * Supported Google AI Studio Free Tier Gemini models:
 * 1. gemini-3.5-flash (Flash: Fast & Reasoning)
 * 2. gemini-3.6-flash (Flash: Advanced Multimodal Vision & OCR)
 * 3. gemini-3.5-flash-lite (Flash: Subagent & High Throughput)
 * 4. gemini-3.1-flash-lite (Flash: Lightweight Tasks with Separate Quota Headroom)
 * 5. gemini-3.1-pro-preview (Pro: Complex Reasoning & STEM)
 */
export const GEMINI_MODELS_DESCENDING: GeminiModelInfo[] = [
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    category: 'Flash (Fast & Reasoning)',
    badge: 'Fast & Reasoning',
    badgeColor: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    description: 'Flagship model for high-speed multi-step reasoning, dense question papers, and high multimodal vision precision.',
    isFreeTierCompatible: true,
    rank: 1,
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    category: 'Flash (Vision & Precision)',
    badge: 'Advanced Vision',
    badgeColor: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    description: 'Next-generation multimodal model with state-of-the-art bounding box coordinate extraction and complex formula reading.',
    isFreeTierCompatible: true,
    rank: 2,
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    category: 'Flash (Subagent & High Throughput)',
    badge: 'High Throughput',
    badgeColor: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    description: 'Subagent-optimized high throughput model designed for parallel swarm extraction and low-latency OCR.',
    isFreeTierCompatible: true,
    rank: 3,
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash-Lite',
    category: 'Flash (Lightweight Tasks)',
    badge: 'Separate Quota Headroom',
    badgeColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    description: 'Fast lightweight engine with independent quota headroom for quick structure, answer-key, and layout parsing.',
    isFreeTierCompatible: true,
    rank: 4,
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    category: 'Pro (Complex Reasoning & STEM)',
    badge: 'Pro Reasoning & STEM',
    badgeColor: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    description: 'Pro tier engine specializing in complex mathematical reasoning, advanced STEM formulas, and dense documents.',
    isFreeTierCompatible: true,
    rank: 5,
  },
];

export const SUPPORTED_GEMINI_MODELS = GEMINI_MODELS_DESCENDING.map((m) => m.id);
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

export type SupportedGeminiModel = string;

export function getStoredSelectedModel(): string {
  if (typeof window === 'undefined') return DEFAULT_GEMINI_MODEL;
  const stored = localStorage.getItem(SELECTED_MODEL_STORAGE_KEY);
  if (stored && SUPPORTED_GEMINI_MODELS.includes(stored)) {
    return stored;
  }
  return DEFAULT_GEMINI_MODEL;
}

export function setStoredSelectedModel(modelId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, modelId);
}

export function getStoredFallbackModelQueue(): string[] {
  const defaultQueue = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview'];
  if (typeof window === 'undefined') return defaultQueue;
  try {
    const raw = localStorage.getItem(FALLBACK_MODEL_QUEUE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter((id) => SUPPORTED_GEMINI_MODELS.includes(id));
        SUPPORTED_GEMINI_MODELS.forEach((id) => {
          if (!valid.includes(id)) valid.push(id);
        });
        return valid;
      }
    }
  } catch (e) {
    // ignore
  }
  return defaultQueue;
}

export function setStoredFallbackModelQueue(queue: string[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FALLBACK_MODEL_QUEUE_STORAGE_KEY, JSON.stringify(queue));
}

export interface AiGenerateOptions {
  contents: any[];
  schema?: Schema;
  temperature?: number;
  systemInstruction?: string;
  label?: string;
  preferredModel?: string;
}

/**
 * Detects whether an error is non-retryable authentication/permission failure
 */
export function isAuthError(err: any): boolean {
  if (!err) return false;
  const status = err?.status || err?.code || err?.statusCode;
  const msg = String(err?.message || '').toLowerCase();
  return (
    status === 401 ||
    status === 403 ||
    msg.includes('unauthenticated') ||
    msg.includes('api key not valid') ||
    msg.includes('invalid api key') ||
    msg.includes('permission_denied')
  );
}

/**
 * Detects whether an error is transient (e.g. rate limit, high load, timeout)
 */
export function isTransientError(err: any): boolean {
  if (!err) return false;
  const status = err?.status || err?.code || err?.statusCode;
  const msg = String(err?.message || '').toLowerCase();
  return (
    status === 429 ||
    status === 503 ||
    status === 502 ||
    status === 504 ||
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('high demand') ||
    msg.includes('unavailable') ||
    msg.includes('overloaded')
  );
}

/**
 * Detects whether a specific model's per-user/daily quota or free tier limit has been exhausted
 * so the engine can immediately skip to an alternate model family instead of retrying the exhausted model.
 */
export function isModelQuotaExhausted(err: any): boolean {
  if (!err) return false;
  const msg = String(err?.message || '').toLowerCase();
  return (
    msg.includes('tokens_per_model_per_user') ||
    msg.includes('requests_per_model_per_user') ||
    msg.includes('generate_content_tokens_per_model') ||
    msg.includes('generate_content_free_tier') ||
    msg.includes('limit: 25000000') ||
    msg.includes('limit: 0')
  );
}

export function cleanJsonText(raw: string): string {
  let text = (raw || '').trim();
  if (text.startsWith('```json')) {
    text = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  } else if (text.startsWith('```')) {
    text = text.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return text.trim();
}

/**
 * Normalizes error messages for user-friendly display
 */
export function formatAiErrorMessage(err: any): string {
  if (!err) return 'Unknown AI extraction error occurred.';
  const msg = String(err?.message || '');
  if (isAuthError(err)) {
    return 'Invalid or missing Gemini API Key. Please verify your API key in Settings.';
  }
  const status = err?.status || err?.code || err?.statusCode;
  const is503 = status === 503 || msg.includes('503') || msg.includes('high demand') || msg.includes('unavailable') || msg.includes('overloaded');
  if (is503) {
    return 'Google Gemini service is temporarily experiencing high demand (503). Retrying shortly or try switching models in Settings.';
  }
  if (isTransientError(err)) {
    return 'Gemini API quota reached (429). Please select a different model or add a fallback key in Settings.';
  }
  if (msg.includes('JSON')) {
    return 'Failed to parse structured response from AI model. Please try again.';
  }
  return msg || 'AI processing request failed.';
}

/**
 * Executes a Gemini request prioritizing the user's selected model,
 * with graceful failover down the user-configured fallback model queue.
 */
export async function executeGeminiWithFallback<T = any>(
  ai: GoogleGenAI,
  options: AiGenerateOptions
): Promise<T> {
  const { contents, schema, temperature = 0.1, systemInstruction, label = 'AI Operation', preferredModel } = options;
  let lastError: any = null;

  // Primary model selected by user (or passed in)
  const primaryModel = preferredModel || getStoredSelectedModel();
  const fallbackQueue = getStoredFallbackModelQueue();

  const modelChain: string[] = [];
  if (primaryModel && SUPPORTED_GEMINI_MODELS.includes(primaryModel)) {
    modelChain.push(primaryModel);
  } else {
    modelChain.push(DEFAULT_GEMINI_MODEL);
  }

  // Append user's fallback queue order
  fallbackQueue.forEach((m) => {
    if (!modelChain.includes(m) && SUPPORTED_GEMINI_MODELS.includes(m)) {
      modelChain.push(m);
    }
  });

  // Append remaining supported models if any missing
  SUPPORTED_GEMINI_MODELS.forEach((m) => {
    if (!modelChain.includes(m)) {
      modelChain.push(m);
    }
  });

  for (let mIdx = 0; mIdx < modelChain.length; mIdx++) {
    const model = modelChain[mIdx];
    const isLastModel = mIdx === modelChain.length - 1;

    // Up to 2 attempts per model for transient errors
    const maxAttemptsPerModel = 2;

    for (let attempt = 1; attempt <= maxAttemptsPerModel; attempt++) {
      try {
        const config: any = {
          temperature,
        };

        if (schema) {
          config.responseMimeType = 'application/json';
          config.responseSchema = schema;
        }

        if (systemInstruction) {
          config.systemInstruction = systemInstruction;
        }

        const response = await ai.models.generateContent({
          model,
          contents,
          config,
        });

        if (!response.text) {
          throw new Error(`Empty response returned from model ${model}`);
        }

        if (schema) {
          const cleaned = cleanJsonText(response.text);
          const parsed = JSON.parse(cleaned);
          return parsed as T;
        }

        return response.text as unknown as T;
      } catch (err: any) {
        lastError = err;

        // Fail fast on authentication errors: no model fallback will succeed with a bad key
        if (isAuthError(err)) {
          console.warn(`[AI Engine] ${label} - Auth error on ${model}: ${err.message}`);
          throw new Error(formatAiErrorMessage(err));
        }

        // Check if error is 404 (model not available for current API key/version)
        const is404 = err?.status === 404 || String(err?.message || '').includes('404') || String(err?.message || '').includes('not found');
        if (is404) {
          console.warn(`[AI Engine] ${label} - Model ${model} returned 404/Not Found. Trying fallback model in chain...`);
          break; // move to next model in chain
        }

        // Check if per-model token quota or free tier limit is exhausted (e.g. 25M daily limit on gemini-3-flash)
        if (isModelQuotaExhausted(err)) {
          console.warn(`[AI Engine] ${label} - Model ${model} quota reached (${err.message?.slice(0, 120)}...). Immediately auto-switching to next model in queue...`);
          break; // Do not waste retries on an exhausted model; failover immediately to next model family
        }

        const isTransient = isTransientError(err);

        if (isTransient && attempt < maxAttemptsPerModel) {
          const delay = attempt * 1200 + Math.floor(Math.random() * 400);
          console.warn(
            `[AI Engine] ${label} - Model ${model} encountered transient error (${err.message}). Retrying in ${delay}ms (attempt ${attempt}/${maxAttemptsPerModel})...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        console.warn(
          `[AI Engine] ${label} - Model ${model} attempt ${attempt} failed (${err.message}). ${
            !isLastModel ? 'Trying fallback model...' : 'All supported models exhausted.'
          }`
        );

        if (!isLastModel && isTransient) {
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
        break; // move to next model in chain
      }
    }
  }

  throw new Error(formatAiErrorMessage(lastError));
}

