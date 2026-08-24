import { GoogleGenAI, Schema } from '@google/genai';

/**
 * Standard, supported Gemini models in order of priority:
 * 1. gemini-2.5-flash (Primary default high-speed multimodal vision engine)
 * 2. gemini-3.1-flash-lite (Fast official Flash Lite fallback with separate capacity)
 * 3. gemini-2.5-flash-lite (Secondary lightweight fallback)
 * Note: gemini-3.7-flash and legacy heavy models are strictly excluded.
 */
export const SUPPORTED_GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
] as const;

export type SupportedGeminiModel = (typeof SUPPORTED_GEMINI_MODELS)[number];

export interface AiGenerateOptions {
  contents: any[];
  schema?: Schema;
  temperature?: number;
  systemInstruction?: string;
  label?: string;
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
    return 'Google Gemini service is temporarily experiencing high demand (503). Retrying shortly or try adding a fallback key in Settings.';
  }
  if (isTransientError(err)) {
    return 'Gemini API quota reached (429). Please add a fallback key in Settings or wait a moment.';
  }
  if (msg.includes('JSON')) {
    return 'Failed to parse structured response from AI model. Please try again.';
  }
  return msg || 'AI processing request failed.';
}

/**
 * Executes a Gemini request with model fallback across active, supported models.
 * Includes exponential backoff retries for transient 503/429 demand spikes.
 */
export async function executeGeminiWithFallback<T = any>(
  ai: GoogleGenAI,
  options: AiGenerateOptions
): Promise<T> {
  const { contents, schema, temperature = 0.1, systemInstruction, label = 'AI Operation' } = options;
  let lastError: any = null;

  for (let mIdx = 0; mIdx < SUPPORTED_GEMINI_MODELS.length; mIdx++) {
    const model = SUPPORTED_GEMINI_MODELS[mIdx];
    const isLastModel = mIdx === SUPPORTED_GEMINI_MODELS.length - 1;

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

        // Check if error is 404 (model not available for current API version)
        const is404 = err?.status === 404 || String(err?.message || '').includes('404') || String(err?.message || '').includes('not found');
        if (is404) {
          console.warn(`[AI Engine] ${label} - Model ${model} returned 404/Not Found. Trying fallback model...`);
          break; // move to next model
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
        break; // move to next model
      }
    }
  }

  throw new Error(formatAiErrorMessage(lastError));
}
