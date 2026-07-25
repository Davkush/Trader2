import { z } from 'zod';

export type Timeframe = '1s' | '5s' | '1m' | '5m' | '10m' | '15m' | '30m' | '1h' | '2h' | '3h' | '4h' | '1d' | '1w';

export type ChartType = 'candlestick' | 'renko';

export interface Point {
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  type: 'trend' | 'horizontal' | 'fibonacci' | 'rectangle';
  point1: Point;
  point2?: Point;
  color: string;
}

export interface IndicatorSettings {
  ema20: boolean;
  ema50: boolean;
  ema80: boolean;
  ema200: boolean;
  vwap: boolean;
  bollingerBands: boolean;
  ichimoku: boolean;
  fvg: boolean;
  volumeProfile: boolean;
  macd: boolean;
  rsi: boolean;
  fractal: boolean;
  smartSignal: boolean;
  orderFlow: boolean;
  smcOrderBlocks: boolean;
  smcLiquiditySweeps: boolean;
  cvd: boolean;
  obvMacdDoubleMacd: boolean;
  killerIdm: boolean;
  
  // Custom Parameters
  emaPeriods: [number, number, number, number];
  rsiLength: number;
  macdParams: [number, number, number];
  volumeProfileBins: number;
  
  smartSignalParams: {
    emaFast: number;
    emaMed: number;
    emaSlow: number;
    rsiLength: number;
    rsiBuyMin: number;
    rsiBuyMax: number;
    rsiSellMin: number;
    rsiSellMax: number;
    volRatio: number;
  };
}


export interface PineStrategyParameter {
  key: string;
  label: string;
  type: 'number' | 'boolean';
  default: number | boolean;
  min?: number;
  max?: number;
  step?: number;
  value: any; // User's custom configured value
}

export interface PineDashboardTable {
  title: string;
  headers: string[];
  rows: string[][];
}

export interface PineStrategyData {
  name: string;
  description: string;
  pineCode: string;
  parameters: PineStrategyParameter[];
  jsCode: string;
  active: boolean;
  dashboards?: PineDashboardTable[];
}

export interface ChartPaneState {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  chartType: ChartType;
  isReplayMode: boolean;
  replayStartIndex: number | null;
  replayCurrentIndex: number | null;
  replaySpeed: number;
  isPlaying: boolean;
  bookmarks: number[];
  drawings: Drawing[];
  indicators: IndicatorSettings;
  pineStrategy?: PineStrategyData;
  activeDrawingType: 'trend' | 'horizontal' | 'fibonacci' | 'rectangle' | null;
  selectedElementForDeletion: { id: string, type: 'drawing' | 'position' } | null;
  l2depth: { bids: { price: number; size: number }[]; asks: { price: number; size: number }[] };
}

export enum DataSource {
  POLYGON = 'Polygon.io',
  BINANCE = 'Binance',
  HYPERLIQUID = 'Hyperliquid',
  SYNTHETIC = 'Synthetic Fallback',
  YAHOO = 'Yahoo Finance'
}

export interface LivePrice {
  symbol: string;
  price: number;
  timestamp: number;
  quality?: DataQuality;
  source?: DataSource;
}

export interface Position {
  id: string;
  paneId: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  entryTime: number;
  quantity: number;
  tpPrice: number | null;
  slPrice: number | null;
  status: 'OPEN' | 'CLOSED';
  exitPrice?: number;
  exitTime?: number;
  pnl?: number;
  pnlPercent?: number;
  amount?: number;
  leverage?: number;
}

export interface BacktestStats {
  totalTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  largestWin: number;
  largestLoss: number;
  maxDrawdown: number;
  expectancy: number;
}

export interface BacktestConfig {
  initialCapital: number;
  makerFee: number;   // e.g., 0.001 (0.1%)
  takerFee: number;   // e.g., 0.002 (0.2%)
  slippageBps: number;// e.g., 5 (5 basis points)
  latencyMs: number;  // e.g., 200ms execution delay
  smartSignalParams?: any;
}

export interface SystemPreferences {
  chartCount: number;
  soundEnabled: boolean;
  hotkeysEnabled: boolean;
  themeAccent: string;
  accountBalance: number;
  riskPercent: number;
  syncTimeEnabled: boolean;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SmartSignalOutput {
  time: number;
  signal: 'BUY' | 'SELL' | 'EXIT' | null;
  entry: number;
  tp: number;
  sl: number;
  rr: number;
  confidence: number;
  regime: 'TREND' | 'RANGE' | 'VOLATILE';
}

// ─── Shared API Validation Schemas (Zod) ──────────────────────────────────
export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
});

export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema),
  model: z.string().optional(),
});

export const SentimentRequestSchema = z.object({
  symbol: z.string().min(1).max(20),
});

export const PositionSchemaForRisk = z.object({
  id: z.string(),
  paneId: z.string(),
  symbol: z.string(),
  direction: z.enum(['BUY', 'SELL']),
  entryPrice: z.number(),
  entryTime: z.number(),
  quantity: z.number(),
  tpPrice: z.number().nullable(),
  slPrice: z.number().nullable(),
  status: z.enum(['OPEN', 'CLOSED']),
  exitPrice: z.number().optional(),
  exitTime: z.number().optional(),
  pnl: z.number().optional(),
  pnlPercent: z.number().optional(),
});

export const RiskRequestSchema = z.object({
  positions: z.array(PositionSchemaForRisk),
  balance: z.number().positive(),
});

export const PineScriptConvertRequestSchema = z.object({
  pineCode: z.string().min(1),
});

export const VaultStoreRequestSchema = z.object({
  keyName: z.string().min(1),
  keyValue: z.string(),
});

export const VaultRetrieveRequestSchema = z.object({
  keyName: z.string().min(1),
});

export const TradeExecuteRequestSchema = z.object({
  symbol: z.string().min(1),
  direction: z.enum(['BUY', 'SELL']),
  quantity: z.number().positive(),
  price: z.number().positive(),
  type: z.string(),
  balance: z.number().positive(),
  currentDrawdown: z.number(),
});

export const BotCreateRequestSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  timeframe: z.string().min(1),
  strategy: z.string().min(1),
  balance: z.number().positive(),
  aiModels: z.array(z.any()).optional(),
  discussionMode: z.string().optional(),
});

export enum DataQuality {
  LIVE_REAL_TIME = 'LIVE_REAL_TIME',
  DELAYED_15_MIN = 'DELAYED_15_MIN',
  END_OF_DAY = 'END_OF_DAY',
  SYNTHETIC_FALLBACK = 'SYNTHETIC_FALLBACK'
}

