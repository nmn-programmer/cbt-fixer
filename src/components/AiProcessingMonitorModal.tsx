import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Activity,
  Cpu,
  Layers,
  Sparkles,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Zap,
  HardDrive,
  Terminal,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
  Maximize2,
  Minimize2,
  Sliders,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { useCbtStore } from '../store/useCbtStore';
import {
  getOrchestratedKeyPool,
  OrchestratedKey,
  ApiKeyStatus,
  GEMINI_FREE_TIER_RPM,
  GEMINI_FREE_TIER_RPD,
  maskApiKey,
  getUsageColor,
} from '../utils/geminiKeyManager';
import {
  FleetConfiguration,
  FleetStrategy,
  TriageResult,
  allocateSwarmFleet,
  SwarmAgent,
} from '../utils/amasOrchestrator';

export interface WorkerActivityLog {
  id: string;
  timestamp: number;
  workerId: string; // 'worker-1', 'worker-2', 'merger', 'orchestrator', 'auditor', 'linker'
  workerLabel: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  pageNumber?: number;
}

export interface PagePartitionState {
  pageNumber: number;
  assignedWorkerId: string;
  assignedWorkerLabel: string;
  status: 'pending' | 'rendering' | 'processing' | 'done' | 'backoff' | 'failed';
  detectedQuestionsCount?: number;
  retryAttempt?: number;
  backoffRemainingMs?: number;
}

interface AiProcessingMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
  // External props if passed during active conversion
  activePages?: number[];
  pagePartitions?: PagePartitionState[];
  logs?: WorkerActivityLog[];
  activePhase?: string;
  isLiveProcessing?: boolean;
  fleetConfig?: FleetConfiguration;
  triageResult?: TriageResult | null;
  fleetStrategy?: FleetStrategy;
}

// Global event bus for worker logs so logs can be broadcasted from anywhere
type LogListener = (log: WorkerActivityLog) => void;
const logListeners: Set<LogListener> = new Set();
let globalLogsMemory: WorkerActivityLog[] = [];

export function emitWorkerLog(log: Omit<WorkerActivityLog, 'id' | 'timestamp'>) {
  const fullLog: WorkerActivityLog = {
    ...log,
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    timestamp: Date.now(),
  };
  globalLogsMemory.push(fullLog);
  if (globalLogsMemory.length > 200) {
    globalLogsMemory = globalLogsMemory.slice(-200);
  }
  logListeners.forEach((fn) => fn(fullLog));
}

export function subscribeWorkerLogs(listener: LogListener): () => void {
  logListeners.add(listener);
  return () => {
    logListeners.delete(listener);
  };
}

export function getGlobalWorkerLogs(): WorkerActivityLog[] {
  return [...globalLogsMemory];
}

export function clearGlobalWorkerLogs(): void {
  globalLogsMemory = [];
  logListeners.forEach((fn) =>
    fn({
      id: 'clear',
      timestamp: Date.now(),
      workerId: 'orchestrator',
      workerLabel: 'System',
      level: 'info',
      message: 'Activity log cleared.',
    })
  );
}

export const AiProcessingMonitorModal: React.FC<AiProcessingMonitorModalProps> = ({
  isOpen,
  onClose,
  pagePartitions = [],
  logs: externalLogs,
  activePhase,
  isLiveProcessing = false,
  fleetConfig: passedFleetConfig,
  triageResult,
  fleetStrategy = 'autopilot',
}) => {
  const [internalLogs, setInternalLogs] = useState<WorkerActivityLog[]>(() => getGlobalWorkerLogs());
  const [logFilter, setLogFilter] = useState<'all' | 'workers' | 'merger' | 'errors'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const { refreshUsageMetrics, primaryRpm, primaryRpd, primaryStatus, fallbackApiKeys } =
    useCbtStore();

  const [activeFleet, setActiveFleet] = useState<FleetConfiguration>(() =>
    passedFleetConfig || allocateSwarmFleet((fleetStrategy as FleetStrategy) || 'autopilot', triageResult)
  );

  // Listen to live logs
  useEffect(() => {
    const unsub = subscribeWorkerLogs((newLog) => {
      if (newLog.id === 'clear') {
        setInternalLogs([]);
      } else {
        setInternalLogs((prev) => [...prev.slice(-199), newLog]);
      }
    });
    return unsub;
  }, []);

  // Sync fleet metrics periodically
  useEffect(() => {
    if (isOpen) {
      if (passedFleetConfig) {
        setActiveFleet(passedFleetConfig);
      } else {
        setActiveFleet(allocateSwarmFleet((fleetStrategy as FleetStrategy) || 'autopilot', triageResult));
      }
      const interval = setInterval(() => {
        if (passedFleetConfig) {
          setActiveFleet(passedFleetConfig);
        } else {
          setActiveFleet(allocateSwarmFleet((fleetStrategy as FleetStrategy) || 'autopilot', triageResult));
        }
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [isOpen, primaryRpm, primaryRpd, primaryStatus, fallbackApiKeys, passedFleetConfig, fleetStrategy, triageResult]);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [internalLogs, externalLogs, autoScroll]);

  if (!isOpen) return null;

  const displayLogs = (externalLogs && externalLogs.length > 0 ? externalLogs : internalLogs).filter(
    (log) => {
      if (logFilter === 'all') return true;
      if (logFilter === 'errors') return log.level === 'error' || log.level === 'warning';
      if (logFilter === 'merger') return log.workerId.includes('merger') || log.workerId.includes('manager');
      if (logFilter === 'workers') return log.workerId.includes('worker') || log.workerId.includes('auditor') || log.workerId.includes('linker');
      return true;
    }
  );

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d
      .getMinutes()
      .toString()
      .padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${Math.floor(
      d.getMilliseconds() / 100
    )}`;
  };

  return (
    <div
      id="ai-processing-monitor-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        id="ai-processing-monitor-container"
        className="flex flex-col w-full h-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100 max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/80 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Cpu className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-100">
                  Adaptive Multi-Agent Swarm (AMAS) Fleet Monitor
                </h2>
                {isLiveProcessing ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                    Live Swarm Running
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                    Fleet Ready
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Mode: <strong className="text-indigo-300 uppercase">{activeFleet.strategy}</strong> • {activeFleet.workers.length} Layout Workers • {activeFleet.auditors.length} Auditors • 1 Consensus Manager
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                refreshUsageMetrics();
                setActiveFleet(allocateSwarmFleet((fleetStrategy as FleetStrategy) || 'autopilot', triageResult));
              }}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Refresh Swarm Metrics"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800/80 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              title="Close Monitor"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* AMAS Triage & Strategy Banner */}
          {triageResult && (
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-indigo-900/40 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Document Archetype</span>
                  <span className="font-bold text-slate-100">{triageResult.archetypeLabel}</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Complexity Rating</span>
                  <span className="font-bold text-amber-300">{triageResult.complexityScore} / 10 • {triageResult.isTwoColumn ? '2-Column Split' : 'Single Column'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Estimated Quota Savings</span>
                  <span className="font-bold text-emerald-300">{activeFleet.metrics.quotaSavingsPercent}% Quota Preserved</span>
                </div>
              </div>
            </div>
          )}

          {/* Phase Banner */}
          {activePhase && (
            <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between text-xs">
              <span className="font-semibold text-indigo-300">Active Orchestration Phase:</span>
              <span className="font-mono font-bold text-slate-100">{activePhase}</span>
            </div>
          )}

          {/* SWARM AGENTS & ROLES FLEET GRID */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-indigo-400" />
                Dynamic Swarm Role Allocations ({activeFleet.agents.length} Roles Assigned)
              </h3>
              <span className="text-[11px] text-slate-500">
                Pacing: {activeFleet.ratePacingMs}ms • Batch: {activeFleet.batchSize} Pgs
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Specialized Swarm Agents Cards */}
              {activeFleet.agents.map((agent, idx) => {
                const rpmColor = getUsageColor(agent.rpm, GEMINI_FREE_TIER_RPM);
                const rpdColor = getUsageColor(agent.rpd, GEMINI_FREE_TIER_RPD);

                return (
                  <div
                    key={`${agent.id}_${agent.role}_${idx}`}
                    className="p-3.5 rounded-xl border bg-slate-950/60 border-slate-800 text-slate-200 hover:border-slate-700 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-200">
                            {agent.role === 'layout_worker' ? `W${agent.workerIndex || idx + 1}` : agent.role === 'diagram_auditor' ? 'DA' : agent.role === 'answer_linker' ? 'AL' : 'CM'}
                          </span>
                          <div>
                            <div className="text-xs font-bold text-slate-100">{agent.label}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {agent.roleTitle}
                            </div>
                          </div>
                        </div>

                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${agent.roleBadgeColor}`}>
                          {agent.role === 'layout_worker' ? 'Extractor' : agent.role === 'diagram_auditor' ? 'Auditor' : agent.role === 'answer_linker' ? 'Linker' : 'Consensus'}
                        </span>
                      </div>

                      <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">
                        {agent.description}
                      </p>

                      <div className="text-[11px] font-mono text-slate-500 mb-2 truncate">
                        {maskApiKey(agent.key)}
                      </div>
                    </div>

                    {/* RPM & RPD Meters */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
                      <div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span>RPM</span>
                          <span className="font-semibold text-slate-200">
                            {agent.rpm}/{GEMINI_FREE_TIER_RPM}
                          </span>
                        </div>
                        <div className="w-full h-1 bg-slate-800 rounded-full mt-1 overflow-hidden">
                          <div
                            className={`h-full ${rpmColor.bg}`}
                            style={{
                              width: `${Math.min(
                                (agent.rpm / GEMINI_FREE_TIER_RPM) * 100,
                                100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span>RPD</span>
                          <span className="font-semibold text-slate-200">
                            {agent.rpd}/{GEMINI_FREE_TIER_RPD}
                          </span>
                        </div>
                        <div className="w-full h-1 bg-slate-800 rounded-full mt-1 overflow-hidden">
                          <div
                            className={`h-full ${rpdColor.bg}`}
                            style={{
                              width: `${Math.min(
                                (agent.rpd / GEMINI_FREE_TIER_RPD) * 100,
                                100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PAGE PARTITIONS GRID */}
          {pagePartitions.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  Live Page Partition Grid ({pagePartitions.length} Pages)
                </h3>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded bg-indigo-500 animate-pulse"></span> Processing
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded bg-emerald-500"></span> Completed
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded bg-amber-500"></span> Backoff / Retry
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                {pagePartitions.map((p) => {
                  let bgClass = 'bg-slate-900 border-slate-800 text-slate-400';
                  let statusLabel = 'Pending';
                  if (p.status === 'processing') {
                    bgClass =
                      'bg-indigo-900/40 border-indigo-500 ring-1 ring-indigo-500 text-indigo-200 animate-pulse';
                    statusLabel = 'Analyzing';
                  } else if (p.status === 'done') {
                    bgClass = 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300';
                    statusLabel = `Done (${p.detectedQuestionsCount ?? 0} Qs)`;
                  } else if (p.status === 'backoff') {
                    bgClass =
                      'bg-amber-950/40 border-amber-500 ring-1 ring-amber-500 text-amber-200 animate-pulse';
                    statusLabel = `Retry ${p.retryAttempt ?? 1}`;
                  } else if (p.status === 'failed') {
                    bgClass = 'bg-rose-950/40 border-rose-500 text-rose-300';
                    statusLabel = 'Failed';
                  }

                  return (
                    <div
                      key={p.pageNumber}
                      className={`p-2 rounded-xl border text-center transition-all ${bgClass}`}
                      title={`Page ${p.pageNumber} - Assigned to ${p.assignedWorkerLabel} - Status: ${statusLabel}`}
                    >
                      <div className="text-xs font-bold">P{p.pageNumber}</div>
                      <div className="text-[9px] font-mono opacity-80 mt-0.5 truncate">
                        {p.assignedWorkerLabel}
                      </div>
                      <div className="text-[9px] font-semibold mt-1 truncate">{statusLabel}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ACTIVITY LOOP LOGS / PIPELINE TICKER */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Swarm Activity Loop & Role Dispatch Log
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {/* Filter Tabs */}
                <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-[11px]">
                  {(['all', 'workers', 'merger', 'errors'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setLogFilter(f)}
                      className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                        logFilter === f
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                <button
                  onClick={clearGlobalWorkerLogs}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 text-[11px] transition-colors"
                >
                  Clear Logs
                </button>
              </div>
            </div>

            {/* Log Terminal Window */}
            <div
              ref={logContainerRef}
              className="w-full h-56 sm:h-64 bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs overflow-y-auto space-y-1.5 shadow-inner"
            >
              {displayLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                  Awaiting swarm agent dispatches...
                </div>
              ) : (
                displayLogs.map((log) => {
                  let textClass = 'text-slate-300';
                  let icon = '⚡';
                  if (log.level === 'success') {
                    textClass = 'text-emerald-400';
                    icon = '✓';
                  } else if (log.level === 'warning') {
                    textClass = 'text-amber-400';
                    icon = '⚠️';
                  } else if (log.level === 'error') {
                    textClass = 'text-rose-400';
                    icon = '✕';
                  }

                  return (
                    <div key={log.id} className="flex items-start gap-2 leading-relaxed hover:bg-slate-900/50 rounded px-1 py-0.5">
                      <span className="text-slate-500 text-[10px] select-none shrink-0">
                        [{formatTime(log.timestamp)}]
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded shrink-0 ${
                          log.workerId.includes('merger') || log.workerId.includes('manager')
                            ? 'bg-purple-900/40 text-purple-300 border border-purple-700/40'
                            : log.workerId.includes('auditor')
                            ? 'bg-amber-900/40 text-amber-300 border border-amber-700/40'
                            : log.workerId.includes('worker')
                            ? 'bg-indigo-900/40 text-indigo-300 border border-indigo-700/40'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {log.workerLabel}
                      </span>
                      <span className={`flex-1 break-all ${textClass}`}>
                        {icon} {log.message}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldAlert className="w-3.5 h-3.5 text-indigo-400" />
            <span>
              Adaptive Multi-Agent Swarm (AMAS) Engine • Dynamic Token Conservation
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            Close Monitor
          </button>
        </div>
      </div>
    </div>
  );
};

