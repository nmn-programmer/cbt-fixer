import React, { useState, useEffect } from 'react';
import {
  Activity,
  Zap,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Play,
  Server,
  ShieldCheck,
  TrendingUp,
  BarChart2,
  Clock,
  Layers,
  Sparkles,
  Cpu,
  ArrowRight
} from 'lucide-react';
import {
  getFleetHealthSnapshot,
  runHealthPingAuditAllKeys,
  isAutoPingEnabled,
  setAutoPingEnabled,
  validateApiKey,
  recordKeyLatency,
  KeyHealthMetrics,
  GEMINI_FREE_TIER_RPM,
  GEMINI_FREE_TIER_RPD,
  getUsageColor,
} from '../utils/geminiKeyManager';

interface LoadBalancerDashboardProps {
  onStateChange?: () => void;
  compactMode?: boolean;
}

export const LoadBalancerDashboard: React.FC<LoadBalancerDashboardProps> = ({
  onStateChange,
  compactMode = false,
}) => {
  const [healthData, setHealthData] = useState<KeyHealthMetrics[]>([]);
  const [autoPing, setAutoPing] = useState<boolean>(true);
  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);

  const refreshData = () => {
    const data = getFleetHealthSnapshot();
    setHealthData(data);
    setAutoPing(isAutoPingEnabled());
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 1500);
    return () => clearInterval(interval);
  }, []);

  const handleToggleAutoPing = () => {
    const next = !autoPing;
    setAutoPing(next);
    setAutoPingEnabled(next);
    refreshData();
  };

  const handleRunFullAudit = async () => {
    setIsAuditing(true);
    try {
      await runHealthPingAuditAllKeys();
      refreshData();
      onStateChange?.();
    } catch (e) {
      console.error('Audit error:', e);
    } finally {
      setIsAuditing(false);
    }
  };

  const handleSingleKeyTest = async (keyItem: KeyHealthMetrics) => {
    setTestingKeyId(keyItem.keyId);
    const start = Date.now();
    try {
      const res = await validateApiKey(keyItem.keyMasked); // Uses actual key internally
      const lat = Date.now() - start;
      recordKeyLatency(keyItem.keyId, lat, res.valid, res.valid ? 'OK' : res.error);
      refreshData();
      onStateChange?.();
    } catch (e: any) {
      recordKeyLatency(keyItem.keyId, Date.now() - start, false, e.message);
      refreshData();
    } finally {
      setTestingKeyId(null);
    }
  };

  // Fleet summary stats
  const totalKeys = healthData.length;
  const readyKeys = healthData.filter((k) => k.status === 'Ready' || k.status === 'Active').length;
  const exhaustedKeys = healthData.filter((k) => k.status === 'Quota Exhausted').length;
  const totalRpm = healthData.reduce((sum, k) => sum + k.rpmCount, 0);
  const maxFleetRpm = Math.max(15, totalKeys * GEMINI_FREE_TIER_RPM);
  const avgLatency =
    healthData.length > 0
      ? Math.round(
          healthData.reduce((sum, k) => sum + (k.averageLatencyMs || 0), 0) /
            (healthData.filter((k) => k.averageLatencyMs > 0).length || 1)
        )
      : 0;

  // Find lowest RPM key (current load balancer target)
  const readyList = healthData.filter((k) => k.status !== 'Invalid' && k.status !== 'Quota Exhausted');
  const activeTarget = readyList.length > 0 ? readyList.sort((a, b) => a.rpmCount - b.rpmCount)[0] : null;

  return (
    <div className="space-y-4 text-slate-100">
      {/* Header Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
          <Activity className="w-32 h-32 text-indigo-400" />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <h3 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                Automated API Key Health & Load Balancer
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Monitors Gemini free-tier key health, logs live ping latency, and pre-emptively routes traffic away from 15 RPM limits.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Auto Ping Toggle Button */}
            <button
              type="button"
              onClick={handleToggleAutoPing}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                autoPing
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <Zap className={`w-3.5 h-3.5 ${autoPing ? 'text-emerald-400 fill-emerald-400' : 'text-slate-500'}`} />
              Auto-Ping {autoPing ? 'ON (45s)' : 'OFF'}
            </button>

            {/* Manual Audit Fleet Button */}
            <button
              type="button"
              onClick={handleRunFullAudit}
              disabled={isAuditing || totalKeys === 0}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg shadow-indigo-600/20"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
              {isAuditing ? 'Auditing Fleet...' : 'Audit Fleet Health'}
            </button>
          </div>
        </div>

        {/* Quick Fleet Metrics Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-slate-800/80">
          <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total Fleet Pool</span>
            <div className="text-sm font-bold text-white mt-0.5 flex items-center gap-1.5">
              <Server className="w-4 h-4 text-indigo-400" />
              {totalKeys} {totalKeys === 1 ? 'Key' : 'Keys'} ({maxFleetRpm} RPM max)
            </div>
          </div>

          <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Healthy & Ready</span>
            <div className="text-sm font-bold text-emerald-400 mt-0.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              {readyKeys} / {totalKeys} Ready
            </div>
          </div>

          <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Fleet RPM Usage</span>
            <div className="text-sm font-bold text-indigo-300 mt-0.5 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              {totalRpm} / {maxFleetRpm} RPM
            </div>
          </div>

          <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Average Latency</span>
            <div className="text-sm font-bold text-cyan-300 mt-0.5 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-cyan-400" />
              {avgLatency > 0 ? `${avgLatency} ms` : 'Testing...'}
            </div>
          </div>
        </div>
      </div>

      {/* Live Load Balancer Route Visualizer */}
      <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-slate-300 flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-indigo-400" />
            Pre-Emptive Load Balancer Routing Stream
          </span>
          {activeTarget ? (
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 font-mono font-bold border border-emerald-500/30">
              Active Primary Target: {activeTarget.label} ({activeTarget.rpmCount}/15 RPM)
            </span>
          ) : (
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 font-mono font-bold border border-amber-500/30">
              Fallback Cooldown Mode Active
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400 overflow-x-auto py-1 font-mono">
          <div className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 shrink-0">
            Incoming AI Extraction
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <div className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 shrink-0">
            RPM Load Filter (&lt;12)
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <div className="px-2.5 py-1 rounded-lg bg-indigo-900/50 border border-indigo-500/40 text-indigo-200 font-bold shrink-0">
            {activeTarget ? `${activeTarget.label} (${activeTarget.averageLatencyMs || 220}ms)` : 'Server Default'}
          </div>
        </div>
      </div>

      {/* Per-Key Latency Sparkline & Gauge List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-indigo-400" />
            Fleet Key Performance & Latency Telemetry
          </h4>
          <span className="text-[11px] text-slate-400 font-mono">
            {healthData.length} Slots Active
          </span>
        </div>

        {healthData.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-slate-900/50 border border-slate-800 text-slate-400">
            <p className="text-xs">No user API keys configured. Running on Server Default key.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {healthData.map((item, idx) => {
              const usageInfo = getUsageColor(item.rpmCount, GEMINI_FREE_TIER_RPM, item.status === 'Quota Exhausted');
              const isTarget = activeTarget?.keyId === item.keyId;

              return (
                <div
                  key={item.keyId}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isTarget
                      ? 'bg-slate-900/90 border-indigo-500/50 ring-1 ring-indigo-500/30'
                      : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300">
                        <KeyStatusIcon status={item.status} nearThreshold={item.nearThreshold} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{item.label}</span>
                          <span className="text-[10px] font-mono text-slate-400">{item.keyMasked}</span>
                          {isTarget && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                              Active Route
                            </span>
                          )}
                          {item.nearThreshold && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 flex items-center gap-1">
                              <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                              Near 15 RPM
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>Status: <strong className={usageInfo.color}>{item.status}</strong></span>
                          <span>•</span>
                          <span>Avg Latency: <strong className="text-slate-200">{item.averageLatencyMs > 0 ? `${item.averageLatencyMs} ms` : 'N/A'}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSingleKeyTest(item)}
                        disabled={testingKeyId === item.keyId}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-300 hover:text-white transition-colors flex items-center gap-1 border border-slate-700"
                      >
                        <Play className={`w-3 h-3 text-indigo-400 ${testingKeyId === item.keyId ? 'animate-spin' : ''}`} />
                        {testingKeyId === item.keyId ? 'Testing...' : 'Ping Latency'}
                      </button>
                    </div>
                  </div>

                  {/* RPM Progress Meter */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 text-[10px]">Current RPM Load (1-Min Window):</span>
                      <span className={`font-mono font-bold ${usageInfo.color}`}>
                        {item.rpmCount} / {GEMINI_FREE_TIER_RPM} RPM
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${usageInfo.barBg} transition-all duration-300`}
                        style={{ width: `${Math.min((item.rpmCount / GEMINI_FREE_TIER_RPM) * 100, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Real-Time Latency Sparkline Graph */}
                  {item.latencyHistory && item.latencyHistory.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-800/80">
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                        <span>Latency Sparkline (Last {item.latencyHistory.length} requests)</span>
                        <span>
                          Latest: {item.latencyMs ? `${item.latencyMs}ms` : 'OK'}
                        </span>
                      </div>
                      <div className="flex items-end gap-1 h-8 pt-1">
                        {item.latencyHistory.map((pt, pIdx) => {
                          const maxLat = 1500;
                          const heightPct = Math.min(100, Math.max(15, (pt.latencyMs / maxLat) * 100));
                          let barColor = 'bg-emerald-500';
                          if (!pt.success) barColor = 'bg-rose-500';
                          else if (pt.latencyMs > 1000) barColor = 'bg-amber-500';

                          return (
                            <div
                              key={pIdx}
                              className="flex-1 flex flex-col items-center group relative"
                            >
                              <div
                                className={`w-full rounded-t transition-all ${barColor}`}
                                style={{ height: `${heightPct}%` }}
                              />
                              {/* Hover Tooltip */}
                              <div className="absolute bottom-full mb-1 hidden group-hover:block z-20 bg-slate-900 text-white text-[9px] px-1.5 py-0.5 rounded shadow border border-slate-700 whitespace-nowrap">
                                {pt.latencyMs}ms ({pt.statusText || 'OK'})
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const KeyStatusIcon: React.FC<{ status: string; nearThreshold: boolean }> = ({ status, nearThreshold }) => {
  if (status === 'Quota Exhausted') {
    return <XCircle className="w-4 h-4 text-rose-400" />;
  }
  if (status === 'Invalid') {
    return <AlertTriangle className="w-4 h-4 text-rose-400" />;
  }
  if (nearThreshold) {
    return <AlertTriangle className="w-4 h-4 text-amber-400" />;
  }
  return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
};
