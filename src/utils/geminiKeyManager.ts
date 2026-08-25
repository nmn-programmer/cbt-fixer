import { executeGeminiClientSide } from './aiDirectEngine';
import { getStoredSelectedModel } from './aiModelConfig';

export type ApiKeyStatus = 'Ready' | 'Active' | 'Quota Exhausted' | 'Invalid';
export type ApiKeyRole = 'worker' | 'merger' | 'auto';

export interface FallbackKeyItem {
  id: string;
  key: string;
  label: string;
  role?: ApiKeyRole;
  status: ApiKeyStatus;
  rpmCount: number;
  rpdCount: number;
  requestTimestamps: number[];
  lastUsedAt?: number;
  exhaustedUntil?: number;
  lastError?: string;
}

export interface OrchestratedKey {
  id: string;
  key: string;
  label: string;
  role: 'worker' | 'merger';
  workerIndex?: number;
  status: ApiKeyStatus;
  rpmCount: number;
  rpdCount: number;
  exhaustedUntil?: number;
  lastUsedAt?: number;
  lastError?: string;
}

export interface OrchestratedPoolResult {
  totalKeys: number;
  workers: OrchestratedKey[];
  merger: OrchestratedKey;
  all: OrchestratedKey[];
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
 * Export all API keys (primary + fallbacks) as a JSON string
 */
export function exportApiKeysJson(): string {
  const primaryKey = getStoredPrimaryApiKey();
  const fallbacks = getStoredFallbackKeys();
  const exportData = {
    primaryKey,
    fallbackKeys: fallbacks.map(f => ({
      id: f.id,
      label: f.label,
      key: f.key
    })),
    exportedAt: new Date().toISOString()
  };
  return JSON.stringify(exportData, null, 2);
}

/**
 * Import API keys from a JSON string.
 * Using the first appearing key as the active key! Any subsequent keys become backup/fallback keys.
 */
export function importApiKeysFromJson(jsonString: string): {
  success: boolean;
  importedCount: number;
  primaryKeyMasked?: string;
  error?: string;
} {
  try {
    const data = JSON.parse(jsonString);
    const keysFound: { key: string; label?: string }[] = [];

    // Helper to collect string keys
    const addKey = (k: any, label?: string) => {
      if (typeof k === 'string' && k.trim().length > 5) {
        const trimmed = k.trim();
        if (!keysFound.some(item => item.key === trimmed)) {
          keysFound.push({ key: trimmed, label });
        }
      }
    };

    if (Array.isArray(data)) {
      // Direct array of strings or key objects
      data.forEach((item, index) => {
        if (typeof item === 'string') {
          addKey(item, index === 0 ? 'Primary Key' : `Backup Key ${index}`);
        } else if (item && typeof item === 'object') {
          const val = item.key || item.apiKey || item.value;
          const lbl = item.label || item.name || (index === 0 ? 'Primary Key' : `Backup Key ${index}`);
          addKey(val, lbl);
        }
      });
    } else if (data && typeof data === 'object') {
      // Object structure: { primaryKey, fallbackKeys, ... }
      if (data.primaryKey) {
        addKey(data.primaryKey, 'Primary Key');
      }
      if (Array.isArray(data.fallbackKeys)) {
        data.fallbackKeys.forEach((item: any, index: number) => {
          if (typeof item === 'string') {
            addKey(item, `Backup Key ${index + 1}`);
          } else if (item && typeof item === 'object') {
            const val = item.key || item.apiKey;
            const lbl = item.label || item.name || `Backup Key ${index + 1}`;
            addKey(val, lbl);
          }
        });
      }
      if (Array.isArray(data.keys)) {
        data.keys.forEach((item: any, index: number) => {
          if (typeof item === 'string') {
            addKey(item, index === 0 ? 'Primary Key' : `Backup Key ${index}`);
          } else if (item && typeof item === 'object') {
            addKey(item.key || item.apiKey, item.label || item.name);
          }
        });
      }
      if (Array.isArray(data.apiKeys)) {
        data.apiKeys.forEach((item: any, index: number) => {
          if (typeof item === 'string') {
            addKey(item, index === 0 ? 'Primary Key' : `Backup Key ${index}`);
          } else if (item && typeof item === 'object') {
            addKey(item.key || item.apiKey, item.label || item.name);
          }
        });
      }
    }

    if (keysFound.length === 0) {
      return { success: false, importedCount: 0, error: 'No valid API keys found in JSON.' };
    }

    // First appearing key is set as active primary key!
    const primary = keysFound[0];
    setStoredPrimaryApiKey(primary.key);
    setStoredPrimaryStatus('Ready');

    // Subsequent keys become fallback keys
    const fallbackList: FallbackKeyItem[] = keysFound.slice(1).map((item, index) => ({
      id: `fallback_imported_${Date.now()}_${index}`,
      key: item.key,
      label: item.label || `Backup Key ${index + 1}`,
      status: 'Ready',
      rpmCount: 0,
      rpdCount: 0,
      requestTimestamps: []
    }));

    setStoredFallbackKeys(fallbackList);

    const primaryMasked = primary.key.slice(0, 6) + '...' + primary.key.slice(-4);
    return {
      success: true,
      importedCount: keysFound.length,
      primaryKeyMasked: primaryMasked
    };
  } catch (err: any) {
    return { success: false, importedCount: 0, error: `Invalid JSON format: ${err?.message || 'Parse error'}` };
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
 * Calculates exponential backoff with randomized jitter:
 * WaitTime = (2^attempt * 1000ms) + jitter (0-400ms)
 */
export function calculateExponentialBackoffWithJitter(attempt: number): number {
  const base = Math.pow(2, Math.max(1, attempt)) * 1000;
  const jitter = Math.floor(Math.random() * 400);
  return base + jitter;
}

/**
 * Resolves full orchestrated key pool according to the K-1 Workers + 1 Merger architecture:
 * - If 1 key: Worker 1 & Merger use Key 1 (Single key mode)
 * - If K >= 2 keys: Keys 1...(K-1) are assigned as Workers, and Key K is the dedicated Merger
 */
export function getOrchestratedKeyPool(): OrchestratedPoolResult {
  const snapshot = getKeyUsageSnapshot();
  const primaryKey = snapshot.primaryKey.trim();
  const rawFallbacks = snapshot.fallbackKeys;

  const rawList: { id: string; key: string; label: string; role?: ApiKeyRole; status: ApiKeyStatus; rpm: number; rpd: number; exhaustedUntil?: number; lastUsedAt?: number; lastError?: string }[] = [];

  if (primaryKey.length > 0) {
    rawList.push({
      id: 'primary',
      key: primaryKey,
      label: 'Primary Key',
      status: snapshot.primaryKeyStatus,
      rpm: snapshot.primaryRpm,
      rpd: snapshot.primaryRpd,
      exhaustedUntil: snapshot.primaryExhaustedUntil,
      lastUsedAt: snapshot.primaryLastUsedAt,
      lastError: snapshot.primaryLastError,
    });
  }

  rawFallbacks.forEach((f, idx) => {
    if (f.key && f.key.trim().length > 0) {
      rawList.push({
        id: f.id,
        key: f.key.trim(),
        label: f.label || `Backup Key ${idx + 1}`,
        role: f.role,
        status: f.status,
        rpm: f.rpmCount,
        rpd: f.rpdCount,
        exhaustedUntil: f.exhaustedUntil,
        lastUsedAt: f.lastUsedAt,
        lastError: f.lastError,
      });
    }
  });

  // Limit to up to 5 keys
  const limitedList = rawList.slice(0, 5);

  if (limitedList.length === 0) {
    const dummyKey: OrchestratedKey = {
      id: 'env_default',
      key: '',
      label: 'Server Environment Key',
      role: 'merger',
      status: 'Ready',
      rpmCount: 0,
      rpdCount: 0,
    };
    return {
      totalKeys: 0,
      workers: [dummyKey],
      merger: dummyKey,
      all: [dummyKey],
    };
  }

  if (limitedList.length === 1) {
    const single = limitedList[0];
    const keyObj: OrchestratedKey = {
      id: single.id,
      key: single.key,
      label: single.label,
      role: 'worker',
      workerIndex: 1,
      status: single.status,
      rpmCount: single.rpm,
      rpdCount: single.rpd,
      exhaustedUntil: single.exhaustedUntil,
      lastUsedAt: single.lastUsedAt,
      lastError: single.lastError,
    };
    return {
      totalKeys: 1,
      workers: [keyObj],
      merger: { ...keyObj, role: 'merger' },
      all: [keyObj],
    };
  }

  // K >= 2: Keys 0..(K-2) are Workers, Last key (K-1) is Merger
  const workers: OrchestratedKey[] = [];
  for (let i = 0; i < limitedList.length - 1; i++) {
    const item = limitedList[i];
    workers.push({
      id: item.id,
      key: item.key,
      label: item.label || `Worker ${i + 1}`,
      role: 'worker',
      workerIndex: i + 1,
      status: item.status,
      rpmCount: item.rpm,
      rpdCount: item.rpd,
      exhaustedUntil: item.exhaustedUntil,
      lastUsedAt: item.lastUsedAt,
      lastError: item.lastError,
    });
  }

  const lastItem = limitedList[limitedList.length - 1];
  const merger: OrchestratedKey = {
    id: lastItem.id,
    key: lastItem.key,
    label: lastItem.label || 'Dedicated Merger Key',
    role: 'merger',
    status: lastItem.status,
    rpmCount: lastItem.rpm,
    rpdCount: lastItem.rpd,
    exhaustedUntil: lastItem.exhaustedUntil,
    lastUsedAt: lastItem.lastUsedAt,
    lastError: lastItem.lastError,
  };

  const all: OrchestratedKey[] = [...workers, merger];

  return {
    totalKeys: limitedList.length,
    workers,
    merger,
    all,
  };
}

let currentKeyRotationIndex = 0;

/**
 * Enforces a small rate-pacing delay to prevent free-tier bursts exceeding 15 RPM
 */
export function ratePaceDelay(ms: number = 600): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Validates whether a Gemini API key is active and functional with a quick ping
 */
export async function validateApiKey(
  apiKey: string,
  model?: string
): Promise<{ valid: boolean; error?: string; modelUsed?: string }> {
  if (!apiKey || !apiKey.trim()) {
    return { valid: false, error: 'API key is empty' };
  }

  const modelToTest = model || getStoredSelectedModel();

  try {
    const res = await fetch('/api/gemini/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'ping' }] }],
        model: modelToTest,
        config: { temperature: 0.1 },
      }),
    });

    if (res.ok) {
      return { valid: true, modelUsed: modelToTest };
    }

    // If server is 404/405, test client-side
    if (res.status === 404 || res.status === 405) {
      const clientRes = await executeGeminiClientSide(
        '/api/gemini/generate',
        {
          contents: [{ parts: [{ text: 'ping' }] }],
          model: modelToTest,
        },
        apiKey.trim()
      );
      if (clientRes && clientRes.text) {
        return { valid: true, modelUsed: modelToTest };
      }
    }

    const errData = await res.json().catch(() => ({}));
    const errMsg = errData.error || `HTTP ${res.status}`;
    return { valid: false, error: errMsg };
  } catch (err: any) {
    // Try client-side direct validation
    try {
      const clientRes = await executeGeminiClientSide(
        '/api/gemini/generate',
        {
          contents: [{ parts: [{ text: 'ping' }] }],
          model: modelToTest,
        },
        apiKey.trim()
      );
      if (clientRes && clientRes.text) {
        return { valid: true, modelUsed: modelToTest };
      }
    } catch (cErr: any) {
      return { valid: false, error: cErr.message || err.message || 'Key validation failed' };
    }
    return { valid: false, error: err.message || 'Key validation failed' };
  }
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
  // Ensure selected model is injected into request body for POST requests if not specified
  const selectedModel = getStoredSelectedModel();
  let modifiedOptions = { ...options };
  if (options.body && typeof options.body === 'string') {
    try {
      const parsed = JSON.parse(options.body);
      if (!parsed.model) {
        parsed.model = selectedModel;
        modifiedOptions.body = JSON.stringify(parsed);
      }
    } catch (e) {
      // ignore
    }
  }

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

  const allConfiguredCandidates: KeyCandidate[] = [];

  if (primaryKey.trim().length > 0) {
    allConfiguredCandidates.push({
      id: 'primary',
      label: 'Primary API Key',
      key: primaryKey.trim(),
      status: snapshot.primaryKeyStatus,
      exhaustedUntil: snapshot.primaryExhaustedUntil,
    });
  }

  fallbacks.forEach((f, idx) => {
    if (f.key && f.key.trim().length > 0) {
      allConfiguredCandidates.push({
        id: f.id,
        label: f.label || `Fallback Key ${idx + 1}`,
        key: f.key.trim(),
        status: f.status,
        exhaustedUntil: f.exhaustedUntil,
      });
    }
  });

  if (allConfiguredCandidates.length === 0) {
    // No client keys configured - try server default environment
    const res = await fetch(url, modifiedOptions);
    if (res.status === 404 || res.status === 405) {
      throw new Error('Server returned 404 (Endpoint Not Found). Please configure a Gemini API Key in Settings to run AI extraction directly on client side.');
    }
    return res;
  }

  const now = Date.now();
  // Filter out invalid keys and keys currently in cooldown, unless ALL are in cooldown
  let usableCandidates = allConfiguredCandidates.filter(
    (c) => c.status !== 'Invalid' && (!c.exhaustedUntil || now >= c.exhaustedUntil)
  );

  if (usableCandidates.length === 0) {
    // If all keys are in cooldown, reset cooldowns and try all non-invalid keys
    usableCandidates = allConfiguredCandidates.filter((c) => c.status !== 'Invalid');
    if (usableCandidates.length === 0) {
      usableCandidates = allConfiguredCandidates;
    }
  }

  // Load Balance: Rotate starting candidate to distribute RPM load evenly across free tier keys
  if (usableCandidates.length > 1) {
    const startIdx = currentKeyRotationIndex % usableCandidates.length;
    currentKeyRotationIndex++;
    usableCandidates = [
      ...usableCandidates.slice(startIdx),
      ...usableCandidates.slice(0, startIdx),
    ];
  }

  let lastError: any = null;

  for (let cIdx = 0; cIdx < usableCandidates.length; cIdx++) {
    const candidate = usableCandidates[cIdx];
    const isLastCandidate = cIdx === usableCandidates.length - 1;

    // Record usage for metrics tracking
    recordRequestUsage(candidate.id);
    onStateUpdate?.();

    const headers = new Headers(modifiedOptions.headers || {});
    headers.set('Authorization', `Bearer ${candidate.key}`);

    let res: Response | null = null;
    const maxAttempts = 2;

    // Attempt request with exponential backoff for 500/503 errors
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        res = await fetch(url, { ...modifiedOptions, headers });

        if ((res.status === 500 || res.status === 503 || res.status === 502) && attempt < maxAttempts) {
          await sleep(attempt * 500);
          continue;
        }
        break;
      } catch (err: any) {
        lastError = err;
        if (attempt < maxAttempts) {
          await sleep(attempt * 500);
        }
      }
    }

    if (!res) {
      if (!isLastCandidate) {
        const next = usableCandidates[cIdx + 1];
        notifyToast?.(
          'Network Retry',
          `${candidate.label} encountered network error. Failing over to ${next.label}...`,
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
      // Mark candidate as Quota Exhausted with a short 60s adaptive cooldown
      const cooldownUntil = Date.now() + 60 * 1000;
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
          'Rate Limit Cooldown (429)',
          `${candidate.label} rate limit reached. Auto-switching to ${next.label}.`,
          'warning'
        );
        continue; // Failover retry with next key in loop
      } else {
        notifyToast?.(
          'All API Keys Rate Limited',
          'All configured Gemini API keys have temporarily reached their RPM/TPM quota. Please wait a few seconds or add a new key in Settings.',
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
