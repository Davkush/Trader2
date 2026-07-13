import React, { useState, useEffect } from 'react';
import { authenticatedFetch } from '../utils/api';
import { 
  ShieldAlert, 
  TrendingUp, 
  Newspaper, 
  AlertTriangle, 
  Gauge, 
  Zap, 
  Loader2, 
  RefreshCw, 
  Percent, 
  ShieldCheck, 
  HelpCircle,
  TrendingDown,
  Info
} from 'lucide-react';
import { ChartPaneState, CandleData } from '../types';

interface AiAgentsHubPanelProps {
  pane: ChartPaneState;
  candles: CandleData[];
  balance: number;
  positions: any[];
  drawdown: number;
}

interface SentimentData {
  bullishPercent: number;
  overallRating: string;
  impactScore: number;
  articles: Array<{
    title: string;
    source: string;
    time: string;
    summary: string;
    sentiment: string;
    impact: number;
  }>;
  recommendation: string;
}

interface RiskData {
  portfolioRiskScore: number;
  valueAtRiskPct: number;
  hedgingSuggestions: string[];
  drawdownStatus: string;
  riskLevel: string;
  auditDetails: string;
}

export const AiAgentsHubPanel: React.FC<AiAgentsHubPanelProps> = ({ 
  pane, 
  candles, 
  balance, 
  positions, 
  drawdown 
}) => {
  const [activeTab, setActiveTab] = useState<'sentiment' | 'risk'>('sentiment');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Agent States
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [risk, setRisk] = useState<RiskData | null>(null);

  const fetchSentiment = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authenticatedFetch('/api/agents/sentiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: pane.symbol }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch sentiment.');
      }
      const data = await res.json();
      setSentiment(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to trigger Sentiment Agent.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRiskAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authenticatedFetch('/api/agents/risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          positions: positions.map(p => ({
            symbol: p.symbol,
            side: p.side,
            size: p.size,
            entryPrice: p.entryPrice,
            currentPrice: p.currentPrice,
            pnl: p.pnl,
            pnlPercent: p.pnlPercent
          })), 
          balance 
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch risk audit.');
      }
      const data = await res.json();
      setRisk(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to trigger Risk Agent.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'sentiment') {
      fetchSentiment();
    } else {
      fetchRiskAudit();
    }
  }, [activeTab, pane.symbol, positions.length]);

  return (
    <div id="ai-agents-hub-root" className="flex flex-col h-full bg-[#121620] text-gray-200 font-sans">
      {/* Header */}
      <div className="p-4 border-b border-[#222632] flex items-center justify-between shrink-0 bg-[#171b26]">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-violet-400 animate-pulse" />
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-gray-100 uppercase">AI QUANT AGENT HUB</h2>
            <p className="text-[10px] text-gray-400">Autonomous Server-Side Copilots</p>
          </div>
        </div>
        <button 
          onClick={activeTab === 'sentiment' ? fetchSentiment : fetchRiskAudit}
          disabled={loading}
          className="p-1.5 rounded bg-[#1e222d] text-gray-400 hover:text-white hover:bg-[#2a2e39] transition-all disabled:opacity-50"
          title="Refresh Analysis"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 border-b border-[#222632] bg-[#141822] shrink-0">
        <button
          onClick={() => setActiveTab('sentiment')}
          className={`py-2.5 text-xs font-semibold uppercase tracking-wider text-center border-b-2 transition-all ${
            activeTab === 'sentiment'
              ? 'border-violet-500 text-violet-400 bg-violet-950/10'
              : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#1a1e2a]'
          }`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <Newspaper className="w-3.5 h-3.5" />
            Sentiment Agent
          </div>
        </button>
        <button
          onClick={() => setActiveTab('risk')}
          className={`py-2.5 text-xs font-semibold uppercase tracking-wider text-center border-b-2 transition-all ${
            activeTab === 'risk'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-950/10'
              : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#1a1e2a]'
          }`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Risk Audit Agent
          </div>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
            <span className="text-xs text-gray-400 animate-pulse font-mono uppercase tracking-widest">
              Initializing Autonomous Audit Pipeline...
            </span>
          </div>
        )}

        {error && !loading && (
          <div className="bg-rose-950/20 border border-rose-800/30 p-3.5 rounded-lg text-rose-400 text-xs flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold uppercase tracking-wider text-[10px]">Agent Error Triggered</p>
              <p className="mt-1 font-mono">{error}</p>
              <p className="mt-2 text-gray-400 text-[10px]">Ensure your GEMINI_API_KEY is configured under Settings &gt; Secrets.</p>
            </div>
          </div>
        )}

        {/* Tab 1: Sentiment Agent */}
        {activeTab === 'sentiment' && sentiment && !loading && (
          <div className="space-y-4 animate-fade-in">
            {/* Rating Gauge Card */}
            <div className="bg-[#171b26] border border-[#2a2e39] p-4 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] text-gray-400 font-mono uppercase tracking-wider block mb-1">
                  NEWS INDEX SENTIMENT
                </span>
                <span className={`text-xl font-bold tracking-tight ${
                  (sentiment?.overallRating || 'NEUTRAL') === 'BULLISH' ? 'text-emerald-400 shadow-emerald-500/10' :
                  (sentiment?.overallRating || 'NEUTRAL') === 'BEARISH' ? 'text-rose-400 shadow-rose-500/10' : 'text-amber-400'
                }`}>
                  {sentiment?.overallRating}
                </span>
                <div className="flex items-center gap-1 mt-1 text-[11px] text-gray-400">
                  <span>Impact rating:</span>
                  <span className="font-bold text-gray-200">{(sentiment?.impactScore ?? 5)}/10</span>
                </div>
              </div>

              {/* Progress Circle or Indicator Bar */}
              <div className="relative flex flex-col items-end">
                <div className="flex items-center gap-1 bg-[#1e222d] px-2.5 py-1.5 rounded-lg border border-[#2d313f]">
                  {(sentiment?.bullishPercent ?? 50) >= 50 ? (
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-rose-400" />
                  )}
                  <span className="text-sm font-mono font-semibold text-gray-100">
                    {sentiment?.bullishPercent ?? 50}% Bullish
                  </span>
                </div>
                <span className="text-[9px] text-gray-500 mt-1 uppercase font-mono">
                  Weighted Score
                </span>
              </div>
            </div>

            {/* Recommendation Box */}
            <div className="bg-violet-950/15 border border-violet-800/30 p-3.5 rounded-xl">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Zap className="w-4 h-4 text-violet-400" />
                <span className="text-[10px] uppercase tracking-wider font-bold text-violet-300">
                  EXECUTIVE SENTIMENT ADVISORY
                </span>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed font-sans italic">
                "{sentiment?.recommendation}"
              </p>
            </div>

            {/* News Articles Feed */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Newspaper className="w-3.5 h-3.5 text-gray-500" />
                Live Headlines Analysed
              </h3>
              <div className="space-y-2.5">
                {(sentiment?.articles || []).filter(Boolean).map((art, idx) => (
                  <div 
                    key={idx} 
                    id={`sentiment-article-${idx}`}
                    className="p-3 bg-[#171b26] border border-[#2a2e39] rounded-xl hover:border-gray-700/50 transition-all space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-semibold text-gray-100 leading-snug hover:text-violet-400 cursor-pointer">
                        {art?.title}
                      </h4>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase shrink-0 ${
                        art?.sentiment === 'bullish' ? 'bg-emerald-950 text-emerald-400' :
                        art?.sentiment === 'bearish' ? 'bg-rose-950 text-rose-400' : 'bg-gray-800 text-gray-400'
                      }`}>
                        {art?.sentiment}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      {art?.summary}
                    </p>
                    <div className="flex items-center justify-between text-[9px] text-gray-500 font-mono pt-1 border-t border-gray-800/50">
                      <span>{art?.source} &bull; {art?.time}</span>
                      <span>Impact: {art?.impact}/10</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Risk Audit Agent */}
        {activeTab === 'risk' && risk && !loading && (
          <div className="space-y-4 animate-fade-in">
            {/* Risk Level Badge */}
            <div className="bg-[#171b26] border border-[#2a2e39] p-4 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] text-gray-400 font-mono uppercase tracking-wider block mb-1">
                  PORTFOLIO RISK LEVEL
                </span>
                <span className={`text-xl font-bold tracking-tight ${
                  (risk?.riskLevel || 'LOW') === 'LOW' ? 'text-emerald-400' :
                  (risk?.riskLevel || 'LOW') === 'MEDIUM' ? 'text-amber-400' :
                  (risk?.riskLevel || 'LOW') === 'HIGH' ? 'text-rose-400' : 'text-red-500 animate-pulse'
                }`}>
                  {risk?.riskLevel || 'LOW'}
                </span>
                <div className="flex items-center gap-1 mt-1 text-[11px] text-gray-400">
                  <span>Drawdown metric:</span>
                  <span className={`font-semibold ${drawdown > 10 ? 'text-rose-400' : 'text-gray-200'}`}>
                    {drawdown.toFixed(2)}%
                  </span>
                </div>
              </div>

              <div className="relative flex flex-col items-end">
                <div className="flex items-center gap-1 bg-[#1e222d] px-2.5 py-1.5 rounded-lg border border-[#2d313f]">
                  <Percent className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-mono font-semibold text-gray-100">
                    {risk?.portfolioRiskScore ?? 0}/100 Score
                  </span>
                </div>
                <span className="text-[9px] text-gray-500 mt-1 uppercase font-mono">
                  Stress Rating
                </span>
              </div>
            </div>

            {/* Value at Risk (VaR) Banner */}
            <div className="bg-[#171b26] border border-emerald-950 p-3 rounded-xl flex items-center gap-3">
              <div className="p-2 rounded bg-emerald-950/50">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h4 className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                  95% Confidence Value-at-Risk (VaR)
                </h4>
                <p className="text-sm font-mono font-semibold text-emerald-400">
                  {(risk?.valueAtRiskPct ?? 0).toFixed(2)}% of Equity ($"{(balance * ((risk?.valueAtRiskPct ?? 0) / 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}")
                </p>
              </div>
            </div>

            {/* Circuit Breaker Health */}
            <div className="bg-[#171b26] border border-[#2a2e39] p-3.5 rounded-xl space-y-2">
              <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 block mb-1">
                Risk Circuit Breakers Status
              </span>
              <div className="flex items-center justify-between text-xs py-1 border-b border-gray-800">
                <span className="text-gray-400 flex items-center gap-1">
                  Global Drawdown Limit (12%)
                </span>
                <span className={`font-mono font-semibold ${drawdown > 12 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {drawdown > 12 ? 'TRIPPED (FROZEN)' : 'NOMINAL (ACTIVE)'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-1">
                <span className="text-gray-400 flex items-center gap-1">
                  Max Single-Position Limit (15%)
                </span>
                <span className="font-mono font-semibold text-emerald-400">
                  NOMINAL (ACTIVE)
                </span>
              </div>
            </div>

            {/* Hedging Suggestions */}
            <div className="bg-[#171b26] border border-[#2a2e39] p-3.5 rounded-xl space-y-2">
              <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 block mb-1 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Dynamic Hedging Suggestions
              </span>
              <ul className="space-y-1.5">
                {(risk?.hedgingSuggestions || []).filter(Boolean).map((sug, idx) => (
                  <li key={idx} className="text-xs text-gray-300 leading-relaxed flex items-start gap-1.5">
                    <span className="text-amber-500 mt-1 shrink-0">&bull;</span>
                    <span>{sug}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Detailed Audit Commentary */}
            <div className="bg-emerald-950/15 border border-emerald-800/30 p-3.5 rounded-xl space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-300 block">
                RISK COMPLIANCE MEMO
              </span>
              <p className="text-xs text-gray-300 leading-relaxed font-sans italic">
                "{risk?.auditDetails}"
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer Instructions */}
      <div className="p-3 bg-[#171b26] border-t border-[#222632] text-center text-[10px] text-gray-500 font-mono shrink-0">
        AI Agents running inside sandbox. No private key exports possible.
      </div>
    </div>
  );
};
