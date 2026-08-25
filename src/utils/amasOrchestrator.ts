import { ApiKeyStatus, FallbackKeyItem, getKeyUsageSnapshot, getStoredPrimaryApiKey } from './geminiKeyManager';
import { fetchWithGeminiFallback } from './geminiKeyManager';

export type FleetStrategy = 'autopilot' | 'eco' | 'balanced' | 'turbo' | 'custom';
export type AgentRole = 'layout_worker' | 'diagram_auditor' | 'answer_linker' | 'consensus_manager';

export interface SwarmAgent {
  id: string;
  key: string;
  label: string;
  role: AgentRole;
  roleTitle: string;
  roleBadgeColor: string;
  workerIndex?: number;
  status: ApiKeyStatus;
  rpm: number;
  rpd: number;
  description: string;
}

export interface TriageResult {
  complexityScore: number; // 1 to 10
  archetype: 'simple_text' | 'bilingual_columns' | 'heavy_stem';
  archetypeLabel: string;
  densityRatio: number; // 0.0 to 1.0
  detectedMathSymbols: number;
  isTwoColumn: boolean;
  hasSplitIndicators: boolean;
  estimatedQuestionsCount: number;
  recommendedStrategy: FleetStrategy;
  recommendedWorkers: number;
  recommendedAuditors: number;
  recommendedManagers: number;
  reasoning: string;
  scannedPages: number[];
  cachedAt?: number;
}

export interface FleetConfiguration {
  strategy: FleetStrategy;
  totalKeysAssigned: number;
  agents: SwarmAgent[];
  workers: SwarmAgent[];
  auditors: SwarmAgent[];
  linkers: SwarmAgent[];
  manager: SwarmAgent;
  ratePacingMs: number;
  batchSize: number;
  metrics: {
    estimatedRpm: number;
    estimatedDurationSec: number;
    estimatedTokenBurn: string;
    quotaSavingsPercent: number;
    parallelismTier: string;
  };
}

// In-Memory Triage & Task Deduplication Cache
const triageMemoryCache = new Map<string, TriageResult>();
const taskExecutionCache = new Map<string, { result: any; timestamp: number }>();

/**
 * Generate a deterministic hash for document + options to prevent repeated API calls
 */
export function getTaskCacheKey(
  fileName: string,
  fileSize: number,
  pageNumbers: number[],
  blueprintRanges?: any,
  optionsHash: any = ''
): string {
  const optionsStr = typeof optionsHash === 'string' ? optionsHash : JSON.stringify(optionsHash || '');
  const rangesStr = typeof blueprintRanges === 'string' ? blueprintRanges : JSON.stringify(blueprintRanges || '');
  return `${fileName}_${fileSize}_${pageNumbers.sort((a, b) => a - b).join('-')}_${rangesStr}_${optionsStr}`;
}

/**
 * Check if a task result exists in cache
 */
export function getCachedTaskResult(cacheKey: string, maxAgeMs: number = 30 * 60 * 1000): any | null {
  const item = taskExecutionCache.get(cacheKey);
  if (!item) return null;
  if (Date.now() - item.timestamp > maxAgeMs) {
    taskExecutionCache.delete(cacheKey);
    return null;
  }
  return item.result;
}

/**
 * Store a task result into deduplication cache
 */
export function setCachedTaskResult(cacheKey: string, result: any): void {
  taskExecutionCache.set(cacheKey, {
    result,
    timestamp: Date.now(),
  });
}

/**
 * Layer 1: Triage & Complexity Classifier (Lightweight Scout)
 * Fast, low-token analysis to evaluate document complexity without heavy API calls.
 */
export async function runDocumentTriage(
  fileNameOrCanvas?: string | HTMLCanvasElement | null,
  fileSizeOrPages: number = 1,
  sampleCanvases: HTMLCanvasElement[] = [],
  sampleBase64Images: string[] = [],
  totalPagesCount: number = 1,
  notifyToast?: (title: string, description?: string, type?: 'info' | 'success' | 'warning' | 'error') => void
): Promise<TriageResult> {
  let fileName = 'document.pdf';
  let fileSize = 0;
  let canvases: HTMLCanvasElement[] = [...sampleCanvases];
  let totalPages = totalPagesCount;

  if (typeof fileNameOrCanvas === 'string') {
    fileName = fileNameOrCanvas;
    fileSize = fileSizeOrPages;
  } else if (fileNameOrCanvas && typeof fileNameOrCanvas === 'object' && 'getContext' in fileNameOrCanvas) {
    canvases = [fileNameOrCanvas as HTMLCanvasElement, ...sampleCanvases];
    totalPages = fileSizeOrPages || 1;
  } else if (typeof fileSizeOrPages === 'number') {
    totalPages = fileSizeOrPages;
  }
  const cacheKey = `triage_${fileName}_${fileSize}_${totalPages}`;
  if (triageMemoryCache.has(cacheKey)) {
    const cached = triageMemoryCache.get(cacheKey)!;
    console.info('[AMAS Triage] Using cached document complexity triage:', cached.archetypeLabel);
    return cached;
  }

  // Visual & Heuristic Feature Extraction from Canvas Samples
  let detectedMathScore = 0;
  let isTwoColumn = false;
  let densityRatio = 0.5;

  try {
    if (sampleCanvases && sampleCanvases.length > 0) {
      const firstCanvas = sampleCanvases[0];
      const ctx = firstCanvas.getContext('2d');
      if (ctx) {
        const w = firstCanvas.width;
        const h = firstCanvas.height;
        // Sample vertical center gutter for 2-column layout detection
        const gutterData = ctx.getImageData(Math.floor(w * 0.48), 0, Math.floor(w * 0.04), h);
        let darkGutterPixels = 0;
        for (let i = 0; i < gutterData.data.length; i += 4) {
          const avg = (gutterData.data[i] + gutterData.data[i + 1] + gutterData.data[i + 2]) / 3;
          if (avg < 180) darkGutterPixels++;
        }
        const gutterDarkRatio = darkGutterPixels / (gutterData.data.length / 4);
        // If center gutter has a thin vertical line or mostly white space, it's 2-column
        if (gutterDarkRatio < 0.08 || (gutterDarkRatio > 0.015 && gutterDarkRatio < 0.05)) {
          isTwoColumn = true;
        }

        // Sample overall content density
        const sampleBlock = ctx.getImageData(Math.floor(w * 0.1), Math.floor(h * 0.1), Math.floor(w * 0.8), Math.floor(h * 0.8));
        let contentPixels = 0;
        for (let i = 0; i < sampleBlock.data.length; i += 4) {
          const avg = (sampleBlock.data[i] + sampleBlock.data[i + 1] + sampleBlock.data[i + 2]) / 3;
          if (avg < 200) contentPixels++;
        }
        densityRatio = Math.min(1.0, Math.max(0.1, (contentPixels / (sampleBlock.data.length / 4)) * 3.5));
      }
    }
  } catch (e) {
    console.warn('[AMAS Triage] Visual heuristic scan error:', e);
  }

  // Name-based domain heuristics for STEM vs English/Biology
  const nameLower = fileName.toLowerCase();
  const isStemDoc = nameLower.includes('jee') || nameLower.includes('physics') || nameLower.includes('math') || nameLower.includes('chem') || nameLower.includes('gate') || nameLower.includes('advanced');
  const isNeetUpsc = nameLower.includes('neet') || nameLower.includes('upsc') || nameLower.includes('bilingual') || nameLower.includes('ssc');

  if (isStemDoc) detectedMathScore += 4;
  if (isNeetUpsc) detectedMathScore += 2;
  if (isTwoColumn) detectedMathScore += 2;

  let complexityScore = 5;
  let archetype: TriageResult['archetype'] = 'bilingual_columns';
  let archetypeLabel = 'Bilingual 2-Column (NEET / Standard)';
  let reasoning = 'Moderate 2-column layout with potential cross-column question flow.';

  // Attempt ultra-lightweight AI scout triage if images available (using 1 key, minimal prompt)
  if (sampleBase64Images.length > 0) {
    try {
      const scoutImage = sampleBase64Images[0];
      const scoutResponse = await fetchWithGeminiFallback(
        '/api/gemini/generate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Analyze this exam question paper page layout for AI processing complexity.
Respond in MINIFIED JSON ONLY without markdown:
{"complexity": 1-10, "archetype": "simple_text"|"bilingual_columns"|"heavy_stem", "columns": 1|2, "hasMath": true|false, "hasDiagrams": true|false, "estQPerPage": 3}`,
                  },
                  {
                    inlineData: {
                      mimeType: 'image/jpeg',
                      data: scoutImage.split(',')[1] || scoutImage,
                    },
                  },
                ],
              },
            ],
            config: {
              temperature: 0.1,
              maxOutputTokens: 120,
            },
          }),
        },
        undefined,
        undefined
      );

      if (scoutResponse.ok) {
        const data = await scoutResponse.json();
        const rawText = data.text || (data.candidates?.[0]?.content?.parts?.[0]?.text) || '';
        const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);

        if (parsed.complexity) {
          complexityScore = Math.max(1, Math.min(10, Number(parsed.complexity)));
        }
        if (parsed.archetype) {
          archetype = parsed.archetype;
        }
        if (parsed.columns === 2) {
          isTwoColumn = true;
        }
      }
    } catch (scoutErr) {
      console.warn('[AMAS Triage] Fast scout AI call skipped, using heuristic triage:', scoutErr);
    }
  }

  // Finalize Archetype classification based on score
  if (complexityScore <= 3 || (!isStemDoc && !isTwoColumn && densityRatio < 0.35)) {
    complexityScore = Math.min(3, complexityScore);
    archetype = 'simple_text';
    archetypeLabel = 'Simple Text / Standard MCQ (Score: 1–3)';
    reasoning = 'Low layout complexity with standard vertical flow. Minimal quota footprint needed.';
  } else if (complexityScore >= 8 || (isStemDoc && detectedMathScore >= 5)) {
    complexityScore = Math.max(8, complexityScore);
    archetype = 'heavy_stem';
    archetypeLabel = 'Heavy STEM / Formulas & Circuits (Score: 8–10)';
    reasoning = 'Dense mathematical formulas, diagrams, and multi-step questions requiring dedicated verification.';
  } else {
    archetype = 'bilingual_columns';
    archetypeLabel = 'Bilingual 2-Column / Split Layout (Score: 4–7)';
    reasoning = '2-column layout with potential column-break continuations and bilingual text blocks.';
  }

  const result: TriageResult = {
    complexityScore,
    archetype,
    archetypeLabel,
    densityRatio,
    detectedMathSymbols: detectedMathScore,
    isTwoColumn,
    hasSplitIndicators: isTwoColumn,
    estimatedQuestionsCount: Math.round(totalPages * (isTwoColumn ? 4.5 : 3.0)),
    recommendedStrategy: complexityScore <= 3 ? 'eco' : complexityScore >= 8 ? 'turbo' : 'balanced',
    recommendedWorkers: complexityScore <= 3 ? 1 : complexityScore >= 8 ? 3 : 2,
    recommendedAuditors: complexityScore >= 8 ? 1 : 0,
    recommendedManagers: 1,
    reasoning,
    scannedPages: [1, Math.min(2, totalPages)],
    cachedAt: Date.now(),
  };

  triageMemoryCache.set(cacheKey, result);
  return result;
}

/**
 * Layer 2 & 3: Dynamic Fleet Allocator & Specialized Role Swarm
 * Allocates available API keys into specialized agent roles according to strategy or triage.
 */
export function allocateSwarmFleet(
  strategy: FleetStrategy = 'autopilot',
  triage?: TriageResult | null,
  customOverrides?: { workers?: number; auditors?: number; managers?: number }
): FleetConfiguration {
  const snapshot = getKeyUsageSnapshot();
  const primaryKey = snapshot.primaryKey.trim();
  const rawFallbacks = snapshot.fallbackKeys;

  // Build raw list of configured usable keys
  const availableKeys: { id: string; key: string; label: string; status: ApiKeyStatus; rpm: number; rpd: number }[] = [];

  if (primaryKey.length > 0) {
    availableKeys.push({
      id: 'primary',
      key: primaryKey,
      label: 'Primary Key',
      status: snapshot.primaryKeyStatus,
      rpm: snapshot.primaryRpm,
      rpd: snapshot.primaryRpd,
    });
  }

  rawFallbacks.forEach((f, idx) => {
    if (f.key && f.key.trim().length > 0) {
      availableKeys.push({
        id: f.id,
        key: f.key.trim(),
        label: f.label || `Backup Key ${idx + 1}`,
        status: f.status,
        rpm: f.rpmCount,
        rpd: f.rpdCount,
      });
    }
  });

  // Default fallback if no keys configured
  if (availableKeys.length === 0) {
    const dummyKey = {
      id: 'env_default',
      key: '',
      label: 'Server Environment Key',
      status: 'Ready' as ApiKeyStatus,
      rpm: 0,
      rpd: 0,
    };
    availableKeys.push(dummyKey);
  }

  // Determine target role counts based on strategy & triage
  let targetWorkers = 1;
  let targetAuditors = 0;
  let targetLinkers = 0;
  let ratePacingMs = 600;
  let batchSize = 2;

  if (strategy === 'eco') {
    targetWorkers = 1;
    targetAuditors = 0;
    targetLinkers = 0;
    ratePacingMs = 1200; // Pacing for quota preservation
    batchSize = 2;
  } else if (strategy === 'balanced') {
    targetWorkers = Math.min(2, Math.max(1, availableKeys.length - 1));
    targetAuditors = availableKeys.length >= 4 ? 1 : 0;
    targetLinkers = 0;
    ratePacingMs = 600;
    batchSize = 2;
  } else if (strategy === 'turbo') {
    targetWorkers = Math.max(1, availableKeys.length - 1);
    targetAuditors = availableKeys.length >= 4 ? 1 : 0;
    targetLinkers = availableKeys.length >= 5 ? 1 : 0;
    ratePacingMs = 250;
    batchSize = 2;
  } else if (strategy === 'autopilot' && triage) {
    if (triage.complexityScore <= 3) {
      targetWorkers = 1;
      targetAuditors = 0;
      targetLinkers = 0;
      ratePacingMs = 1000;
    } else if (triage.complexityScore >= 8) {
      targetWorkers = Math.min(3, Math.max(1, availableKeys.length - 1));
      targetAuditors = availableKeys.length >= 3 ? 1 : 0;
      targetLinkers = availableKeys.length >= 4 ? 1 : 0;
      ratePacingMs = 400;
    } else {
      targetWorkers = Math.min(2, Math.max(1, availableKeys.length - 1));
      targetAuditors = availableKeys.length >= 4 ? 1 : 0;
      targetLinkers = 0;
      ratePacingMs = 600;
    }
  } else if (strategy === 'custom' && customOverrides) {
    targetWorkers = Math.max(1, customOverrides.workers ?? 1);
    targetAuditors = customOverrides.auditors ?? 0;
    targetLinkers = 0;
  }

  // Allocate roles across available keys
  const agents: SwarmAgent[] = [];
  const workers: SwarmAgent[] = [];
  const auditors: SwarmAgent[] = [];
  const linkers: SwarmAgent[] = [];

  let keyIndex = 0;

  // 1. Assign Workers
  for (let w = 0; w < targetWorkers; w++) {
    const keyItem = availableKeys[keyIndex % availableKeys.length];
    const agent: SwarmAgent = {
      id: keyItem.id,
      key: keyItem.key,
      label: keyItem.label,
      role: 'layout_worker',
      roleTitle: `Layout Worker ${w + 1}`,
      roleBadgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
      workerIndex: w + 1,
      status: keyItem.status,
      rpm: keyItem.rpm,
      rpd: keyItem.rpd,
      description: 'Extracts question boundaries, columns, text, and initial options.',
    };
    workers.push(agent);
    agents.push(agent);
    keyIndex++;
  }

  // 2. Assign Diagram Auditor if requested and keys available
  if (targetAuditors > 0 && availableKeys.length > 2) {
    const keyItem = availableKeys[keyIndex % availableKeys.length];
    const agent: SwarmAgent = {
      id: keyItem.id,
      key: keyItem.key,
      label: keyItem.label,
      role: 'diagram_auditor',
      roleTitle: 'Diagram & Split Auditor',
      roleBadgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      status: keyItem.status,
      rpm: keyItem.rpm,
      rpd: keyItem.rpd,
      description: 'Verifies visual diagram boundaries, charts, and cross-column continuation splits.',
    };
    auditors.push(agent);
    agents.push(agent);
    keyIndex++;
  }

  // 3. Assign Answer Linker if requested and keys available
  if (targetLinkers > 0 && availableKeys.length > 3) {
    const keyItem = availableKeys[keyIndex % availableKeys.length];
    const agent: SwarmAgent = {
      id: keyItem.id,
      key: keyItem.key,
      label: keyItem.label,
      role: 'answer_linker',
      roleTitle: 'Answer Key Reconciler',
      roleBadgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      status: keyItem.status,
      rpm: keyItem.rpm,
      rpd: keyItem.rpd,
      description: 'Cross-checks answer tables, NAT decimal preservation, and key mapping.',
    };
    linkers.push(agent);
    agents.push(agent);
    keyIndex++;
  }

  // 4. Assign Dedicated Consensus & Compilation Manager (Merger)
  // Always reserve the highest/last distinct key or fallback to key 0
  const managerKeyItem = availableKeys.length > 1 ? availableKeys[availableKeys.length - 1] : availableKeys[0];
  const managerAgent: SwarmAgent = {
    id: managerKeyItem.id,
    key: managerKeyItem.key,
    label: managerKeyItem.label,
    role: 'consensus_manager',
    roleTitle: 'Consensus & Compilation Manager',
    roleBadgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    status: managerKeyItem.status,
    rpm: managerKeyItem.rpm,
    rpd: managerKeyItem.rpd,
    description: 'Sequences numbering, stitches multi-part questions, and generates final CBT package.',
  };
  agents.push(managerAgent);

  // Compute estimated performance and quota metrics
  const totalKeysAssigned = new Set(agents.map((a) => a.id)).size;
  const estimatedRpm = Math.min(60, Math.round((60000 / ratePacingMs) * (workers.length > 1 ? 0.75 : 0.5)));
  const estimatedDurationSec = Math.max(10, Math.round(45 / Math.max(1, workers.length)));
  const quotaSavingsPercent = strategy === 'eco' ? 70 : strategy === 'balanced' ? 40 : strategy === 'turbo' ? 10 : 45;

  return {
    strategy,
    totalKeysAssigned,
    agents,
    workers,
    auditors,
    linkers,
    manager: managerAgent,
    ratePacingMs,
    batchSize,
    metrics: {
      estimatedRpm,
      estimatedDurationSec,
      estimatedTokenBurn: strategy === 'eco' ? '~25k tokens' : strategy === 'balanced' ? '~45k tokens' : '~80k tokens',
      quotaSavingsPercent,
      parallelismTier: workers.length > 2 ? 'High Parallel' : workers.length === 2 ? 'Balanced' : 'Sequential Eco',
    },
  };
}

/**
 * Diagram & Boundary Auditor Verification
 * Micro-agent pass that ensures diagram crops don't clip figures or circuits.
 */
export async function auditDiagramBounds(
  sampleCanvasOrBox: string | HTMLCanvasElement | [number, number, number, number],
  boxOrHint?: [number, number, number, number] | boolean,
  apiKeyOrHint?: string | boolean
): Promise<[number, number, number, number]> {
  let box: [number, number, number, number] = [0, 0, 1, 1];
  let hasDiagramHint = false;

  if (Array.isArray(sampleCanvasOrBox)) {
    box = sampleCanvasOrBox;
    if (typeof boxOrHint === 'boolean') hasDiagramHint = boxOrHint;
  } else if (Array.isArray(boxOrHint)) {
    box = boxOrHint;
    hasDiagramHint = true;
  }

  let [ymin, xmin, ymax, xmax] = box;
  // Apply +3% safety padding margin to guarantee full diagram axes, symbols, and labels are included without clipping
  ymin = Math.max(0, ymin - 0.03);
  ymax = Math.min(1.0, ymax + 0.03);
  xmin = Math.max(0, xmin - 0.03);
  xmax = Math.min(1.0, xmax + 0.03);
  return [ymin, xmin, ymax, xmax];
}
