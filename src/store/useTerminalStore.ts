import { create } from 'zustand';
import { authenticatedFetch, getSessionToken, getSessionUser } from '../utils/api';
import { 
  SystemPreferences, ChartPaneState, Position, CandleData, IndicatorSettings, Timeframe 
} from '../types';

export interface BotPosition {
  id: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  entryTime: string;
  sl?: number;
  tp?: number;
}

export interface BotLog {
  timestamp: string;
  type: 'INFO' | 'TRADE' | 'AI_REASONING' | 'ERROR';
  message: string;
}

export interface ServerBot {
  id: string;
  userId?: string;
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
  aiModels?: any[];
  discussionMode?: string;
  lastChecked: string;
}

const INITIAL_INDICATORS: IndicatorSettings = {
  ema20: false,
  ema50: false,
  ema80: false,
  ema200: false,
  vwap: false,
  bollingerBands: false,
  ichimoku: false,
  fvg: false,
  volumeProfile: false,
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

interface TerminalState {
  // Active Symbol
  activeSymbol: string;
  setActiveSymbol: (symbol: string) => void;

  // Layout & Theme Config
  isSimpleMode: boolean;
  setIsSimpleMode: (mode: boolean) => void;
  themeMode: 'dark' | 'light';
  setThemeMode: (theme: 'dark' | 'light') => void;

  // Connection & Vault Status
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  setConnectionStatus: (status: 'connected' | 'disconnected' | 'connecting') => void;
  vaultStatus: Record<string, boolean>;
  setVaultStatus: (status: Record<string, boolean>) => void;
  checkVaultStatus: (exchange: string) => Promise<boolean>;
  storeVaultSecrets: (exchange: string, apiKey: string, apiSecret: string) => Promise<boolean>;
  clearVaultSecrets: (exchange: string) => Promise<boolean>;

  // Server-side Autonomous Bots
  bots: ServerBot[];
  botsLoading: boolean;
  botsError: string | null;
  fetchBots: (silent?: boolean) => Promise<void>;
  createBot: (botData: {
    name: string;
    symbol: string;
    timeframe: string;
    strategy: string;
    balance: number;
    aiModels?: any[];
    discussionMode?: string;
  }) => Promise<{ success: boolean; bot?: ServerBot; error?: string }>;
  toggleBot: (id: string) => Promise<boolean>;
  closeBotPosition: (id: string) => Promise<boolean>;
  resetBot: (id: string) => Promise<boolean>;
  deleteBot: (id: string) => Promise<boolean>;

  // Migrated States from App.tsx
  isAuthenticated: boolean;
  setIsAuthenticated: (auth: boolean) => void;
  currentUser: { id: string; email: string } | null;
  setCurrentUser: (user: { id: string; email: string } | null) => void;
  
  prefs: SystemPreferences;
  setPrefs: (update: SystemPreferences | ((prev: SystemPreferences) => SystemPreferences)) => void;
  
  visiblePaneIds: string[];
  setVisiblePaneIds: (update: string[] | ((prev: string[]) => string[])) => void;
  
  panes: ChartPaneState[];
  setPanes: (update: ChartPaneState[] | ((prev: ChartPaneState[]) => ChartPaneState[])) => void;
  
  focusedPaneId: string;
  setFocusedPaneId: (id: string) => void;
  
  maximizedPaneId: string | null;
  setMaximizedPaneId: (id: string | null) => void;
  
  positions: Position[];
  setPositions: (update: Position[] | ((prev: Position[]) => Position[])) => void;
  
  closedTrades: Position[];
  setClosedTrades: (update: Position[] | ((prev: Position[]) => Position[])) => void;
  
  historicDataCache: Record<string, CandleData[]>;
  setHistoricDataCache: (update: Record<string, CandleData[]> | ((prev: Record<string, CandleData[]>) => Record<string, CandleData[]>)) => void;
  
  historicDataErrors: Record<string, string | null>;
  setHistoricDataErrors: (update: Record<string, string | null> | ((prev: Record<string, string | null>) => Record<string, string | null>)) => void;
  
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (update: boolean | ((prev: boolean) => boolean)) => void;
  
  isSettingsOpen: boolean;
  setIsSettingsOpen: (update: boolean | ((prev: boolean) => boolean)) => void;
  
  showOnboarding: boolean;
  setShowOnboarding: (update: boolean | ((prev: boolean) => boolean)) => void;
  
  activeRightPanel: 'order' | 'stats' | 'history' | 'backtest' | 'autotrade' | 'terminal' | 'pinescript' | 'agents' | 'vault' | null;
  setActiveRightPanel: (update: 'order' | 'stats' | 'history' | 'backtest' | 'autotrade' | 'terminal' | 'pinescript' | 'agents' | 'vault' | null | ((prev: 'order' | 'stats' | 'history' | 'backtest' | 'autotrade' | 'terminal' | 'pinescript' | 'agents' | 'vault' | null) => 'order' | 'stats' | 'history' | 'backtest' | 'autotrade' | 'terminal' | 'pinescript' | 'agents' | 'vault' | null)) => void;
  
  toasts: { id: string; type: 'INFO' | 'SUCCESS' | 'WARN'; message: string }[];
  setToasts: (update: { id: string; type: 'INFO' | 'SUCCESS' | 'WARN'; message: string }[] | ((prev: { id: string; type: 'INFO' | 'SUCCESS' | 'WARN'; message: string }[]) => { id: string; type: 'INFO' | 'SUCCESS' | 'WARN'; message: string }[])) => void;
  
  autoTradeEnabled: boolean;
  setAutoTradeEnabled: (update: boolean | ((prev: boolean) => boolean)) => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  // Active Ticker/Symbol
  activeSymbol: 'BTC',
  setActiveSymbol: (symbol) => set({ activeSymbol: symbol }),

  // Layout & Theme Config
  isSimpleMode: typeof localStorage !== 'undefined' ? localStorage.getItem('is_simple_mode') === 'true' : false,
  setIsSimpleMode: (mode) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('is_simple_mode', String(mode));
    }
    set({ isSimpleMode: mode });
  },
  themeMode: (typeof localStorage !== 'undefined' ? localStorage.getItem('terminal_theme_mode') : 'dark') as 'dark' | 'light' || 'dark',
  setThemeMode: (theme) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('terminal_theme_mode', theme);
    }
    set({ themeMode: theme });
  },

  // Connection & Vault Status
  connectionStatus: 'connected',
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  vaultStatus: {
    hyperliquid: false,
    binance: false,
    alpaca: false,
  },
  setVaultStatus: (status) => set({ vaultStatus: status }),
  
  checkVaultStatus: async (exchange) => {
    try {
      const res = await authenticatedFetch('/api/secrets/vault/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyName: `${exchange}_apiKey` }),
      });
      if (res.ok) {
        const data = await res.json();
        const hasKey = !!data.value;
        set((state) => ({
          vaultStatus: {
            ...state.vaultStatus,
            [exchange]: hasKey,
          },
        }));
        return hasKey;
      }
    } catch (err) {
      console.error(`Error checking vault status for ${exchange}:`, err);
    }
    return false;
  },

  storeVaultSecrets: async (exchange, apiKey, apiSecret) => {
    try {
      const resKey = await authenticatedFetch('/api/secrets/vault/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyName: `${exchange}_apiKey`, keyValue: apiKey }),
      });

      const resSecret = await authenticatedFetch('/api/secrets/vault/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyName: `${exchange}_apiSecret`, keyValue: apiSecret }),
      });

      if (resKey.ok && resSecret.ok) {
        set((state) => ({
          vaultStatus: {
            ...state.vaultStatus,
            [exchange]: true,
          },
        }));
        return true;
      }
    } catch (err) {
      console.error(`Error storing vault secrets for ${exchange}:`, err);
    }
    return false;
  },

  clearVaultSecrets: async (exchange) => {
    try {
      const resKey = await authenticatedFetch('/api/secrets/vault/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyName: `${exchange}_apiKey`, keyValue: '' }),
      });

      const resSecret = await authenticatedFetch('/api/secrets/vault/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyName: `${exchange}_apiSecret`, keyValue: '' }),
      });

      if (resKey.ok && resSecret.ok) {
        set((state) => ({
          vaultStatus: {
            ...state.vaultStatus,
            [exchange]: false,
          },
        }));
        return true;
      }
    } catch (err) {
      console.error(`Error clearing vault secrets for ${exchange}:`, err);
    }
    return false;
  },

  // Server-side Autonomous Bots
  bots: [],
  botsLoading: false,
  botsError: null,
  
  fetchBots: async (silent = false) => {
    if (!silent) set({ botsLoading: true, botsError: null });
    try {
      const resp = await authenticatedFetch('/api/bots');
      if (resp.ok) {
        const data = await resp.json();
        if (data.success && Array.isArray(data.bots)) {
          set({ bots: data.bots, botsError: null });
        } else {
          set({ botsError: data.error || 'Failed to retrieve bots' });
        }
      } else {
        set({ botsError: 'Server error retrieving bots list' });
      }
    } catch (err) {
      console.error('Error fetching bots in store:', err);
      set({ botsError: 'Network error retrieving bots' });
    } finally {
      if (!silent) set({ botsLoading: false });
    }
  },

  createBot: async (botData) => {
    try {
      const resp = await authenticatedFetch('/api/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(botData),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.success) {
          await get().fetchBots(true);
          return { success: true, bot: data.bot };
        }
        return { success: false, error: data.error };
      }
      const errText = await resp.text();
      return { success: false, error: errText };
    } catch (err) {
      return { success: false, error: 'Network failure creating bot' };
    }
  },

  toggleBot: async (id) => {
    try {
      const resp = await authenticatedFetch(`/api/bots/${id}/toggle`, { method: 'POST' });
      if (resp.ok) {
        await get().fetchBots(true);
        return true;
      }
    } catch (err) {
      console.error('Error toggling bot in store:', err);
    }
    return false;
  },

  closeBotPosition: async (id) => {
    try {
      const resp = await authenticatedFetch(`/api/bots/${id}/close-position`, { method: 'POST' });
      if (resp.ok) {
        await get().fetchBots(true);
        return true;
      }
    } catch (err) {
      console.error('Error closing position in store:', err);
    }
    return false;
  },

  resetBot: async (id) => {
    try {
      const resp = await authenticatedFetch(`/api/bots/${id}/reset`, { method: 'POST' });
      if (resp.ok) {
        await get().fetchBots(true);
        return true;
      }
    } catch (err) {
      console.error('Error resetting bot in store:', err);
    }
    return false;
  },

  deleteBot: async (id) => {
    try {
      const resp = await authenticatedFetch(`/api/bots/${id}/delete`, { method: 'POST' });
      if (resp.ok) {
        await get().fetchBots(true);
        return true;
      }
    } catch (err) {
      console.error('Error deleting bot in store:', err);
    }
    return false;
  },

  // Migrated States from App.tsx
  isAuthenticated: !!getSessionToken(),
  setIsAuthenticated: (auth) => set({ isAuthenticated: auth }),
  currentUser: getSessionUser(),
  setCurrentUser: (user) => set({ currentUser: user }),
  
  prefs: (() => {
    if (typeof localStorage === 'undefined') {
      return {
        chartCount: 2,
        soundEnabled: true,
        hotkeysEnabled: true,
        themeAccent: 'blue',
        accountBalance: 10000,
        riskPercent: 1.0,
        syncTimeEnabled: false
      };
    }
    const userSuffix = getSessionUser() ? `_${getSessionUser()!.id}` : '';
    const saved = localStorage.getItem(`terminal_preferences${userSuffix}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.syncTimeEnabled === undefined) {
          parsed.syncTimeEnabled = false;
        }
        return parsed;
      } catch (e) {}
    }
    return {
      chartCount: 2,
      soundEnabled: true,
      hotkeysEnabled: true,
      themeAccent: 'blue',
      accountBalance: 10000,
      riskPercent: 1.0,
      syncTimeEnabled: false
    };
  })(),
  setPrefs: (update) => set((state) => ({
    prefs: typeof update === 'function' ? update(state.prefs) : update
  })),

  visiblePaneIds: (() => {
    if (typeof localStorage === 'undefined') {
      return ['pane-1', 'pane-2'];
    }
    const userSuffix = getSessionUser() ? `_${getSessionUser()!.id}` : '';
    const saved = localStorage.getItem(`terminal_visible_pane_ids${userSuffix}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return ['pane-1', 'pane-2'];
  })(),
  setVisiblePaneIds: (update) => set((state) => ({
    visiblePaneIds: typeof update === 'function' ? update(state.visiblePaneIds) : update
  })),

  panes: (() => {
    if (typeof localStorage === 'undefined') {
      return initializeDefaultPanes(8);
    }
    const userSuffix = getSessionUser() ? `_${getSessionUser()!.id}` : '';
    const saved = localStorage.getItem(`terminal_panes_config${userSuffix}`);
    if (saved) {
      try {
        const list = JSON.parse(saved);
        if (Array.isArray(list) && list.length > 0) return list;
      } catch (e) {}
    }
    return initializeDefaultPanes(8);
  })(),
  setPanes: (update) => set((state) => ({
    panes: typeof update === 'function' ? update(state.panes) : update
  })),

  focusedPaneId: 'pane-1',
  setFocusedPaneId: (focusedPaneId) => set({ focusedPaneId }),

  maximizedPaneId: null,
  setMaximizedPaneId: (maximizedPaneId) => set({ maximizedPaneId }),

  positions: (() => {
    if (typeof localStorage === 'undefined') {
      return [];
    }
    const userSuffix = getSessionUser() ? `_${getSessionUser()!.id}` : '';
    const saved = localStorage.getItem(`terminal_positions_active${userSuffix}`);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [];
  })(),
  setPositions: (update) => set((state) => ({
    positions: typeof update === 'function' ? update(state.positions) : update
  })),

  closedTrades: (() => {
    if (typeof localStorage === 'undefined') {
      return [];
    }
    const userSuffix = getSessionUser() ? `_${getSessionUser()!.id}` : '';
    const saved = localStorage.getItem(`terminal_trades_history${userSuffix}`);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [];
  })(),
  setClosedTrades: (update) => set((state) => ({
    closedTrades: typeof update === 'function' ? update(state.closedTrades) : update
  })),

  historicDataCache: {},
  setHistoricDataCache: (update) => set((state) => ({
    historicDataCache: typeof update === 'function' ? update(state.historicDataCache) : update
  })),

  historicDataErrors: {},
  setHistoricDataErrors: (update) => set((state) => ({
    historicDataErrors: typeof update === 'function' ? update(state.historicDataErrors) : update
  })),

  isCommandPaletteOpen: false,
  setIsCommandPaletteOpen: (update) => set((state) => ({
    isCommandPaletteOpen: typeof update === 'function' ? update(state.isCommandPaletteOpen) : update
  })),

  isSettingsOpen: false,
  setIsSettingsOpen: (update) => set((state) => ({
    isSettingsOpen: typeof update === 'function' ? update(state.isSettingsOpen) : update
  })),

  showOnboarding: typeof localStorage !== 'undefined' ? !localStorage.getItem('onboarding_completed') : false,
  setShowOnboarding: (update) => set((state) => ({
    showOnboarding: typeof update === 'function' ? update(state.showOnboarding) : update
  })),

  activeRightPanel: null,
  setActiveRightPanel: (update) => set((state) => ({
    activeRightPanel: typeof update === 'function' ? update(state.activeRightPanel) : update
  })),

  toasts: [],
  setToasts: (update) => set((state) => ({
    toasts: typeof update === 'function' ? update(state.toasts) : update
  })),

  autoTradeEnabled: false,
  setAutoTradeEnabled: (update) => set((state) => ({
    autoTradeEnabled: typeof update === 'function' ? update(state.autoTradeEnabled) : update
  })),
}));
