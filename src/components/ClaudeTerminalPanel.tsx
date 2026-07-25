import React, { useState, useRef, useEffect } from 'react';
import { authenticatedFetch } from '../utils/api';
import { Terminal as TerminalIcon, Send, AlertTriangle, Loader2, Activity, Copy, Check } from 'lucide-react';
import { ChartPaneState, CandleData, IndicatorSettings } from '../types';
import { calcSmartSignals } from './TradingChart';
import { runPineStrategy } from '../utils/pineRunner';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ClaudeTerminalPanelProps {
  pane: ChartPaneState;
  data: CandleData[];
  onUpdatePane: (fields: Partial<ChartPaneState>) => void;
}

export const ClaudeTerminalPanel: React.FC<ClaudeTerminalPanelProps> = ({ pane, data, onUpdatePane }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'system',
      content: 'You are an elite quantitative AI trading assistant powered by a free OpenRouter model (e.g. Llama-3 or Mistral). You will help fine-tune strategies based on the current context.'
    },
    {
      role: 'assistant',
      content: `Terminal Initialized.\\nAsset: ${pane.symbol}\\nTimeframe: ${pane.timeframe}\\n\\nHow can I assist you with refining your strategy on ${pane.symbol}?`
    }
  ]);
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingProposal, setPendingProposal] = useState<{
    type?: 'UPDATE_PARAMS' | 'UPDATE_INDICATOR_SETTINGS' | 'COMPILE_PINE_STRATEGY';
    params: any;
    description: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => {
      setCopiedIndex(null);
    }, 2000);
  };

  const [selectedModel, setSelectedModel] = useState('nvidia/nemotron-3-super-120b-a12b:free');
  
  const runOptimizationLoop = async () => {
    if (isLoading || data.length < 100) return;
    setIsLoading(true);
    setMessages(prev => [...prev, { role: 'system', content: 'Starting parameter auto-optimization loop...\nScanning combinations to maximize win rate...' }]);
    
    // Allow UI to update
    await new Promise(r => setTimeout(r, 100));

    let bestParams = { ...pane.indicators.smartSignalParams };
    let bestWinRate = 0;
    
    // Quick grid search or random search for parameter optimization
    // We will do a structured grid to find the best configuration
    const variations = [];
    const emaFasts = [14, 20, 25];
    const rsiLengths = [10, 14, 21];
    const rsiBuyMins = [35, 40, 45];
    const rsiSellMaxs = [55, 60, 65];

    let totalCals = emaFasts.length * rsiLengths.length * rsiBuyMins.length * rsiSellMaxs.length;
    let computed = 0;

    for (const f of emaFasts) {
      for (const rlen of rsiLengths) {
        for (const rmin of rsiBuyMins) {
          for (const rmax of rsiSellMaxs) {
            const p = {
              emaFast: f, emaMed: f * 2.5, emaSlow: f * 4,
              rsiLength: rlen,
              rsiBuyMin: rmin, rsiBuyMax: rmin + 25,
              rsiSellMin: rmax - 25, rsiSellMax: rmax,
              volRatio: 1.1
            };
            
            const signals = calcSmartSignals(data, p);
            let w = 0; let l = 0;
            signals.forEach((sig) => {
              if (!sig || sig.time === undefined || sig.time === null) return;
              const idx = data.findIndex(d => d?.time === sig.time);
              if (idx > -1 && idx < data.length - 1) {
                for (let i = idx + 1; i < data.length; i++) {
                  const c = data[i];
                  if (!c) continue;
                  if (sig.signal === 'BUY') {
                    if (c.high >= sig.tp) { w++; break; }
                    if (c.low <= sig.sl) { l++; break; }
                  } else {
                    if (c.low <= sig.tp) { w++; break; }
                    if (c.high >= sig.sl) { l++; break; }
                  }
                }
              }
            });
            const resolved = w + l;
            if (resolved > 0) {
              const rate = w / resolved;
              if (rate > bestWinRate) {
                bestWinRate = rate;
                bestParams = { ...p };
              }
            }
            computed++;
          }
        }
      }
    }

    const rateStr = (bestWinRate * 100).toFixed(1) + "%";
    
    if (bestWinRate >= 0.75) {
      setMessages(prev => [...prev, { 
        role: 'system', 
        content: `Search complete (${computed} iterations).\nFound optimal parameters with ${rateStr} win rate.\nProposing changes below. Click "ACCEPT" to apply.` 
      }]);
      setPendingProposal({
        params: bestParams,
        description: `Local Auto-Optimization Result (${rateStr} Win Rate)`
      });
    } else {
      setMessages(prev => [...prev, { 
        role: 'system', 
        content: `Search complete.\nCould not find a parameter set exceeding 75% win rate (max found: ${rateStr}).\nTry different assets or timeframes.` 
      }]);
    }
    
    setIsLoading(false);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initialMountRef = useRef(true);
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    setMessages(prev => [
      ...prev,
      {
        role: 'system',
        content: `Terminal context synchronized: active chart updated to ${pane.symbol} (${pane.timeframe}).`
      }
    ]);
  }, [pane.symbol, pane.timeframe]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      // Calculate current backtest result
      let btWinRate = "0.0%";
      let btTotal = 0;
      let btWins = 0;
      let btLosses = 0;
      if (data.length >= 100) {
        const signals = pane.pineStrategy && pane.pineStrategy.active
          ? runPineStrategy(data, pane.pineStrategy)
          : calcSmartSignals(data, pane.indicators.smartSignalParams);
        if (signals.length > 0) {
          signals.forEach((sig) => {
            if (!sig || sig.time === undefined || sig.time === null) return;
            const idx = data.findIndex(d => d?.time === sig.time);
            if (idx > -1 && idx < data.length - 1) {
              for (let i = idx + 1; i < data.length; i++) {
                const c = data[i];
                if (!c) continue;
                if (sig.signal === 'BUY') {
                  if (c.high >= sig.tp) { btWins++; break; }
                  if (c.low <= sig.sl) { btLosses++; break; }
                } else {
                  if (c.low <= sig.tp) { btWins++; break; }
                  if (c.high >= sig.sl) { btLosses++; break; }
                }
              }
            }
          });
          
          btTotal = signals.length;
          const resolved = btWins + btLosses;
          if (resolved > 0) {
             btWinRate = ((btWins / resolved) * 100).toFixed(1) + "%";
          }
        }
      }

      // 1. Get recent 25 candles (OHLCV) for market analysis
      const cleanData = (data || []).filter(Boolean);
      const recentCandles = cleanData.slice(-25).map(d => ({
        time: d?.time,
        open: d?.open,
        high: d?.high,
        low: d?.low,
        close: d?.close,
        volume: d?.volume
      }));

      // 2. Identify active indicators on the chart
      const activeIndicators = Object.keys(pane.indicators)
        .filter(key => pane.indicators[key as keyof IndicatorSettings] === true);

      // 3. Collect active indicator parameter configurations
      const indicatorParameters = {
        emaPeriods: pane.indicators.emaPeriods,
        rsiLength: pane.indicators.rsiLength,
        macdParams: pane.indicators.macdParams,
        volumeProfileBins: pane.indicators.volumeProfileBins,
        smartSignalParams: pane.indicators.smartSignalParams,
      };

      const systemPrompt = `You are an elite quantitative AI trading assistant and professional Pine Script compiler.
You have direct, real-time access to the current active chart pane state, indicators, active custom strategy, and recent candlestick data.

CHART & MARKET DATA:
- Symbol: ${pane.symbol}
- Timeframe: ${pane.timeframe}
- Recent 25 candles (OHLCV):
${JSON.stringify(recentCandles, null, 2)}

CURRENT CHART INDICATORS CONFIGURATION:
- Active indicators: ${JSON.stringify(activeIndicators)}
- Indicator parameter values:
${JSON.stringify(indicatorParameters, null, 2)}

ACTIVE PINE SCRIPT STRATEGY:
${pane.pineStrategy ? JSON.stringify({
  name: pane.pineStrategy.name,
  description: pane.pineStrategy.description,
  parameters: pane.pineStrategy.parameters.map(p => ({ key: p.key, label: p.label, value: p.value !== undefined ? p.value : p.default })),
  pineCode: pane.pineStrategy.pineCode
}, null, 2) : "None active. Currently using standard SmartSignals."}

Current backtest performance over recent history (SmartSignals/Pine Strategy):
- Total closed trades: ${btTotal}
- Wins: ${btWins}
- Win rate: ${btWinRate}

Your primary capabilities include:
1. Analysing the provided market candles directly to identify patterns, trend direction, support/resistance, volatility, and momentum.
2. Toggling technical indicators on the chart or updating their mathematical length/period values.
3. Modifying the parameters of the standard SmartSignal algorithm.
4. Writing or modifying/rewriting custom Pine Script strategies and indicators from scratch.

To execute actions, you MUST include a single JSON block formatted exactly like one of the following schemas anywhere in your response:

A) UPDATE SMART SIGNAL PARAMETERS:
\`\`\`json
{
  "command": "UPDATE_PARAMS",
  "params": {
    "emaFast": 20, "emaMed": 50, "emaSlow": 80,
    "rsiLength": 14, "rsiBuyMin": 40, "rsiBuyMax": 65,
    "rsiSellMin": 35, "rsiSellMax": 60, "volRatio": 1.1
  }
}
\`\`\`

B) CONFIGURE CHART INDICATORS AND PERIODS:
(Allows turning indicators on/off and updating general indicator lengths like emaPeriods, rsiLength, macdParams, etc.)
\`\`\`json
{
  "command": "UPDATE_INDICATOR_SETTINGS",
  "indicators": {
    "ema20": true,
    "ema50": true,
    "bollingerBands": false,
    "rsi": true,
    "rsiLength": 14,
    "emaPeriods": [20, 50, 80, 200]
  }
}
\`\`\`

C) COMPILE/REWRITE PINE SCRIPT STRATEGY:
(Writes or completely rewrites a custom TradingView Pine Script strategy. It will automatically compile via the Gemini Compiler into JavaScript and dynamic inputs!)
\`\`\`json
{
  "command": "COMPILE_PINE_STRATEGY",
  "pineCode": "//@version=5\\nstrategy(\\"My New Strategy\\", overlay=true)\\nfastPeriod = input.int(10, title=\\"Fast EMA Period\\")\\nslowPeriod = input.int(30, title=\\"Slow EMA Period\\")\\n\\nfastEMA = ta.ema(close, fastPeriod)\\nslowEMA = ta.ema(close, slowPeriod)\\nbuySignal = ta.crossover(fastEMA, slowEMA)\\nsellSignal = ta.crossunder(fastEMA, slowEMA)\\n\\nif (buySignal)\\n    strategy.entry(\\"Long\\", strategy.long)\\nif (sellSignal)\\n    strategy.close(\\"Long\\")"
}
\`\`\`

Respond to the user with analytical reasoning first, explaining your actions and findings, followed by the chosen JSON command block if you are making changes.`;

      const response = await authenticatedFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage }
          ]
        })
      });

      const result = await response.json();
      
      if (!response.ok) {
        const errorMsg = result.error || `HTTP error ${response.status}`;
        if (response.status === 429 || errorMsg.includes('429') || errorMsg.includes('rate-limited')) {
          throw new Error(`Model ${selectedModel.split('/').pop()} is currently rate-limited. Please select a different model from the dropdown above and try again.`);
        }
        throw new Error(errorMsg);
      }

      if (result.choices && result.choices.length > 0) {
        const aiMessage = result.choices[0].message.content;
        setMessages(prev => [...prev, { role: 'assistant', content: aiMessage }]);
        
        // Auto-parse JSON
        const jsonMatch = aiMessage.match(/```json\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[1]);
            if (parsed.command === 'UPDATE_PARAMS' && parsed.params) {
              setPendingProposal({
                type: 'UPDATE_PARAMS',
                params: parsed.params,
                description: 'AI parameter proposal.'
              });
              setMessages(prev => [...prev, { role: 'system', content: 'Received new parameter proposal. Click "ACCEPT" to apply or "DISCARD" to ignore.' }]);
            } else if (parsed.command === 'UPDATE_INDICATOR_SETTINGS' && parsed.indicators) {
              setPendingProposal({
                type: 'UPDATE_INDICATOR_SETTINGS',
                params: parsed.indicators,
                description: 'AI indicator configuration update proposal.'
              });
              setMessages(prev => [...prev, { role: 'system', content: 'Received new indicator settings proposal. Click "ACCEPT" to apply or "DISCARD" to ignore.' }]);
            } else if (parsed.command === 'COMPILE_PINE_STRATEGY' && parsed.pineCode) {
              setMessages(prev => [...prev, { role: 'system', content: 'Compiling proposed Pine Script strategy...' }]);
              try {
                const res = await authenticatedFetch('/api/pinescript/convert', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ pineCode: parsed.pineCode }),
                });
                if (!res.ok) {
                  const errorData = await res.json();
                  throw new Error(errorData.error || `Server compilation error ${res.status}`);
                }
                const strategyResult = await res.json();
                const updatedParams = (strategyResult.parameters || []).map((p: any) => ({
                  ...p,
                  value: p.default
                }));
                const newPineStrategy = {
                  name: strategyResult.name || "Custom AI Strategy",
                  description: strategyResult.description || "Generated by the Quant Terminal AI.",
                  parameters: updatedParams,
                  jsCode: strategyResult.jsCode,
                  pineCode: parsed.pineCode,
                  active: true
                };
                setPendingProposal({
                  type: 'COMPILE_PINE_STRATEGY',
                  params: newPineStrategy,
                  description: `Compiled Pine Script Strategy: "${newPineStrategy.name}"`
                });
                setMessages(prev => [...prev, { role: 'system', content: `✓ Strategy compiled successfully! Click "ACCEPT" to activate "${newPineStrategy.name}" as your active signal engine.` }]);
              } catch (compileErr: any) {
                console.error(compileErr);
                setMessages(prev => [...prev, { role: 'system', content: `✗ Pine Strategy Compilation failed: ${compileErr.message || 'Unknown compiler error'}` }]);
              }
            }
          } catch(e) {
            console.error("Failed to parse JSON parameters from LLM", e);
          }
        }
      } else {
        throw new Error("No response choices returned by AI.");
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while connecting to OpenRouter. Ensure OPENROUTER_API_KEY is set via the Secrets panel.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#121620] relative">
      <div className="flex flex-col items-center justify-center py-4 border-b border-[#2e3242] shrink-0">
        <TerminalIcon className="w-8 h-8 text-violet-400 mb-2" />
        <h3 className="font-bold text-gray-100 tracking-wide">QUANT TERMINAL</h3>
        <p className="text-[10px] text-gray-500 font-mono mt-1 mb-3 uppercase tracking-wider">
          LLM Strategy Fine-Tuner
        </p>
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className="bg-[#1a1f2e] border border-[#2e3242] text-violet-300 text-[10px] font-mono rounded px-2 py-1 outline-none focus:border-violet-500/50"
        >
          <option value="google/gemma-4-31b-it:free">Google (Free)</option>
          <option value="mistralai/mistral-7b-instruct:free">Mistral 7B (Free)</option>
          <option value="qwen/qwen-2-7b-instruct:free">Qwen 2 7B (Free)</option>
          <option value="nousresearch/hermes-3-llama-3.1-405b:free">Hermes</option>
          <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
          <option value="nvidia/nemotron-3-super-120b-a12b:free">Nvidia</option>
          <option value="google/gemini-pro-1.5">Gemini 1.5 Pro</option>
          <option value="cohere/north-mini-code:free">Cohere</option>
          <option value="openrouter/free">Openrouter</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs select-text">
        {messages.filter(m => m.role !== 'system' || m.content.startsWith('✓')).map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full group/msg`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[9px] uppercase tracking-wider ${msg.role === 'user' ? 'text-gray-500' : 'text-violet-400'}`}>
                {msg.role === 'user' ? 'You' : msg.role === 'system' ? 'System' : 'Terminal AI'}
              </span>
              <button
                onClick={() => handleCopy(msg.content, idx)}
                className="text-gray-500 hover:text-gray-300 transition-colors cursor-pointer opacity-30 group-hover/msg:opacity-100 flex items-center gap-1"
                title="Copy message text"
              >
                {copiedIndex === idx ? (
                  <span className="text-[9px] text-emerald-400 flex items-center gap-0.5 font-sans font-medium"><Check className="w-2.5 h-2.5" /> Copied</span>
                ) : (
                  <Copy className="w-2.5 h-2.5" />
                )}
              </button>
            </div>
            <div className={`p-2.5 rounded max-w-[95%] whitespace-pre-wrap max-h-[35vh] overflow-y-auto scrollbar-thin select-text ${
              msg.role === 'user' 
              ? 'bg-[#1a1f2e] text-gray-300 border border-[#2e3242] rounded-tr-none' 
              : msg.role === 'system'
              ? 'bg-emerald-900/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-violet-900/20 text-violet-200 border border-violet-500/30 rounded-tl-none'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex flex-col items-start">
            <span className="text-[9px] text-violet-400 uppercase tracking-wider mb-1">Terminal AI</span>
            <div className="p-2.5 bg-violet-900/20 rounded border border-violet-500/30 rounded-tl-none flex items-center gap-2 text-violet-300">
              <Loader2 className="w-3 h-3 animate-spin" /> Processing request...
            </div>
          </div>
        )}

        {pendingProposal && (
          <div className="p-3 bg-emerald-900/20 border border-emerald-500/30 rounded text-emerald-400 flex flex-col gap-2 mt-2">
            <div className="font-bold text-[10px] uppercase tracking-wide border-b border-emerald-500/20 pb-1.5 text-emerald-300">{pendingProposal.description}</div>
            <pre className="text-[9px] bg-[#0d1017] p-2 rounded text-emerald-300/80 overflow-x-auto max-h-[150px] scrollbar-thin">
              {pendingProposal.type === 'COMPILE_PINE_STRATEGY' ? pendingProposal.params.pineCode : JSON.stringify(pendingProposal.params, null, 2)}
            </pre>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => {
                  if (pendingProposal.type === 'UPDATE_INDICATOR_SETTINGS') {
                    onUpdatePane({ indicators: { ...pane.indicators, ...pendingProposal.params } });
                  } else if (pendingProposal.type === 'COMPILE_PINE_STRATEGY') {
                    onUpdatePane({ pineStrategy: pendingProposal.params });
                  } else {
                    // Default / UPDATE_PARAMS
                    onUpdatePane({ indicators: { ...pane.indicators, smartSignalParams: pendingProposal.params } });
                  }
                  setMessages(prev => [...prev, { role: 'system', content: '✓ Parameters/Strategy successfully applied.' }]);
                  setPendingProposal(null);
                }}
                className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 py-1.5 rounded text-[10px] uppercase font-bold transition-colors border border-emerald-500/30 cursor-pointer"
              >
                Accept
              </button>
              <button
                onClick={() => {
                  setMessages(prev => [...prev, { role: 'system', content: '✗ Proposal discarded.' }]);
                  setPendingProposal(null);
                }}
                className="flex-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 py-1.5 rounded text-[10px] uppercase font-bold transition-colors border border-rose-500/30 cursor-pointer"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-900/20 border border-red-500/30 rounded text-red-400 flex flex-col gap-1.5 items-start mt-2">
            <div className="flex items-center gap-1.5 font-bold">
               <AlertTriangle className="w-3.5 h-3.5" /> Connection Failed
            </div>
            <span className="text-[10px] font-sans break-words w-full">{error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 bg-[#0d1017] border-t border-[#2e3242] shrink-0 flex flex-col gap-2">
        <button
          onClick={runOptimizationLoop}
          disabled={isLoading || data.length < 100}
          className="w-full bg-[#1a1f2e] text-blue-400 text-[10px] font-bold uppercase tracking-wider py-1.5 rounded flex items-center justify-center gap-2 border border-[#2e3242] hover:bg-[#252a36] disabled:opacity-50 transition-colors"
        >
          <Activity className="w-3 h-3" />
          Run Local Auto-Optimization
        </button>
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            type="text"
            className="w-full bg-[#161b28] border border-[#2e3242] rounded px-3 py-2 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-500/50 pr-10"
            placeholder="Type command..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute right-2 text-gray-500 hover:text-violet-400 transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <div className="mt-2 text-center text-[9px] text-gray-600 font-mono tracking-widest uppercase">
          Powered by OpenRouter
        </div>
      </div>
    </div>
  );
}
