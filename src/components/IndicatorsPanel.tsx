import React, { useState, useMemo } from 'react';
import { Search, Sliders, X, Check, Settings, Info, RefreshCw, Eye, EyeOff, Loader2, AlertTriangle } from 'lucide-react';
import { IndicatorSettings, ChartPaneState, CandleData } from '../types';
import { authenticatedFetch } from '../utils/api';
import { PINE_PRESETS } from './PineScriptConverterPanel';
import { dryRunStrategyInWorker } from '../utils/pineValidator';

interface IndicatorsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  indicators: IndicatorSettings;
  onUpdateIndicators: (updated: Partial<IndicatorSettings>) => void;
  pane?: ChartPaneState;
  onUpdatePane?: (updated: Partial<ChartPaneState>) => void;
  candles?: CandleData[];
}

export const IndicatorsPanel: React.FC<IndicatorsPanelProps> = ({
  isOpen,
  onClose,
  indicators,
  onUpdateIndicators,
  pane,
  onUpdatePane,
  candles,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [compilingKey, setCompilingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Indicators database with metadata and config fields
  const indicatorList = useMemo(() => {
    const list = [
      {
        key: 'ema20',
        label: 'EMA 20',
        category: 'Moving Averages',
        desc: 'Fast exponential moving average for short-term trend direction.',
        hasSettings: true,
        settingsType: 'ema',
      },
      {
        key: 'ema50',
        label: 'EMA 50',
        category: 'Moving Averages',
        desc: 'Medium exponential moving average commonly used for mid-term trend bias.',
        hasSettings: true,
        settingsType: 'ema',
      },
      {
        key: 'ema80',
        label: 'EMA 80',
        category: 'Moving Averages',
        desc: 'Intermediate exponential moving average for dynamic support/resistance.',
        hasSettings: true,
        settingsType: 'ema',
      },
      {
        key: 'ema200',
        label: 'EMA 200',
        category: 'Moving Averages',
        desc: 'Slow exponential moving average serving as the major long-term baseline.',
        hasSettings: true,
        settingsType: 'ema',
      },
      {
        key: 'vwap',
        label: 'VWAP',
        category: 'Price / Volume',
        desc: 'Volume Weighted Average Price. Calculated from session start.',
        hasSettings: false,
      },
      {
        key: 'bollingerBands',
        label: 'Bollinger Bands',
        category: 'Volatility',
        desc: 'Standard-deviation volatility bands built around a 20 SMA.',
        hasSettings: false,
      },
      {
        key: 'ichimoku',
        label: 'Ichimoku Cloud',
        category: 'Trend Systems',
        desc: 'Comprehensive multi-line indicator representing equilibrium, momentum, and clouds.',
        hasSettings: false,
      },
      {
        key: 'rsi',
        label: 'Relative Strength Index (RSI)',
        category: 'Oscillators',
        desc: 'Oscillator tracking overbought (70) and oversold (30) conditions.',
        hasSettings: true,
        settingsType: 'rsi',
      },
      {
        key: 'macd',
        label: 'MACD',
        category: 'Oscillators',
        desc: 'Moving Average Convergence Divergence showing momentum trends.',
        hasSettings: true,
        settingsType: 'macd',
      },
      {
        key: 'cvd',
        label: 'Cumulative Delta',
        category: 'Order Flow',
        desc: 'Cumulative Volume Delta tracking buyer/seller imbalance cycles.',
        hasSettings: false,
      },
      {
        key: 'obvMacdDoubleMacd',
        label: 'OBV MACD + Double MACD Combined',
        category: 'Oscillators',
        desc: 'Hybrid system overlaying volume-weighted flow with twin trend scales.',
        hasSettings: false,
      },
      {
        key: 'killerIdm',
        label: '🔥 Killer + IDM Sweep Signals',
        category: 'Quant Tools',
        desc: 'Detects sweeps of key liquidity inducement points filtered by Supertrend and Braid confluences.',
        hasSettings: false,
      },
      {
        key: 'fractal',
        label: 'Fractals',
        category: 'Market Structure',
        desc: 'Highlights local turning-point high and low pivot points.',
        hasSettings: false,
      },
      {
        key: 'smartSignal',
        label: '🤖 SmartSignal AI Overlays',
        category: 'Quant Tools',
        desc: 'Advanced multi-factor quant strategy entry and exit overlay tags.',
        hasSettings: true,
        settingsType: 'smartSignal',
      },
      {
        key: 'smcOrderBlocks',
        label: 'Order Blocks (SMC)',
        category: 'Smart Money Concepts',
        desc: 'Highlights key institutional order block supply/demand boundaries.',
        hasSettings: false,
      },
      {
        key: 'smcLiquiditySweeps',
        label: 'Liquidity Sweeps (SMC)',
        category: 'Smart Money Concepts',
        desc: 'Traces stop-run sweeps of local extreme points.',
        hasSettings: false,
      },
      {
        key: 'volumeProfile',
        label: 'Volume Profile',
        category: 'Price / Volume',
        desc: 'Horizontal volume distribution at price bars for liquidity nodes.',
        hasSettings: true,
        settingsType: 'volumeProfile',
      },
      {
        key: 'fvg',
        label: 'Fair Value Gap (FVG)',
        category: 'Market Structure',
        desc: 'Identifies single-sided price displacement imbalances.',
        hasSettings: false,
      },
    ];

    // Dynamically append custom Pine Script presets
    PINE_PRESETS.forEach((preset, idx) => {
      list.push({
        key: `pine_preset_${idx}`,
        label: `🌲 ${preset.name}`,
        category: 'Algorithmic Strategies',
        desc: idx === 4
          ? 'Elite dual-layer confluence strategy fusing Supertrend/Braid filter map with Inducement Liquidity targets.'
          : idx === 3
          ? 'Advanced SMC Suite tracing supply/demand institutional order blocks, fair value gaps, and liquidity sweep trigger lines.'
          : 'High-fidelity algorithmic Pine Script strategy converted instantly by Gemini AI into reactive JavaScript signals.',
        hasSettings: false,
        settingsType: undefined,
      } as any);
    });

    return list;
  }, []);

  // Filter indicatorList based on search
  const filteredList = useMemo(() => {
    if (!searchTerm.trim()) return indicatorList;
    return indicatorList.filter(
      (ind) =>
        ind.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ind.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ind.desc.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm, indicatorList]);

  if (!isOpen) return null;

  const handleToggle = async (item: { key: string; label: string; desc: string }) => {
    const isPinePreset = item.key.startsWith('pine_preset_');
    if (isPinePreset) {
      if (!pane || !onUpdatePane) return;
      const presetIdx = parseInt(item.key.replace('pine_preset_', ''));
      const preset = PINE_PRESETS[presetIdx];
      const isActive = !!(pane.pineStrategy?.active && pane.pineStrategy.pineCode === preset.code);

      if (isActive) {
        // Toggle active off
        onUpdatePane({
          pineStrategy: {
            ...pane.pineStrategy!,
            active: false
          }
        });
      } else {
        // Turn on -> Compile via server!
        setCompilingKey(item.key);
        setError(null);
        try {
          const response = await authenticatedFetch('/api/pinescript/convert', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ pineCode: preset.code }),
          });

          if (!response.ok) {
            let errorMsg = `Server returned error status ${response.status}`;
            try {
              const contentType = response.headers.get('content-type');
              if (contentType && contentType.includes('application/json')) {
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg;
              } else {
                const text = await response.text();
                errorMsg = text || errorMsg;
              }
            } catch (e) {}
            throw new Error(errorMsg);
          }

          const strategyResult = await response.json();
          const updatedParams = (strategyResult.parameters || []).map((p: any) => ({
            ...p,
            value: p.default
          }));

          if (candles && candles.length > 0) {
            const dryRunReport = await dryRunStrategyInWorker(candles, strategyResult.jsCode, updatedParams);
            if (!dryRunReport.success) {
              throw new Error(`Dry Run Execution Failed: ${dryRunReport.error || 'Syntax or runtime error in translated JavaScript.'}`);
            }
          }

          onUpdatePane({
            pineStrategy: {
              name: strategyResult.name || item.label.replace('🌲 ', ''),
              description: strategyResult.description || item.desc,
              parameters: updatedParams,
              jsCode: strategyResult.jsCode,
              pineCode: preset.code,
              active: true
            }
          });
        } catch (err: any) {
          console.error(err);
          setError(err.message || "Failed to compile Pine script strategy.");
        } finally {
          setCompilingKey(null);
        }
      }
    } else {
      const currentVal = !!indicators[item.key as keyof IndicatorSettings];
      onUpdateIndicators({ [item.key]: !currentVal });
    }
  };

  const handleResetSettings = () => {
    onUpdateIndicators({
      emaPeriods: [20, 50, 80, 200],
      rsiLength: 14,
      macdParams: [12, 26, 9],
      volumeProfileBins: 40,
      smartSignalParams: {
        emaFast: 9,
        emaMed: 21,
        emaSlow: 50,
        rsiLength: 14,
        rsiBuyMin: 30,
        rsiBuyMax: 55,
        rsiSellMin: 45,
        rsiSellMax: 70,
        volRatio: 1.1,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-xs" onClick={onClose} />

      {/* Main Panel Container */}
      <div className="relative w-full max-w-lg h-[640px] max-h-[90vh] bg-[#171b26] border border-[#2a2e39] rounded-xl shadow-2xl flex flex-col overflow-hidden z-10 text-gray-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#2a2e39] bg-[#1e222f]/80">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-100">
              Indicators Manager
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetSettings}
              className="px-2 py-1 text-[9px] font-mono text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded transition-colors flex items-center gap-1 cursor-pointer"
              title="Reset parameters to factory defaults"
            >
              <RefreshCw className="w-2.5 h-2.5" />
              Reset All Params
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Input Bar */}
        <div className="p-3 bg-[#131722]/60 border-b border-[#2a2e39]/60 flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-2.5 text-gray-500">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Search indicators by name or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0e121a] border border-[#2a2e39] rounded px-9 py-2 text-xs text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono"
            />
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-300 font-mono cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 p-2.5 rounded text-red-400 leading-normal flex items-start gap-2 mb-2 animate-fadeIn">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="text-[11px] font-mono">{error}</span>
            </div>
          )}

          {filteredList.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-500 font-mono">
              No matching indicators found for "{searchTerm}"
            </div>
          ) : (
            filteredList.map((item) => {
              const isPinePreset = item.key.startsWith('pine_preset_');
              let isActive = false;
              if (isPinePreset) {
                const presetIdx = parseInt(item.key.replace('pine_preset_', ''));
                isActive = !!(pane?.pineStrategy?.active && pane?.pineStrategy?.pineCode === PINE_PRESETS[presetIdx].code);
              } else {
                isActive = !!indicators[item.key as keyof IndicatorSettings];
              }
              const isEditing = editingKey === item.key;

              return (
                <div
                  key={item.key}
                  className={`border rounded-lg transition-colors overflow-hidden ${
                    isActive
                      ? 'bg-[#1e222f]/45 border-[#3b82f6]/40'
                      : 'bg-[#131722]/40 border-[#2a2e39]/50'
                  }`}
                >
                  {/* Row content */}
                  <div className="p-3.5 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400 shadow-md' : 'bg-gray-600'}`} />
                        <span className="text-xs font-bold text-gray-100 tracking-tight">
                          {item.label}
                        </span>
                        <span className="text-[9px] text-gray-500 font-mono uppercase tracking-wider px-1.5 bg-gray-900 border border-gray-850 rounded">
                          {item.category}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1 leading-normal max-w-md">
                        {item.desc}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Settings trigger */}
                      {item.hasSettings && (
                        <button
                          onClick={() => setEditingKey(isEditing ? null : item.key)}
                          className={`p-1.5 rounded transition-colors cursor-pointer ${
                            isEditing
                              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-transparent'
                          }`}
                          title={`Adjust settings for ${item.label}`}
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Active switch */}
                      {compilingKey === item.key ? (
                        <div className="flex items-center justify-center w-14 h-6">
                          <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                        </div>
                      ) : (
                        <button
                          onClick={() => handleToggle(item)}
                          className={`w-14 h-6 rounded-full p-0.5 transition-colors duration-250 cursor-pointer flex relative ${
                            isActive ? 'bg-emerald-600' : 'bg-gray-800'
                          }`}
                        >
                          <div
                            className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-250 flex items-center justify-center ${
                              isActive ? 'translate-x-8' : 'translate-x-0'
                            }`}
                          >
                            {isActive ? (
                              <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                            ) : (
                              <div className="w-1 h-1 bg-gray-400 rounded-full" />
                            )}
                          </div>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Settings section inline */}
                  {isEditing && (
                    <div className="px-4 pb-4 pt-1 bg-[#0e121a]/60 border-t border-[#2a2e39]/40 text-xs text-gray-300">
                      <div className="font-mono text-[10px] text-blue-400 uppercase tracking-widest font-bold mb-3 flex items-center gap-1">
                        <Sliders className="w-3 h-3" /> Parameter Configurations
                      </div>
                      {item.settingsType === 'ema' && (
                        <div className="space-y-3.5">
                          <p className="text-[10px] text-gray-400 leading-normal">
                            Each active EMA period is customizable. Set length (number of candles) below:
                          </p>
                          <div className="grid grid-cols-4 gap-2">
                            {['EMA 20', 'EMA 50', 'EMA 80', 'EMA 200'].map((emaLbl, idx) => {
                              const currentVal = indicators.emaPeriods?.[idx] || (idx === 0 ? 20 : idx === 1 ? 50 : idx === 2 ? 80 : 200);
                              return (
                                <div key={emaLbl} className="space-y-1">
                                  <label className="text-[9px] font-mono text-gray-500">{emaLbl}</label>
                                  <input
                                    type="number"
                                    value={currentVal}
                                    min="1"
                                    max="1000"
                                    onChange={(e) => {
                                      const newPeriods = [...(indicators.emaPeriods || [20, 50, 80, 200])];
                                      newPeriods[idx] = Math.max(1, parseInt(e.target.value) || 1);
                                      onUpdateIndicators({ emaPeriods: newPeriods as [number, number, number, number] });
                                    }}
                                    className="w-full bg-[#131722] border border-[#2a2e39] rounded p-1.5 text-xs text-gray-100 font-mono outline-none focus:border-blue-500"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {item.settingsType === 'rsi' && (
                        <div className="space-y-2 max-w-sm">
                          <label className="text-[10px] font-mono text-gray-500">RSI Period Length</label>
                          <div className="flex items-center gap-3">
                            <input
                              type="range"
                              min="2"
                              max="100"
                              value={indicators.rsiLength || 14}
                              onChange={(e) => onUpdateIndicators({ rsiLength: parseInt(e.target.value) || 14 })}
                              className="flex-1 accent-blue-500 cursor-pointer h-1 bg-gray-800 rounded"
                            />
                            <span className="text-xs font-mono font-bold text-amber-400">{indicators.rsiLength || 14}</span>
                          </div>
                          <p className="text-[9px] text-gray-500 italic font-mono leading-tight">
                            Default is 14. Smaller values are faster and noisier; larger values are smoother.
                          </p>
                        </div>
                      )}

                      {item.settingsType === 'macd' && (
                        <div className="space-y-3">
                          <p className="text-[10px] text-gray-400">
                            Configure slow and fast moving averages, along with signal smoothing length:
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { label: 'Fast EMA', index: 0, defaultVal: 12 },
                              { label: 'Slow EMA', index: 1, defaultVal: 26 },
                              { label: 'Signal period', index: 2, defaultVal: 9 },
                            ].map((p) => {
                              const currentVal = indicators.macdParams?.[p.index] || p.defaultVal;
                              return (
                                <div key={p.label} className="space-y-1">
                                  <label className="text-[9px] font-mono text-gray-500">{p.label}</label>
                                  <input
                                    type="number"
                                    value={currentVal}
                                    min="1"
                                    max="200"
                                    onChange={(e) => {
                                      const newMacd = [...(indicators.macdParams || [12, 26, 9])];
                                      newMacd[p.index] = Math.max(1, parseInt(e.target.value) || 1);
                                      onUpdateIndicators({ macdParams: newMacd as [number, number, number] });
                                    }}
                                    className="w-full bg-[#131722] border border-[#2a2e39] rounded p-1.5 text-xs text-gray-100 font-mono outline-none focus:border-blue-500"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {item.settingsType === 'volumeProfile' && (
                        <div className="space-y-2 max-w-sm">
                          <label className="text-[10px] font-mono text-gray-500">Volume Profile Row Bins</label>
                          <div className="flex items-center gap-3">
                            <input
                              type="range"
                              min="10"
                              max="150"
                              step="5"
                              value={indicators.volumeProfileBins || 40}
                              onChange={(e) => onUpdateIndicators({ volumeProfileBins: parseInt(e.target.value) || 40 })}
                              className="flex-1 accent-blue-500 cursor-pointer h-1 bg-gray-800 rounded"
                            />
                            <span className="text-xs font-mono font-bold text-amber-400">{indicators.volumeProfileBins || 40} rows</span>
                          </div>
                          <p className="text-[9px] text-gray-500 italic font-mono leading-tight">
                            Determines the resolution of horizontal volume bars across the price chart.
                          </p>
                        </div>
                      )}

                      {item.settingsType === 'smartSignal' && (
                        <div className="space-y-3.5">
                          <p className="text-[10px] text-gray-400 leading-normal">
                            SmartSignals evaluate RSI and multi-period EMA momentum for triggers.
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <label className="text-[9px] font-mono text-gray-500">EMA Fast</label>
                              <input
                                type="number"
                                value={indicators.smartSignalParams?.emaFast || 9}
                                onChange={(e) => {
                                  const ss = { ...(indicators.smartSignalParams || { emaFast: 9, emaMed: 21, emaSlow: 50, rsiLength: 14, rsiBuyMin: 30, rsiBuyMax: 55, rsiSellMin: 45, rsiSellMax: 70, volRatio: 1.1 }) };
                                  ss.emaFast = Math.max(1, parseInt(e.target.value) || 1);
                                  onUpdateIndicators({ smartSignalParams: ss });
                                }}
                                className="w-full bg-[#131722] border border-[#2a2e39] rounded p-1.5 text-xs text-gray-100 font-mono outline-none focus:border-blue-500"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-mono text-gray-500">EMA Medium</label>
                              <input
                                type="number"
                                value={indicators.smartSignalParams?.emaMed || 21}
                                onChange={(e) => {
                                  const ss = { ...(indicators.smartSignalParams || { emaFast: 9, emaMed: 21, emaSlow: 50, rsiLength: 14, rsiBuyMin: 30, rsiBuyMax: 55, rsiSellMin: 45, rsiSellMax: 70, volRatio: 1.1 }) };
                                  ss.emaMed = Math.max(1, parseInt(e.target.value) || 1);
                                  onUpdateIndicators({ smartSignalParams: ss });
                                }}
                                className="w-full bg-[#131722] border border-[#2a2e39] rounded p-1.5 text-xs text-gray-100 font-mono outline-none focus:border-blue-500"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-mono text-gray-500">EMA Slow</label>
                              <input
                                type="number"
                                value={indicators.smartSignalParams?.emaSlow || 50}
                                onChange={(e) => {
                                  const ss = { ...(indicators.smartSignalParams || { emaFast: 9, emaMed: 21, emaSlow: 50, rsiLength: 14, rsiBuyMin: 30, rsiBuyMax: 55, rsiSellMin: 45, rsiSellMax: 70, volRatio: 1.1 }) };
                                  ss.emaSlow = Math.max(1, parseInt(e.target.value) || 1);
                                  onUpdateIndicators({ smartSignalParams: ss });
                                }}
                                className="w-full bg-[#131722] border border-[#2a2e39] rounded p-1.5 text-xs text-gray-100 font-mono outline-none focus:border-blue-500"
                              />
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3.5">
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-mono text-gray-500 block">RSI Buy Triggers ({indicators.smartSignalParams?.rsiBuyMin || 30} - {indicators.smartSignalParams?.rsiBuyMax || 55})</label>
                              <div className="flex gap-2">
                                <input
                                  type="number"
                                  value={indicators.smartSignalParams?.rsiBuyMin || 30}
                                  placeholder="Min"
                                  onChange={(e) => {
                                    const ss = { ...(indicators.smartSignalParams || { emaFast: 9, emaMed: 21, emaSlow: 50, rsiLength: 14, rsiBuyMin: 30, rsiBuyMax: 55, rsiSellMin: 45, rsiSellMax: 70, volRatio: 1.1 }) };
                                    ss.rsiBuyMin = parseInt(e.target.value) || 30;
                                    onUpdateIndicators({ smartSignalParams: ss });
                                  }}
                                  className="w-1/2 bg-[#131722] border border-[#2a2e39] rounded p-1 text-xs text-gray-100 font-mono outline-none"
                                />
                                <input
                                  type="number"
                                  value={indicators.smartSignalParams?.rsiBuyMax || 55}
                                  placeholder="Max"
                                  onChange={(e) => {
                                    const ss = { ...(indicators.smartSignalParams || { emaFast: 9, emaMed: 21, emaSlow: 50, rsiLength: 14, rsiBuyMin: 30, rsiBuyMax: 55, rsiSellMin: 45, rsiSellMax: 70, volRatio: 1.1 }) };
                                    ss.rsiBuyMax = parseInt(e.target.value) || 55;
                                    onUpdateIndicators({ smartSignalParams: ss });
                                  }}
                                  className="w-1/2 bg-[#131722] border border-[#2a2e39] rounded p-1 text-xs text-gray-100 font-mono outline-none"
                                />
                              </div>
                            </div>
                            
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-mono text-gray-500 block">RSI Sell Triggers ({indicators.smartSignalParams?.rsiSellMin || 45} - {indicators.smartSignalParams?.rsiSellMax || 70})</label>
                              <div className="flex gap-2">
                                <input
                                  type="number"
                                  value={indicators.smartSignalParams?.rsiSellMin || 45}
                                  placeholder="Min"
                                  onChange={(e) => {
                                    const ss = { ...(indicators.smartSignalParams || { emaFast: 9, emaMed: 21, emaSlow: 50, rsiLength: 14, rsiBuyMin: 30, rsiBuyMax: 55, rsiSellMin: 45, rsiSellMax: 70, volRatio: 1.1 }) };
                                    ss.rsiSellMin = parseInt(e.target.value) || 45;
                                    onUpdateIndicators({ smartSignalParams: ss });
                                  }}
                                  className="w-1/2 bg-[#131722] border border-[#2a2e39] rounded p-1 text-xs text-gray-100 font-mono outline-none"
                                />
                                <input
                                  type="number"
                                  value={indicators.smartSignalParams?.rsiSellMax || 70}
                                  placeholder="Max"
                                  onChange={(e) => {
                                    const ss = { ...(indicators.smartSignalParams || { emaFast: 9, emaMed: 21, emaSlow: 50, rsiLength: 14, rsiBuyMin: 30, rsiBuyMax: 55, rsiSellMin: 45, rsiSellMax: 70, volRatio: 1.1 }) };
                                    ss.rsiSellMax = parseInt(e.target.value) || 70;
                                    onUpdateIndicators({ smartSignalParams: ss });
                                  }}
                                  className="w-1/2 bg-[#131722] border border-[#2a2e39] rounded p-1 text-xs text-gray-100 font-mono outline-none"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info message */}
        <div className="bg-[#131722] border-t border-[#2a2e39] px-4 py-3 text-center text-[10px] text-gray-500 font-mono flex items-center justify-center gap-1">
          <Info className="w-3 h-3 text-gray-500" />
          Toggled active indicators overlay in real-time on the main candle grid.
        </div>
      </div>
    </div>
  );
};
