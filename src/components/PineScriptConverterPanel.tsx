import React, { useState, useMemo } from 'react';
import { authenticatedFetch } from '../utils/api';
import { 
  Sparkles, Sliders, Play, Code, CheckCircle, Info, RefreshCw, AlertTriangle, PlayCircle, BookOpen, Layers
} from 'lucide-react';
import { ChartPaneState, CandleData } from '../types';
import { runPineStrategyFull } from '../utils/pineRunner';
import { validatePineSyntax, dryRunStrategyInWorker } from '../utils/pineValidator';
import { KILLER_IDM_PRESET } from '../utils/killerIdmPreset';

interface PineScriptConverterPanelProps {
  pane: ChartPaneState;
  candles?: CandleData[];
  onUpdatePane: (changes: Partial<ChartPaneState>) => void;
  onRunBacktestRequest?: () => void;
}

export const PINE_PRESETS = [
  {
    name: "EMA Golden/Death Cross with RSI Confirmation",
    code: `//@version=5
strategy("EMA Trend Follower", overlay=true)

fastPeriod = input.int(10, title="Fast EMA Period", minval=2, maxval=100)
slowPeriod = input.int(30, title="Slow EMA Period", minval=5, maxval=200)
rsiLen = input.int(14, title="RSI Filter Length")
rsiMin = input.int(45, title="RSI Trend Min Threshold")

fastEMA = ta.ema(close, fastPeriod)
slowEMA = ta.ema(close, slowPeriod)
rsiVal = ta.rsi(close, rsiLen)

buySignal = ta.crossover(fastEMA, slowEMA) and rsiVal > rsiMin
sellSignal = ta.crossunder(fastEMA, slowEMA)

if (buySignal)
    strategy.entry("Long", strategy.long)
if (sellSignal)
    strategy.close("Long")`
  },
  {
    name: "RSI Mean Reversion with ATR Take Profit / Stop Loss",
    code: `//@version=5
strategy("RSI ATR Reversion", overlay=true)

rsiLength = input.int(14, title="RSI Length", minval=2, maxval=50)
overbought = input.int(70, title="RSI Overbought", minval=50, maxval=90)
oversold = input.int(30, title="RSI Oversold", minval=10, maxval=50)
atrPeriod = input.int(14, title="ATR Volatility Length")

rsiVal = ta.rsi(close, rsiLength)
valATR = ta.atr(atrPeriod)

buyEntry = ta.crossunder(rsiVal, oversold)
sellEntry = ta.crossover(rsiVal, overbought)

if (buyEntry)
    strategy.entry("BuyReversion", strategy.long, tp=close + 2.5 * valATR, sl=close - 1.5 * valATR)
if (sellEntry)
    strategy.entry("SellReversion", strategy.short, tp=close - 2.5 * valATR, sl=close + 1.5 * valATR)`
  },
  {
    name: "Bollinger Bands Squeeze Breakout",
    code: `//@version=5
strategy("BB Breakout Squeeze", overlay=true)

bbLength = input.int(20, title="BB Indicator Length")
mult = input.float(2.0, title="BB StdDev Multiplier", step=0.1)
rsiFilter = input.int(50, title="RSI Direction Filter")

[basis, dev] = ta.bb(close, bbLength, mult)
upper = basis + dev
lower = basis - dev
rsiVal = ta.rsi(close, 14)

isBreakoutHigh = ta.crossover(close, upper) and rsiVal > rsiFilter
isBreakoutLow = ta.crossunder(close, lower) and rsiVal < rsiFilter

if (isBreakoutHigh)
    strategy.entry("Call", strategy.long)
if (isBreakoutLow)
    strategy.entry("Put", strategy.short)`
  },
  {
    name: "Smart Money Concepts PRO v2 (SMC PRO)",
    code: `// © PersonalConcentrat
// =====================================================================
//  Smart Money Concepts PRO v2.0  -  Pine Script v6
//  OB + FVG + BOS/CHoCH + Liquidity + EQH/EQL + Premium/Discount +
//  Breakers + HTF bias + Volume filter + Confluence entry signals
// =====================================================================

//@version=6
indicator("Smart Money Concepts PRO v2 [OB+FVG+BOS/CHoCH+Liq+EQH/EQL+P/D+Breakers+HTF]",
  shorttitle      = "SMC PRO v2",
  overlay         = true,
  max_boxes_count = 500,
  max_lines_count = 500,
  max_labels_count= 500)

// Inputs
swingLen    = input.int(10, "Swing length (pivot lookback)")
showSwings  = input.bool(true,  "Show HH / LL points")
showBOS     = input.bool(true,  "Show BOS")
showCHoCH   = input.bool(true,  "Show CHoCH")
compactMode = input.bool(false, "Compact mode")
showTrendBG = input.bool(false, "Highlight background by trend")
bullCol     = input.color(#26a69a, "Bullish structure color")
bearCol     = input.color(#ef5350, "Bearish structure color")

useHtf      = input.bool(true,   "Use HTF trend filter")
htfRes      = input.timeframe("240", "HTF timeframe")
htfFast     = input.int(21, "Fast EMA (HTF)")
htfSlow     = input.int(50, "Slow EMA (HTF)")

showOB       = input.bool(true,   "Show Order Blocks")
obMaxCount   = input.int(5,       "Max active OBs")
obMitigation = input.string("Wick","Mitigation by", options=["Wick","Close"])
obVolFilter  = input.bool(true,   "Only OBs with elevated volume")
volMult      = input.float(1.5,   "Volume multiplier")
bullOBCol    = input.color(color.new(#26a69a, 80), "Bullish OB color")
bearOBCol    = input.color(color.new(#ef5350, 80), "Bearish OB color")
obBorder     = input.bool(true,   "Border around OB")

showBR       = input.bool(true,   "Show Breaker Blocks")
brMaxCount   = input.int(5,       "Max active Breakers")
bullBRCol    = input.color(color.new(#2962ff, 80), "Bullish Breaker color")
bearBRCol    = input.color(color.new(#ff6d00, 80), "Bearish Breaker color")

showFVG     = input.bool(true,  "Show FVG")
fvgMaxCount = input.int(10,     "Max active FVGs")
fvgMinAtr   = input.float(0.25, "Min FVG size (x ATR14)")
fvgDisp     = input.bool(true,  "Require displacement")
fvgDispMult = input.float(0.5,  "Min candle body (x ATR14)")
bullFVGCol  = input.color(color.new(#4caf50, 80), "Bullish FVG color")
bearFVGCol  = input.color(color.new(#ff9800, 80), "Bearish FVG color")

showLiq     = input.bool(true,  "Show sweep signals")
liqVolConf  = input.bool(false, "Only sweeps with elevated volume")
liqLabel    = input.string("Arrow", "Label type", options=["Arrow","Text"])
bullLiqCol  = input.color(#26a69a, "Bullish sweep color (low grab)")
bearLiqCol  = input.color(#ef5350, "Bearish sweep color (high grab)")

showEQ      = input.bool(true,  "Show EQH/EQL")
eqTolAtr    = input.float(0.15, "Tolerance (x ATR14)")
eqCol       = input.color(color.new(#9c27b0, 30), "EQH/EQL line color")

showPD      = input.bool(true,  "Show P/D zones")
pdExtend    = input.int(30,     "Zone length (bars to the right)")
premiumCol  = input.color(color.new(#ef5350, 92), "Premium zone color")
discountCol = input.color(color.new(#26a69a, 92), "Discount zone color")
eqCol2      = input.color(color.new(#ffc107, 50), "Equilibrium line color")

showSig     = input.bool(true,  "Show LONG / SHORT signals")
sigNeedHtf  = input.bool(true,  "Require HTF agreement")
sigNeedZone = input.bool(true,  "Require correct P/D zone")
bullSigCol  = input.color(#00e676, "LONG signal color")
bearSigCol  = input.color(#ff1744, "SHORT signal color")

// State & Calculations
atr14 = ta.atr(14)
volSma = ta.sma(volume, 20)
strongVolNow = volume > volSma * volMult

ph = ta.pivothigh(high, swingLen, swingLen)
pl = ta.pivotlow(low, swingLen, swingLen)

// High & Low sweep logic
bearSweep = showLiq and high > ta.highest(high, swingLen)[1] and close < ta.highest(high, swingLen)[1]
bullSweep = showLiq and low < ta.lowest(low, swingLen)[1] and close > ta.lowest(low, swingLen)[1]

// Order Blocks
tapBullOB = low <= ta.lowest(low, swingLen)[1]
tapBearOB = high >= ta.highest(high, swingLen)[1]

// Signals
longSignal = tapBullOB and close > open
shortSignal = tapBearOB and close < open

plotshape(longSignal, title="LONG", style=shape.labelup, location=location.belowbar, color=bullSigCol, text="LONG")
plotshape(shortSignal, title="SHORT", style=shape.labeldown, location=location.abovebar, color=bearSigCol, text="SHORT")`
  },
  {
    name: "Killer + IDM Confluence Strategy",
    code: KILLER_IDM_PRESET
  }
];

export const PineScriptConverterPanel: React.FC<PineScriptConverterPanelProps> = ({ 
  pane, 
  candles,
  onUpdatePane, 
  onRunBacktestRequest 
}) => {
  const [pineCode, setPineCode] = useState<string>(PINE_PRESETS[0].code);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const activeStrategy = pane.pineStrategy;

  const pineStrategyOutput = useMemo(() => {
    if (activeStrategy?.active && candles && candles.length > 20) {
      return runPineStrategyFull(candles, activeStrategy);
    }
    return null;
  }, [candles, activeStrategy]);

  const compiledDashboards = pineStrategyOutput?.dashboards || [];

  const handleConvert = async () => {
    if (!pineCode.trim()) {
      setError("Please paste or write some Pine Script before converting.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    // 1. Syntax Validation Layer
    const syntaxReport = validatePineSyntax(pineCode);
    if (!syntaxReport.valid) {
      setError(`Syntax Validation Failed: ${syntaxReport.error}`);
      setLoading(false);
      return;
    }

    try {
      const response = await authenticatedFetch('/api/pinescript/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pineCode }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server returned error status ${response.status}`);
      }

      const strategyResult = await response.json();
      
      // Inject standard custom value tracker
      const updatedParams = (strategyResult.parameters || []).map((p: any) => ({
        ...p,
        value: p.default // Initial value set to default
      }));

      // 2. Dry Run Simulation Layer
      if (candles && candles.length > 0) {
        setSuccessMsg("Performing sandboxed dry run of converted strategy...");
        const dryRunReport = await dryRunStrategyInWorker(candles, strategyResult.jsCode, updatedParams);
        if (!dryRunReport.success) {
          throw new Error(`Dry Run Execution Failed: ${dryRunReport.error || 'Syntax or runtime error in translated JavaScript.'}`);
        }
      }

      onUpdatePane({
        pineStrategy: {
          name: strategyResult.name || "Converted Custom Strategy",
          description: strategyResult.description || "Generated from Pine Script input code.",
          parameters: updatedParams,
          jsCode: strategyResult.jsCode,
          pineCode: pineCode,
          active: true // Auto-activate upon successful compilation
        }
      });

      setSuccessMsg(`Compiled successfully and passed sandboxed dry run! "${strategyResult.name}" is now active as your signal provider on ${pane.symbol}.`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected compile error occurred inside the Gemini compiler.");
    } finally {
      setLoading(false);
    }
  };

  const handleSliderChange = (paramKey: string, newValue: number | boolean) => {
    if (!activeStrategy) return;

    const nextParams = activeStrategy.parameters.map(p => {
      if (p.key === paramKey) {
        return { ...p, value: newValue };
      }
      return p;
    });

    onUpdatePane({
      pineStrategy: {
        ...activeStrategy,
        parameters: nextParams
      }
    });
  };

  const handleToggleActive = (activeState: boolean) => {
    if (!activeStrategy) return;
    onUpdatePane({
      pineStrategy: {
        ...activeStrategy,
        active: activeState
      }
    });
  };

  return (
    <div id="pinescript-panel-container" className="flex flex-col h-full bg-[#121620] text-gray-100 text-xs">
      
      {/* Scrollable Content Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        
        {/* Banner */}
        <div className="bg-gradient-to-r from-blue-600/10 to-violet-600/10 border border-blue-500/20 p-3 rounded-lg">
          <div className="flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-semibold text-gray-200">Pine Script Strategy Compiler</h3>
              <p className="text-gray-400 mt-0.5 leading-relaxed text-[11px]">
                Paste any Pine Script strategy or custom indicators from TradingView. The Gemini AI Quant compiler converts the math and crossovers to live JavaScript variables and adjustable sliders instantly.
              </p>
            </div>
          </div>
        </div>

        {/* Input Pine Script Area */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-gray-200 tracking-wide flex items-center gap-1.5 uppercase text-[10px]">
              <Code className="w-3.5 h-3.5 text-blue-400" /> Input Pine Script
            </span>
            <div className="flex gap-1.5">
              <span className="text-[10px] text-gray-400">Presets:</span>
              <select 
                className="bg-[#1e2235] border border-gray-700/60 rounded px-1.5 py-0.5 text-[10px] text-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                onChange={(e) => {
                  const idx = parseInt(e.target.value);
                  if (!isNaN(idx)) setPineCode(PINE_PRESETS[idx].code);
                }}
              >
                {PINE_PRESETS.map((p, idx) => (
                  <option key={idx} value={idx}>
                    {p.name.length > 45 ? `${p.name.substring(0, 45)}...` : p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <textarea
            value={pineCode}
            onChange={(e) => setPineCode(e.target.value)}
            className="w-full h-48 bg-[#090b11] text-[#a6accd] font-mono text-[11px] p-3 rounded-md border border-gray-800 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 leading-relaxed overflow-y-auto"
            placeholder="//@version=5&#10;strategy('My Custom Strategy', overlay=true)..."
          />

          <button
            onClick={handleConvert}
            disabled={loading}
            className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-blue-800 disabled:to-indigo-800 rounded text-white font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all duration-150"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Compiling Pine to JS (Gemini API)...</span>
              </>
            ) : (
              <>
                <PlayCircle className="w-3.5 h-3.5" />
                <span>Compile & Activate Strategy</span>
              </>
            )}
          </button>
        </div>

        {/* Error or Success Toast Notifications */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 p-2.5 rounded text-red-400 leading-normal flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="text-[11px] font-mono">{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded text-emerald-400 leading-normal flex items-start gap-2 animate-fadeIn">
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="text-[11px] font-medium">{successMsg}</span>
          </div>
        )}

        {!activeStrategy && (
          <div className="flex flex-col items-center justify-center p-6 border border-gray-800 border-dashed rounded-lg bg-[#0d1017]/40 my-1">
            <Code className="w-8 h-8 text-gray-700 mb-2" />
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">No Active Strategy Loaded</span>
            <span className="text-[9px] text-gray-500 text-center mt-1 leading-normal max-w-[240px]">
              Select a preset template or paste your custom Pine Script above, then click <strong>Compile & Activate Strategy</strong>.
            </span>
          </div>
        )}

        {/* Dynamic Parameter Adjustments Side Drawer */}
        {activeStrategy && (
          <div className="bg-[#191d2c] border border-gray-800 rounded-lg p-3.5 space-y-3.5">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <h4 className="font-semibold text-emerald-400 text-sm">{activeStrategy.name}</h4>
                </div>
                <p className="text-gray-400 text-[10px] mt-1 italic leading-relaxed">
                  {activeStrategy.description}
                </p>
              </div>
              <button
                onClick={() => handleToggleActive(!activeStrategy.active)}
                className={`py-1 px-2.5 rounded text-[10px] font-semibold transition-colors shrink-0 cursor-pointer ${
                  activeStrategy.active 
                  ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                }`}
              >
                {activeStrategy.active ? "● Signal Source Active" : "○ Signal Source Paused"}
              </button>
            </div>

            {/* Adjustable sliders mapped to parsed parameters */}
            <div className="border-t border-gray-800 pt-3 space-y-3">
              <span className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-blue-400" /> Customizable Inputs ({activeStrategy.parameters.length})
              </span>

              {activeStrategy.parameters.length === 0 ? (
                <div className="text-gray-500 italic p-1">No custom parameters extracted from Pine entry.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {activeStrategy.parameters.map((param) => (
                    <div key={param.key} className="space-y-1 bg-[#0f1118]/50 p-2 rounded border border-gray-800/60">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-gray-300 font-medium">{param.label}</span>
                        <span className="text-blue-400 font-mono font-semibold">
                          {param.type === 'boolean' ? (param.value ? 'True' : 'False') : param.value}
                        </span>
                      </div>

                      {param.type === 'number' ? (
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={param.min !== undefined ? param.min : 1}
                            max={param.max !== undefined ? param.max : 100}
                            step={param.step !== undefined ? param.step : 1}
                            value={param.value !== undefined ? param.value : param.default}
                            onChange={(e) => handleSliderChange(param.key, parseFloat(e.target.value))}
                            className="flex-1 accent-blue-500 h-1 rounded-lg bg-gray-800 cursor-pointer"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 mt-1">
                          <input
                            type="checkbox"
                            checked={param.value !== undefined ? !!param.value : !!param.default}
                            onChange={(e) => handleSliderChange(param.key, e.target.checked)}
                            className="rounded border-gray-700 text-blue-500 focus:ring-0 bg-[#090b11] cursor-pointer"
                          />
                          <span className="text-[10px] text-gray-400">Toggle binary rule</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Live Strategy Dashboards / Indicators Status */}
            {compiledDashboards.length > 0 && (
              <div className="border-t border-gray-800 pt-3.5 space-y-3">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span> Compiled Table Dashboards ({compiledDashboards.length})
                </span>
                
                {compiledDashboards.map((dash, dIdx) => (
                  <div key={dIdx} className="bg-[#090b11]/80 p-2.5 rounded border border-gray-800 space-y-2">
                    <h5 className="font-semibold text-gray-200 text-[11px] border-b border-gray-800 pb-1.5 flex justify-between items-center">
                      <span>{dash.title}</span>
                      <span className="text-[8px] text-emerald-400 px-1 py-0.2 bg-emerald-500/10 border border-emerald-500/20 rounded font-bold uppercase tracking-wider">pine</span>
                    </h5>
                    
                    <div className="overflow-x-auto select-all max-h-60 scrollbar-thin">
                      <table className="w-full text-left text-[10px] font-mono leading-relaxed whitespace-nowrap">
                        <thead>
                          <tr className="border-b border-gray-800/80 text-gray-400">
                            {dash.headers.map((h, hIdx) => (
                              <th key={hIdx} className="pb-1 font-semibold pr-3">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/40">
                          {dash.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-blue-500/5">
                              {row.map((cell, cIdx) => {
                                // Dynamic styling based on signal outcomes and percentages
                                const isBullish = cell.toLowerCase().includes('bullish') || cell.toLowerCase().includes('long') || cell.includes('✓') || (cell.includes('%') && parseFloat(cell) > 50 && !cell.startsWith('-')) || (cell.includes('%') && parseFloat(cell) > 0 && !cell.startsWith('-') && !cell.includes('winrate') && !cell.includes('Standalone'));
                                const isBearish = cell.toLowerCase().includes('bearish') || cell.toLowerCase().includes('short') || cell.includes('✗') || (cell.includes('%') && parseFloat(cell) < 50 && !cell.startsWith('-') && cell !== '0 %' && (cell.includes('winrate') || cell.includes('rate'))) || cell.startsWith('-');
                                const isNeutral = cell.toLowerCase().includes('neutral');
                                
                                const textColor = isBullish 
                                  ? 'text-emerald-400 font-bold' 
                                  : isBearish 
                                  ? 'text-rose-400 font-bold' 
                                  : isNeutral 
                                  ? 'text-gray-400' 
                                  : 'text-gray-300';
                                
                                return (
                                  <td key={cIdx} className={`py-1.5 pr-3 ${textColor}`}>{cell}</td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Action Buttons to trigger execution/backtests */}
            <div className="border-t border-gray-800 pt-3 flex gap-2">
              <button
                onClick={onRunBacktestRequest}
                className="flex-1 py-1.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600 hover:text-white rounded flex items-center justify-center gap-1.5 font-semibold transition-all cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Run Strategy Backtest</span>
              </button>
            </div>
          </div>
        )}

        {/* Documentation Card on script design structure */}
        <div className="p-3 bg-[#1e2235]/40 border border-gray-800/60 rounded-lg space-y-2 text-[11px] leading-relaxed">
          <span className="font-semibold text-gray-300 flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-violet-400" /> Pine-to-Runtime Details
          </span>
          <p className="text-gray-400">
            Due to our dynamic parsing layer, standard crossover signals like <code className="text-blue-400 font-mono bg-blue-500/10 px-1 py-0.5 rounded">ta.crossover</code>, moving averages, and Welles Wilder indicators are compiled natively into lightweight calculations. Take-Profit and Stop-Loss orders map precisely onto the live canvas.
          </p>
          <div className="flex gap-4 text-[10px] text-gray-500 pt-1.5">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Buy ▲ Markers</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Sell ▼ Markers</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#1e2235]"></span> Offline Sandbox</span>
          </div>
        </div>

      </div>
    </div>
  );
};
