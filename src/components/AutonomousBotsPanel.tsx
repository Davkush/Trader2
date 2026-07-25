import React, { useState } from 'react';
import { useBotsList } from '../hooks/useBotsList';
import { 
  Cpu, Play, Pause, RotateCcw, Trash2, Plus, Activity, Sparkles, 
  LineChart, TrendingUp, Wallet, Terminal, ArrowUpRight, ArrowDownRight, 
  ShieldAlert, Loader2, RefreshCw, Layers
} from 'lucide-react';

interface BotLog {
  timestamp: string;
  type: 'INFO' | 'TRADE' | 'AI_REASONING' | 'ERROR';
  message: string;
}

interface BotPosition {
  id: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  entryTime: string;
  sl?: number;
  tp?: number;
}

interface ServerBot {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  strategy: string;
  status: 'RUNNING' | 'STOPPED';
  balance: number;
  initialBalance: number;
  positions: BotPosition[];
  history: any[];
  logs: BotLog[];
  lastChecked: string;
}

const PREDEFINED_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'google/gemma-4-31b-it:free',
  'mistralai/mistral-7b-instruct:free',
  'qwen/qwen-2-7b-instruct:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'anthropic/claude-3.5-sonnet',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemini-pro-1.5',
  'cohere/north-mini-code:free',
  'openrouter/free'
];

export const AutonomousBotsPanel: React.FC = () => {
  const {
    bots,
    loading,
    createBot,
    toggleBot,
    closeBotPosition,
    resetBot,
    deleteBot,
    fetchBots,
  } = useBotsList(true, 5000);

  const [refreshing, setRefreshing] = useState(false);
  
  // Creation Form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [botName, setBotName] = useState('');
  const [botSymbol, setBotSymbol] = useState('BTC');
  const [botTimeframe, setBotTimeframe] = useState('1h');
  const [botStrategy, setBotStrategy] = useState('Gemini AI Decision');
  const [botBalance, setBotBalance] = useState('10000');
  const [createLoading, setCreateLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // AI Discussion States
  const [discussionMode, setDiscussionMode] = useState('SIMPLE_VOTE');
  const [analysts, setAnalysts] = useState([
    { name: 'Quant Technical Analyst', modelName: 'gemini-3.1-flash-lite', role: 'TECHNICAL_ANALYST', weight: 1.0 },
    { name: 'Macro Fundamentalist', modelName: 'gemini-3.1-flash-lite', role: 'FUNDAMENTAL_ANALYST', weight: 1.0 },
    { name: 'Capital Risk Officer', modelName: 'gemini-3.1-flash-lite', role: 'RISK_MANAGER', weight: 1.0 }
  ]);

  const addAnalyst = () => {
    setAnalysts([...analysts, { name: `Specialist ${analysts.length + 1}`, modelName: 'gemini-3.1-flash-lite', role: 'TECHNICAL_ANALYST', weight: 1.0 }]);
  };
  const removeAnalyst = (index: number) => {
    if (analysts.length <= 1) {
      setFormError('At least one specialist model is required to hold a discussion.');
      return;
    }
    setAnalysts(analysts.filter((_, i) => i !== index));
  };
  const updateAnalyst = (index: number, field: string, value: any) => {
    const updated = [...analysts];
    updated[index] = { ...updated[index], [field]: value };
    setAnalysts(updated);
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchBots(true);
    setRefreshing(false);
  };

  const handleCreateBot = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!botName.trim()) {
      setFormError('Please enter a bot name.');
      return;
    }
    const parsedBalance = Number(botBalance);
    if (isNaN(parsedBalance) || parsedBalance < 500 || parsedBalance > 1000000) {
      setFormError('Allocation capital must be between $500 and $1,000,000.');
      return;
    }

    setCreateLoading(true);
    try {
      const res = await createBot({
        name: botName,
        symbol: botSymbol,
        timeframe: botTimeframe,
        strategy: botStrategy,
        balance: parsedBalance,
        aiModels: botStrategy === "AI Discussion Board" ? analysts : undefined,
        discussionMode: botStrategy === "AI Discussion Board" ? discussionMode : undefined,
      });

      if (res.success) {
        setBotName('');
        setShowCreateForm(false);
      } else {
        setFormError(res.error || 'Failed to create bot.');
      }
    } catch (err) {
      setFormError('Network failure connecting to backend.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleToggleBot = async (id: string) => {
    await toggleBot(id);
  };

  const handleClosePosition = async (id: string) => {
    if (!confirm("Are you sure you want to force-close this position? This will exit the trade at the entry price and pause the bot.")) return;
    await closeBotPosition(id);
  };

  const handleResetBot = async (id: string) => {
    if (!confirm("Are you sure you want to reset this bot? This will restore the initial capital and clear all historical trade and reasoning logs.")) return;
    await resetBot(id);
  };

  const handleDeleteBot = async (id: string) => {
    if (!confirm("Are you sure you want to delete this bot? This cannot be undone.")) return;
    await deleteBot(id);
  };


  // Stats Calculations
  const activeBotsCount = bots.filter(b => b.status === 'RUNNING').length;
  const totalBalance = bots.reduce((acc, b) => acc + b.balance, 0);
  const totalPnL = bots.reduce((acc, b) => {
    const tradePnL = b.history.reduce((tAcc, t) => tAcc + (t.pnl || 0), 0);
    return acc + tradePnL;
  }, 0);
  
  const allResolvedTrades = bots.flatMap(b => b.history);
  const totalWins = allResolvedTrades.filter(t => t.pnl > 0).length;
  const totalLosses = allResolvedTrades.filter(t => t.pnl <= 0).length;
  const averageWinrate = allResolvedTrades.length > 0 
    ? (totalWins / allResolvedTrades.length) * 100 
    : 0;

  return (
    <div className="flex flex-col h-full bg-[#0a0d14] text-gray-100 overflow-y-auto scrollbar-thin p-4">
      
      {/* Header and Stats Overview */}
      <div className="flex items-center justify-between border-b border-[#1f2433] pb-3 mb-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-emerald-400">
            <Cpu className="w-5 h-5 text-emerald-400 animate-pulse" />
            Autonomous AI Trading Bots
          </h2>
          <p className="text-[10px] text-gray-500 font-mono mt-0.5">
            SERVER RUNTIME: <span className="text-emerald-500">ACTIVE</span> • PERSISTENCE: <span className="text-emerald-500">ON (db_bots.json)</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {refreshing && <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />}
          <button 
            onClick={handleManualRefresh}
            className="p-1.5 rounded hover:bg-[#1e2230] text-gray-400 hover:text-gray-200 cursor-pointer"
            title="Force refresh status"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white font-sans text-xs font-bold px-3 py-1.5 rounded cursor-pointer transition-all duration-200"
          >
            <Plus className="w-3.5 h-3.5" />
            Launch New Bot
          </button>
        </div>
      </div>

      {/* Global Bot Network Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 font-mono">
        <div className="bg-[#121622] border border-[#202636] rounded-lg p-3">
          <div className="text-[9px] text-gray-500 uppercase flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-blue-400" /> Bots Network
          </div>
          <div className="text-lg font-bold mt-1 text-gray-200">
            {activeBotsCount}<span className="text-xs text-gray-500 font-normal"> / {bots.length} active</span>
          </div>
        </div>

        <div className="bg-[#121622] border border-[#202636] rounded-lg p-3">
          <div className="text-[9px] text-gray-500 uppercase flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-yellow-500" /> Combined Assets
          </div>
          <div className="text-lg font-bold mt-1 text-yellow-400">
            ${totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-[#121622] border border-[#202636] rounded-lg p-3">
          <div className="text-[9px] text-gray-500 uppercase flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Net Trading PNL
          </div>
          <div className={`text-lg font-bold mt-1 ${totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
          </div>
        </div>

        <div className="bg-[#121622] border border-[#202636] rounded-lg p-3">
          <div className="text-[9px] text-gray-500 uppercase flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-violet-400" /> Avg Network Winrate
          </div>
          <div className="text-lg font-bold mt-1 text-violet-300">
            {averageWinrate.toFixed(1)}% <span className="text-[10px] text-gray-500 font-normal">({allResolvedTrades.length} trades)</span>
          </div>
        </div>
      </div>

      {/* Launcher Wizard (Create Bot) */}
      {showCreateForm && (
        <form onSubmit={handleCreateBot} className="bg-[#111520] border border-emerald-500/30 rounded-lg p-4 mb-4 animate-in fade-in slide-in-from-top-3 duration-300 font-sans">
          <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 mb-3.5">
            <Cpu className="w-4 h-4" /> AI Bot Deployment Wizard
          </h3>
          
          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-gray-400 mb-1">Bot Call Sign (Name)</label>
              <input 
                type="text"
                placeholder="e.g. Gemini Alpha BTC"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                className="w-full bg-[#1b2030] border border-[#2e354a] rounded px-3 py-2 text-gray-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-400 mb-1">Target Instrument</label>
                <select 
                  value={botSymbol}
                  onChange={(e) => setBotSymbol(e.target.value)}
                  className="w-full bg-[#1b2030] border border-[#2e354a] rounded px-2.5 py-2 text-gray-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="BTC">BTC / Bitcoin</option>
                  <option value="ETH">ETH / Ethereum</option>
                  <option value="SOL">SOL / Solana</option>
                  <option value="GOLD">GOLD / XAU</option>
                  <option value="AAPL">AAPL / Apple Stock</option>
                  <option value="SPY">SPY / S&P 500 ETF</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Timeframe Analysis</label>
                <select 
                  value={botTimeframe}
                  onChange={(e) => setBotTimeframe(e.target.value)}
                  className="w-full bg-[#1b2030] border border-[#2e354a] rounded px-2.5 py-2 text-gray-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="5m">5 Minute</option>
                  <option value="15m">15 Minute</option>
                  <option value="1h">1 Hour (Recommended)</option>
                  <option value="4h">4 Hour</option>
                  <option value="1d">1 Day</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-400 mb-1">Decision AI Model</label>
                <select 
                  value={botStrategy}
                  onChange={(e) => setBotStrategy(e.target.value)}
                  className="w-full bg-[#1b2030] border border-[#2e354a] rounded px-2.5 py-2 text-gray-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="Gemini AI Decision">Gemini AI Decision Model</option>
                  <option value="AI Discussion Board">AI Multi-Model Discussion Board</option>
                  <option value="Smart Signal Quant">Smart Signal Quant System</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Capital Allocation (USD)</label>
                <input 
                  type="number"
                  placeholder="10000"
                  value={botBalance}
                  onChange={(e) => setBotBalance(e.target.value)}
                  className="w-full bg-[#1b2030] border border-[#2e354a] rounded px-3 py-2 text-gray-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {botStrategy === 'AI Discussion Board' && (
              <div className="bg-[#171c2a] border border-violet-500/30 rounded-lg p-3.5 space-y-3 mt-1 animate-in fade-in duration-200 text-xs">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-violet-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-violet-400" /> Discussion Settings & Analyst Team
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-gray-400">Mode:</label>
                    <select
                      value={discussionMode}
                      onChange={(e) => setDiscussionMode(e.target.value)}
                      className="bg-[#1e2436] border border-[#2e354a] rounded px-2 py-1 text-gray-200 text-[10.5px] cursor-pointer focus:outline-none focus:border-violet-500"
                    >
                      <option value="SIMPLE_VOTE">SIMPLE VOTE (Voting)</option>
                      <option value="DISCUSSION">DISCUSSION (Multi-turn Synthesizer)</option>
                      <option value="JUDGE">JUDGE (Arbiter rulings)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                  {analysts.map((analyst, index) => (
                    <div key={index} className="flex flex-col sm:flex-row gap-2 items-center bg-[#1e2436] p-2 rounded border border-[#2c3349]">
                      <div className="flex-1 w-full">
                        <span className="text-[9px] text-gray-500 block mb-0.5">Specialist Name</span>
                        <input
                          type="text"
                          value={analyst.name}
                          onChange={(e) => updateAnalyst(index, 'name', e.target.value)}
                          placeholder="Analyst Name"
                          className="w-full bg-[#131722] border border-[#2e354a] rounded px-2 py-1 text-gray-200 text-[11px] focus:outline-none focus:border-violet-500"
                        />
                      </div>
                      <div className="w-full sm:w-32">
                        <span className="text-[9px] text-gray-500 block mb-0.5">Model Engine</span>
                        {!PREDEFINED_MODELS.includes(analyst.modelName) ? (
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={analyst.modelName}
                              onChange={(e) => updateAnalyst(index, 'modelName', e.target.value)}
                              placeholder="e.g. meta-llama/llama-3"
                              className="w-full bg-[#131722] border border-violet-500/50 rounded px-1.5 py-1 text-gray-200 text-[11px] focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => updateAnalyst(index, 'modelName', 'gemini-3.1-flash-lite')}
                              className="px-1 bg-[#202535] hover:bg-[#2c3247] rounded text-[9px] text-gray-400 font-sans cursor-pointer"
                              title="Reset to predefined dropdown"
                            >
                              Reset
                            </button>
                          </div>
                        ) : (
                          <select
                            value={analyst.modelName}
                            onChange={(e) => {
                              if (e.target.value === '__CUSTOM__') {
                                updateAnalyst(index, 'modelName', 'custom-model-id');
                              } else {
                                updateAnalyst(index, 'modelName', e.target.value);
                              }
                            }}
                            className="w-full bg-[#131722] border border-[#2e354a] rounded px-2 py-1 text-gray-200 text-[11px] cursor-pointer focus:outline-none focus:border-violet-500"
                          >
                            <option value="gemini-3.1-flash-lite">Gemini 3.1 Lite</option>
                            <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                            <option value="google/gemma-4-31b-it:free">Gemma (Free)</option>
                            <option value="mistralai/mistral-7b-instruct:free">Mistral 7B (Free)</option>
                            <option value="qwen/qwen-2-7b-instruct:free">Qwen 2 (Free)</option>
                            <option value="nousresearch/hermes-3-llama-3.1-405b:free">Hermes</option>
                            <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                            <option value="nvidia/nemotron-3-super-120b-a12b:free">Nvidia (Free)</option>
                            <option value="google/gemini-pro-1.5">Gemini 1.5 Pro</option>
                            <option value="cohere/north-mini-code:free">Cohere</option>
                            <option value="openrouter/free">Openrouter</option>
                            <option value="__CUSTOM__">✍️ Custom ID...</option>
                          </select>
                        )}
                      </div>
                      <div className="w-full sm:w-36">
                        <span className="text-[9px] text-gray-500 block mb-0.5">Role Domain</span>
                        <select
                          value={analyst.role}
                          onChange={(e) => updateAnalyst(index, 'role', e.target.value)}
                          className="w-full bg-[#131722] border border-[#2e354a] rounded px-2 py-1 text-gray-200 text-[11px] cursor-pointer focus:outline-none focus:border-violet-500"
                        >
                          <option value="TECHNICAL_ANALYST">TECHNICAL ANALYST</option>
                          <option value="FUNDAMENTAL_ANALYST">FUNDAMENTAL ANALYST</option>
                          <option value="RISK_MANAGER">RISK MANAGER</option>
                          <option value="JUDGE">JUDGE / ARBITER</option>
                        </select>
                      </div>
                      <div className="w-16 shrink-0">
                        <span className="text-[9px] text-gray-500 block mb-0.5">Vote Weight</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            max="5.0"
                            value={analyst.weight}
                            onChange={(e) => updateAnalyst(index, 'weight', parseFloat(e.target.value) || 1.0)}
                            className="w-full bg-[#131722] border border-[#2e354a] rounded px-1.5 py-1 text-gray-200 text-[11px] text-center focus:outline-none focus:border-violet-500"
                          />
                        </div>
                      </div>
                      <div className="shrink-0 pt-3">
                        <button
                          type="button"
                          onClick={() => removeAnalyst(index)}
                          className="text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-[#252c42] cursor-pointer"
                          title="Remove analyst"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-end border-t border-[#1e2436] pt-2">
                  <button
                    type="button"
                    onClick={addAnalyst}
                    className="flex items-center gap-1 text-[10px] bg-violet-600/20 border border-violet-500/30 text-violet-300 px-2 py-1 rounded hover:bg-violet-600/40 cursor-pointer transition-all duration-200"
                  >
                    <Plus className="w-3 h-3" /> Add Analyst Agent
                  </button>
                </div>
              </div>
            )}

            {formError && (
              <div className="bg-rose-950/20 border border-rose-500/30 rounded p-2 text-rose-400 text-[11px] flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                {formError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-3 py-2 rounded text-gray-400 hover:bg-[#1a1e2b] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createLoading}
                className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded cursor-pointer disabled:opacity-50"
              >
                {createLoading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Launching...</>
                ) : (
                  "Deploy Bot Network"
                )}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
          <p className="text-xs font-mono text-gray-500 uppercase tracking-widest animate-pulse">Initializing Server Bot Streams...</p>
        </div>
      ) : bots.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center max-w-sm mx-auto">
          <Cpu className="w-12 h-12 text-gray-700 mb-3" />
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide">No Active AI Bots</h3>
          <p className="text-xs text-gray-500 mt-2 leading-relaxed">
            There are currently no server-side autonomous trading bots deployed. Click the button above to launch your first persistent AI bot.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {bots.map((bot) => {
            // calculate individual bot stats
            const resolvedTrades = bot.history || [];
            const wins = resolvedTrades.filter(t => t.pnl > 0).length;
            const winRate = resolvedTrades.length > 0 ? (wins / resolvedTrades.length) * 100 : 0;
            const netPnL = bot.balance - bot.initialBalance;
            const netPnLPct = (netPnL / bot.initialBalance) * 100;

            const isRunning = bot.status === 'RUNNING';

            return (
              <div 
                key={bot.id} 
                className={`bg-[#121622] border rounded-lg p-4 transition-all duration-300 ${
                  isRunning ? 'border-[#242b3d] shadow-[0_4px_12px_rgba(16,185,129,0.03)]' : 'border-[#1e222e]'
                }`}
              >
                {/* Bot Title Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#202636] pb-3.5 mb-3.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-amber-500'}`} />
                      <h3 className="text-xs font-bold text-gray-100 uppercase font-sans tracking-wide">{bot.name}</h3>
                      <span className="bg-[#1b2030] text-[9.5px] font-mono font-semibold px-2 py-0.5 rounded text-gray-400 uppercase">
                        {bot.symbol} {bot.timeframe}
                      </span>
                    </div>
                    <div className="text-[9px] font-mono text-gray-500 uppercase mt-1">
                      BOT ID: <span className="text-gray-300">{bot.id}</span> • MODEL: <span className="text-gray-300">{bot.strategy}</span>
                    </div>
                  </div>

                  {/* Actions / Buttons Controls */}
                  <div className="flex items-center gap-1.5 select-none">
                    <button
                      onClick={() => handleToggleBot(bot.id)}
                      className={`flex items-center gap-1 py-1.5 px-3 rounded text-[9.5px] font-mono uppercase tracking-wider font-bold cursor-pointer border transition-colors ${
                        isRunning 
                          ? 'bg-amber-950/20 hover:bg-amber-950/35 text-amber-400 border-amber-500/40' 
                          : 'bg-emerald-950/20 hover:bg-emerald-950/35 text-emerald-400 border-emerald-500/40'
                      }`}
                    >
                      {isRunning ? (
                        <><Pause className="w-3 h-3" /> Pause Bot</>
                      ) : (
                        <><Play className="w-3 h-3" /> Resume Bot</>
                      )}
                    </button>

                    <button
                      onClick={() => handleResetBot(bot.id)}
                      className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-yellow-400 border border-[#232838] cursor-pointer"
                      title="Reset balance & history logs"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleDeleteBot(bot.id)}
                      className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-rose-400 border border-[#232838] cursor-pointer"
                      title="Delete Bot"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Bot Core Performance Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 font-mono">
                  <div className="bg-[#0b0e15] border border-[#1b2030] rounded p-2.5">
                    <div className="text-[8px] text-gray-500 uppercase">Current Capital</div>
                    <div className="text-xs font-bold text-gray-200 mt-1">${bot.balance.toFixed(2)}</div>
                  </div>

                  <div className="bg-[#0b0e15] border border-[#1b2030] rounded p-2.5">
                    <div className="text-[8px] text-gray-500 uppercase">Total Profit / Loss</div>
                    <div className={`text-xs font-bold mt-1 ${netPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {netPnL >= 0 ? '+' : ''}${netPnL.toFixed(2)} ({netPnLPct.toFixed(2)}%)
                    </div>
                  </div>

                  <div className="bg-[#0b0e15] border border-[#1b2030] rounded p-2.5">
                    <div className="text-[8px] text-gray-500 uppercase">Win Ratio</div>
                    <div className="text-xs font-bold text-violet-300 mt-1">{winRate.toFixed(1)}%</div>
                  </div>

                  <div className="bg-[#0b0e15] border border-[#1b2030] rounded p-2.5">
                    <div className="text-[8px] text-gray-500 uppercase">Total Executions</div>
                    <div className="text-xs font-bold text-gray-200 mt-1">{resolvedTrades.length} trades</div>
                  </div>
                </div>

                {/* Open Active Positions Banner */}
                {bot.positions && bot.positions.length > 0 ? (
                  <div className="bg-emerald-950/10 border border-emerald-500/20 rounded p-3 mb-4 animate-in fade-in duration-300 font-sans">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                        Active Open Position
                      </span>
                      <button 
                        onClick={() => handleClosePosition(bot.id)}
                        className="text-[9.5px] font-semibold bg-rose-950/20 hover:bg-rose-950/30 border border-rose-500/40 text-rose-400 px-2 py-0.5 rounded cursor-pointer transition-colors"
                      >
                        Force Exit Trade
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-[9px] text-gray-500 block uppercase">Direction</span>
                        <span className={`font-bold uppercase ${bot.positions[0].direction === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {bot.positions[0].direction} {bot.positions[0].quantity} {bot.symbol}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-500 block uppercase">Entry Price</span>
                        <span className="font-bold text-gray-200">${bot.positions[0].entryPrice.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-500 block uppercase">TP / SL Target</span>
                        <span className="font-bold text-gray-300">
                          TP: ${bot.positions[0].tp ? bot.positions[0].tp.toFixed(1) : 'N/A'} <span className="text-gray-500 font-normal">|</span> SL: ${bot.positions[0].sl ? bot.positions[0].sl.toFixed(1) : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#0b0e15] border border-[#1b2030] rounded p-2.5 mb-4 text-center font-sans">
                    <span className="text-[10.5px] font-mono text-gray-500 uppercase tracking-wide">
                      {isRunning ? "● Scanning charts... standing by for AI trade signal" : "Bot is paused. Turn ON to scan for signals."}
                    </span>
                  </div>
                )}

                {/* Live Bot AI reasoning and logs terminal stream */}
                <div className="bg-[#080a0f] border border-[#1a1e2a] rounded overflow-hidden">
                  <div className="flex items-center justify-between bg-[#0e111a] px-3 py-1.5 border-b border-[#1a1e2a] select-none">
                    <span className="text-[8.5px] font-mono text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-gray-500" /> AI Decisional Feed & Logs
                    </span>
                    <span className="text-[8px] font-mono text-gray-600 uppercase">
                      Last Check: {new Date(bot.lastChecked).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="max-h-36 overflow-y-auto p-2.5 space-y-1.5 font-mono text-[10px] scrollbar-thin">
                    {bot.logs && bot.logs.length > 0 ? (
                      bot.logs.map((log, idx) => {
                        const timeStr = new Date(log.timestamp).toLocaleTimeString();
                        
                        if (log.type === 'AI_REASONING') {
                          const isDiscussionLog = log.message.startsWith('[AI Discussion Panel');
                          if (isDiscussionLog) {
                            const lines = log.message.split('\n');
                            const header = lines[0]; // e.g. [AI Discussion Panel - Final Decision: BUY] (Confidence: 100%)
                            const turns = lines.slice(1).filter(l => l.trim().startsWith('•'));
                            
                            return (
                              <div key={idx} className="bg-[#1b172e] border border-violet-500/20 p-2.5 rounded-lg my-1.5 font-sans">
                                <div className="flex items-center justify-between border-b border-violet-500/20 pb-1.5 mb-1.5">
                                  <div className="flex items-center gap-1">
                                    <Sparkles className="w-3 h-3 text-violet-400 animate-pulse" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-violet-300">Agent Board Debate</span>
                                  </div>
                                  <span className="text-[8.5px] font-mono text-violet-200 font-bold">
                                    {header.replace('[AI Discussion Panel - ', '').replace(']', '')}
                                  </span>
                                </div>
                                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5 scrollbar-thin">
                                  {turns.map((turn, tIdx) => {
                                    const match = turn.match(/•\s+\[(.*?)\]\s+\((.*?)\)\s+->\s+(.*?):\s+"(.*)"/);
                                    if (match) {
                                      const [_, role, model, decision, comment] = match;
                                      const isBuy = decision === 'BUY';
                                      const isSell = decision === 'SELL';
                                      const isHold = decision === 'HOLD';
                                      return (
                                        <div key={tIdx} className="bg-[#0b0e15] border border-gray-800/40 rounded p-1.5 text-[9.5px]">
                                          <div className="flex items-center justify-between mb-0.5">
                                            <div className="flex items-center gap-1">
                                              <span className="text-[7.5px] font-mono font-extrabold uppercase bg-[#1e2436] text-gray-300 px-1 py-0.2 rounded">
                                                {role.replace('_', ' ')}
                                              </span>
                                              <span className="text-[7px] text-gray-500">({model})</span>
                                            </div>
                                            <span className={`text-[8px] font-mono font-bold px-1 rounded ${
                                              isBuy ? 'text-emerald-400 bg-emerald-950/40' :
                                              isSell ? 'text-rose-400 bg-rose-950/40' : 'text-amber-400 bg-amber-950/40'
                                            }`}>
                                              {decision}
                                            </span>
                                          </div>
                                          <p className="text-[9px] text-gray-300 leading-normal italic">"{comment}"</p>
                                        </div>
                                      );
                                    }
                                    return <div key={tIdx} className="text-[9px] text-gray-400 pl-1">{turn}</div>;
                                  })}
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div key={idx} className="bg-[#8b5cf6]/5 border-l-2 border-violet-500 p-2 rounded-r my-1 text-violet-200">
                              <div className="flex items-center gap-1 mb-0.5 text-[8.5px] font-bold text-violet-400 uppercase tracking-wider">
                                <Sparkles className="w-3 h-3 text-violet-400 animate-pulse" /> AI Reasoned Vector • {timeStr}
                              </div>
                              <div className="text-[9.5px] leading-relaxed italic">{log.message}</div>
                            </div>
                          );
                        }

                        if (log.type === 'TRADE') {
                          return (
                            <div key={idx} className="text-emerald-400 flex gap-2">
                              <span className="text-gray-500 shrink-0">[{timeStr}]</span>
                              <span className="font-semibold">{log.message}</span>
                            </div>
                          );
                        }

                        return (
                          <div key={idx} className="text-gray-400 flex gap-2">
                            <span className="text-gray-600 shrink-0">[{timeStr}]</span>
                            <span>{log.message}</span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center text-gray-600 italic py-2 text-[9px]">Zero logs generated. Deployed bot has not performed trades yet.</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
