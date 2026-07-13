import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  BarChart2, Search, Sliders, Play, Settings, Share2, Sparkles, 
  Trash2, X, ChevronDown, ChevronUp, Check, Info, Bell, AlertTriangle,
  ShoppingCart, Activity, BookOpen, Newspaper, BrainCircuit, Target, LineChart, Terminal,
  Clock, Lock, Sun, Moon
} from 'lucide-react';
import { 
  ChartPaneState, CandleData, Position, SystemPreferences, Timeframe, IndicatorSettings, SmartSignalOutput 
} from './types';
import { POPULAR_SYMBOLS } from './utils/dataGenerator';
import { TradingChart } from './components/TradingChart';
import { TradingPanel } from './components/TradingPanel';
import { StatsPanel } from './components/StatsPanel';
import { TradeHistory } from './components/TradeHistory';
import { CommandPalette } from './components/CommandPalette';
import { SettingsDrawer } from './components/SettingsDrawer';
import { AiQuantPanel } from './components/AiQuantPanel';
import { ClaudeTerminalPanel } from './components/ClaudeTerminalPanel';
const PineScriptConverterPanel = React.lazy(() => import('./components/PineScriptConverterPanel').then(m => ({ default: m.PineScriptConverterPanel })));
const AiAgentsHubPanel = React.lazy(() => import('./components/AiAgentsHubPanel').then(m => ({ default: m.AiAgentsHubPanel })));
const SecretsVaultPanel = React.lazy(() => import('./components/SecretsVaultPanel').then(m => ({ default: m.SecretsVaultPanel })));
const AutonomousBotsPanel = React.lazy(() => import('./components/AutonomousBotsPanel').then(m => ({ default: m.AutonomousBotsPanel })));
import { useTerminalStore } from './store/useTerminalStore';
import { useBotsList } from './hooks/useBotsList';
import { fetchRealHistoricCandles, LiveDataProvider } from './services/liveData';
import { loadDrawings, saveDrawings } from './services/db';
import { saveEncryptedToStorage, loadDecryptedFromStorage } from './utils/crypto';
import { authenticatedFetch, getSessionToken, getSessionUser, clearSession } from './utils/api';
import { AuthScreen } from './components/AuthScreen';
import { LogOut, User as UserIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const PANE_THEMES: Record<number, { bg: string; text: string; border: string; shadow: string; ring: string }> = {
  1: { bg: 'bg-blue-600', text: 'text-blue-100', border: 'border-blue-600', shadow: 'shadow-[0_0_20px_rgba(37,99,235,0.2)]', ring: 'ring-blue-500' },
  2: { bg: 'bg-red-600', text: 'text-red-100', border: 'border-red-600', shadow: 'shadow-[0_0_20px_rgba(220,38,38,0.2)]', ring: 'ring-red-500' },
  3: { bg: 'bg-emerald-600', text: 'text-emerald-100', border: 'border-emerald-600', shadow: 'shadow-[0_0_20px_rgba(16,185,129,0.2)]', ring: 'ring-emerald-500' },
  4: { bg: 'bg-amber-600', text: 'text-amber-100', border: 'border-amber-600', shadow: 'shadow-[0_0_20px_rgba(245,158,11,0.2)]', ring: 'ring-amber-500' },
  5: { bg: 'bg-violet-600', text: 'text-violet-100', border: 'border-violet-600', shadow: 'shadow-[0_0_20px_rgba(139,92,246,0.2)]', ring: 'ring-violet-500' },
  6: { bg: 'bg-pink-600', text: 'text-pink-100', border: 'border-pink-600', shadow: 'shadow-[0_0_20px_rgba(236,72,153,0.2)]', ring: 'ring-pink-500' },
  7: { bg: 'bg-cyan-600', text: 'text-cyan-100', border: 'border-cyan-600', shadow: 'shadow-[0_0_20px_rgba(6,182,212,0.2)]', ring: 'ring-cyan-500' },
  8: { bg: 'bg-orange-600', text: 'text-orange-100', border: 'border-orange-600', shadow: 'shadow-[0_0_20px_rgba(249,115,22,0.2)]', ring: 'ring-orange-500' },
};

// Group popular symbols by category statically
const symbolsByCategory = (() => {
  const groups: Record<string, typeof POPULAR_SYMBOLS> = {};
  POPULAR_SYMBOLS.forEach(sym => {
    const cat = sym.category;
    if (!groups[cat]) {
      groups[cat] = [];
    }
    groups[cat].push(sym);
  });
  return groups;
})();

// Seed default indicators setup
const INITIAL_INDICATORS: IndicatorSettings = {
  ema20: false,
  ema50: false,
  ema80: false,
  ema200: false,
  vwap: false,
  bollingerBands: false,
  ichimoku: false,
  fvg: false,
  volumeProfile: false, // Disabled by default as requested
  macd: false,
  rsi: false,
  fractal: false,
  smartSignal: false,
  orderFlow: false,
  smcOrderBlocks: false,
  smcLiquiditySweeps: false,
  cvd: false,
  obvMacdDoubleMacd: true,
  killerIdm: true,
  emaPeriods: [20, 50, 80, 200],
  rsiLength: 14,
  macdParams: [12, 26, 9],
  volumeProfileBins: 40,
  smartSignalParams: {
    emaFast: 20,
    emaMed: 50,
    emaSlow: 80,
    rsiLength: 14,
    rsiBuyMin: 40,
    rsiBuyMax: 65,
    rsiSellMin: 35,
    rsiSellMax: 60,
    volRatio: 1.1
  }
};

// Seed default panes state
function initializeDefaultPanes(count: number): ChartPaneState[] {
  const defaultSymbols = [
    'BTC', 'EURUSD', 'GOLD', 'AAPL', 
    'SPY', 'SPX', 'ETH', 'OIL'
  ];
  return Array.from({ length: 8 }, (_, i) => ({
    id: `pane-${i + 1}`,
    symbol: defaultSymbols[i % defaultSymbols.length],
    timeframe: '1d',
    chartType: 'candlestick',
    isReplayMode: false,
    replayStartIndex: null,
    replayCurrentIndex: null,
    replaySpeed: 1,
    isPlaying: false,
    bookmarks: [],
    drawings: [],
    indicators: { ...INITIAL_INDICATORS },
    activeDrawingType: null,
    selectedElementForDeletion: null,
    l2depth: { bids: [], asks: [] }
  }));
}

export default function App() {
  const {
    isAuthenticated, setIsAuthenticated,
    currentUser, setCurrentUser,
    prefs, setPrefs,
    visiblePaneIds, setVisiblePaneIds,
    panes, setPanes,
    focusedPaneId, setFocusedPaneId,
    maximizedPaneId, setMaximizedPaneId,
    positions, setPositions,
    closedTrades, setClosedTrades,
    historicDataCache, setHistoricDataCache,
    historicDataErrors, setHistoricDataErrors,
    isCommandPaletteOpen, setIsCommandPaletteOpen,
    isSettingsOpen, setIsSettingsOpen,
    showOnboarding, setShowOnboarding,
    activeRightPanel, setActiveRightPanel,
    toasts, setToasts,
    autoTradeEnabled, setAutoTradeEnabled,
    isSimpleMode, setIsSimpleMode,
    themeMode, setThemeMode,
    setActiveSymbol,
  } = useTerminalStore();

  const {
    bots: serverBots,
    toggleBot,
    createBot,
    fetchBots: fetchServerBots,
  } = useBotsList(true, 5000);

  // Decrypt and load all state caches on app initialization
  useEffect(() => {
    if (!currentUser) return;
    let isMounted = true;
    (async () => {
      const uId = currentUser.id;
      
      const decryptedPrefs = await loadDecryptedFromStorage<any>(`terminal_preferences_${uId}`);
      if (decryptedPrefs && isMounted) {
        setPrefs(decryptedPrefs);
      }
      
      const decryptedPaneIds = await loadDecryptedFromStorage<any>(`terminal_visible_pane_ids_${uId}`);
      if (decryptedPaneIds && isMounted) {
        setVisiblePaneIds(decryptedPaneIds);
      }
      
      const decryptedPanes = await loadDecryptedFromStorage<any>(`terminal_panes_config_${uId}`);
      if (decryptedPanes && isMounted) {
        setPanes(decryptedPanes);
      }
      
      const decryptedPositions = await loadDecryptedFromStorage<any>(`terminal_positions_active_${uId}`);
      if (decryptedPositions && isMounted) {
        setPositions(decryptedPositions);
      }
      
      const decryptedTrades = await loadDecryptedFromStorage<any>(`terminal_trades_history_${uId}`);
      if (decryptedTrades && isMounted) {
        setClosedTrades(decryptedTrades);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [currentUser, setPrefs, setVisiblePaneIds, setPanes, setPositions, setClosedTrades]);

  // Save preferences on update
  useEffect(() => {
    if (!currentUser) return;
    saveEncryptedToStorage(`terminal_preferences_${currentUser.id}`, prefs);
  }, [prefs, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    saveEncryptedToStorage(`terminal_visible_pane_ids_${currentUser.id}`, visiblePaneIds);
  }, [visiblePaneIds, currentUser]);

  // Auto-shift focus to a visible pane if current one gets hidden
  useEffect(() => {
    if (visiblePaneIds.length > 0 && !visiblePaneIds.includes(focusedPaneId)) {
      setFocusedPaneId(visiblePaneIds[0]);
    }
  }, [visiblePaneIds, focusedPaneId]);

  // Keep state collections saved in localStorage
  useEffect(() => {
    if (!currentUser) return;
    // Strip drawings to keep localStorage lightweight, store drawings in IndexedDB instead
    const panesWithoutDrawings = panes.map(p => ({ ...p, drawings: [] }));
    saveEncryptedToStorage(`terminal_panes_config_${currentUser.id}`, panesWithoutDrawings);

    panes.forEach(p => {
       saveDrawings(p.id, p.drawings, currentUser.id).catch(console.error);
    });
  }, [panes, currentUser]);

  // Load drawings from IndexedDB on initial mount
  useEffect(() => {
    if (!currentUser) return;
    let mounted = true;
    (async () => {
       const copies = [...panes];
       let changed = false;
       for (const pane of copies) {
          try {
            const drawings = await loadDrawings(pane.id, currentUser.id);
            if (drawings && drawings.length > 0) {
               pane.drawings = drawings;
               changed = true;
            }
          } catch(e) {}
       }
       if (mounted && changed) {
          setPanes(copies);
       }
    })();
    return () => { mounted = false };
  }, [currentUser]); // run when currentUser is available

  useEffect(() => {
    if (!currentUser) return;
    saveEncryptedToStorage(`terminal_positions_active_${currentUser.id}`, positions);
  }, [positions, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    saveEncryptedToStorage(`terminal_trades_history_${currentUser.id}`, closedTrades);
  }, [closedTrades, currentUser]);

  // Find active focused pane parameters
  const focusedPane = useMemo(() => {
    return panes.find(p => p.id === focusedPaneId) || panes[0];
  }, [panes, focusedPaneId]);

  const focusedCacheKey = `${focusedPane.symbol}-${focusedPane.timeframe}`;
  const focusedData = historicDataCache[focusedCacheKey] || [];
  const focusedLastCandle = focusedData[focusedData.length - 1] || null;
  const focusedPrice = focusedLastCandle ? focusedLastCandle.close : 100;

  const fetchCandlesForPane = useCallback((symbol: string, timeframe: string) => {
    const cacheKey = `${symbol}-${timeframe}`;
    // Mark as loading and clear previous errors
    setHistoricDataCache(prev => ({ ...prev, [cacheKey]: [] }));
    setHistoricDataErrors(prev => ({ ...prev, [cacheKey]: null }));

    fetchRealHistoricCandles(symbol, timeframe, 600).then(rawBars => {
       if (rawBars.length === 0) {
         setHistoricDataErrors(prev => ({
           ...prev,
           [cacheKey]: `Failed to establish real-time market data stream for ${symbol} (${timeframe}) after multiple automatic attempts.`
         }));
       } else {
         setHistoricDataCache(prev => ({ ...prev, [cacheKey]: rawBars }));
         setHistoricDataErrors(prev => ({ ...prev, [cacheKey]: null }));
       }
    }).catch(err => {
       setHistoricDataErrors(prev => ({
         ...prev,
         [cacheKey]: err?.message || 'Unknown connection error'
       }));
    });
  }, [setHistoricDataCache, setHistoricDataErrors]);

  // Trigger cache fetch on pane modifications
  useEffect(() => {
    panes.forEach(p => {
      const cacheKey = `${p.symbol}-${p.timeframe}`;
      if (!historicDataCache[cacheKey] && !historicDataErrors[cacheKey]) {
        fetchCandlesForPane(p.symbol, p.timeframe);
      }
    });
  }, [panes, fetchCandlesForPane, historicDataCache, historicDataErrors]);

  const alignedKeys = useRef<Set<string>>(new Set());

  // Sync historicDataCache with real Yahoo Finance prices when they are fetched
  useEffect(() => {
    const timer = setInterval(() => {
      setHistoricDataCache(currentCache => {
        let cacheUpdated = false;
        const newCache = { ...currentCache };

        Object.keys(newCache).forEach(cacheKey => {
          if (alignedKeys.current.has(cacheKey)) return; // Only align once

          const [symbol, timeframe] = cacheKey.split('-');
          const provider = LiveDataProvider.getInstance();
          if (!provider.hasLivePrice(symbol)) return; // Only align when we have a REAL live price fetched!

          const livePriceObj = provider.getLatestPrice(symbol);
          
          if (livePriceObj && livePriceObj.price) {
            const candles = newCache[cacheKey];
            if (candles && candles.length > 0) {
              const lastCandle = candles[candles.length - 1];
              const diff = livePriceObj.price - lastCandle.close;
              
              // Shift the series to match Yahoo live price if they deviate notable
              // 0.2% block deviation to trigger alignment nicely
              if (Math.abs(diff) > lastCandle.close * 0.002) {
                const multiplier = livePriceObj.price / lastCandle.close;
                newCache[cacheKey] = candles.map(c => ({
                  ...c,
                  open: Number((c.open * multiplier).toFixed(4)),
                  high: Number((c.high * multiplier).toFixed(4)),
                  low: Math.max(0.0001, Number((c.low * multiplier).toFixed(4))),
                  close: Number((c.close * multiplier).toFixed(4))
                }));
                cacheUpdated = true;
                console.log(`Aligned ${cacheKey} candles by multiplier ${multiplier.toFixed(4)} to match Yahoo Live price: ${livePriceObj.price}`);
              }
              // Mark as aligned regardless, so we don't fight with the WebSocket
              alignedKeys.current.add(cacheKey);
            }
          }
        });

        return cacheUpdated ? newCache : currentCache;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [setHistoricDataCache]);

  // Clear or wipe storage cache
  const handleWipeData = () => {
    localStorage.removeItem('terminal_panes_config');
    localStorage.removeItem('terminal_positions_active');
    localStorage.removeItem('terminal_trades_history');
    localStorage.removeItem('terminal_preferences');
    setPanes(initializeDefaultPanes(8));
    setPositions([]);
    setClosedTrades([]);
    setPrefs({
      chartCount: 2,
      soundEnabled: true,
      hotkeysEnabled: true,
      themeAccent: 'blue',
      accountBalance: 10000,
      riskPercent: 1.0,
      syncTimeEnabled: false
    });
    addToast('SUCCESS', 'All cached terminal settings wiped successfully.');
  };





  // Sync store active symbol with focused pane symbol
  useEffect(() => {
    if (focusedPane?.symbol) {
      setActiveSymbol(focusedPane.symbol);
    }
  }, [focusedPane?.symbol, setActiveSymbol]);

  // Enforce single-pane limitation in Simple Mode
  useEffect(() => {
    if (isSimpleMode && visiblePaneIds.length > 1) {
      setVisiblePaneIds([focusedPaneId || 'pane-1']);
    }
  }, [isSimpleMode, visiblePaneIds, focusedPaneId]);

  const isLight = themeMode === 'light';

  const handleToggleBotMode = async (symbol: string) => {
    try {
      const existing = serverBots.find(b => b.symbol === symbol);
      if (existing) {
        // Toggle the existing bot
        const success = await toggleBot(existing.id);
        if (success) {
          const newState = existing.status === 'RUNNING' ? 'PAUSED' : 'RUNNING';
          addToast('INFO', `Server AI Bot for ${symbol} is now ${newState}`);
          playBeep(800, 0.15);
        }
      } else {
        // Create a new running bot for this symbol
        const res = await createBot({
          name: `AI-Pilot-${symbol}`,
          symbol: symbol,
          timeframe: focusedPane?.timeframe || '1h',
          strategy: 'Gemini AI Decision',
          balance: 10000
        });
        if (res.success) {
          addToast('SUCCESS', `Autonomous AI Bot started for ${symbol}!`);
          playBeep(1000, 0.2);
        } else {
          addToast('WARN', `Could not start server-side bot. Check API key.`);
        }
      }
    } catch (e) {
      addToast('WARN', `Failed to connect to backend bot controller.`);
    }
  };


  // Sound triggering helper using Web Audio API
  const playBeep = (frequency = 600, duration = 0.12) => {
    if (!prefs.soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      // audio context blocked by browser
    }
  };

  // Notification slide alert handler
  const addToast = (type: 'INFO' | 'SUCCESS' | 'WARN', message: string) => {
    const id = Math.random().toString();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  const loadTemplate = (templateId: string) => {
    const isBeg = templateId === 'beginner';
    setIsSimpleMode(isBeg);
    localStorage.setItem('is_simple_mode', String(isBeg));
    
    if (templateId === 'beginner') {
      setVisiblePaneIds(['pane-1']);
      setFocusedPaneId('pane-1');
      handleUpdatePane('pane-1', {
        symbol: 'BTC',
        timeframe: '1d',
        indicators: {
          ...INITIAL_INDICATORS,
          ema20: true,
          ema50: false,
          ema80: false,
          ema200: false,
          rsi: false,
          macd: false,
          smartSignal: false,
          bollingerBands: false,
          volumeProfile: false
        }
      });
      addToast('SUCCESS', 'Loaded Beginner Template in Simple Mode.');
    } else if (templateId === 'scalping') {
      setVisiblePaneIds(['pane-1', 'pane-2']);
      setFocusedPaneId('pane-1');
      handleUpdatePane('pane-1', {
        symbol: 'SOL',
        timeframe: '5m',
        indicators: {
          ...INITIAL_INDICATORS,
          rsi: true,
          bollingerBands: true,
          smartSignal: true
        }
      });
      handleUpdatePane('pane-2', {
        symbol: 'SOL',
        timeframe: '15m',
        indicators: {
          ...INITIAL_INDICATORS,
          rsi: true,
          bollingerBands: true,
          smartSignal: false
        }
      });
      addToast('SUCCESS', 'Loaded Crypto Scalping Template.');
    } else if (templateId === 'forex') {
      setVisiblePaneIds(['pane-1', 'pane-2']);
      setFocusedPaneId('pane-1');
      handleUpdatePane('pane-1', {
        symbol: 'EURUSD',
        timeframe: '1h',
        indicators: {
          ...INITIAL_INDICATORS,
          macd: true,
          smcOrderBlocks: true
        }
      });
      addToast('SUCCESS', 'Loaded Forex Swing Trading Template.');
    } else if (templateId === 'stocks') {
      setVisiblePaneIds(['pane-1']);
      setFocusedPaneId('pane-1');
      handleUpdatePane('pane-1', {
        symbol: 'AAPL',
        timeframe: '1d',
        indicators: {
          ...INITIAL_INDICATORS,
          volumeProfile: true
        }
      });
      setActiveRightPanel('backtest');
      addToast('SUCCESS', 'Loaded Stock Backtesting Template.');
    } else if (templateId === 'smc') {
      setVisiblePaneIds(['pane-1', 'pane-2']);
      setFocusedPaneId('pane-1');
      handleUpdatePane('pane-1', {
        symbol: 'BTC',
        timeframe: '15m',
        indicators: {
          ...INITIAL_INDICATORS,
          smcOrderBlocks: true,
          smcLiquiditySweeps: true,
          fvg: true
        }
      });
      addToast('SUCCESS', 'Loaded SMC/ICT Structure Template.');
    } else if (templateId === 'ai_lab') {
      setVisiblePaneIds(['pane-1']);
      setFocusedPaneId('pane-1');
      handleUpdatePane('pane-1', {
        symbol: 'ETH',
        timeframe: '1h',
        indicators: {
          ...INITIAL_INDICATORS,
          smartSignal: true
        },
        pineStrategy: {
          name: "SMC Premium Reversion v2",
          description: "Active AI compilation of SMC Fair Value Gaps and EMA crossovers.",
          parameters: [
            { key: "fastPeriod", label: "Fast EMA Length", type: "number", default: 10, value: 10 },
            { key: "rsiLen", label: "RSI Trigger Length", type: "number", default: 14, value: 14 }
          ],
          pineCode: `//@version=5\nstrategy("SMC Premium Reversion v2")`,
          jsCode: `// Generated JS Code`,
          active: true
        }
      });
      setActiveRightPanel('terminal');
      addToast('SUCCESS', 'Loaded AI Strategy Lab Template.');
    }
    
    setShowOnboarding(false);
    localStorage.setItem('onboarding_completed', 'true');
  };

  // Find active focused pane parameters (moved earlier)

  // Active open order selector for focused symbol
  const activePosition = useMemo(() => {
    return positions.find(pos => pos.paneId === focusedPane.id && pos.status === 'OPEN') || null;
  }, [positions, focusedPane.id]);

  // Helper to split panes by active visibility selections
  const visiblePanes = useMemo(() => {
    if (maximizedPaneId) {
      return panes.filter(p => p.id === maximizedPaneId);
    }
    return panes.filter(p => visiblePaneIds.includes(p.id));
  }, [panes, visiblePaneIds, maximizedPaneId]);

  // Support responsive grid margins based on the number of currently active charts visible
  const gridLayoutClass = useMemo(() => {
    if (maximizedPaneId) return 'grid-cols-1 md:grid-cols-1 h-full';
    const visibleCount = visiblePanes.length;
    switch (visibleCount) {
      case 1: return 'grid-cols-1 md:grid-cols-1 h-full';
      case 2: return 'grid-cols-1 md:grid-cols-2 h-full gap-4';
      case 3: return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 h-full gap-3';
      case 4: return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 h-full gap-3';
      case 5:
      case 6: return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 h-full gap-3';
      case 7:
      case 8: return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 h-full gap-2';
      default: return 'grid-cols-1 md:grid-cols-2 h-full gap-4';
    }
  }, [visiblePanes.length]);

  // 4. Update individual pane helper function
  const handleUpdatePane = (paneId: string, updatedFields: Partial<ChartPaneState>) => {
    setPanes(prev => prev.map(p => {
      if (p.id === paneId) {
        return { ...p, ...updatedFields };
      }
      return p;
    }));
  };

  const calculateDrawdown = () => {
    if (closedTrades.length === 0) return 0;
    let bal = 10000;
    let peak = bal;
    let maxDrawdown = 0;
    for (const t of closedTrades) {
      bal += t.pnl ?? 0;
      if (bal > peak) peak = bal;
      const dd = ((peak - bal) / peak) * 100;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
    return maxDrawdown;
  };

  // Execute Market orders with Global Risk Interceptor
  const handleExecuteTrade = async (
    direction: 'BUY' | 'SELL',
    quantity: number,
    slDistance: number,
    tpDistance: number
  ) => {
    // Prevent overriding existing open positions
    if (activePosition) {
      addToast('WARN', `Already have an open trade for ${focusedPane.symbol} on this panel! Close it first.`);
      return;
    }

    const price = focusedPrice;
    const time = focusedLastCandle ? focusedLastCandle.time : Math.floor(Date.now() / 1000);

    const tpPrice = direction === 'BUY' ? price + tpDistance : price - tpDistance;
    const slPrice = direction === 'BUY' ? price - slDistance : price + slDistance;

    try {
      const currentDrawdown = calculateDrawdown();
      const res = await authenticatedFetch('/api/trade/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: focusedPane.symbol,
          direction,
          quantity,
          price,
          type: 'MARKET',
          balance: prefs.accountBalance,
          currentDrawdown
        })
      });

      const execution = await res.json();

      if (!execution.approved) {
        addToast('WARN', execution.reason || 'Order rejected by Risk Management.');
        playBeep(400, 0.35); // low buzz
        return;
      }

      const filledPrice = execution.executedPrice;
      const feeVal = execution.fee;

      // Deduct fee from account balance
      setPrefs(prev => ({
        ...prev,
        accountBalance: Number((prev.accountBalance - feeVal).toFixed(2))
      }));

      const newPos: Position = {
        id: execution.orderId || Math.random().toString(),
        paneId: focusedPane.id,
        symbol: focusedPane.symbol,
        direction,
        entryPrice: filledPrice,
        entryTime: time,
        quantity,
        tpPrice: Number(tpPrice.toFixed(2)),
        slPrice: Number(slPrice.toFixed(2)),
        status: 'OPEN'
      };

      setPositions(prev => [...prev, newPos]);
      playBeep(880, 0.15); // fill alert
      addToast('SUCCESS', `${direction} order entry filled: ${quantity} units at $${filledPrice} (Fee: $${feeVal}, Slip: $${execution.slippage})`);
    } catch (err) {
      console.error(err);
      const newPos: Position = {
        id: Math.random().toString(),
        paneId: focusedPane.id,
        symbol: focusedPane.symbol,
        direction,
        entryPrice: Number(price.toFixed(2)),
        entryTime: time,
        quantity,
        tpPrice: Number(tpPrice.toFixed(2)),
        slPrice: Number(slPrice.toFixed(2)),
        status: 'OPEN'
      };

      setPositions(prev => [...prev, newPos]);
      playBeep(880, 0.15);
      addToast('SUCCESS', `${direction} order entry filled: ${quantity} units at $${price}`);
    }
  };

  // Close trade manually or on SL/TP crossing hits
  const handleCloseTrade = (paneId: string, positionId: string, pnl: number, exitPrice: number) => {
    const pos = positions.find(p => p.id === positionId);
    if (!pos) return;

    // Calculate percentage change
    const grossVal = pos.entryPrice * pos.quantity;
    const pnlPercent = (pnl / grossVal) * 100;

    const closedPos: Position = {
      ...pos,
      status: 'CLOSED',
      exitPrice: Number(exitPrice.toFixed(2)),
      exitTime: Math.floor(Date.now() / 1000),
      pnl: Number(pnl.toFixed(2)),
      pnlPercent: Number(pnlPercent.toFixed(2))
    };

    // Remove from active list
    setPositions(prev => prev.filter(p => p.id !== positionId));
    
    // Only push to history if it doesn't already exist to prevent duplicate keys
    setClosedTrades(prev => {
      if (prev.some(t => t.id === positionId)) return prev;
      return [...prev, closedPos];
    });

    // Update account balance
    setPrefs(prev => ({
      ...prev,
      accountBalance: Number((prev.accountBalance + pnl).toFixed(2))
    }));

    // Trigger audio beeps
    const isWin = pnl > 0;
    if (isWin) {
      playBeep(1200, 0.22); // triumphant high beep
      addToast('SUCCESS', `Win Trade! TP Hit on ${pos.symbol}: +$${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
    } else {
      playBeep(400, 0.25); // low buzz loss beep
      addToast('WARN', `Loss Trade! SL Hit on ${pos.symbol}: -$${Math.abs(pnl).toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
    }
  };

  // Manual update of position limits (TP, SL line updates from chart dragging)
  const handleUpdatePositionPrice = (positionId: string, fields: Partial<Position>) => {
    setPositions(prev => prev.map(p => {
      if (p.id === positionId) {
        return { ...p, ...fields };
      }
      return p;
    }));
  };

  const handleChartSignal = (paneId: string, signal: SmartSignalOutput) => {
    if (!autoTradeEnabled) return;
    const existing = positions.find(pos => pos.paneId === paneId && pos.status === 'OPEN');
    if (existing) return; // avoid duplicates

    // find the pane
    const p = panes.find(x => x.id === paneId);
    if (!p) return;
    
    const direction = signal.signal === 'BUY' ? 'BUY' : 'SELL';
    
    const time = Math.floor(Date.now() / 1000);
    const tpPrice = signal.tp;
    const slPrice = signal.sl;

    const newPos: Position = {
      id: Math.random().toString(),
      paneId: p.id,
      symbol: p.symbol,
      direction,
      quantity: prefs.accountBalance * (prefs.riskPercent / 100) / signal.entry,
      entryPrice: signal.entry,
      tpPrice,
      slPrice,
      entryTime: time,
      status: 'OPEN'
    };

    setPositions(prev => [...prev, newPos]);
    addToast('SUCCESS', `AI AutoTrade: ${direction} Triggered on ${p.symbol}`);
    playBeep(direction === 'BUY' ? 800 : 300, 0.1);
  };

  // Recover shared links parameters inside the active URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get('session');
    if (session) {
      try {
        const decoded = JSON.parse(atob(session));
        if (decoded && Array.isArray(decoded.panes)) {
          setPanes(prev => {
            const copy = [...prev];
            decoded.panes.forEach((sharedPane: any, i: number) => {
              if (copy[i]) {
                copy[i] = { ...copy[i], ...sharedPane };
              }
            });
            return copy;
          });
          if (decoded.visiblePaneIds && Array.isArray(decoded.visiblePaneIds)) {
            setVisiblePaneIds(decoded.visiblePaneIds);
          } else if (decoded.chartCount) {
            setVisiblePaneIds(Array.from({ length: decoded.chartCount }, (_, i) => `pane-${i + 1}`));
          }
          setPrefs(prev => ({ ...prev, chartCount: decoded.chartCount || prev.chartCount }));
          addToast('SUCCESS', 'Shared multi-chart session parameters imported successfully.');
        }
      } catch (e) {
        addToast('WARN', 'Shared session URL had illegal formats or parsing fails');
      }
    }
  }, []);

  // Encode setups and serialize URL parameters
  const handleCopySessionURL = () => {
    try {
      const payload = {
        chartCount: prefs.chartCount,
        visiblePaneIds,
        panes: panes.filter(p => visiblePaneIds.includes(p.id)).map(p => ({
          symbol: p.symbol,
          timeframe: p.timeframe,
          isReplayMode: p.isReplayMode,
          replayStartIndex: p.replayStartIndex,
          bookmarks: p.bookmarks
        }))
      };

      const base64 = btoa(JSON.stringify(payload));
      const shareUrl = `${window.location.origin}${window.location.pathname}?session=${base64}`;

      navigator.clipboard.writeText(shareUrl);
      playBeep(1000, 0.1);
      addToast('SUCCESS', 'Share URL encoded & copied to clipboard!');
    } catch (e) {
      addToast('WARN', 'Sharing failed on base64 translation bounds.');
    }
  };

  // 5. Setup active keyboard Hotkey hooks
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!prefs.hotkeysEnabled) return;
      
      // Ensure the user isn't filing/editing values inside interactive text boxes
      const activeEl = document.activeElement;
      if (activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
      )) {
        return;
      }

      // Hotkey maps
      switch (e.code) {
        // B (Buy Long)
        case 'KeyB':
          e.preventDefault();
          const p = 10; // default points
          const maxLossLoss = prefs.accountBalance * (prefs.riskPercent / 100);
          const autoQty = maxLossLoss / (p || 1);
          handleExecuteTrade('BUY', Math.max(0.1, Number(autoQty.toFixed(1))), p, p * 2);
          break;

        // S (Sell Short)
        case 'KeyS':
          e.preventDefault();
          const spLimit = 10;
          const maxLossLossS = prefs.accountBalance * (prefs.riskPercent / 100);
          const autoQtyS = maxLossLossS / (spLimit || 1);
          handleExecuteTrade('SELL', Math.max(0.1, Number(autoQtyS.toFixed(1))), spLimit, spLimit * 2);
          break;

        // Space (Replay Play/Pause)
        case 'Space':
          e.preventDefault();
          handleUpdatePane(focusedPane.id, { isPlaying: !focusedPane.isPlaying });
          break;

        // Right Arrow (Step Forward)
        case 'ArrowRight':
          e.preventDefault();
          if (focusedPane.isReplayMode && focusedPane.replayCurrentIndex !== null && focusedPane.replayCurrentIndex < focusedData.length - 1) {
            handleUpdatePane(focusedPane.id, { replayCurrentIndex: focusedPane.replayCurrentIndex + 1 });
          }
          break;

        // Left Arrow (Step Backward)
        case 'ArrowLeft':
          e.preventDefault();
          if (focusedPane.isReplayMode && focusedPane.replayCurrentIndex !== null && focusedPane.replayCurrentIndex > (focusedPane.replayStartIndex || 0)) {
            handleUpdatePane(focusedPane.id, { replayCurrentIndex: focusedPane.replayCurrentIndex - 1 });
          }
          break;

        // R (Toggle Replay)
        case 'KeyR':
          e.preventDefault();
          handleUpdatePane(focusedPane.id, { 
            isReplayMode: !focusedPane.isReplayMode,
            replayStartIndex: null,
            replayCurrentIndex: null,
            isPlaying: false 
          });
          break;

        // Escape (Cancel overlays)
        case 'Escape':
          e.preventDefault();
          handleUpdatePane(focusedPane.id, { activeDrawingType: null });
          break;

        // '=' or '+' to increase replay speed
        case 'Equal':
        case 'NumpadAdd':
          e.preventDefault();
          const sIndexList = [0.1, 0.3, 0.5, 1, 3, 10];
          const currSIndex = sIndexList.indexOf(focusedPane.replaySpeed);
          if (currSIndex >= 0 && currSIndex < sIndexList.length - 1) {
            handleUpdatePane(focusedPane.id, { replaySpeed: sIndexList[currSIndex + 1] });
          }
          break;

        // '-' to decrease replay speed
        case 'Minus':
        case 'NumpadSubtract':
          e.preventDefault();
          const sIndices = [0.1, 0.3, 0.5, 1, 3, 10];
          const currSIdx = sIndices.indexOf(focusedPane.replaySpeed);
          if (currSIdx > 0) {
            handleUpdatePane(focusedPane.id, { replaySpeed: sIndices[currSIdx - 1] });
          }
          break;

        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedPane, prefs, positions, focusedPrice, focusedLastCandle]);

  // Global Delete drawing element interceptor
  useEffect(() => {
    const handleDel = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (focusedPane.selectedElementForDeletion?.type === 'drawing') {
          handleUpdatePane(focusedPane.id, {
            drawings: focusedPane.drawings.filter(d => d.id !== focusedPane.selectedElementForDeletion?.id),
            selectedElementForDeletion: null
          });
          addToast('INFO', 'Drawing line removed.');
        }
      }
    };
    window.addEventListener('keydown', handleDel);
    return () => window.removeEventListener('keydown', handleDel);
  }, [focusedPane]);

  // Trigger Cmd/Ctrl-K search
  useEffect(() => {
    const handleCommandPaletteShortcut = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleCommandPaletteShortcut);
    return () => window.removeEventListener('keydown', handleCommandPaletteShortcut);
  }, []);

  if (!isAuthenticated) {
    return (
      <AuthScreen 
        onAuthSuccess={(user) => {
          setCurrentUser(user);
          setIsAuthenticated(true);
        }} 
      />
    );
  }

  return (

    <div className={`h-screen max-h-screen overflow-hidden ${isLight ? 'bg-slate-50 text-slate-800' : 'bg-[#07090c] text-gray-200'} flex flex-col font-sans select-none`}>
      
      {/* 1. Global Navigation header */}
      {!maximizedPaneId && (
      <header className={`bg-${isLight ? 'white/90 border-slate-200' : '[#0b0e14]/80 border-[#171a25]'} backdrop-blur border-b py-1.5 px-4 flex flex-row items-center justify-between gap-3 sticky top-0 z-40 text-xs shrink-0 min-h-[44px]`}>
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <BarChart2 className="w-4 h-4 text-blue-500" />
            <div className="absolute inset-0 bg-blue-500 blur-sm opacity-40"></div>
          </div>
          <h1 className={`font-bold tracking-tight text-xs uppercase ${isLight ? 'text-slate-800' : 'text-white'} flex items-center gap-1.5`}>
            <span className="hidden md:inline">SPLIT-SCREEN TERMINAL</span>
            <span className={`text-[9px] font-mono select-none px-1 py-0.5 rounded ${isLight ? 'bg-slate-200 text-slate-600' : 'bg-gray-800 text-gray-400'}`}>v4.6</span>
          </h1>
        </div>
 
        {/* Dynamic selector controls */}
        <div className="flex items-center gap-2 lg:gap-3 flex-nowrap overflow-x-auto scrollbar-none py-1">
          {/* Simple vs Pro Mode Pill Selector */}
          <div className={`flex items-center p-0.5 rounded-lg border shrink-0 ${isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#131722] border-[#2a2e39]'}`}>
            <button
              onClick={() => {
                setIsSimpleMode(true);
                localStorage.setItem('is_simple_mode', 'true');
                addToast('INFO', 'Switched to Simple Mode. Clutter minimized.');
              }}
              className={`px-2 py-1 rounded-md text-[9px] uppercase font-bold tracking-wider transition-all cursor-pointer ${
                isSimpleMode 
                  ? 'bg-blue-600 text-white shadow-sm font-extrabold' 
                  : `${isLight ? 'text-slate-500 hover:text-slate-700' : 'text-gray-400 hover:text-gray-200'}`
              }`}
            >
              Simple
            </button>
            <button
              onClick={() => {
                setIsSimpleMode(false);
                localStorage.setItem('is_simple_mode', 'false');
                addToast('INFO', 'Switched to Pro Mode. Full multi-chart workstation enabled.');
              }}
              className={`px-2 py-1 rounded-md text-[9px] uppercase font-bold tracking-wider transition-all cursor-pointer ${
                !isSimpleMode 
                  ? 'bg-[#1e2330] text-emerald-450 border border-emerald-500/20 shadow-sm font-extrabold' 
                  : `${isLight ? 'text-slate-500 hover:text-slate-700' : 'text-gray-400 hover:text-gray-200'}`
              }`}
            >
              Pro
            </button>
          </div>

          {/* Chart counts selector */}
          <div className={`flex items-center shrink-0 ${isLight ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-[#131722] border-[#2a2e39] text-gray-200'} border rounded px-2 py-1 text-xs gap-1.5 font-mono`}>
            <span className="text-gray-450 font-sans text-[10px] uppercase mr-0.5 hidden sm:inline">Active:</span>
            {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
              const id = `pane-${num}`;
              const isVisible = visiblePaneIds.includes(id);
              const theme = PANE_THEMES[num] || PANE_THEMES[1];
              return (
                <button
                  key={num}
                  onClick={() => {
                    if (isSimpleMode) {
                      setVisiblePaneIds([id]);
                      setFocusedPaneId(id);
                      addToast('INFO', `Focused Chart ${num} in Simple Mode`);
                    } else {
                      setVisiblePaneIds(prev => {
                        if (prev.includes(id)) {
                          if (prev.length === 1) {
                            addToast('WARN', 'At least one chart pane must remain visible.');
                            return prev;
                          }
                          return prev.filter(pId => pId !== id);
                        } else {
                          return [...prev, id];
                        }
                      });
                    }
                  }}
                  className={`w-5 h-5 flex items-center justify-center rounded text-[10px] cursor-pointer font-bold transition-all ${
                    isVisible 
                      ? `${theme.bg} ${theme.text} font-extrabold scale-110 shadow-sm` 
                      : `${isLight ? 'bg-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-300' : 'bg-gray-800/40 text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`
                  }`}
                  title={isSimpleMode ? `Focus Chart Window ${num}` : `${isVisible ? 'Hide' : 'Show'} Chart Window ${num}`}
                >
                  {num}
                </button>
              );
            })}
          </div>
 
          {/* Focused Ticker fast selectors */}
          <div className="flex items-center gap-1 shrink-0">
            <select
              value={focusedPane.symbol}
              onChange={(e) => handleUpdatePane(focusedPane.id, { symbol: e.target.value })}
              className={`${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-[#131722] border-[#2a2e39] text-gray-200'} border rounded text-[11px] py-1 px-1.5 font-sans font-medium hover:border-gray-500 transition-colors cursor-pointer`}
            >
              {Object.entries(symbolsByCategory).map(([category, items]) => (
                <optgroup key={category} label={category.toUpperCase()} className={isLight ? 'bg-white text-slate-400 font-mono text-[9px] font-semibold' : 'bg-[#171b26] text-gray-400 font-mono text-[9px] tracking-wider font-semibold'}>
                  {items.map(item => (
                    <option key={item.symbol} value={item.symbol} className={isLight ? 'bg-white text-slate-800 font-sans text-xs' : 'bg-[#131722] text-gray-200 font-sans text-xs font-semibold normal-case'}>
                      {item.symbol}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
 
            {/* Timeframe selector */}
            <select
              value={focusedPane.timeframe}
              onChange={(e) => handleUpdatePane(focusedPane.id, { timeframe: e.target.value as Timeframe })}
              className={`${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-[#131722] border-[#2a2e39] text-gray-200'} border rounded text-[11px] py-1 px-1.5 font-sans font-medium hover:border-gray-500 transition-colors cursor-pointer`}
            >
              {['1s', '5s', '1m', '5m', '10m', '15m', '30m', '1h', '2h', '3h', '4h', '1d', '1w'].map(tf => (
                <option key={tf} value={tf} className={isLight ? 'bg-white text-slate-855' : 'bg-[#131722]'}>{tf}</option>
              ))}
            </select>
          </div>
 
          {/* Exit replay mode toggles */}
          {focusedPane.isReplayMode && (
            <button
              onClick={() => handleUpdatePane(focusedPane.id, { isReplayMode: false, replayStartIndex: null, replayCurrentIndex: null, isPlaying: false })}
              className="bg-rose-955/40 hover:bg-rose-900 border border-rose-900 text-rose-300 text-[10px] py-1 px-2 rounded-md font-medium cursor-pointer transition-colors shrink-0"
            >
              Exit Replay
            </button>
          )}
 
          {/* Settings / Commands Buttons */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-gray-700/50 shrink-0">
            <button
              title={prefs.syncTimeEnabled ? "Sync Time Mode (ON) - Clicking jump-aligns all charts to the clicked point" : "Sync Time Mode (OFF) - Click to synchronize charts to clicked points"}
              onClick={() => setPrefs(prev => ({ ...prev, syncTimeEnabled: !prev.syncTimeEnabled }))}
              className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] cursor-pointer font-semibold transition-all ${
                prefs.syncTimeEnabled 
                  ? 'bg-blue-600/20 border-blue-500/55 text-blue-400 hover:bg-blue-600/30' 
                  : `${isLight ? 'bg-transparent border-slate-300 text-slate-500 hover:text-slate-800 hover:border-slate-400' : 'bg-transparent border-[#2a2e39] text-gray-400 hover:text-gray-200 hover:border-gray-600'}`
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Sync Time</span>
              <span className={`w-1.5 h-1.5 rounded-full ${prefs.syncTimeEnabled ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]' : 'bg-gray-600'}`}></span>
            </button>
            <button
              title="Search and Hotkeys Palette"
              onClick={() => setIsCommandPaletteOpen(true)}
              className={`p-1 rounded ${isLight ? 'hover:bg-slate-100 hover:text-slate-800' : 'hover:bg-[#121620] hover:border-gray-700/30'} border border-transparent text-gray-400 cursor-pointer transitions flex items-center justify-center`}
            >
              <Search className={`w-3.5 h-3.5 ${isLight ? 'text-slate-600' : 'text-gray-300'}`} />
            </button>
            <button
              title="Copy encoded Session URl"
              onClick={handleCopySessionURL}
              className={`p-1 rounded ${isLight ? 'hover:bg-slate-100 hover:text-slate-800' : 'hover:bg-[#121620] hover:border-gray-700/30'} border border-transparent text-gray-400 cursor-pointer transitions flex items-center justify-center`}
            >
              <Share2 className={`w-3.5 h-3.5 ${isLight ? 'text-slate-600' : 'text-gray-300'}`} />
            </button>
            <button
              title={themeMode === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
              onClick={() => {
                const nextMode = themeMode === 'dark' ? 'light' : 'dark';
                setThemeMode(nextMode);
                addToast('INFO', `Switched to ${nextMode === 'dark' ? 'Dark' : 'Light'} Mode`);
                playBeep(900, 0.1);
              }}
              className={`p-1 rounded ${isLight ? 'hover:bg-slate-100 hover:text-slate-800' : 'hover:bg-[#121620] hover:border-gray-700/30'} border border-transparent text-gray-400 cursor-pointer transitions flex items-center justify-center`}
            >
              {themeMode === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-500" /> : <Moon className="w-3.5 h-3.5 text-indigo-650" />}
            </button>
            <button
              title="Preferences panel"
              onClick={() => setIsSettingsOpen(true)}
              className={`p-1 rounded ${isLight ? 'hover:bg-slate-100 hover:text-slate-800' : 'hover:bg-[#121620] hover:border-gray-700/30'} border border-transparent text-gray-400 cursor-pointer transitions flex items-center justify-center animate-spin-hover`}
            >
              <Settings className={`w-3.5 h-3.5 ${isLight ? 'text-slate-600' : 'text-gray-300'}`} />
            </button>
            
            {/* User Profile Info & Secure Sign Out */}
            <div className="flex items-center gap-1.5 pl-1.5 border-l border-gray-700/50">
              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${isLight ? 'bg-slate-100 text-slate-700' : 'bg-slate-900 text-slate-300'}`}>
                <UserIcon className="w-3 h-3 text-indigo-400" />
                <span className="hidden lg:inline max-w-[80px] truncate">{currentUser?.email}</span>
              </div>
              <button
                title="Sign Out"
                onClick={() => {
                  clearSession();
                  setIsAuthenticated(false);
                  setCurrentUser(null);
                  addToast('INFO', 'Secure session terminated.');
                }}
                className={`p-1 rounded ${isLight ? 'hover:bg-rose-50 text-rose-600' : 'hover:bg-rose-955/30 text-rose-400 hover:border-rose-900/30'} border border-transparent cursor-pointer transitions flex items-center justify-center`}
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>
      )}
 
      {/* 2. Primary layout body viewports */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Left column split screens grid map (Grid of up to 8 responsive charts) */}
        <div className={`flex-1 overflow-hidden flex flex-col ${maximizedPaneId ? 'p-0' : 'p-1 md:p-1.5 h-full'}`}>
          <div className={`flex-1 flex flex-col overflow-y-auto scrollbar-thin ${maximizedPaneId ? (isLight ? 'bg-white' : 'bg-[#090b10]') : `${isLight ? 'bg-white/80 border-slate-200/80 shadow-sm' : 'bg-[#121620]/45 border border-[#1e222e]/45'} p-1 md:p-1.5 rounded-lg border`}`}>
            {visiblePanes.length === 0 ? (
              <div className={`flex-1 flex flex-col items-center justify-center text-center p-8 min-h-[440px] ${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-[#121620]/65 border border-[#2a2e39]/50'} rounded-lg border shadow-sm`}>
                <BarChart2 className="w-12 h-12 text-gray-600 mb-3 animate-pulse" />
                <h3 className={`font-semibold mb-1 text-sm ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>All Chart Windows Are Hidden</h3>
                <p className={`text-xs max-w-sm ${isLight ? 'text-slate-500' : 'text-gray-550'}`}>
                  Click any of the active chart indicators <strong className="text-blue-450 text-xs font-mono">1 – 8</strong> in the top header menu to toggle windows visible on screen.
                </p>
              </div>
            ) : (
              <div className={`grid ${gridLayoutClass} flex-1 w-full`}>
                {visiblePanes.map((pane) => {
                  const isActive = pane.id === focusedPaneId;
                  const cacheKey = `${pane.symbol}-${pane.timeframe}`;
                  const data = historicDataCache[cacheKey] || [];
                  const panePosition = positions.find(p => p.paneId === pane.id && p.status === 'OPEN') || null;

                  return (
                    <div key={pane.id} className="h-full min-h-[300px] flex-1 flex flex-col">
                      <TradingChart
                        pane={pane}
                        paneIndex={parseInt(pane.id.split('-')[1])}
                        isActive={isActive}
                        isMaximized={maximizedPaneId === pane.id}
                        onToggleMaximize={() => setMaximizedPaneId(maximizedPaneId === pane.id ? null : pane.id)}
                        onSelectPane={() => setFocusedPaneId(pane.id)}
                        onUpdatePane={(f) => handleUpdatePane(pane.id, f)}
                        historicData={data}
                        activePosition={panePosition}
                        onSignal={(signal) => handleChartSignal(pane.id, signal)}
                        onUpdatePosition={(p) => {
                          if (panePosition) {
                            handleUpdatePositionPrice(panePosition.id, p);
                          }
                        }}
                        onCloseTrade={(pnl, exitPrice) => {
                          if (panePosition) {
                            handleCloseTrade(pane.id, panePosition.id, pnl, exitPrice);
                          }
                        }}
                        syncTimeEnabled={prefs.syncTimeEnabled}
                        serverBots={serverBots}
                        themeMode={themeMode}
                        onToggleBotMode={handleToggleBotMode}
                        error={historicDataErrors[cacheKey]}
                        onRetryFetch={() => fetchCandlesForPane(pane.symbol, pane.timeframe)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right side operational Control sidebar panel */}
        {!maximizedPaneId && (
          <div className={`flex h-full border-l ${isLight ? 'border-slate-200' : 'border-[#2e3242]'}`}>
            
            {/* Expanded Panel Area */}
            {activeRightPanel && (
              <div className={`w-80 ${isLight ? 'bg-white border-r border-slate-200' : 'bg-[#171b26] border-r border-[#2e3242]'} flex flex-col h-full overflow-hidden`}>
                <div className={`p-4 border-b ${isLight ? 'border-slate-200 bg-white' : 'border-[#2e3242] bg-[#171b26]'} flex items-center justify-between sticky top-0 z-10 shrink-0`}>
                <h2 className={`text-sm font-bold uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-gray-200'}`}>
                  {activeRightPanel === 'order' && 'Order Execution'}
                  {activeRightPanel === 'stats' && 'Performance Metrics'}
                  {activeRightPanel === 'history' && 'Journal'}
                  {activeRightPanel === 'backtest' && 'Strategy Backtester'}
                  {activeRightPanel === 'autotrade' && 'Paper Auto-Trading'}
                  {activeRightPanel === 'terminal' && 'AI Strategy Assistant'}
                  {activeRightPanel === 'pinescript' && 'Pine Script Importer'}
                  {activeRightPanel === 'agents' && 'AI Sentiment & Risk Hub'}
                  {activeRightPanel === 'vault' && 'Secure Key Vault'}
                </h2>
                <button 
                  onClick={() => setActiveRightPanel(null)}
                  className={`cursor-pointer ${isLight ? 'text-slate-400 hover:text-slate-700' : 'text-gray-400 hover:text-white'}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className={`p-0 flex-1 flex flex-col ${['terminal', 'backtest', 'autotrade', 'pinescript', 'agents', 'vault'].includes(activeRightPanel) ? 'overflow-hidden' : 'overflow-y-auto scrollbar-thin'}`}>
                {activeRightPanel === 'order' && (
                  <div className="p-4">
                    <TradingPanel
                      symbol={focusedPane.symbol}
                      currentPrice={focusedPrice}
                      accountBalance={prefs.accountBalance}
                      riskPercent={prefs.riskPercent}
                      onSetPreferences={(prefChanges) => setPrefs(prev => ({ ...prev, ...prefChanges }))}
                      onExecuteTrade={handleExecuteTrade}
                    />
                  </div>
                )}

                {activeRightPanel === 'stats' && (
                  <div className="p-4">
                    <StatsPanel
                      closedTrades={closedTrades}
                      initialBalance={10000}
                    />
                  </div>
                )}

                {activeRightPanel === 'history' && (
                  <div className="p-4">
                    <TradeHistory
                      closedTrades={closedTrades}
                      onClearHistory={() => {
                        setClosedTrades([]);
                        addToast('INFO', 'Historical trade logs cleared.');
                      }}
                    />
                  </div>
                )}

                {activeRightPanel === 'backtest' && (
                  <AiQuantPanel
                    symbol={focusedPane.symbol}
                    timeframe={focusedPane.timeframe}
                    data={focusedData}
                    autoTradeEnabled={autoTradeEnabled}
                    setAutoTradeEnabled={setAutoTradeEnabled}
                    mode="backtest"
                    pane={focusedPane}
                    closedTrades={closedTrades}
                    positions={positions}
                    onUpdatePane={(changes) => handleUpdatePane(focusedPane.id, changes)}
                  />
                )}

                {activeRightPanel === 'autotrade' && (
                  <React.Suspense fallback={<div className="p-6 text-center text-xs font-mono text-gray-500">Initializing Bots Workstation...</div>}>
                    <AutonomousBotsPanel />
                  </React.Suspense>
                )}

                {activeRightPanel === 'terminal' && (
                  <ClaudeTerminalPanel
                    pane={focusedPane}
                    data={focusedData}
                    onUpdatePane={(changes) => handleUpdatePane(focusedPane.id, changes)}
                  />
                )}

                {activeRightPanel === 'pinescript' && (
                  <React.Suspense fallback={<div className="p-6 text-center text-xs font-mono text-gray-500">Preparing Pine Script Engine...</div>}>
                    <PineScriptConverterPanel
                      pane={focusedPane}
                      candles={focusedData}
                      onUpdatePane={(changes) => handleUpdatePane(focusedPane.id, changes)}
                      onRunBacktestRequest={() => setActiveRightPanel('backtest')}
                    />
                  </React.Suspense>
                )}

                {activeRightPanel === 'agents' && (
                  <React.Suspense fallback={<div className="p-6 text-center text-xs font-mono text-gray-500">Loading Sentiment Agents...</div>}>
                    <AiAgentsHubPanel
                      pane={focusedPane}
                      candles={focusedData}
                      balance={prefs.accountBalance}
                      positions={positions}
                      drawdown={calculateDrawdown()}
                    />
                  </React.Suspense>
                )}

                {activeRightPanel === 'vault' && (
                  <React.Suspense fallback={<div className="p-6 text-center text-xs font-mono text-gray-500">Unlocking Encrypted Keyring...</div>}>
                    <SecretsVaultPanel />
                  </React.Suspense>
                )}
              </div>
            </div>
          )}

          {/* Narrow Icon Strip */}
          <div className="w-[72px] shrink-0 bg-[#121620] flex flex-col items-center py-4 gap-2.5 z-20 border-l border-gray-800/60 overflow-y-auto scrollbar-none">
            {/* 1. Backtester (Pro only) */}
            {!isSimpleMode && (
            <button
              onClick={() => setActiveRightPanel(prev => prev === 'backtest' ? null : 'backtest')}
              className={`w-full py-2 px-0.5 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${activeRightPanel === 'backtest' ? 'bg-blue-600/15 text-blue-400 border-r-2 border-blue-500' : 'text-gray-400 hover:bg-[#1e2235] hover:text-blue-200'}`}
              title="Strategy Backtester"
            >
              <Activity className="w-4.5 h-4.5" />
              <span className="text-[8px] font-sans font-semibold tracking-tighter uppercase text-center scale-90">Backtest</span>
            </button>
            )}

            {/* 2. Auto-trade */}
            <button
              onClick={() => setActiveRightPanel(prev => prev === 'autotrade' ? null : 'autotrade')}
              className={`w-full py-2 px-0.5 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${activeRightPanel === 'autotrade' ? 'bg-emerald-600/15 text-emerald-400 border-r-2 border-emerald-500' : 'text-gray-400 hover:bg-[#1e2235] hover:text-emerald-200'}`}
              title="Paper Auto-Trading (Simulation Bots)"
            >
              <Target className="w-4.5 h-4.5" />
              <span className="text-[8px] font-sans font-semibold tracking-tighter uppercase text-center scale-90">Auto-Bot</span>
            </button>

            {/* 3. AI Strategy Assistant (Simple & Pro) */}
            <button
              onClick={() => setActiveRightPanel(prev => prev === 'terminal' ? null : 'terminal')}
              className={`w-full py-2 px-0.5 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${activeRightPanel === 'terminal' ? 'bg-violet-600/15 text-violet-400 border-r-2 border-violet-500' : 'text-gray-400 hover:bg-[#1e2235] hover:text-violet-200'}`}
              title="AI Strategy Assistant"
            >
              <Terminal className="w-4.5 h-4.5" />
              <span className="text-[8px] font-sans font-semibold tracking-tighter uppercase text-center scale-90">AI Strategy</span>
            </button>

            {/* 4. Pine Script Importer (Pro only) */}
            {!isSimpleMode && (
            <button
              onClick={() => setActiveRightPanel(prev => prev === 'pinescript' ? null : 'pinescript')}
              className={`w-full py-2 px-0.5 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${activeRightPanel === 'pinescript' ? 'bg-blue-600/15 text-blue-400 border-r-2 border-blue-500' : 'text-gray-400 hover:bg-[#1e2235] hover:text-blue-200'}`}
              title="Pine Script Importer"
            >
              <BrainCircuit className="w-4.5 h-4.5" />
              <span className="text-[8px] font-sans font-semibold tracking-tighter uppercase text-center scale-90">Pine Import</span>
            </button>
            )}

            {/* 5. Order Execution (Simple & Pro) */}
            <button
              onClick={() => setActiveRightPanel(prev => prev === 'order' ? null : 'order')}
              className={`w-full py-2 px-0.5 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${activeRightPanel === 'order' ? 'bg-blue-600/15 text-blue-400 border-r-2 border-blue-500' : 'text-gray-400 hover:bg-[#1e2235] hover:text-gray-200'}`}
              title="Order Execution"
            >
              <ShoppingCart className="w-4.5 h-4.5" />
              <span className="text-[8px] font-sans font-semibold tracking-tighter uppercase text-center scale-90">Orders</span>
            </button>

            {/* 6. Performance metrics (Simple & Pro) */}
            <button
              onClick={() => setActiveRightPanel(prev => prev === 'stats' ? null : 'stats')}
              className={`w-full py-2 px-0.5 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${activeRightPanel === 'stats' ? 'bg-blue-600/15 text-blue-400 border-r-2 border-blue-500' : 'text-gray-400 hover:bg-[#1e2235] hover:text-gray-200'}`}
              title="Performance Metrics"
            >
              <LineChart className="w-4.5 h-4.5" />
              <span className="text-[8px] font-sans font-semibold tracking-tighter uppercase text-center scale-90">Metrics</span>
            </button>

            {/* 7. Journal (Simple & Pro) */}
            <button
              onClick={() => setActiveRightPanel(prev => prev === 'history' ? null : 'history')}
              className={`w-full py-2 px-0.5 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${activeRightPanel === 'history' ? 'bg-blue-600/15 text-blue-400 border-r-2 border-blue-500' : 'text-gray-400 hover:bg-[#1e2235] hover:text-gray-200'}`}
              title="Trade Journal"
            >
              <BookOpen className="w-4.5 h-4.5" />
              <span className="text-[8px] font-sans font-semibold tracking-tighter uppercase text-center scale-90">Journal</span>
            </button>
            
            <div className="w-8 border-b border-gray-850 my-1"></div>

            {/* 8. AI Sentiment & Risk Hub (Pro only) */}
            {!isSimpleMode && (
            <button
              onClick={() => setActiveRightPanel(prev => prev === 'agents' ? null : 'agents')}
              className={`w-full py-2 px-0.5 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${activeRightPanel === 'agents' ? 'bg-violet-600/15 text-violet-400 border-r-2 border-violet-500' : 'text-gray-400 hover:bg-[#1e2235] hover:text-violet-200'}`}
              title="Autonomous AI Agent Hub (Sentiment & Risk)"
            >
              <Sparkles className="w-4.5 h-4.5" />
              <span className="text-[8px] font-sans font-semibold tracking-tighter uppercase text-center scale-90">AI Agents</span>
            </button>
            )}

            {/* 9. Key Vault (Pro only) */}
            {!isSimpleMode && (
            <button
              onClick={() => setActiveRightPanel(prev => prev === 'vault' ? null : 'vault')}
              className={`w-full py-2 px-0.5 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${activeRightPanel === 'vault' ? 'bg-emerald-600/15 text-emerald-400 border-r-2 border-emerald-500' : 'text-gray-400 hover:bg-[#1e2235] hover:text-emerald-200'}`}
              title="Secure Key Vault & Exchange Connectors"
            >
              <Lock className="w-4.5 h-4.5" />
              <span className="text-[8px] font-sans font-semibold tracking-tighter uppercase text-center scale-90">Vault Keys</span>
            </button>
            )}
          </div>
        </div>
        )}
      </main>

      {/* 3. Bottom Low-Profile Footer: Speed & Hotkey Legend Band */}
      <AnimatePresence>
        {prefs.hotkeysEnabled && (
          <footer className={`shrink-0 z-30 border-t ${isLight ? 'bg-white border-slate-200 text-slate-600' : 'bg-[#090b11]/90 border-[#1a1f2c] text-gray-400'} py-1 md:py-1.5 px-4 text-[9px] font-mono flex flex-wrap items-center justify-between gap-2 shadow-inner transition-colors duration-200`}>
            <div className="flex items-center gap-1.5 text-gray-500 uppercase font-sans font-extrabold text-[8px] tracking-wider">
              <Sliders className="w-3 h-3 text-blue-500 shrink-0" />
              <span>Hotkey Quick Legend:</span>
            </div>
            <div className="flex items-center gap-2 md:gap-3 flex-wrap">
              <div className="flex items-center gap-1"><kbd className={`${isLight ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-[#121620] border border-[#252a36] text-gray-200'} px-1 py-0.5 rounded text-[8px]`}>B</kbd> BUY Long</div>
              <div className="flex items-center gap-1"><kbd className={`${isLight ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-[#121620] border border-[#252a36] text-gray-200'} px-1 py-0.5 rounded text-[8px]`}>S</kbd> SELL Short</div>
              <div className="flex items-center gap-1"><kbd className={`${isLight ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-[#121620] border border-[#252a36] text-gray-200'} px-1 py-0.5 rounded text-[8px]`}>Space</kbd> Play/Pause Replay</div>
              <div className="flex items-center gap-1"><kbd className={`${isLight ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-[#121620] border border-[#252a36] text-gray-200'} px-1 py-0.5 rounded text-[8px]`}>← / →</kbd> Step Candle</div>
              <div className="flex items-center gap-1"><kbd className={`${isLight ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-[#121620] border border-[#252a36] text-gray-200'} px-1 py-0.5 rounded text-[8px]`}>R</kbd> Toggle Replay Mode</div>
              <div className="flex items-center gap-1"><kbd className={`${isLight ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-[#121620] border border-[#252a36] text-gray-200'} px-1 py-0.5 rounded text-[8px]`}>Esc</kbd> Cancel Line Tools</div>
              <div className="flex items-center gap-1"><kbd className={`${isLight ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-[#121620] border border-[#252a36] text-gray-200'} px-1 py-0.5 rounded text-[8px]`}>+/-</kbd> Replay Speed</div>
            </div>
          </footer>
        )}
      </AnimatePresence>

      {/* 4. Command Palette search overlay */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectSymbol={(symbol) => handleUpdatePane(focusedPane.id, { symbol })}
        onSelectTimeframe={(timeframe) => handleUpdatePane(focusedPane.id, { timeframe })}
        onSelectLayout={(panesCount) => {
          const newVisible: string[] = [];
          for (let i = 1; i <= panesCount; i++) {
            newVisible.push(`pane-${i}`);
          }
          setVisiblePaneIds(newVisible);
          addToast('SUCCESS', `Grid layout set to ${panesCount} charts.`);
        }}
        onToggleMode={(simpleMode) => {
          setIsSimpleMode(simpleMode);
          localStorage.setItem('is_simple_mode', String(simpleMode));
          addToast('INFO', `Switched to ${simpleMode ? 'Simple' : 'Pro'} Mode via Command Palette.`);
        }}
        onSelectAction={(actionId) => {
          if (actionId === 'action-settings') {
            setIsSettingsOpen(true);
          } else if (actionId === 'action-clear-drawings') {
            handleUpdatePane(focusedPane.id, { drawings: [] });
            addToast('SUCCESS', `Cleared drawings for active chart ${focusedPane.symbol}`);
          } else if (actionId === 'action-wipe-data') {
            handleWipeData();
          }
        }}
        onToggleIndicator={(indicatorKey) => {
          const currentVal = !!focusedPane.indicators[indicatorKey as keyof typeof focusedPane.indicators];
          handleUpdatePane(focusedPane.id, {
            indicators: {
              ...focusedPane.indicators,
              [indicatorKey]: !currentVal
            }
          });
          addToast('SUCCESS', `Toggled indicator: ${indicatorKey.toUpperCase()} is now ${!currentVal ? 'ON' : 'OFF'}`);
        }}
      />

      {/* 5. Terminal Options Drawer */}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        prefs={prefs}
        onUpdatePrefs={(up) => setPrefs(prev => ({ ...prev, ...up }))}
        onWipeData={handleWipeData}
      />

      {/* 6. Onboarding & Template Selector Overlay */}
      {showOnboarding && (
        <div id="onboarding-overlay" className="fixed inset-0 bg-black/85 z-55 flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto">
          <div className="bg-[#0e121a] border border-[#2a2e39] w-full max-w-3xl rounded-2xl shadow-2xl p-6 md:p-8 flex flex-col gap-6 my-8">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase font-mono tracking-wider font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded w-fit mb-2">First Launch Workspace Setup</div>
                <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">Configure Your Trading Cockpit</h2>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">Welcome to the premium split-screen AI trading workstation. Please select a template below based on your expertise level. You can toggle between <strong>Simple Mode</strong> and <strong>Pro Mode</strong> at any time in the header.</p>
              </div>
              <button 
                onClick={() => {
                  setShowOnboarding(false);
                  localStorage.setItem('onboarding_completed', 'true');
                }}
                className="text-gray-400 hover:text-white p-1 hover:bg-gray-800 rounded-lg cursor-pointer"
                title="Skip onboarding"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Beginner Template Option */}
              <div 
                onClick={() => loadTemplate('beginner')}
                className="group border border-blue-500/30 hover:border-blue-500 bg-blue-950/10 hover:bg-blue-950/20 p-5 rounded-xl cursor-pointer transition-all flex flex-col gap-3 relative overflow-hidden text-left"
              >
                <div className="absolute right-0 top-0 bg-blue-500 text-[8px] uppercase font-bold text-white px-3 py-1 rounded-bl-lg font-mono">RECOMMENDED</div>
                <div className="flex items-center gap-3">
                  <div className="bg-blue-600/10 p-2.5 rounded-lg group-hover:bg-blue-600/20 text-blue-400 transition-colors">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white group-hover:text-blue-300">🔰 Beginner Simple Mode</h3>
                    <p className="text-[10px] text-gray-400 font-mono">Single Chart Focus • Cleansed Layout</p>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 leading-normal">
                  Launches in a streamlined single-chart view. Removes complex developer tools, compiler features, and multi-screens. Shows friendly labels for basic analysis and order logging.
                </p>
              </div>

              {/* Pro Crypto Scalper Template Option */}
              <div 
                onClick={() => loadTemplate('scalping')}
                className="group border border-emerald-500/25 hover:border-emerald-500 bg-emerald-950/5 hover:bg-emerald-950/10 p-5 rounded-xl cursor-pointer transition-all flex flex-col gap-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-600/10 p-2.5 rounded-lg group-hover:bg-emerald-600/20 text-emerald-400 transition-colors">
                    <Target className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white group-hover:text-emerald-300">⚡ Crypto Scalping (Multi-tf)</h3>
                    <p className="text-[10px] text-gray-400 font-mono">Dual charts • SOL • RSI & Bollinger Bands</p>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 leading-normal">
                  Excellent for high-speed momentum traders. Opens SOL/USD on twin split screens (5-minute and 15-minute) with RSI, Bollinger Bands, and AI SmartSignals active.
                </p>
              </div>

              {/* Forex Swing Template Option */}
              <div 
                onClick={() => loadTemplate('forex')}
                className="group border border-amber-500/25 hover:border-amber-500 bg-amber-950/5 hover:bg-amber-950/10 p-5 rounded-xl cursor-pointer transition-all flex flex-col gap-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-amber-600/10 p-2.5 rounded-lg group-hover:bg-amber-600/20 text-amber-400 transition-colors">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white group-hover:text-amber-300">💱 Forex Swing Trader</h3>
                    <p className="text-[10px] text-gray-400 font-mono">Dual EURUSD charts • MACD & Order Blocks</p>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 leading-normal">
                  Engineered for FX structure traders. Deploys EURUSD with Smart Money Concepts (SMC) Order Blocks, MACD, and a 1-hour timeframe preset.
                </p>
              </div>

              {/* Stock Backtesting Option */}
              <div 
                onClick={() => loadTemplate('stocks')}
                className="group border border-purple-500/25 hover:border-purple-500 bg-purple-950/5 hover:bg-purple-950/10 p-5 rounded-xl cursor-pointer transition-all flex flex-col gap-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-purple-600/10 p-2.5 rounded-lg group-hover:bg-purple-600/20 text-purple-400 transition-colors">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white group-hover:text-purple-300">📈 Stock Performance & Backtest</h3>
                    <p className="text-[10px] text-gray-400 font-mono">AAPL 1D • Volume Profile • Backtest panel open</p>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 leading-normal">
                  Focused on historical testing. Deploys AAPL stock on a daily timeframe with the Volume Profile overlay and activates the right Strategy Backtester panel.
                </p>
              </div>
            </div>

            <div className="border-t border-gray-800 pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                <span>Press <kbd className="bg-gray-850 px-1 py-0.5 rounded border border-gray-800 text-gray-400">Ctrl + K</kbd> at any time to open commands search.</span>
              </div>
              <button
                onClick={() => {
                  setShowOnboarding(false);
                  localStorage.setItem('onboarding_completed', 'true');
                  addToast('SUCCESS', 'Launched empty default workstation (Pro Mode).');
                }}
                className="text-xs text-gray-400 hover:text-white underline underline-offset-4 cursor-pointer font-medium"
              >
                Launch with default blank layout &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
