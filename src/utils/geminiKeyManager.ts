import { executeGeminiClientSide } from './aiDirectEngine';

export type ApiKeyStatus = 'Ready' | 'Active' | 'Quota Exhausted' | 'Invalid';

export interface FallbackKeyItem {
  id: string;
  key: string;
  label: string;
  status: ApiKeyStatus;
  rpmCount: number;
  rpdCount: number;
  requestTimestamps: number[];
  lastUsedAt?: number;
  exhaustedUntil?: number;
  lastError?: string;
}

export interface KeyUsageMetrics {
  primaryKey: string;
  primaryKeyStatus: ApiKeyStatus;
  primaryRpm: number;
  primaryRpd: number;
  primaryTimestamps: number[];
  primaryExhaustedUntil?: number;
  primaryLastUsedAt?: number;
  primaryLastError?: string;
  fallbackKeys: FallbackKeyItem[];
  activeKeyId: string; // 'primary' or fallback key id
  rpmLimit: number; // default 15
  rpdLimit: number; // default 1500
}

export interface ToastNotification {
  id: string;
  title: string;
  description?: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: number;
}

const PRIMARY_KEY_STORAGE = 'user_gemini_api_key';
const FALLBACK_KEYS_STORAGE = 'user_gemini_fallback_keys';
const TIMESTAMPS_PRIMARY_STORAGE = 'user_gemini_primary_timestamps';
const PRIMARY_STATUS_STORAGE = 'user_gemini_primary_status';
const PRIMARY_COOLDOWN_STORAGE = 'user_gemini_primary_cooldown';

export const GEMINI_FREE_TIER_RPM = 15;
export const GEMINI_FREE_TIER_RPD = 1500;

/**
 * Get stored primary API key
 */
export function getStoredPrimaryApiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(PRIMARY_KEY_STORAGE) || '';
}

/**
 * Set stored primary API key
 */
export function setStoredPrimaryApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PRIMARY_KEY_STORAGE, key.trim());
}

/**
 * Get stored fallback keys list
 */
export function getStoredFallbackKeys(): FallbackKeyItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(FALLBACK_KEYS_STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Failed to parse fallback keys from localStorage:', e);
    return [];
  }
}

/**
 * Set stored fallback keys list
 */
export function setStoredFallbackKeys(keys: FallbackKeyItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(FALLBACK_KEYS_STORAGE, JSON.stringify(keys));
  } catch (e) {
    console.warn('Failed to save fallback keys to localStorage:', e);
  }
}

/**
 * Get primary request timestamps
 */
export function getStoredPrimaryTimestamps(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TIMESTAMPS_PRIMARY_STORAGE);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

/**
 * Save primary request timestamps
 */
export function setStoredPrimaryTimestamps(timestamps: number[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TIMESTAMPS_PRIMARY_STORAGE, JSON.stringify(timestamps));
}

/**
 * Primary Status Storage
 */
export function getStoredPrimaryStatus(): { status: ApiKeyStatus; exhaustedUntil?: number } {
  if (typeof window === 'undefined') return { status: 'Ready' };
  const status = (localStorage.getItem(PRIMARY_STATUS_STORAGE) as ApiKeyStatus) || 'Ready';
  const cooldownRaw = localStorage.getItem(PRIMARY_COOLDOWN_STORAGE);
  const exhaustedUntil = cooldownRaw ? parseInt(cooldownRaw, 10) : undefined;
  return { status, exhaustedUntil };
}

export function setStoredPrimaryStatus(status: ApiKeyStatus, exhaustedUntil?: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PRIMARY_STATUS_STORAGE, status);
  if (exhaustedUntil) {
    localStorage.setItem(PRIMARY_COOLDOWN_STORAGE, exhaustedUntil.toString());
  } else {
    localStorage.removeItem(PRIMARY_COOLDOWN_STORAGE);
  }
}

/**
 * Calculates RPM (last 60s) and RPD (last 24h) from a list of timestamps
 */
export function filterAndCalculateUsage(timestamps: number[]): {
  rpm: number;
  rpd: number;
  filtered: number[];
} {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const oneMinAgo = now - 60 * 1000;

  // Keep only timestamps from last 24h
  const filtered = (timestamps || []).filter((t) => t > oneDayAgo);
  const rpm = filtered.filter((t) => t > oneMinAgo).length;
  const rpd = filtered.length;

  return { rpm, rpd, filtered };
}

/**
 * Record a request execution for a key (primary or fallback)
 */
export function recordRequestUsage(keyId: string): void {
  const now = Date.now();
  if (keyId === 'primary') {
    const timestamps = getStoredPrimaryTimestamps();
    timestamps.push(now);
    const { filtered } = filterAndCalculateUsage(timestamps);
    setStoredPrimaryTimestamps(filtered);
  } else {
    const fallbacks = getStoredFallbackKeys();
    const updated = fallbacks.map((f) => {
      if (f.id === keyId) {
        const ts = f.requestTimestamps || [];
        ts.push(now);
        const { rpm, rpd, filtered } = filterAndCalculateUsage(ts);
        return {
          ...f,
          rpmCount: rpm,
          rpdCount: rpd,
          requestTimestamps: filtered,
          lastUsedAt: now,
        };
      }
      return f;
    });
    setStoredFallbackKeys(updated);
  }
}

/**
 * Get aggregated snapshot of current key metrics
 */
export function getKeyUsageSnapshot(): KeyUsageMetrics {
  const now = Date.now();
  const primaryKey = getStoredPrimaryApiKey();
  const primaryTs = getStoredPrimaryTimestamps();
  const { rpm: primaryRpm, rpd: primaryRpd, filtered: primaryFiltered } = filterAndCalculateUsage(primaryTs);
  setStoredPrimaryTimestamps(primaryFiltered);

  const { status: savedPrimaryStatus, exhaustedUntil: primaryExhaustedUntil } = getStoredPrimaryStatus();
  let primaryKeyStatus: ApiKeyStatus = savedPrimaryStatus;

  // Reset expired cooldowns
  if (primaryExhaustedUntil && now >= primaryExhaustedUntil) {
    primaryKeyStatus = 'Ready';
    setStoredPrimaryStatus('Ready');
  } else if (primaryRpm >= GEMINI_FREE_TIER_RPM || primaryRpd >= GEMINI_FREE_TIER_RPD) {
    primaryKeyStatus = 'Quota Exhausted';
  }

  const rawFallbacks = getStoredFallbackKeys();
  let activeKeyId = 'primary';
  let primaryIsUsable = primaryKey.trim().length > 0 && primaryKeyStatus !== 'Quota Exhausted' && primaryKeyStatus !== 'Invalid';

  const fallbackKeys: FallbackKeyItem[] = rawFallbacks.map((f) => {
    const { rpm, rpd, filtered } = filterAndCalculateUsage(f.requestTimestamps || []);
    let fStatus: ApiKeyStatus = f.status || 'Ready';

    if (f.exhaustedUntil && now >= f.exhaustedUntil) {
      fStatus = 'Ready';
    } else if (rpm >= GEMINI_FREE_TIER_RPM || rpd >= GEMINI_FREE_TIER_RPD) {
      fStatus = 'Quota Exhausted';
    }

    return {
      ...f,
      rpmCount: rpm,
      rpdCount: rpd,
      requestTimestamps: filtered,
      status: fStatus,
    };
  });

  // Save cleaned fallbacks
  setStoredFallbackKeys(fallbackKeys);

  if (primaryIsUsable) {
    activeKeyId = 'primary';
    primaryKeyStatus = 'Active';
  } else {
    // Find first available fallback
    const firstActiveFallback = fallbackKeys.find((f) => f.key.trim().length > 0 && f.status !== 'Quota Exhausted' && f.status !== 'Invalid');
    if (firstActiveFallback) {
      activeKeyId = firstActiveFallback.id;
    }
  }

  return {
    primaryKey,
    primaryKeyStatus,
    primaryRpm,
    primaryRpd,
    primaryTimestamps: primaryFiltered,
    primaryExhaustedUntil,
    fallbackKeys,
    activeKeyId,
    rpmLimit: GEMINI_FREE_TIER_RPM,
    rpdLimit: GEMINI_FREE_TIER_RPD,
  };
}

/**
 * Utility to determine color-coded usage status
 * Green (<70%), Yellow (70-90%), Red (>90% or 429)
 */
export function getUsageColor(count: number, limit: number, isExhausted: boolean = false): {
  color: string;
  bg: string;
  border: string;
  percentage: number;
  badge: string;
} {
  if (isExhausted) {
    return {
      color: 'text-rose-400',
      bg: 'bg-rose-500/20',
      border: 'border-rose-500/30',
      percentage: 100,
      badge: 'Exhausted',
    };
  }

  const percentage = Math.min(100, Math.round((count / limit) * 100));

  if (percentage >= 90) {
    return {
      color: 'text-rose-400',
      bg: 'bg-rose-500/20',
      border: 'border-rose-500/30',
      percentage,
      badge: 'High Usage',
    };
  } else if (percentage >= 70) {
    return {
      color: 'text-amber-400',
      bg: 'bg-amber-500/20',
      border: 'border-amber-500/30',
      percentage,
      badge: 'Moderate',
    };
  } else {
    return {
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/20',
      border: 'border-emerald-500/30',
      percentage,
      badge: 'Optimal',
    };
  }
}

/**
 * Helper to mask sensitive API key string (e.g. AIzaSyD...8xQ)
 */
export function maskApiKey(key: string): string {
  if (!key) return 'No key set';
  if (key.length <= 10) return '••••••••••••';
  return `${key.slice(0, 6)}••••••••${key.slice(-4)}`;
}

/**
 * Helper to sleep for exponential backoff
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes a fetch request to Gemini proxy endpoint with key failover, retries, exponential backoff, and toasts
 */
export async function fetchWithGeminiFallback(
  url: string,
  options: RequestInit = {},
  notifyToast?: (title: string, description?: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
  onStateUpdate?: () => void
): Promise<Response> {
  const snapshot = getKeyUsageSnapshot();
  const primaryKey = snapshot.primaryKey;
  const fallbacks = snapshot.fallbackKeys;

  interface KeyCandidate {
    id: string;
    label: string;
    key: string;
    status: ApiKeyStatus;
    exhaustedUntil?: number;
  }

  const candidates: KeyCandidate[] = [];

  if (primaryKey.trim().length > 0) {
    candidates.push({
      id: 'primary',
      label: 'Primary API Key',
      key: primaryKey.trim(),
      status: snapshot.primaryKeyStatus,
      exhaustedUntil: snapshot.primaryExhaustedUntil,
    });
  }

  fallbacks.forEach((f, idx) => {
    if (f.key && f.key.trim().length > 0) {
      candidates.push({
        id: f.id,
        label: f.label || `Fallback Key ${idx + 1}`,
        key: f.key.trim(),
        status: f.status,
        exhaustedUntil: f.exhaustedUntil,
      });
    }
  });

  if (candidates.length === 0) {
    // No client keys configured - try server
    const res = await fetch(url, options);
    if (res.status === 404 || res.status === 405) {
      throw new Error('Server returned 404 (Endpoint Not Found). Please configure a Gemini API Key in Settings to run AI extraction directly on client side.');
    }
    return res;
  }

  const now = Date.now();
  // Filter out invalid keys and keys currently in cooldown, unless ALL are in cooldown
  let usableCandidates = candidates.filter(
    (c) => c.status !== 'Invalid' && (!c.exhaustedUntil || now >= c.exhaustedUntil)
  );

  if (usableCandidates.length === 0) {
    // If all keys are in cooldown, reset cooldowns and try primary
    usableCandidates = candidates.filter((c) => c.status !== 'Invalid');
    if (usableCandidates.length === 0) {
      usableCandidates = candidates;
    }
  }

  let lastError: any = null;

  for (let cIdx = 0; cIdx < usableCandidates.length; cIdx++) {
    const candidate = usableCandidates[cIdx];
    const isLastCandidate = cIdx === usableCandidates.length - 1;

    // Record usage for metrics tracking
    recordRequestUsage(candidate.id);
    onStateUpdate?.();

    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${candidate.key}`);

    let res: Response | null = null;
    const maxAttempts = 3;

    // Attempt request with exponential backoff for 500/503 errors
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        res = await fetch(url, { ...options, headers });

        if ((res.status === 500 || res.status === 503 || res.status === 502) && attempt < maxAttempts) {
          await sleep(attempt * 600);
          continue;
        }
        break;
      } catch (err: any) {
        lastError = err;
        if (attempt < maxAttempts) {
          await sleep(attempt * 600);
        }
      }
    }

    if (!res) {
      if (!isLastCandidate) {
        const next = usableCandidates[cIdx + 1];
        notifyToast?.(
          'Network Error / Server Retry',
          `${candidate.label} failed. Failing over to ${next.label}...`,
          'warning'
        );
        continue;
      }
      throw lastError || new Error('Network request failed after retries');
    }

    // Intercept 404 / 405 (missing server route, e.g. Vercel static) and execute client-side AI processing
    if (res.status === 404 || res.status === 405) {
      console.info(`[GeminiKeyManager] Server route ${url} returned ${res.status}. Executing Gemini AI directly on client side...`);
      try {
        let reqBody: any = {};
        if (options.body && typeof options.body === 'string') {
          try { reqBody = JSON.parse(options.body); } catch (e) {}
        }
        const clientResult = await executeGeminiClientSide(url, reqBody, candidate.key);
        return new Response(JSON.stringify(clientResult), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (clientErr: any) {
        console.error('[GeminiKeyManager] Client-side AI execution failed:', clientErr);
        if (!isLastCandidate) {
          continue;
        }
        throw new Error(clientErr.message || `Client-side AI extraction failed (${res.status})`);
      }
    }

    // Inspect HTTP status code
    let isQuotaExhausted = res.status === 429;
    let isInvalidKey = res.status === 401 || res.status === 403;
    let resData: any = null;

    // If status is 400 or 500, attempt to clone and read JSON body to check for quota/key error details
    if (!res.ok && res.status !== 429 && res.status !== 401) {
      try {
        const cloned = res.clone();
        resData = await cloned.json();
        const errText = String(resData.error || resData.message || '').toLowerCase();
        if (
          errText.includes('429') ||
          errText.includes('quota') ||
          errText.includes('resource_exhausted') ||
          errText.includes('rate limit')
        ) {
          isQuotaExhausted = true;
        } else if (
          errText.includes('api key not valid') ||
          errText.includes('unauthenticated') ||
          errText.includes('invalid api key')
        ) {
          isInvalidKey = true;
        }
      } catch (e) {
        // body wasn't JSON
      }
    }

    if (isQuotaExhausted) {
      // Mark candidate as Quota Exhausted with 5-min cooldown
      const cooldownUntil = Date.now() + 5 * 60 * 1000;
      if (candidate.id === 'primary') {
        setStoredPrimaryStatus('Quota Exhausted', cooldownUntil);
      } else {
        const currentFallbacks = getStoredFallbackKeys();
        const updated = currentFallbacks.map((f) =>
          f.id === candidate.id ? { ...f, status: 'Quota Exhausted' as ApiKeyStatus, exhaustedUntil: cooldownUntil } : f
        );
        setStoredFallbackKeys(updated);
      }

      onStateUpdate?.();

      if (!isLastCandidate) {
        const next = usableCandidates[cIdx + 1];
        notifyToast?.(
          'Quota Exhausted (429)',
          `${candidate.label} rate limit reached. Auto-switching to ${next.label}.`,
          'warning'
        );
        continue; // Failover retry with next key in loop
      } else {
        notifyToast?.(
          'All API Keys Quota Exhausted',
          'All primary and fallback Gemini API keys have reached their quota limits. Please add a new fallback key or wait a few minutes.',
          'error'
        );
        return res;
      }
    }

    if (isInvalidKey) {
      // Mark candidate as Invalid
      if (candidate.id === 'primary') {
        setStoredPrimaryStatus('Invalid');
      } else {
        const currentFallbacks = getStoredFallbackKeys();
        const updated = currentFallbacks.map((f) =>
          f.id === candidate.id ? { ...f, status: 'Invalid' as ApiKeyStatus } : f
        );
        setStoredFallbackKeys(updated);
      }

      onStateUpdate?.();

      if (!isLastCandidate) {
        const next = usableCandidates[cIdx + 1];
        notifyToast?.(
          'Invalid API Key',
          `${candidate.label} is invalid. Auto-switching to ${next.label}.`,
          'error'
        );
        continue; // Failover retry with next key in loop
      } else {
        notifyToast?.(
          'Invalid API Key',
          'The provided API key is invalid. Please check your Settings.',
          'error'
        );
        return res;
      }
    }

    // If server returned an error (e.g. 503 high demand or 500) and we have more keys, try next key
    if (!res.ok && !isLastCandidate) {
      const next = usableCandidates[cIdx + 1];
      console.warn(`[GeminiKeyManager] Server returned ${res.status} with ${candidate.label}. Trying ${next.label}...`);
      continue;
    }

    // Success response or final handled response
    return res;
  }

  throw new Error('All API key fallback attempts failed.');
}
