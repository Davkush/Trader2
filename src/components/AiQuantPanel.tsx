import React, { useState } from 'react';
import { BrainCircuit, Target, Activity, Download, Sparkles, Cpu, Check, Loader2, Play, SlidersHorizontal, Settings, HelpCircle, DollarSign, Percent, BarChart2 } from 'lucide-react';
import { CandleData, ChartPaneState, Position } from '../types';
import { calcSmartSignals } from './TradingChart';
import { runPineStrategy } from '../utils/pineRunner';
import { runBacktest as runBacktestEngine, runWalkForwardOptimization, WFOWindowResult, BacktestResult } from '../services/backtest';

interface AiQuantPanelProps {
  symbol: string;
  timeframe: string;
  data: CandleData[];
  autoTradeEnabled: boolean;
  setAutoTradeEnabled: (val: boolean) => void;
  mode: 'backtest' | 'autotrade';
  pane: ChartPaneState;
  closedTrades?: Position[];
  positions?: Position[];
  onUpdatePane?: (updatedFields: Partial<ChartPaneState>) => void;
}

export const AiQuantPanel: React.FC<AiQuantPanelProps> = ({ 
  symbol, timeframe, data, autoTradeEnabled, setAutoTradeEnabled, mode, pane, closedTrades, positions, onUpdatePane 
}) => {
  const [btResult, setBtResult] = useState<{ 
    total: number; wins: number; rateStr: string; suggestion: string; 
    lastSignalTime?: string; lastSignalOutcome?: string; lastSignalType?: string;
    rateVal: number; prevRateVal?: number;
  } | null>(null);
  const [btError, setBtError] = useState<string | null>(null);

  // Friction Parameters State
  const [initialCapital, setInitialCapital] = useState<number>(10000);
  const [makerFee, setMakerFee] = useState<number>(0.001); // 0.1%
  const [takerFee, setTakerFee] = useState<number>(0.002); // 0.2%
  const [slippageBps, setSlippageBps] = useState<number>(5); // 5 basis points
  const [latencyMs, setLatencyMs] = useState<number>(200); // 200ms delay
  const [showFrictionSettings, setShowFrictionSettings] = useState<boolean>(false);

  // New detailed backtest stats
  const [detailedStats, setDetailedStats] = useState<BacktestResult | null>(null);
  const [wfoResults, setWfoResults] = useState<WFOWindowResult[] | null>(null);
  const [runWfo, setRunWfo] = useState<boolean>(true);

  // Optimizer States
  const [optGoal, setOptGoal] = useState<'winrate' | 'profit' | 'balanced'>('balanced');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optStep, setOptStep] = useState<string>('');
  const [optResults, setOptResults] = useState<{
    params: any;
    winRate: string;
    totalTrades: number;
    profitIndex: string;
    profitVal: number;
    winRateVal: number;
    displayParams: { key: string; value: string | number }[];
  }[] | null>(null);
  const [appliedIndex, setAppliedIndex] = useState<number | null>(null);

  const runBacktest = () => {
    setBtError(null);
    if (data.length < 50) {
      setBtError(`Insufficient historical data available for backtesting. Needs at least 50 candles, currently has ${data.length}.`);
      return;
    }

    const config = {
      initialCapital,
      makerFee,
      takerFee,
      slippageBps,
      latencyMs,
      smartSignalParams: pane.indicators?.smartSignalParams
    };

    // Execute professional math-exact backtest
    const result = runBacktestEngine(data, pane.pineStrategy && pane.pineStrategy.active ? pane.pineStrategy : null, config);
    
    if (result.totalTrades === 0) {
      setBtError("No trading signals were resolved with the current parameter set. Try relaxing SL/TP levels or running a sweep.");
      return;
    }

    setDetailedStats(result);

    const winRateVal = result.winRate;
    const rateStr = (winRateVal * 100).toFixed(1) + "%";

    let suggestion = "";
    if (winRateVal >= 0.85) {
      suggestion = "Stellar Outperformance! Backtest successfully handles fees & slippage while achieving a high mathematical expectancy.";
    } else if (winRateVal >= 0.65) {
      suggestion = "Moderate performance under simulated friction. Tweak parameters or reduce execution slippage to maximize profitability.";
    } else {
      suggestion = "Underperforming after transaction costs. Use the Optimizer Sweep below to find parameter combinations with higher net expectancy.";
    }

    const lastTrade = result.trades[result.trades.length - 1];
    const lastSignalTime = lastTrade ? new Date(lastTrade.entryTime * 1000).toLocaleTimeString() : "N/A";
    const lastSignalOutcome = lastTrade ? lastTrade.outcome : "N/A";
    const lastSignalType = lastTrade ? lastTrade.direction : "N/A";

    setBtResult(prev => ({ 
      total: result.totalTrades, 
      wins: result.wins, 
      rateStr, 
      suggestion, 
      lastSignalTime, 
      lastSignalOutcome, 
      lastSignalType,
      rateVal: winRateVal, 
      prevRateVal: prev ? prev.rateVal : undefined
    }));

    // Run Walk-Forward Optimization (WFO) if checked
    if (runWfo && pane.pineStrategy && pane.pineStrategy.active) {
      const wfo = runWalkForwardOptimization(data, pane.pineStrategy, config);
      setWfoResults(wfo);
    } else {
      setWfoResults(null);
    }
  };

  // Backtest Evaluator for a specific Parameter Combo
  const evaluateConfig = (params: any) => {
    let signals: any[] = [];
    if (pane.pineStrategy && pane.pineStrategy.active) {
      const testStrategy = {
        ...pane.pineStrategy,
        parameters: pane.pineStrategy.parameters.map(p => {
          if (params[p.key] !== undefined) {
            return { ...p, value: params[p.key] };
          }
          return p;
        })
      };
      signals = runPineStrategy(data, testStrategy);
    } else {
      signals = calcSmartSignals(data, params);
    }

    if (!signals.length) {
      return { winRate: 0, totalTrades: 0, profitIndex: 0, wins: 0, losses: 0 };
    }

    let wins = 0;
    let losses = 0;
    let totalProfit = 0;

    signals.forEach((sig) => {
      if (!sig || sig.time === undefined || sig.time === null) return;
      const idx = data.findIndex(d => d?.time === sig.time);
      if (idx === -1 || idx === data.length - 1) return;

      let resolved = false;
      const entry = sig.entry || data[idx].close;
      const tp = sig.tp;
      const sl = sig.sl;

      for (let i = idx + 1; i < data.length; i++) {
        const c = data[i];
        if (!c) continue;
        if (sig.signal === 'BUY') {
          if (c.high >= tp) { 
            wins++; 
            totalProfit += ((tp - entry) / entry) * 100;
            resolved = true; 
            break; 
          }
          if (c.low <= sl) { 
            losses++; 
            totalProfit += ((sl - entry) / entry) * 100;
            resolved = true; 
            break; 
          }
        } else if (sig.signal === 'SELL') {
          if (c.low <= tp) { 
            wins++; 
            totalProfit += ((entry - tp) / entry) * 100;
            resolved = true; 
            break; 
          }
          if (c.high >= sl) { 
            losses++; 
            totalProfit += ((entry - sl) / entry) * 100;
            resolved = true; 
            break; 
          }
        }
      }
    });

    const totalResolved = wins + losses;
    const winRate = totalResolved > 0 ? wins / totalResolved : 0;

    return {
      winRate,
      totalTrades: totalResolved,
      profitIndex: totalProfit,
      wins,
      losses
    };
  };

  // Run Sweep optimization with staggered timeouts for a polished, interactive UI experience
  const runOptimization = () => {
    if (data.length < 50) return;
    setIsOptimizing(true);
    setAppliedIndex(null);

    const steps = [
      { text: "Scanning asset historical structure...", delay: 0 },
      { text: "Generating high-probability parameter arrays...", delay: 300 },
      { text: "Simulating backtests & signal performance...", delay: 650 },
      { text: "Sorting top-performing configurations...", delay: 1000 },
      { text: "Done!", delay: 1350 }
    ];

    steps.forEach((step, idx) => {
      setTimeout(() => {
        if (idx === steps.length - 1) {
          executeSweep();
          setIsOptimizing(false);
        } else {
          setOptStep(step.text);
        }
      }, step.delay);
    });
  };

  const executeSweep = () => {
    let combinations: any[] = [];
    const isPineActive = !!(pane.pineStrategy && pane.pineStrategy.active);

    if (isPineActive && pane.pineStrategy) {
      const numericParams = pane.pineStrategy.parameters.filter(p => p.type === 'number');
      const sweepParams = numericParams.slice(0, 3);
      if (sweepParams.length === 0) {
        setOptResults([]);
        return;
      }

      const paramValuesLists: { key: string; values: number[] }[] = [];

      for (const p of sweepParams) {
        const curVal = p.value !== undefined ? Number(p.value) : Number(p.default);
        const step = p.step || (curVal > 15 ? 5 : curVal > 3 ? 2 : 1);
        const minVal = p.min !== undefined ? p.min : 2;
        const maxVal = p.max !== undefined ? p.max : 250;

        const vals = [curVal];
        const valLess = curVal - step;
        const valMore = curVal + step;
        const valLess2 = curVal - step * 2;
        const valMore2 = curVal + step * 2;

        if (valLess >= minVal) vals.push(valLess);
        if (valMore <= maxVal) vals.push(valMore);
        if (valLess2 >= minVal) vals.push(valLess2);
        if (valMore2 <= maxVal) vals.push(valMore2);

        const uniqueVals = Array.from(new Set(vals)).sort((a, b) => a - b);
        paramValuesLists.push({ key: p.key, values: uniqueVals });
      }

      // Generate combinations
      let combos: any[] = [{}];
      for (const pList of paramValuesLists) {
        const nextCombos: any[] = [];
        for (const c of combos) {
          for (const v of pList.values) {
            nextCombos.push({
              ...c,
              [pList.key]: v
            });
          }
        }
        combos = nextCombos;
      }
      combinations = combos;
    } else {
      // Standard SmartSignals parameter sweep
      const emaFastValues = [10, 15, 20, 25];
      const emaMedValues = [35, 50, 65];
      const rsiLengthValues = [9, 14, 21];

      for (const fast of emaFastValues) {
        for (const med of emaMedValues) {
          if (fast >= med) continue;
          for (const rsi of rsiLengthValues) {
            combinations.push({
              emaFast: fast,
              emaMed: med,
              rsiLength: rsi,
              emaSlow: pane.indicators.smartSignalParams?.emaSlow ?? 80,
              rsiBuyMin: pane.indicators.smartSignalParams?.rsiBuyMin ?? 40,
              rsiBuyMax: pane.indicators.smartSignalParams?.rsiBuyMax ?? 65,
              rsiSellMin: pane.indicators.smartSignalParams?.rsiSellMin ?? 35,
              rsiSellMax: pane.indicators.smartSignalParams?.rsiSellMax ?? 60,
              volRatio: pane.indicators.smartSignalParams?.volRatio ?? 1.1
            });
          }
        }
      }
    }

    // Evaluate combinations
    const evaluated = combinations.map(combo => {
      const metrics = evaluateConfig(combo);
      
      const displayParams: { key: string; value: string | number }[] = [];
      if (isPineActive && pane.pineStrategy) {
        pane.pineStrategy.parameters.forEach(p => {
          if (combo[p.key] !== undefined) {
            displayParams.push({ key: p.label || p.key, value: combo[p.key] });
          }
        });
      } else {
        displayParams.push({ key: "Fast EMA", value: combo.emaFast });
        displayParams.push({ key: "Med EMA", value: combo.emaMed });
        displayParams.push({ key: "RSI Len", value: combo.rsiLength });
      }

      return {
        params: combo,
        winRate: (metrics.winRate * 100).toFixed(1) + "%",
        winRateVal: metrics.winRate,
        totalTrades: metrics.totalTrades,
        profitIndex: (metrics.profitIndex >= 0 ? "+" : "") + metrics.profitIndex.toFixed(1) + "%",
        profitVal: metrics.profitIndex,
        displayParams
      };
    });

    // Sort top configurations based on chosen optimizer goal
    let sorted = [...evaluated];
    if (optGoal === 'winrate') {
      sorted.sort((a, b) => {
        if (b.winRateVal !== a.winRateVal) return b.winRateVal - a.winRateVal;
        return b.profitVal - a.profitVal;
      });
    } else if (optGoal === 'profit') {
      sorted.sort((a, b) => b.profitVal - a.profitVal);
    } else {
      // Balanced: combines winrate, profit index, and trade frequency
      sorted.sort((a, b) => {
        const scoreA = a.winRateVal * 55 + a.profitVal * 0.45 + (a.totalTrades > 6 ? 5 : 0);
        const scoreB = b.winRateVal * 55 + b.profitVal * 0.45 + (b.totalTrades > 6 ? 5 : 0);
        return scoreB - scoreA;
      });
    }

    setOptResults(sorted.slice(0, 4));
  };

  const handleApplyConfig = (config: any, index: number) => {
    if (!onUpdatePane) return;

    if (pane.pineStrategy && pane.pineStrategy.active) {
      const updatedParams = pane.pineStrategy.parameters.map(p => {
        if (config.params[p.key] !== undefined) {
          return { ...p, value: config.params[p.key] };
        }
        return p;
      });

      onUpdatePane({
        pineStrategy: {
          ...pane.pineStrategy,
          parameters: updatedParams
        }
      });
    } else {
      onUpdatePane({
        indicators: {
          ...pane.indicators,
          smartSignalParams: {
            ...pane.indicators.smartSignalParams,
            ...config.params
          }
        }
      });
    }

    setAppliedIndex(index);
    setTimeout(() => {
      setAppliedIndex(null);
    }, 2500);
  };

  const handleExportQuantData = () => {
    // 1. Export Chart History
    if (data && data.length > 0) {
      const chartHeaders = ['Timestamp', 'Date', 'Open', 'High', 'Low', 'Close', 'Volume'];
      const chartRows = (data || []).filter(Boolean).map(d => [
        d.time,
        d.time ? (() => {
          try {
            const num = Number(d.time);
            if (!isNaN(num)) {
              return new Date(num * (num < 10000000000 ? 1000 : 1)).toISOString();
            }
            return new Date(d.time).toISOString();
          } catch {
            return String(d.time);
          }
        })() : '',
        d.open,
        d.high,
        d.low,
        d.close,
        d.volume
      ]);
      const chartCsvContent = [
        chartHeaders.join(','),
        ...chartRows.map(r => r.map(val => `"${val}"`).join(','))
      ].join('\n');

      const chartBlob = new Blob([chartCsvContent], { type: 'text/csv;charset=utf-8;' });
      const chartUrl = URL.createObjectURL(chartBlob);
      const chartLink = document.createElement('a');
      chartLink.setAttribute('href', chartUrl);
      chartLink.setAttribute('download', `${symbol}_${timeframe}_chart_history.csv`);
      document.body.appendChild(chartLink);
      chartLink.click();
      document.body.removeChild(chartLink);
    }

    // 2. Export Trade History
    const tradesToExport = closedTrades || [];
    if (tradesToExport.length > 0) {
      const tradeHeaders = ['ID', 'Pane ID', 'Symbol', 'Direction', 'Quantity', 'Entry Price', 'Exit Price', 'P&L ($)', 'P&L (%)', 'Exit Time'];
      const tradeRows = tradesToExport.map(t => [
        t.id,
        t.paneId,
        t.symbol,
        t.direction,
        t.quantity,
        t.entryPrice,
        t.exitPrice || 0,
        t.pnl || 0,
        t.pnlPercent || 0,
        t.exitTime ? new Date(t.exitTime * 1000).toISOString() : ''
      ]);
      const tradeCsvContent = [
        tradeHeaders.join(','),
        ...tradeRows.map(r => r.map(val => `"${val}"`).join(','))
      ].join('\n');

      const tradeBlob = new Blob([tradeCsvContent], { type: 'text/csv;charset=utf-8;' });
      const tradeUrl = URL.createObjectURL(tradeBlob);
      const tradeLink = document.createElement('a');
      tradeLink.setAttribute('href', tradeUrl);
      tradeLink.setAttribute('download', `trade_history_${Date.now()}.csv`);
      document.body.appendChild(tradeLink);
      tradeLink.click();
      document.body.removeChild(tradeLink);
    }

    // 3. Export Active Trade Data (positions)
    const activePositions = positions || [];
    if (activePositions.length > 0) {
      const activeHeaders = ['ID', 'Pane ID', 'Symbol', 'Direction', 'Quantity', 'Entry Price', 'Current Price', 'P&L ($)', 'P&L (%)'];
      const activeRows = activePositions.map(p => [
        p.id,
        p.paneId,
        p.symbol,
        p.direction,
        p.quantity,
        p.entryPrice,
        p.exitPrice || p.entryPrice,
        p.pnl || 0,
        p.pnlPercent || 0
      ]);
      const activeCsvContent = [
        activeHeaders.join(','),
        ...activeRows.map(r => r.map(val => `"${val}"`).join(','))
      ].join('\n');

      const activeBlob = new Blob([activeCsvContent], { type: 'text/csv;charset=utf-8;' });
      const activeUrl = URL.createObjectURL(activeBlob);
      const activeLink = document.createElement('a');
      activeLink.setAttribute('href', activeUrl);
      activeLink.setAttribute('download', `active_positions_${Date.now()}.csv`);
      document.body.appendChild(activeLink);
      activeLink.click();
      document.body.removeChild(activeLink);
    }
  };

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="flex flex-col items-center justify-center py-6 border-b border-[#2e3242] bg-[#121620]">
        {mode === 'backtest' ? (
          <Activity className="w-10 h-10 text-blue-400 mb-3" />
        ) : (
          <Target className="w-10 h-10 text-emerald-400 mb-3" />
        )}
        <h3 className="font-bold text-gray-100 tracking-wide">QUANT ASSISTANT</h3>
        <p className="text-[10px] text-gray-500 font-mono mt-1 uppercase tracking-wider">
          {mode === 'backtest' ? 'Strategy Backtester' : 'Auto-Trading Module'}
        </p>
      </div>

      <div className="p-4 flex-1 flex flex-col overflow-y-auto">
        <div className="p-1 space-y-6">
          
          {/* Backtester Section */}
          {mode === 'backtest' && (
          <div className="bg-[#121620] border border-[#2e3242] rounded-lg p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h4 className="text-[11px] text-gray-400 font-mono uppercase mb-4 flex items-center gap-2">
               <Activity className="w-4 h-4 text-blue-400" />
               Strategy Backtester
            </h4>
            <p className="text-[10px] text-gray-500 mb-4 leading-relaxed">
              Evaluate the performance of the active algorithm over historical data for {symbol} ({timeframe}) to measure the projected win-rate and identify optimal parameters.
            </p>
            <button 
              onClick={runBacktest}
              className="w-full mb-3 flex items-center justify-center py-2.5 rounded text-xs font-bold font-sans tracking-wide cursor-pointer text-gray-300 border border-gray-600 bg-gray-800 hover:bg-gray-700 transition-colors"
            >
              Run Quick Backtest
            </button>

            {/* Simulated Friction Parameters Control Panel */}
            <div className="bg-[#1a1e29] border border-[#2e3242] rounded-lg p-3 mb-3">
              <button 
                onClick={() => setShowFrictionSettings(!showFrictionSettings)}
                className="w-full flex items-center justify-between text-[10px] uppercase font-mono text-gray-400 font-bold focus:outline-none cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Settings className="w-3.5 h-3.5 text-blue-400" />
                  Simulated Friction Parameters
                </span>
                <span className="text-blue-400">{showFrictionSettings ? 'Collapse' : 'Expand'}</span>
              </button>
              
              {showFrictionSettings && (
                <div className="mt-3 space-y-3 pt-2 border-t border-[#2e3242]/50 animate-in fade-in duration-200">
                  <div>
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                      <span>Initial Capital</span>
                      <span className="font-mono font-bold text-gray-200">${initialCapital.toLocaleString()}</span>
                    </div>
                    <input 
                      type="range" 
                      min="1000" 
                      max="100000" 
                      step="1000"
                      value={initialCapital} 
                      onChange={(e) => setInitialCapital(Number(e.target.value))}
                      className="w-full accent-blue-500 h-1 bg-[#121620] rounded-lg cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                        <span>Maker Fee</span>
                        <span className="font-mono text-gray-200">{(makerFee * 100).toFixed(2)}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="0.01" 
                        step="0.0005"
                        value={makerFee} 
                        onChange={(e) => setMakerFee(Number(e.target.value))}
                        className="w-full accent-blue-500 h-1 bg-[#121620] rounded-lg cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                        <span>Taker Fee</span>
                        <span className="font-mono text-gray-200">{(takerFee * 100).toFixed(2)}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="0.01" 
                        step="0.0005"
                        value={takerFee} 
                        onChange={(e) => setTakerFee(Number(e.target.value))}
                        className="w-full accent-blue-500 h-1 bg-[#121620] rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                        <span>Slippage</span>
                        <span className="font-mono text-gray-200">{slippageBps} bps</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="50" 
                        step="1"
                        value={slippageBps} 
                        onChange={(e) => setSlippageBps(Number(e.target.value))}
                        className="w-full accent-blue-500 h-1 bg-[#121620] rounded-lg cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                        <span>Latency</span>
                        <span className="font-mono text-gray-200">{latencyMs} ms</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="1000" 
                        step="50"
                        value={latencyMs} 
                        onChange={(e) => setLatencyMs(Number(e.target.value))}
                        className="w-full accent-blue-500 h-1 bg-[#121620] rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>

                  {pane.pineStrategy?.active && (
                    <div className="flex items-center gap-2 pt-1">
                      <input 
                        type="checkbox" 
                        id="runWfoCheckbox"
                        checked={runWfo}
                        onChange={(e) => setRunWfo(e.target.checked)}
                        className="rounded border-gray-700 bg-gray-900 text-blue-500 focus:ring-blue-500/20 cursor-pointer"
                      />
                      <label htmlFor="runWfoCheckbox" className="text-[10px] text-gray-400 cursor-pointer font-sans select-none">
                        Execute Walk-Forward Optimization (WFO)
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button 
              onClick={runBacktest}
              className="w-full mb-3 flex items-center justify-center py-2.5 rounded text-xs font-bold font-sans tracking-wide cursor-pointer text-gray-300 border border-gray-600 bg-gray-800 hover:bg-gray-700 transition-colors"
            >
              Run High-Fidelity Backtest
            </button>

            {btError && (
              <div className="mb-3 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded text-[11px] text-amber-300 leading-relaxed font-sans">
                <span className="font-bold text-amber-400">Backtest Note:</span> {btError}
              </div>
            )}

            {!btResult && (
              <div className="flex flex-col items-center justify-center p-6 border border-[#2e3242] border-dashed rounded-lg bg-[#0d1017]/50 my-3">
                <Activity className="w-8 h-8 text-gray-600 mb-2" />
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">No Active Results</span>
                <span className="text-[9px] text-gray-500 text-center mt-1 leading-normal max-w-[220px]">
                  Press "Run High-Fidelity Backtest" above to evaluate this strategy over historical data under realistic friction models.
                </span>
              </div>
            )}

            {btResult && (
              <div className="mt-4 bg-[#0d1017] border border-[#2e3242] rounded-lg p-3 animate-in fade-in duration-300">
                <h5 className="text-[11px] font-bold text-gray-200 mb-3 border-b border-[#2e3242] pb-2">Historical Results</h5>
                <div className="grid grid-cols-2 gap-2 text-[10px] mb-4">
                  <div className="bg-[#1a1e29] p-2.5 rounded border border-[#2e3242]">
                    <div className="text-gray-500 mb-1 font-mono uppercase">Total Signals</div>
                    <div className="text-gray-200 font-mono text-sm">{btResult.total}</div>
                  </div>
                  <div className="bg-[#1a1e29] p-2.5 rounded border border-[#2e3242] flex flex-col justify-between">
                    <div className="text-gray-500 mb-1 font-mono uppercase">Win Rate</div>
                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-sm font-bold ${parseFloat(btResult.rateStr as string) >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {btResult.rateStr}
                      </span>
                      {btResult.prevRateVal !== undefined && btResult.prevRateVal !== btResult.rateVal && (
                        <div className={`text-[9px] font-mono font-bold px-1 rounded ${btResult.rateVal > btResult.prevRateVal ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                          {btResult.rateVal > btResult.prevRateVal ? '▲' : '▼'} {Math.abs((btResult.rateVal - btResult.prevRateVal) * 100).toFixed(1)}%
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-[#1a1e29] p-2.5 rounded border border-[#2e3242] mb-4">
                  <div className="text-gray-500 mb-2 font-mono uppercase text-[10px]">Latest Signal ({btResult.lastSignalType})</div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300 font-mono text-[10px]">{btResult.lastSignalTime}</span>
                    <span className={`font-bold font-mono text-[10px] ${
                      btResult.lastSignalOutcome === 'WIN' ? 'text-emerald-400' :
                      btResult.lastSignalOutcome === 'LOSS' ? 'text-rose-400' :
                      'text-blue-400'
                    }`}>
                      {btResult.lastSignalOutcome}
                    </span>
                  </div>
                </div>

                {detailedStats && (
                  <div className="space-y-2 border-t border-[#2e3242] pt-3 mt-3">
                    <h6 className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">Friction Audit Details</h6>
                    <div className="grid grid-cols-2 gap-1.5 text-[9px] font-mono text-gray-300">
                      <div className="bg-[#121620] p-1.5 rounded border border-[#2e3242]/50 flex justify-between">
                        <span className="text-gray-500">Gross Return:</span>
                        <span className={detailedStats.grossCapital >= initialCapital ? 'text-emerald-400' : 'text-rose-400'}>
                          ${(detailedStats.grossCapital - initialCapital).toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-[#121620] p-1.5 rounded border border-[#2e3242]/50 flex justify-between">
                        <span className="text-gray-500">Net Return:</span>
                        <span className={detailedStats.finalCapital >= initialCapital ? 'text-emerald-400' : 'text-rose-400'}>
                          ${(detailedStats.finalCapital - initialCapital).toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-[#121620] p-1.5 rounded border border-[#2e3242]/50 flex justify-between">
                        <span className="text-gray-500">Total Fees:</span>
                        <span className="text-amber-400">${detailedStats.totalFeesPaid.toFixed(2)}</span>
                      </div>
                      <div className="bg-[#121620] p-1.5 rounded border border-[#2e3242]/50 flex justify-between">
                        <span className="text-gray-500">Slippage Paid:</span>
                        <span className="text-amber-400">${detailedStats.totalSlippagePaid.toFixed(2)}</span>
                      </div>
                      <div className="bg-[#121620] p-1.5 rounded border border-[#2e3242]/50 flex justify-between">
                        <span className="text-gray-500">Max Drawdown:</span>
                        <span className="text-rose-400">{(detailedStats.maxDrawdown * 100).toFixed(2)}%</span>
                      </div>
                      <div className="bg-[#121620] p-1.5 rounded border border-[#2e3242]/50 flex justify-between">
                        <span className="text-gray-500">Profit Factor:</span>
                        <span className={detailedStats.profitFactor >= 1.5 ? 'text-emerald-400' : 'text-yellow-400'}>
                          {detailedStats.profitFactor.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Render WFO Results if available */}
                {wfoResults && wfoResults.length > 0 && (
                  <div className="mt-4 border-t border-[#2e3242] pt-3 animate-in fade-in duration-300">
                    <div className="flex items-center gap-1 mb-2">
                      <BarChart2 className="w-3.5 h-3.5 text-amber-400" />
                      <h6 className="text-[10px] font-mono text-amber-300 uppercase font-bold tracking-wider">Walk-Forward Results</h6>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[9px] font-mono text-gray-300 border-collapse">
                        <thead>
                          <tr className="border-b border-[#2e3242] text-gray-500">
                            <th className="py-1 pr-1">Window</th>
                            <th className="py-1 px-1">IS WR / Profit</th>
                            <th className="py-1 pl-1">OOS WR / Profit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {wfoResults.map((r, idx) => (
                            <tr key={idx} className="border-b border-[#2e3242]/30 hover:bg-[#1a1e29]">
                              <td className="py-1 text-gray-400" title={r.outOfSampleRange}>W{r.windowIndex}</td>
                              <td className="py-1 px-1 text-gray-300">{(r.inSampleWinRate * 100).toFixed(0)}% / {r.inSampleProfitPercent >= 0 ? '+' : ''}{r.inSampleProfitPercent.toFixed(1)}%</td>
                              <td className={`py-1 pl-1 font-bold ${r.outOfSampleWinRate >= 0.5 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {(r.outOfSampleWinRate * 100).toFixed(0)}% / {r.outOfSampleProfitPercent >= 0 ? '+' : ''}{r.outOfSampleProfitPercent.toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[8px] text-gray-500 mt-2 leading-normal">
                      *In-Sample (IS) is 80% rolling length for parameter tuning. Out-of-Sample (OOS) is the subsequent 20% validation window.
                    </p>
                  </div>
                )}

                <div className="bg-blue-500/10 border border-blue-500/20 p-2.5 rounded text-[10.5px] text-blue-200 leading-relaxed font-sans mt-3">
                   <span className="font-bold text-blue-400">Quant AI:</span> {btResult.suggestion}
                </div>
              </div>
            )}
          </div>
          )}

          {/* AI Sweep & Strategy Optimizer (Phase 3 Optimization Engine) */}
          {mode === 'backtest' && (
          <div className="bg-[#121620] border border-[#2e3242] rounded-lg p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h4 className="text-[11px] text-gray-400 font-mono uppercase mb-3 flex items-center gap-2">
               <Sparkles className="w-4 h-4 text-amber-450 animate-pulse" />
               Parameter Optimizer Sweep
            </h4>
            <p className="text-[10px] text-gray-500 mb-4 leading-relaxed">
               Iterate over a high-dimensional grid matrix of parameters for {symbol} to discover mathematically optimal signal bounds.
            </p>

            <div className="mb-4">
               <label className="text-[9px] font-mono uppercase text-gray-400 mb-1.5 block">Optimization Objective</label>
               <div className="grid grid-cols-3 gap-1.5">
                 {(['balanced', 'winrate', 'profit'] as const).map((goal) => (
                   <button
                     key={goal}
                     onClick={() => setOptGoal(goal)}
                     className={`py-1.5 px-1 rounded text-[9px] font-bold uppercase tracking-wider border font-sans cursor-pointer transition-all ${
                       optGoal === goal 
                         ? 'bg-amber-600/20 border-amber-500/60 text-amber-300' 
                         : 'bg-[#181c26] border-gray-800 text-gray-500 hover:text-gray-300'
                     }`}
                   >
                     {goal === 'winrate' ? 'Max Winrate' : goal === 'profit' ? 'Max Profit' : 'Balanced'}
                   </button>
                 ))}
               </div>
            </div>

            <button
               onClick={runOptimization}
               disabled={isOptimizing || data.length < 50}
               className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded text-xs font-bold font-sans tracking-wide cursor-pointer text-gray-200 border border-amber-500/30 bg-amber-600/15 hover:bg-amber-600/25 transition-all duration-200 disabled:opacity-50"
            >
               {isOptimizing ? (
                 <>
                   <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                   <span className="font-mono text-[10px] text-amber-300">{optStep}</span>
                 </>
               ) : (
                 <>
                   <Cpu className="w-4 h-4 text-amber-400" />
                   Run Parameter Optimizer
                 </>
               )}
            </button>

            {optResults && optResults.length > 0 && (
              <div className="mt-4 space-y-3 animate-in fade-in duration-400">
                <div className="flex items-center justify-between border-b border-[#2e3242] pb-1.5 mb-1.5">
                  <span className="text-[9.5px] font-mono text-amber-400 font-bold uppercase tracking-wider">Top Recommended Ports</span>
                  <span className="text-[8px] font-mono text-gray-500 uppercase">{optGoal.toUpperCase()} SORTED</span>
                </div>

                <div className="space-y-2">
                  {optResults.map((res, index) => (
                    <div 
                      key={index}
                      className={`bg-[#0d1017] border rounded-md p-2.5 flex items-center justify-between transition-all ${
                        appliedIndex === index ? 'border-emerald-500/40 bg-emerald-950/10' : 'border-[#2e3242]'
                      }`}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-1.5">
                          {res.displayParams.map((p, pidx) => (
                            <span key={pidx} className="text-[10px] font-mono text-gray-300">
                              <span className="text-gray-500">{p.key}:</span> {p.value}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-4 text-[9px] font-mono">
                          <span className="text-gray-500">
                            WR: <span className={`font-bold ${parseFloat(res.winRate) >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{res.winRate}</span>
                          </span>
                          <span className="text-gray-500">
                            TRADES: <span className="text-gray-300 font-bold">{res.totalTrades}</span>
                          </span>
                          <span className="text-gray-500">
                            PROFIT: <span className={`font-bold ${res.profitVal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{res.profitIndex}</span>
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleApplyConfig(res, index)}
                        className={`py-1.5 px-3 rounded text-[9.5px] font-bold uppercase tracking-wider cursor-pointer border shrink-0 transition-all ${
                          appliedIndex === index 
                            ? 'bg-emerald-600/20 border-emerald-500/80 text-emerald-300'
                            : 'bg-gray-800/80 border-gray-700 text-gray-300 hover:bg-gray-700'
                        }`}
                      >
                        {appliedIndex === index ? (
                          <span className="flex items-center gap-1"><Check className="w-3 h-3 text-emerald-400" /> Applied</span>
                        ) : (
                          "Apply"
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}

          {/* Auto Trade Section */}
          {mode === 'autotrade' && (
          <div className="bg-[#121620] border border-[#2e3242] rounded-lg p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h4 className="text-[11px] text-gray-400 font-mono uppercase mb-3 flex items-center gap-2">
               <Target className="w-4 h-4 text-emerald-400" />
               Paper Auto-Trading (Simulated)
            </h4>
            <div className="bg-yellow-950/20 border border-yellow-900/40 rounded p-2.5 mb-3">
              <p className="text-[9px] text-amber-400 font-mono flex items-center gap-1.5 leading-normal">
                <span>⚠️</span>
                <span><strong>SAFE ENVIRONMENT DISCLAIMER:</strong> All order routing executes against simulated virtual paper accounts. No live API keys or capital assets are at risk.</span>
              </p>
            </div>
            <p className="text-[10px] text-gray-400 mb-4 leading-relaxed">
              When active, the Paper Auto-Trader will automatically execute market orders when SmartSignals trigger on any open chart pane.
            </p>
            <div
              onClick={() => setAutoTradeEnabled(!autoTradeEnabled)}
              className={`w-full py-3 rounded text-xs font-bold font-sans uppercase tracking-wide cursor-pointer transition-all border select-none ${
                  autoTradeEnabled 
                  ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/50 hover:bg-emerald-600/30' 
                  : 'bg-[#1a1e29] text-gray-400 border-[#2e3242] hover:bg-[#252a36]'
              }`}
            >
                <div className="flex items-center justify-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${autoTradeEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`}/>
                  {autoTradeEnabled ? 'Auto-Trading Active' : 'Enable Auto-Trading'}
                </div>
            </div>
          </div>
          )}

          {/* Quant Data Exporter Section */}
          <div className="bg-[#121620] border border-[#2e3242] rounded-lg p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h4 className="text-[11px] text-gray-400 font-mono uppercase mb-4 flex items-center gap-2">
               <Download className="w-4 h-4 text-violet-450" />
               Quant Data Package Exporter
            </h4>
            <p className="text-[10px] text-gray-500 mb-4 leading-relaxed">
              Generate and download standardized CSV data packages—comprising chart candles, trade history ledger, and current open positions—specifically formatted for quant backtesting engines or machine learning model training.
            </p>
            <button 
              onClick={handleExportQuantData}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded text-xs font-bold font-sans tracking-wide cursor-pointer text-gray-355 border border-violet-500/40 bg-violet-600/20 hover:bg-violet-600/30 hover:border-violet-500/60 transition-all duration-200"
            >
              <Download className="w-4 h-4 text-violet-400 animate-pulse" />
              Export Quant Data Pack
            </button>
          </div>
          
        </div>
      </div>
    </div>
  );
};
