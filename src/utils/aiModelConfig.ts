import { GoogleGenAI, Schema } from '@google/genai';

export const SELECTED_MODEL_STORAGE_KEY = 'user_gemini_selected_model';

export interface GeminiModelInfo {
  id: string;
  name: string;
  badge: string;
  badgeColor: string;
  description: string;
  isFreeTierCompatible: boolean;
  rank: number;
}

/**
 * Standard, supported Gemini models listed in descending order of capability & speed:
 * 1. gemini-2.0-flash (Flagship Flash: Next-gen speed, superior multimodal OCR, layout & bounding box precision)
 * 2. gemini-1.5-flash (High Speed Workhorse: Ultra-reliable, fast document parsing with high free-tier headroom)
 * 3. gemini-1.5-pro (Pro Reasoning: Advanced reasoning for complex STEM math formulas and dense multi-column papers)
 * 4. gemini-2.0-flash-lite (Ultra Fast Lite: Low latency lightweight engine with separate quota capacity)
 */
export const GEMINI_MODELS_DESCENDING: GeminiModelInfo[] = [
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    badge: 'Flagship Flash',
    badgeColor: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    description: 'Google’s flagship Flash engine. Ultra-fast multimodal OCR, superior question layout parsing, and robust math equation recognition.',
    isFreeTierCompatible: true,
    rank: 1,
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    badge: 'High Speed Workhorse',
    badgeColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    description: 'Highly reliable, fast multimodal workhorse model with high throughput and high free-tier rate headroom.',
    isFreeTierCompatible: true,
    rank: 2,
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    badge: 'Pro STEM Reasoning',
    badgeColor: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    description: 'Advanced reasoning engine for complex STEM formulas, dense multi-column question papers, and intricate table structures.',
    isFreeTierCompatible: true,
    rank: 3,
  },
  {
    id: 'gemini-2.0-flash-lite',
    name: 'Gemini 2.0 Flash Lite',
    badge: 'Ultra Fast Lite',
    badgeColor: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    description: 'Lightweight high-throughput engine with separate quota capacity for low-latency batch processing.',
    isFreeTierCompatible: true,
    rank: 4,
  },
];

export const SUPPORTED_GEMINI_MODELS = GEMINI_MODELS_DESCENDING.map((m) => m.id);

export type SupportedGeminiModel = string;

export function getStoredSelectedModel(): string {
  if (typeof window === 'undefined') return 'gemini-2.0-flash';
  return localStorage.getItem(SELECTED_MODEL_STORAGE_KEY) || 'gemini-2.0-flash';
}

export function setStoredSelectedModel(modelId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, modelId);
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
 * with graceful failover down the descending capability model chain.
 */
export async function executeGeminiWithFallback<T = any>(
  ai: GoogleGenAI,
  options: AiGenerateOptions
): Promise<T> {
  const { contents, schema, temperature = 0.1, systemInstruction, label = 'AI Operation', preferredModel } = options;
  let lastError: any = null;

  // Build model execution chain starting with user's preferred/selected model
  const primaryModel = preferredModel || getStoredSelectedModel();
  const modelChain: string[] = [];

  if (primaryModel) {
    modelChain.push(primaryModel);
  }

  // Append remaining models in descending order of capability
  GEMINI_MODELS_DESCENDING.forEach((m) => {
    if (!modelChain.includes(m.id)) {
      modelChain.push(m.id);
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
