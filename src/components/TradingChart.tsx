import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  createChart, IChartApi, UTCTimestamp, LogicalRange,
  CandlestickSeries, LineSeries, HistogramSeries, BaselineSeries
} from 'lightweight-charts';
import { chartSyncBus, broadcastLogicalRange, broadcastCrosshair } from '../utils/syncBus';
import {
  Play, Pause, ChevronRight, RefreshCw, PenTool, Type, AlignJustify,
  Trash, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, Square,
  Maximize, Minimize, Sliders, Check, Camera
} from 'lucide-react';
import { ChartPaneState, CandleData, Position, Timeframe, SmartSignalOutput, IndicatorSettings, DataQuality, DataSource } from '../types';
import { runPineStrategy, runPineStrategyFull } from '../utils/pineRunner';
import { hyperliquidWS } from '../services/hyperliquidWS';
import { LiveDataProvider } from '../services/liveData';
import { PromptModal } from './PromptModal';
import { calculateObvMacdDoubleMacd, calcKillerIdmSignals } from '../utils/indicators';
import { IndicatorsPanel } from './IndicatorsPanel';
import { Tooltip } from './Tooltip';
import { useTerminalStore } from '../store/useTerminalStore';
import { PriceBadge } from './PriceBadge';


// ─── Props ────────────────────────────────────────────────────────────────────
interface TradingChartProps {
  pane: ChartPaneState;
  paneIndex?: number;
  isActive: boolean;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onSelectPane: () => void;
  onUpdatePane: (fields: Partial<ChartPaneState>) => void;
  historicData: CandleData[];
  activePosition: Position | null;
  onSignal?: (signal: SmartSignalOutput) => void;
  onUpdatePosition: (fields: Partial<Position>) => void;
  onCloseTrade: (pnl: number, exitPrice: number) => void;
  syncTimeEnabled?: boolean;
  serverBots?: any[];
  themeMode?: 'dark' | 'light';
  onToggleBotMode?: (symbol: string) => void;
  error?: string | null;
  onRetryFetch?: () => void;
}

const PANE_THEMES: Record<number, { bg: string; text: string; border: string; shadow: string; ring: string }> = {
  1: { bg: 'bg-blue-600', text: 'text-blue-100', border: 'border-blue-600', shadow: 'shadow-[0_0_20px_rgba(37,99,235,0.2)]', ring: 'ring-blue-500' },
  2: { bg: 'bg-red-600', text: 'text-red-100', border: 'border-red-600', shadow: 'shadow-[0_0_20px_rgba(220,38,38,0.2)]', ring: 'ring-red-500' },
  3: { bg: 'bg-emerald-600', text: 'text-emerald-100', border: 'border-emerald-600', shadow: 'shadow-[0_0_20px_rgba(16,185,129,0.2)]', ring: 'ring-emerald-500' },
  4: { bg: 'bg-amber-600', text: 'text-amber-100', border: 'border-amber-600', shadow: 'shadow-[0_0_20px_rgba(245,158,11,0.2)]', ring: 'ring-amber-500' },
  5: { bg: 'bg-violet-600', text: 'text-violet-100', border: 'border-violet-600', shadow: 'shadow-[0_0_20px_rgba(139,92,246,0.2)]', ring: 'ring-violet-500' },
  6: { bg: 'bg-pink-600', text: 'text-pink-100', border: 'border-pink-600', shadow: 'shadow-[0_0_20px_rgba(236,72,153,0.2)]', ring: 'ring-pink-500' },
  7: { bg: 'bg-cyan-600', text: 'text-cyan-100', border: 'border-cyan-600', shadow: 'shadow-[0_0_20px_rgba(6,182,212,0.2)]', ring: 'ring-cyan-500' },
  8: { bg: 'bg-orange-600', text: 'text-orange-100', border: 'border-orange-600', shadow: 'shadow-[0_0_20px_rgba(249,115,22,0.2)]', ring: 'ring-orange-500' },
};

// ─── Timeframe → seconds ─────────────────────────────────────────────────────
function tfToSeconds(tf: string): number {
  const map: Record<string, number> = {
    '1s': 1, '5s': 5, '1m': 60, '5m': 300, '10m': 600,
    '15m': 900, '30m': 1800, '1h': 3600, '2h': 7200, '3h': 10800,
    '4h': 14400, '1d': 86400, '1w': 604800,
  };
  return map[tf] ?? 86400;
}

// ─── Math helpers ─────────────────────────────────────────────────────────────
function calcEMA(d: CandleData[], period: number): { time: UTCTimestamp; value: number }[] {
  const data = d.filter(Boolean);
  if (!period || isNaN(period) || period <= 0 || data.length < period || !data[period - 1]) return [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i].close;
  let prev = sum / period;
  const k = 2 / (period + 1);
  const out = [{ time: data[period - 1].time as UTCTimestamp, value: prev }];
  for (let i = period; i < data.length; i++) {
    prev = data[i].close * k + prev * (1 - k);
    out.push({ time: data[i].time as UTCTimestamp, value: prev });
  }
  return out;
}

function calcRSI(d: CandleData[], period = 14): { time: UTCTimestamp; value: number }[] {
  const data = d.filter(Boolean);
  if (!period || isNaN(period) || period <= 0 || data.length < period + 1 || !data[period]) return [];
  const out: { time: UTCTimestamp; value: number }[] = [];
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i].close - data[i - 1].close;
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period; i < data.length; i++) {
    const diff = data[i].close - data[i - 1].close;
    avgGain = (avgGain * (period - 1) + Math.max(0, diff)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -diff)) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out.push({ time: data[i].time as UTCTimestamp, value: Number((100 - 100 / (1 + rs)).toFixed(2)) });
  }
  return out;
}

function calcMACD(d: CandleData[], fast = 12, slow = 26, sigPeriod = 9): {
  macd: { time: UTCTimestamp; value: number }[];
  signal: { time: UTCTimestamp; value: number }[];
  hist: { time: UTCTimestamp; value: number; color: string }[];
} {
  const data = d.filter(Boolean);
  if (
    !fast || isNaN(fast) || fast <= 0 ||
    !slow || isNaN(slow) || slow <= 0 ||
    !sigPeriod || isNaN(sigPeriod) || sigPeriod <= 0 ||
    data.length < slow
  ) {
    return { macd: [], signal: [], hist: [] };
  }
  const ema12 = calcEMA(data, fast);
  const ema26 = calcEMA(data, slow);
  const offset12 = data.length - ema12.length;
  const offset26 = data.length - ema26.length;
  const macdLine: { time: UTCTimestamp; value: number }[] = [];
  const startIdx = Math.max(offset12, offset26);
  for (let i = startIdx; i < data.length; i++) {
    const e12 = ema12[i - offset12];
    const e26 = ema26[i - offset26];
    if (e12 && e26) macdLine.push({ time: data[i].time as UTCTimestamp, value: e12.value - e26.value });
  }
  const sigLine: { time: UTCTimestamp; value: number }[] = [];
  if (macdLine.length >= sigPeriod) {
    let prev = macdLine.slice(0, sigPeriod).reduce((s, v) => s + v.value, 0) / sigPeriod;
    sigLine.push({ time: macdLine[sigPeriod - 1].time, value: prev });
    const k = 2 / (sigPeriod + 1);
    for (let i = sigPeriod; i < macdLine.length; i++) {
      prev = macdLine[i].value * k + prev * (1 - k);
      sigLine.push({ time: macdLine[i].time, value: prev });
    }
  }
  const hist = sigLine.map((s, i) => {
    const m = macdLine[i + (macdLine.length - sigLine.length)];
    const v = m ? m.value - s.value : 0;
    return { time: s.time, value: v, color: v >= 0 ? '#089981' : '#f23645' };
  });
  return { macd: macdLine, signal: sigLine, hist };
}

function calcVWAP(d: CandleData[]): { time: UTCTimestamp; value: number }[] {
  let cpv = 0, cv = 0;
  return d.filter(Boolean).map(d => {
    const tp = (d.high + d.low + d.close) / 3;
    cpv += tp * d.volume; cv += d.volume;
    return { time: d.time as UTCTimestamp, value: Number((cpv / (cv || 1)).toFixed(4)) };
  });
}

function calcCVD(d: CandleData[]): { time: UTCTimestamp; value: number; color: string }[] {
  let cvd = 0;
  return d.filter(Boolean).map(d => {
    const range = d.high - d.low;
    let delta = 0;
    if (range > 0) {
      delta = ((d.close - d.open) / range) * d.volume * 0.8; 
    }
    cvd += delta;
    return { time: d.time as UTCTimestamp, value: cvd, color: delta >= 0 ? '#089981' : '#f23645' };
  });
}

function calcSMC(d: CandleData[]) {
  const data = d.filter(Boolean);
  const orderBlocks: { type: 'BULL' | 'BEAR', top: number, bottom: number, startIndex: number, time: number }[] = [];
  const sweeps: { type: 'BULL' | 'BEAR', price: number, time: number }[] = [];
  
  if (data.length < 10) return { orderBlocks, sweeps };

  let atrSum = 0;
  for(let i=1; i<=14 && i<data.length; i++) {
    atrSum += Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i-1].close), Math.abs(data[i].low - data[i-1].close));
  }
  let atr = atrSum / 14;

  for (let i = 1; i < data.length - 2; i++) {
    const c1 = data[i];
    const c2 = data[i+1];
    const c3 = data[i+2];
    
    // Bullish OB
    if (c1.close < c1.open && c2.close > c2.open && c3.close > c3.open) {
      const move = c3.close - c1.low;
      if (move > atr * 1.5) {
        orderBlocks.push({ type: 'BULL', top: c1.high, bottom: c1.low, startIndex: i, time: c1.time as number });
      }
    }
    // Bearish OB
    if (c1.close > c1.open && c2.close < c2.open && c3.close < c3.open) {
      const move = c1.high - c3.close;
      if (move > atr * 1.5) {
        orderBlocks.push({ type: 'BEAR', top: c1.high, bottom: c1.low, startIndex: i, time: c1.time as number });
      }
    }
    
    // Liquidity Sweeps
    if (c1.high > data[i-1].high && c1.close < data[i-1].high) {
      sweeps.push({ type: 'BEAR', price: c1.high, time: c1.time as number });
    }
    if (c1.low < data[i-1].low && c1.close > data[i-1].low) {
      sweeps.push({ type: 'BULL', price: c1.low, time: c1.time as number });
    }
  }
  
  return { orderBlocks, sweeps };
}

function calcBB(d: CandleData[], p = 20, mult = 2) {
  const data = d.filter(Boolean);
  if (!p || isNaN(p) || p <= 0 || data.length < p || !data[p - 1]) return [];
  return data.slice(p - 1).map((_, idx) => {
    const i = idx + p - 1;
    const slice = data.slice(i - p + 1, i + 1);
    const mid = slice.reduce((s, c) => s + c.close, 0) / p;
    const std = Math.sqrt(slice.reduce((s, c) => s + (c.close - mid) ** 2, 0) / p);
    return { time: data[i].time, mid: Number(mid.toFixed(4)), upper: Number((mid + std * mult).toFixed(4)), lower: Number((mid - std * mult).toFixed(4)) };
  });
}

// Ichimoku Cloud
function calcIchimoku(d: CandleData[]) {
  const data = d.filter(Boolean);
  const high = (arr: CandleData[]) => Math.max(...arr.map(c => c.high));
  const low  = (arr: CandleData[]) => Math.min(...arr.map(c => c.low));
  const tenkan: { time: UTCTimestamp; value: number }[]  = [];
  const kijun:  { time: UTCTimestamp; value: number }[]  = [];
  const senkouA: { time: UTCTimestamp; value: number }[] = [];
  const senkouB: { time: UTCTimestamp; value: number }[] = [];
  const chikou:  { time: UTCTimestamp; value: number }[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i >= 8) {
      const t = (high(data.slice(i - 8, i + 1)) + low(data.slice(i - 8, i + 1))) / 2;
      tenkan.push({ time: data[i].time as UTCTimestamp, value: Number(t.toFixed(4)) });
    }
    if (i >= 25) {
      const k = (high(data.slice(i - 25, i + 1)) + low(data.slice(i - 25, i + 1))) / 2;
      kijun.push({ time: data[i].time as UTCTimestamp, value: Number(k.toFixed(4)) });
    }
    // Senkou A: avg of tenkan + kijun shifted +26
    if (i >= 25) {
      const tV = tenkan.find(x => x.time === (data[i].time as UTCTimestamp))?.value ?? 0;
      const kV = kijun.find(x => x.time === (data[i].time as UTCTimestamp))?.value ?? 0;
      if (tV && kV) senkouA.push({ time: data[i].time as UTCTimestamp, value: (tV + kV) / 2 });
    }
    if (i >= 51) {
      const s = (high(data.slice(i - 51, i + 1)) + low(data.slice(i - 51, i + 1))) / 2;
      senkouB.push({ time: data[i].time as UTCTimestamp, value: Number(s.toFixed(4)) });
    }
    if (i >= 26) {
      chikou.push({ time: data[i - 26].time as UTCTimestamp, value: data[i].close });
    }
  }
  return { tenkan, kijun, senkouA, senkouB, chikou };
}

// Williams Fractal — marks local high/low over 5-bar window
function calcFractals(d: CandleData[]): { highs: { time: UTCTimestamp; price: number }[]; lows: { time: UTCTimestamp; price: number }[] } {
  const data = d.filter(Boolean);
  const highs: { time: UTCTimestamp; price: number }[] = [];
  const lows:  { time: UTCTimestamp; price: number }[] = [];
  for (let i = 2; i < data.length - 2; i++) {
    if (!data[i] || !data[i-1] || !data[i-2] || !data[i+1] || !data[i+2]) continue;
    const h = data[i].high;
    if (h > data[i-1].high && h > data[i-2].high && h > data[i+1].high && h > data[i+2].high) {
      highs.push({ time: data[i].time as UTCTimestamp, price: h });
    }
    const l = data[i].low;
    if (l < data[i-1].low && l < data[i-2].low && l < data[i+1].low && l < data[i+2].low) {
      lows.push({ time: data[i].time as UTCTimestamp, price: l });
    }
  }
  return { highs, lows };
}

// ─── SmartSignal Engine (ML-style, RR ≥ 1.5) ──────────────────────────────────
// Uses: trend regime detection (EMA stack), momentum (RSI), volatility (ATR),
// structure (BB squeeze), volume confirmation, fractal pivot entries.
// Only emits signal when expected RR ≥ 1.5.
export function calcSmartSignals(d: CandleData[], params?: IndicatorSettings['smartSignalParams']): SmartSignalOutput[] {
  const data = d.filter(Boolean);
  if (data.length < 60) return [];

  const p = {
    emaFast: params?.emaFast ?? 20,
    emaMed: params?.emaMed ?? 50,
    emaSlow: params?.emaSlow ?? 80,
    rsiLength: params?.rsiLength ?? 14,
    rsiBuyMin: params?.rsiBuyMin ?? 40,
    rsiBuyMax: params?.rsiBuyMax ?? 65,
    rsiSellMin: params?.rsiSellMin ?? 35,
    rsiSellMax: params?.rsiSellMax ?? 60,
    volRatio: params?.volRatio ?? 1.1
  };

  const emaFast = calcEMA(data, p.emaFast);
  const emaMed = calcEMA(data, p.emaMed);
  const emaSlow = calcEMA(data, p.emaSlow);
  const rsiArr = calcRSI(data, p.rsiLength);
  const { highs: fracHigh, lows: fracLow } = calcFractals(data);

  // ATR-14
  const atr: number[] = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i] || !data[i-1]) {
      atr.push(atr[atr.length - 1] ?? 0);
      continue;
    }
    const tr = Math.max(
      data[i].high - data[i].low,
      Math.abs(data[i].high - data[i - 1].close),
      Math.abs(data[i].low  - data[i - 1].close)
    );
    if (i === 1) { atr.push(tr); continue; }
    atr.push(atr[atr.length - 1] * 13 / 14 + tr / 14);
  }

  // Volume SMA-20
  const volSMA: number[] = [];
  for (let i = 19; i < data.length; i++) {
    const chunk = data.slice(i - 19, i + 1).filter(c => !!c);
    volSMA.push(chunk.reduce((s, c) => s + c.volume, 0) / Math.max(chunk.length, 1));
  }

  const signals: SmartSignalOutput[] = [];
  const fracHighSet = new Set(fracHigh.map(f => f.time));
  const fracLowSet  = new Set(fracLow.map(f  => f.time));
  const offset20 = data.length - emaFast.length;
  const offset50 = data.length - emaMed.length;
  const offset80 = data.length - emaSlow.length;

  let lastSignalBar = -50; // cooldown: min 5 bars between signals

  for (let i = 80; i < data.length - 1; i++) {
    if (!data[i] || !data[i - 1]) continue;
    if (i - lastSignalBar < 5) continue;

    const e20 = emaFast[i - offset20]?.value;
    const e50 = emaMed[i - offset50]?.value;
    const e80 = emaSlow[i - offset80]?.value;
    const rsi = rsiArr[i - (data.length - rsiArr.length)]?.value;
    const curATR = atr[i - 1] ?? atr[atr.length - 1];
    const volIdx = i - (data.length - volSMA.length - 19);
    const volRatio = volIdx >= 0 && volSMA[volIdx] ? data[i].volume / volSMA[volIdx] : 1;

    if (!e20 || !e50 || !e80 || !rsi) continue;

    const price = data[i].close;

    // Regime detection
    const bullTrend = e20 > e50 && e50 > e80 && price > e20;
    const bearTrend = e20 < e50 && e50 < e80 && price < e20;
    const isVolatile = curATR / price > 0.015;
    const regime: SmartSignalOutput['regime'] = isVolatile ? 'VOLATILE'
      : (bullTrend || bearTrend) ? 'TREND' : 'RANGE';

    // BB squeeze as low-volatility setup detector
    const bbSlice = data.slice(Math.max(0, i - 19), i + 1);
    const bbMid = bbSlice.reduce((s, c) => s + c.close, 0) / bbSlice.length;
    const bbStd = Math.sqrt(bbSlice.reduce((s, c) => s + (c.close - bbMid) ** 2, 0) / bbSlice.length);
    const bbWidth = (bbStd * 4) / bbMid; // normalized band width
    const isSqueeze = bbWidth < 0.02;

    // ── BUY signal conditions ──────────────────────────────────────────────
    const isFracLow = fracLowSet.has(data[i].time as UTCTimestamp);
    const buySetup = bullTrend
      && rsi > p.rsiBuyMin && rsi < p.rsiBuyMax                  // momentum not overbought
      && (isFracLow || isSqueeze)               // structure: fractal low or squeeze break
      && volRatio > p.volRatio                         // volume confirmation
      && data[i].close > data[i].open          // bullish bar
      && !isVolatile;

    // ── SELL signal conditions ─────────────────────────────────────────────
    const isFracHigh = fracHighSet.has(data[i].time as UTCTimestamp);
    const sellSetup = bearTrend
      && rsi > p.rsiSellMin && rsi < p.rsiSellMax
      && (isFracHigh || isSqueeze)
      && volRatio > p.volRatio
      && data[i].close < data[i].open          // bearish bar
      && !isVolatile;

    if (buySetup) {
      const entry = price;
      const sl    = Math.min(data[i].low, data[i - 1].low) - curATR * 0.5;
      const risk  = entry - sl;
      if (risk <= 0) continue;
      const tp    = entry + risk * 1.6;         // RR = 1.6 (≥ 1.5)
      const rr    = (tp - entry) / risk;
      // Confidence: composite score
      const conf  = Math.min(99, Math.round(
        40 + (rsi < 55 ? 15 : 5)
           + (volRatio > 1.5 ? 20 : volRatio > 1.2 ? 12 : 5)
           + (isFracLow ? 15 : 0)
           + (isSqueeze ? 10 : 0)
      ));
      signals.push({ time: data[i].time, signal: 'BUY', entry, tp, sl, rr: Number(rr.toFixed(2)), confidence: conf, regime });
      lastSignalBar = i;
    } else if (sellSetup) {
      const entry = price;
      const sl    = Math.max(data[i].high, data[i - 1].high) + curATR * 0.5;
      const risk  = sl - entry;
      if (risk <= 0) continue;
      const tp    = entry - risk * 1.6;
      const rr    = (entry - tp) / risk;
      const conf  = Math.min(99, Math.round(
        40 + (rsi > 45 ? 15 : 5)
           + (volRatio > 1.5 ? 20 : volRatio > 1.2 ? 12 : 5)
           + (isFracHigh ? 15 : 0)
           + (isSqueeze ? 10 : 0)
      ));
      signals.push({ time: data[i].time, signal: 'SELL', entry, tp, sl, rr: Number(rr.toFixed(2)), confidence: conf, regime });
      lastSignalBar = i;
    }
  }

  // Inject EXIT signals: when RSI crosses back to neutral after a signal
  return signals;
}

// ─── Volume Profile helper ─────────────────────────────────────────────────────
function calcVolumeProfile(d: CandleData[], bins = 40) {
  const data = (d || []).filter(Boolean);
  if (!data.length) return { profile: [], step: 0 };
  let min = Infinity, max = -Infinity;
  for (let d of data) {
    if (d.low < min) min = d.low;
    if (d.high > max) max = d.high;
  }
  const step = (max - min) / bins;
  const profile = new Array(bins).fill(0);
  for (let d of data) {
    const avg = (d.high + d.low + d.close) / 3;
    let idx = Math.floor((avg - min) / step);
    if (idx >= bins) idx = bins - 1;
    profile[idx] += d.volume;
  }
  return { profile: profile.map((vol, i) => ({ price: min + step * (i + 0.5), vol })), step };
}

// ─── DragHandle for Resizable Panes ──────────────────────────────────────────
const DragHandle = ({ onDrag }: { onDrag: (dy: number) => void }) => {
  return (
    <div 
      className="h-1 bg-[#2a2e39] cursor-row-resize hover:bg-blue-500 z-10 transition-colors"
      onPointerDown={(e) => {
        let lastY = e.clientY;
        const onMove = (ev: PointerEvent) => {
          onDrag(ev.clientY - lastY);
          lastY = ev.clientY;
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      }}
    />
  );
};

// ─── Component ────────────────────────────────────────────────────────────────
export const TradingChart: React.FC<TradingChartProps> = ({
  pane, paneIndex, isActive, isMaximized, onToggleMaximize, onSelectPane, onUpdatePane,
  historicData, activePosition, onUpdatePosition, onCloseTrade, onSignal, syncTimeEnabled,
  serverBots: propServerBots, themeMode: propThemeMode, onToggleBotMode, error, onRetryFetch
}) => {
  const storeBots = useTerminalStore((state) => state.bots);
  const storeThemeMode = useTerminalStore((state) => state.themeMode);

  const serverBots = propServerBots || storeBots;
  const themeMode = propThemeMode || storeThemeMode;

  const chartContainerRef  = useRef<HTMLDivElement>(null);
  const rsiContainerRef    = useRef<HTMLDivElement>(null);
  const macdContainerRef   = useRef<HTMLDivElement>(null);
  const cvdContainerRef    = useRef<HTMLDivElement>(null);
  const obvMacdContainerRef = useRef<HTMLDivElement>(null);
  const pineContainerRef   = useRef<HTMLDivElement>(null);
  const drawingCanvasRef   = useRef<HTMLCanvasElement>(null);
  const chartRef           = useRef<IChartApi | null>(null);
  const rsiChartRef        = useRef<IChartApi | null>(null);
  const macdChartRef       = useRef<IChartApi | null>(null);
  const cvdChartRef        = useRef<IChartApi | null>(null);
  const obvMacdChartRef    = useRef<IChartApi | null>(null);
  const pineChartRef       = useRef<IChartApi | null>(null);
  const candleSeriesRef    = useRef<any>(null);
  const [currentLivePrice, setCurrentLivePrice] = useState<number | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<{ x: number; y: number; price: number; time: number }[]>([]);
  const [latestSignal, setLatestSignal] = useState<SmartSignalOutput | null>(null);
  const previousSignalRef  = useRef<string | null>(null);
  const historicDataRef    = useRef<CandleData[]>(historicData);
  const syncTimeEnabledRef = useRef(syncTimeEnabled);

  useEffect(() => {
    historicDataRef.current = historicData;
  }, [historicData]);

  useEffect(() => {
    syncTimeEnabledRef.current = syncTimeEnabled;
  }, [syncTimeEnabled]);

  const liveCandleRef = useRef<CandleData | null>(null);

  useEffect(() => {
    if (historicData && historicData.length > 0) {
      liveCandleRef.current = { ...historicData[historicData.length - 1] };
    } else {
      liveCandleRef.current = null;
    }
  }, [pane.symbol, pane.timeframe, historicData]);

  const [rsiHeight, setRsiHeight] = useState(120);
  const [macdHeight, setMacdHeight] = useState(120);
  const [cvdHeight, setCvdHeight] = useState(120);
  const [obvMacdHeight, setObvMacdHeight] = useState(140);
  const [pineHeight, setPineHeight] = useState(120);
  
  const [promptConfig, setPromptConfig] = useState<{isOpen: boolean; title: string; defaultVal: string; onConfirm: (v:string)=>void} | null>(null);
  const [isIndPanelOpen, setIsIndPanelOpen] = useState(false);

  // Sub-pane heights: RSI + MACD rendered below main chart
  const showRSI  = pane.indicators.rsi;
  const showMACD = pane.indicators.macd;
  const showCVD  = pane.indicators.cvd;
  const showObvMacdDoubleMacd = pane.indicators.obvMacdDoubleMacd;
  const subPaneCount = (showRSI ? 1 : 0) + (showMACD ? 1 : 0) + (showCVD ? 1 : 0) + (showObvMacdDoubleMacd ? 1 : 0);

  const visibleData = useMemo(() => {
    const raw = (!pane.isReplayMode || pane.replayCurrentIndex === null)
      ? historicData
      : historicData.slice(0, pane.replayCurrentIndex + 1);
    
    const clean = (raw || [])
      .filter((c): c is CandleData => c !== null && c !== undefined && c.time !== undefined && c.time !== null && !isNaN(c.time))
      .sort((a, b) => a.time - b.time);

    const seen = new Set<number>();
    const uniq: CandleData[] = [];
    for (const c of clean) {
      if (!seen.has(c.time)) {
        seen.add(c.time);
        uniq.push(c);
      }
    }
    return uniq;
  }, [historicData, pane.isReplayMode, pane.replayCurrentIndex]);

  const lastPriceValue = useMemo(() => {
    if (pane.isReplayMode && pane.replayCurrentIndex !== null && historicData[pane.replayCurrentIndex]) {
      return historicData[pane.replayCurrentIndex].close;
    }
    return currentLivePrice ?? (historicData.length > 0 ? historicData[historicData.length - 1].close : 100);
  }, [historicData, pane.isReplayMode, pane.replayCurrentIndex, currentLivePrice]);

  // Full Pine strategy signals and plots execution context
  const pineStrategyOutput = useMemo(() => {
    if (pane.pineStrategy && pane.pineStrategy.active) {
      return runPineStrategyFull(historicData, pane.pineStrategy);
    }
    return null;
  }, [historicData, pane.pineStrategy]);

  // Smart signals computed from historicData to preserve accurate indicator context
  const smartSignals = useMemo(() => {
    if (pineStrategyOutput) {
      return pineStrategyOutput.signals;
    }
    if (!pane.indicators.smartSignal) return [];
    return calcSmartSignals(historicData, pane.indicators.smartSignalParams);
  }, [historicData, pane.indicators.smartSignal, pane.indicators.smartSignalParams, pineStrategyOutput]);

  const killerIdmSignals = useMemo(() => {
    if (!pane.indicators.killerIdm) return [];
    return calcKillerIdmSignals(historicData);
  }, [historicData, pane.indicators.killerIdm]);

  // Reset latest signal on symbol/timeframe changes to prevent displaying stale indicators
  useEffect(() => {
    setLatestSignal(null);
    previousSignalRef.current = '';
  }, [pane.symbol, pane.timeframe]);

  // SMC data computed from visibleData
  const smcData = useMemo(() => {
    if (!pane.indicators.smcOrderBlocks && !pane.indicators.smcLiquiditySweeps) return { orderBlocks: [], sweeps: [] };
    return calcSMC(visibleData);
  }, [visibleData, pane.indicators.smcOrderBlocks, pane.indicators.smcLiquiditySweeps]);

  // Update latest signal state for the badge and emit event
  useEffect(() => {
    const combinedSignals = [
      ...(smartSignals || []),
      ...(killerIdmSignals || [])
    ].sort((a, b) => a.time - b.time);

    if (combinedSignals && combinedSignals.length > 0) {
      const latest = combinedSignals[combinedSignals.length - 1];
      if (latest && latest.time !== undefined && latest.time !== null) {
        setLatestSignal(latest);
        
        const sigType = latest.signal || (latest as any).type || 'SIGNAL';
        const sigId = `${latest.time}-${sigType}`;
        if (previousSignalRef.current !== sigId) {
          previousSignalRef.current = sigId;
          if (onSignal) onSignal(latest);
        }
      }
    } else {
      setLatestSignal(null);
    }
  }, [smartSignals, killerIdmSignals, onSignal]);

  // ── Live price subscription ───────────────────────────────────────────────
  useEffect(() => {
    if (pane.isReplayMode) return;
    const unsub = hyperliquidWS.subscribe(pane.symbol, (price) => {
      setCurrentLivePrice(price);
      if (activePosition?.status === 'OPEN') {
        const { direction, entryPrice, slPrice, tpPrice, quantity } = activePosition;
        let isClosed = false;
        let pnl = direction === 'BUY' ? (price - entryPrice) * quantity : (entryPrice - price) * quantity;
        if (direction === 'BUY') {
          if (tpPrice && price >= tpPrice) isClosed = true;
          if (slPrice && price <= slPrice) isClosed = true;
        } else {
          if (tpPrice && price <= tpPrice) isClosed = true;
          if (slPrice && price >= slPrice) isClosed = true;
        }
        if (isClosed) onCloseTrade(pnl, price);
      }
      if (candleSeriesRef.current && liveCandleRef.current) {
        const tfSecs = tfToSeconds(pane.timeframe);
        const nowSec = Math.floor(Date.now() / 1000);
        
        // Ensure we handle non-modular origins by maintaining the time phase of the historical source
        const offset = liveCandleRef.current.time % tfSecs;
        
        // Find the most recent strictly aligned interval boundary containing nowSec
        let alignedNowSec = Math.floor(nowSec / tfSecs) * tfSecs + offset;
        if (alignedNowSec > nowSec) {
           alignedNowSec -= tfSecs;
        }

        if (alignedNowSec <= liveCandleRef.current.time) {
          const currentClose = liveCandleRef.current.close;
          const isForex = /^[A-Z]{6}$/.test(pane.symbol) && !['GOLD', 'BRENT'].includes(pane.symbol);
          const threshold = isForex ? 0.003 : 0.02; // 0.3% for Forex, 2% for other assets
          const isMismatched = Math.abs(price - currentClose) > currentClose * threshold;

          if (isMismatched) {
            liveCandleRef.current = {
              ...liveCandleRef.current,
              open: price,
              high: price,
              low: price,
              close: price
            };
          } else {
            liveCandleRef.current = {
              ...liveCandleRef.current,
              high: Math.max(liveCandleRef.current.high, price),
              low: Math.min(liveCandleRef.current.low, price),
              close: price
            };
          }
          candleSeriesRef.current.update(liveCandleRef.current as any);
        } else {
          // Cross-boundary execution
          const bar: CandleData = { time: alignedNowSec, open: price, high: price, low: price, close: price, volume: 100 };
          liveCandleRef.current = bar;
          candleSeriesRef.current.update(bar as any);
        }
      }
    });
    return () => unsub();
  }, [pane.symbol, pane.isReplayMode, pane.timeframe, activePosition, onCloseTrade]);

  // ── Replay timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pane.isReplayMode || !pane.isPlaying || pane.replayCurrentIndex === null) return;
    const speeds: Record<number, number> = { 0.1: 10000, 0.3: 3000, 0.5: 2000, 1: 1000, 3: 330, 10: 100 };
    const timer = setInterval(() => {
      const next = pane.replayCurrentIndex! + 1;
      if (next >= historicData.length) { onUpdatePane({ isPlaying: false }); return; }
      onUpdatePane({ replayCurrentIndex: next });
      if (activePosition) {
        const c = historicData[next];
        const { direction, entryPrice, slPrice, tpPrice, quantity } = activePosition;
        let hit: number | null = null;
        if (direction === 'BUY') {
          if (tpPrice && c.high >= tpPrice) hit = tpPrice;
          else if (slPrice && c.low <= slPrice) hit = slPrice;
        } else {
          if (tpPrice && c.low <= tpPrice) hit = tpPrice;
          else if (slPrice && c.high >= slPrice) hit = slPrice;
        }
        if (hit !== null) {
          const pnl = direction === 'BUY' ? (hit - entryPrice) * quantity : (entryPrice - hit) * quantity;
          onCloseTrade(pnl, hit);
        }
      }
    }, speeds[pane.replaySpeed] ?? 1000);
    return () => clearInterval(timer);
  }, [pane.isReplayMode, pane.isPlaying, pane.replayCurrentIndex, pane.replaySpeed, historicData, activePosition, onCloseTrade]);

  // ── Main chart build ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width:  chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 340,
      layout: { background: { color: '#090b10' }, textColor: '#d1d4dc', fontFamily: 'Inter, system-ui, sans-serif' },
      grid:   { vertLines: { color: 'rgba(42,46,57,0.06)' }, horzLines: { color: 'rgba(42,46,57,0.06)' } },
      timeScale: { borderColor: '#1e222e', timeVisible: true, secondsVisible: ['1s','5s'].includes(pane.timeframe) },
      rightPriceScale: { borderColor: '#1e222e', minimumWidth: 80 },
      crosshair: { vertLine: { color: '#5a6a8a', width: 1, style: 3 }, horzLine: { color: '#5a6a8a', width: 1, style: 3 } },
    }) as any;
    chartRef.current = chart;

    const cSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#089981', downColor: '#f23645',
      borderVisible: false, wickUpColor: '#089981', wickDownColor: '#f23645',
    });
    candleSeriesRef.current = cSeries;
    if (visibleData.length > 0) cSeries.setData(visibleData as any);

    // Sync Handlers
    let isSyncingCrosshair = false;

    const onCrosshairMove = (param: any) => {
      if (isSyncingCrosshair) return;
      broadcastCrosshair(pane.id, param);
    };

    chart.subscribeCrosshairMove(onCrosshairMove);

    const onSyncCrosshair = (e: any) => {
      if (!e || !e.detail || e.detail.paneId === pane.id) return;
      isSyncingCrosshair = true;
      const param = e.detail.param;
      if (param && param.time !== undefined && param.point) {
        // Find approximate price scale y coordinate but map it properly for this chart
        // Since price ranges differ, we just set the crosshair at the time, and pick close price or 0
        const point = historicDataRef.current?.find(c => c && c.time === param.time);
        if (point) {
          chart.setCrosshairPosition(point.close, param.time, cSeries);
        } else {
          chart.clearCrosshairPosition();
        }
      } else {
        chart.clearCrosshairPosition();
      }
      setTimeout(() => isSyncingCrosshair = false, 50);
    };

    chartSyncBus.addEventListener('crosshair', onSyncCrosshair);

    // Sync Click Time Handler
    const onChartClick = (param: any) => {
      if (syncTimeEnabledRef.current && param && param.time) {
        chartSyncBus.dispatchEvent(new CustomEvent('sync-click-time', { detail: { time: param.time, senderPaneId: pane.id } }));
      }
    };
    chart.subscribeClick(onChartClick);

    const onSyncClickTime = (e: any) => {
      if (!e || !e.detail) return;
      const targetTime = e.detail.time;
      if (!targetTime) return;

      const timeScaleObj = chart.timeScale();
      const currentRange = timeScaleObj.getVisibleRange();
      if (currentRange) {
        const fromTime = typeof currentRange.from === 'number' ? currentRange.from : new Date(currentRange.from).getTime() / 1000;
        const toTime = typeof currentRange.to === 'number' ? currentRange.to : new Date(currentRange.to).getTime() / 1000;
        const span = toTime - fromTime;
        const halfSpan = span > 0 ? span / 2 : 1800; // default 30 mins
        
        try {
          timeScaleObj.setVisibleRange({
            from: targetTime - halfSpan,
            to: targetTime + halfSpan
          });
        } catch (err) {
          console.error("Error setting synchronized clicked time range", err);
        }
      }
    };

    chartSyncBus.addEventListener('sync-click-time', onSyncClickTime);

    const ind = pane.indicators;

    // EMA overlays
    const addEMA = (period: number, color: string) => {
      const s = chart.addSeries(LineSeries, { color, lineWidth: 1.2, title: `EMA${period}`, priceLineVisible: false, lastValueVisible: false });
      s.setData(calcEMA(visibleData, period) as any);
    };
    if (ind.ema20)  addEMA(ind.emaPeriods?.[0] || 20,  '#f59e0b');
    if (ind.ema50)  addEMA(ind.emaPeriods?.[1] || 50,  '#3b82f6');
    if (ind.ema80)  addEMA(ind.emaPeriods?.[2] || 80,  '#a78bfa');
    if (ind.ema200) addEMA(ind.emaPeriods?.[3] || 200, '#ec4899');

    // VWAP
    if (ind.vwap) {
      const s = chart.addSeries(LineSeries, { color: '#8b5cf6', lineWidth: 1.2, title: 'VWAP', priceLineVisible: false, lastValueVisible: false });
      s.setData(calcVWAP(visibleData) as any);
    }

    // Bollinger Bands
    if (ind.bollingerBands) {
      const bb = calcBB(visibleData);
      const opt = { lineWidth: 0.8, priceLineVisible: false, lastValueVisible: false };
      const mid = chart.addSeries(LineSeries, { ...opt, color: '#22c55e', title: 'BB Mid' });
      const up  = chart.addSeries(LineSeries, { ...opt, color: '#4ade8088', lineStyle: 2, title: 'BB Up' });
      const dn  = chart.addSeries(LineSeries, { ...opt, color: '#4ade8088', lineStyle: 2, title: 'BB Lo' });
      mid.setData(bb.map(b => ({ time: b.time, value: b.mid })) as any);
      up.setData(bb.map(b => ({ time: b.time, value: b.upper })) as any);
      dn.setData(bb.map(b => ({ time: b.time, value: b.lower })) as any);
    }

    // Ichimoku Cloud
    if (ind.ichimoku) {
      const ich = calcIchimoku(visibleData);
      const lineOpts = { lineWidth: 1, priceLineVisible: false, lastValueVisible: false };
      chart.addSeries(LineSeries, { ...lineOpts, color: '#f97316', title: 'Tenkan' }).setData(ich.tenkan as any);
      chart.addSeries(LineSeries, { ...lineOpts, color: '#60a5fa', title: 'Kijun' }).setData(ich.kijun as any);
      chart.addSeries(LineSeries, { ...lineOpts, color: '#34d39944', title: 'Senkou A' }).setData(ich.senkouA as any);
      chart.addSeries(LineSeries, { ...lineOpts, color: '#f8717144', title: 'Senkou B' }).setData(ich.senkouB as any);
      chart.addSeries(LineSeries, { ...lineOpts, color: '#a3a3a388', lineStyle: 2, title: 'Chikou' }).setData(ich.chikou as any);
    }

    // Dynamic Pine Script Indicator overlays
    if (pane.pineStrategy && pane.pineStrategy.active && pineStrategyOutput?.plots) {
      pineStrategyOutput.plots
        .filter(plot => plot.overlay && plot.data.length > 0)
        .forEach(plot => {
          let s;
          if (plot.type === 'histogram') {
            s = chart.addSeries(HistogramSeries, {
              color: plot.color,
              priceLineVisible: false,
              lastValueVisible: false,
              title: plot.title,
            });
          } else {
            s = chart.addSeries(LineSeries, {
              color: plot.color,
              lineWidth: 1.5,
              title: plot.title,
              priceLineVisible: false,
              lastValueVisible: false
            });
          }
          // Filter the plot data to contain only times present in visibleData
          const visibleTimes = new Set((visibleData || []).filter(Boolean).map(c => c.time));
          const filteredData = (plot.data || []).filter(d => d && d.time !== undefined && d.time !== null && visibleTimes.has(d.time));
          s.setData(filteredData as any);
        });
    }

    // Horizontal Sync
    chart.timeScale().subscribeVisibleTimeRangeChange((range: any) => {
      drawUserOverlay();
      if (range) {
        try { if (rsiChartRef.current) (rsiChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (macdChartRef.current) (macdChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (cvdChartRef.current) (cvdChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (pineChartRef.current) (pineChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (obvMacdChartRef.current) (obvMacdChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
      }
    });

    const resizer = new ResizeObserver(entries => {
      for (const e of entries) {
        if (chartRef.current) {
          try { chartRef.current.resize(e.contentRect.width, e.contentRect.height); } catch {}
          drawUserOverlay();
        }
      }
    });
    resizer.observe(chartContainerRef.current);

    const timerId = setTimeout(() => { try { chart.timeScale().fitContent(); drawUserOverlay(); } catch {} }, 150);

    return () => {
      clearTimeout(timerId);
      resizer.disconnect();
      chartSyncBus.removeEventListener('crosshair', onSyncCrosshair);
      chartSyncBus.removeEventListener('sync-click-time', onSyncClickTime);
      try { chart.unsubscribeClick(onChartClick); } catch {}
      try { chart.unsubscribeCrosshairMove(onCrosshairMove); } catch {}
      try { chart.remove(); } catch {}
      chartRef.current = null;
    };
  }, [visibleData, pane.indicators, pane.symbol, pane.timeframe, pane.pineStrategy, pineStrategyOutput]);

  // ── RSI sub-chart ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showRSI || !rsiContainerRef.current) return;
    const chart = createChart(rsiContainerRef.current, {
      width: rsiContainerRef.current.clientWidth, height: rsiContainerRef.current.clientHeight || 80,
      layout: { background: { color: '#090b10' }, textColor: '#6b7280', fontFamily: 'Inter, system-ui, sans-serif' },
      grid: { vertLines: { color: 'rgba(42,46,57,0.04)' }, horzLines: { color: 'rgba(42,46,57,0.04)' } },
      timeScale: { visible: false },
      rightPriceScale: { borderColor: '#1e222e', scaleMargins: { top: 0.05, bottom: 0.05 }, minimumWidth: 80 },
    }) as any;
    rsiChartRef.current = chart;
    const rsiLength = pane.indicators.rsiLength || 14;
    const rsiData = calcRSI(visibleData, rsiLength);
    const s = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true, title: 'RSI' });
    s.setData(rsiData as any);
    // Overbought/oversold lines
    const ob = chart.addSeries(LineSeries, { color: '#f2364560', lineWidth: 0.8, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
    const os = chart.addSeries(LineSeries, { color: '#08998160', lineWidth: 0.8, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
    ob.setData(rsiData.map(d => ({ time: d.time, value: 70 })) as any);
    os.setData(rsiData.map(d => ({ time: d.time, value: 30 })) as any);

    // Sync time scale with main chart
    if (chartRef.current) {
      const range = (chartRef.current as any).timeScale().getVisibleRange();
      if (range) chart.timeScale().setVisibleRange(range);
    }
    chart.timeScale().subscribeVisibleTimeRangeChange((range: any) => {
      if (range) {
        try { if (chartRef.current) (chartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (macdChartRef.current) (macdChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (cvdChartRef.current) (cvdChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (pineChartRef.current) (pineChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (obvMacdChartRef.current) (obvMacdChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
      }
    });
    const resizer = new ResizeObserver(e => { for (const en of e) { try { if (rsiChartRef.current) rsiChartRef.current.resize(en.contentRect.width, en.contentRect.height); } catch {} } });
    resizer.observe(rsiContainerRef.current);
    return () => { resizer.disconnect(); try { chart.remove(); } catch {} rsiChartRef.current = null; };
  }, [visibleData, showRSI]);

  // ── MACD sub-chart ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showMACD || !macdContainerRef.current) return;
    const chart = createChart(macdContainerRef.current, {
      width: macdContainerRef.current.clientWidth, height: macdContainerRef.current.clientHeight || 80,
      layout: { background: { color: '#090b10' }, textColor: '#6b7280', fontFamily: 'Inter, system-ui, sans-serif' },
      grid: { vertLines: { color: 'rgba(42,46,57,0.04)' }, horzLines: { color: 'rgba(42,46,57,0.04)' } },
      timeScale: { visible: false },
      rightPriceScale: { borderColor: '#1e222e', scaleMargins: { top: 0.1, bottom: 0.1 }, minimumWidth: 80 },
    }) as any;
    macdChartRef.current = chart;
    const pFast = pane.indicators.macdParams?.[0] || 12;
    const pSlow = pane.indicators.macdParams?.[1] || 26;
    const pSig  = pane.indicators.macdParams?.[2] || 9;
    const { macd, signal, hist } = calcMACD(visibleData, pFast, pSlow, pSig);
    chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }).setData(hist as any);
    chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1.2, priceLineVisible: false, lastValueVisible: false, title: '' }).setData(macd as any);
    chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1.0, priceLineVisible: false, lastValueVisible: false, title: '' }).setData(signal as any);
    
    // Sync time scale with main chart
    if (chartRef.current) {
      const range = (chartRef.current as any).timeScale().getVisibleRange();
      if (range) chart.timeScale().setVisibleRange(range);
    }
    chart.timeScale().subscribeVisibleTimeRangeChange((range: any) => {
      if (range) {
        try { if (chartRef.current) (chartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (rsiChartRef.current) (rsiChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (cvdChartRef.current) (cvdChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (pineChartRef.current) (pineChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (obvMacdChartRef.current) (obvMacdChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
      }
    });

    const resizer = new ResizeObserver(e => { for (const en of e) { try { if (macdChartRef.current) macdChartRef.current.resize(en.contentRect.width, en.contentRect.height); } catch {} } });
    resizer.observe(macdContainerRef.current);
    return () => { resizer.disconnect(); try { chart.remove(); } catch {} macdChartRef.current = null; };
  }, [visibleData, showMACD]);

  // ── CVD sub-chart ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showCVD || !cvdContainerRef.current) return;
    const chart = createChart(cvdContainerRef.current, {
      width: cvdContainerRef.current.clientWidth, height: cvdContainerRef.current.clientHeight || 120,
      layout: { background: { color: '#090b10' }, textColor: '#6b7280', fontFamily: 'Inter, system-ui, sans-serif' },
      grid: { vertLines: { color: 'rgba(42,46,57,0.04)' }, horzLines: { color: 'rgba(42,46,57,0.04)' } },
      timeScale: { visible: false },
      rightPriceScale: { borderColor: '#1e222e', scaleMargins: { top: 0.1, bottom: 0.1 }, minimumWidth: 80 },
    }) as any;
    cvdChartRef.current = chart;
    const cvdData = calcCVD(visibleData);
    chart.addSeries(HistogramSeries, { 
      priceLineVisible: false, 
      lastValueVisible: false, 
      color: '#34d399', 
      title: 'CVD' 
    }).setData(cvdData as any);
    
    // Sync time scale with main chart
    if (chartRef.current) {
      const range = (chartRef.current as any).timeScale().getVisibleRange();
      if (range) chart.timeScale().setVisibleRange(range);
    }
    chart.timeScale().subscribeVisibleTimeRangeChange((range: any) => {
      if (range) {
        try { if (chartRef.current) (chartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (rsiChartRef.current) (rsiChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (macdChartRef.current) (macdChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (pineChartRef.current) (pineChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (obvMacdChartRef.current) (obvMacdChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
      }
    });

    const resizer = new ResizeObserver(e => { for (const en of e) { try { if (cvdChartRef.current) cvdChartRef.current.resize(en.contentRect.width, en.contentRect.height); } catch {} } });
    resizer.observe(cvdContainerRef.current);
    return () => { resizer.disconnect(); try { chart.remove(); } catch {} cvdChartRef.current = null; };
  }, [visibleData, showCVD]);

  // ── OBV MACD + Double MACD Combined sub-chart ──────────────────────────────
  useEffect(() => {
    if (!showObvMacdDoubleMacd || !obvMacdContainerRef.current) return;
    const chart = createChart(obvMacdContainerRef.current, {
      width: obvMacdContainerRef.current.clientWidth, height: obvMacdContainerRef.current.clientHeight || 140,
      layout: { background: { color: '#090b10' }, textColor: '#6b7280', fontFamily: 'Inter, system-ui, sans-serif' },
      grid: { vertLines: { color: 'rgba(42,46,57,0.04)' }, horzLines: { color: 'rgba(42,46,57,0.04)' } },
      timeScale: { visible: false },
      rightPriceScale: { borderColor: '#1e222e', scaleMargins: { top: 0.1, bottom: 0.1 }, minimumWidth: 80 },
    }) as any;
    obvMacdChartRef.current = chart;

    // Calculate indicator values
    const results = calculateObvMacdDoubleMacd(visibleData);

    const obvMacdData = results.map(r => ({ time: r.time as UTCTimestamp, value: r.obvMacd }));
    const longMacdData = results.map(r => ({ time: r.time as UTCTimestamp, value: r.longMacd }));
    const longSignalData = results.map(r => ({ time: r.time as UTCTimestamp, value: r.longSignal }));
    const longHistData = results.map(r => ({
      time: r.time as UTCTimestamp,
      value: r.longHist,
      color: r.longHist >= 0 ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)' // translucent green/red
    }));

    const shortMacdData = results.map(r => ({ time: r.time as UTCTimestamp, value: r.shortMacd }));
    const shortSignalData = results.map(r => ({ time: r.time as UTCTimestamp, value: r.shortSignal }));
    const shortHistData = results.map(r => ({
      time: r.time as UTCTimestamp,
      value: r.shortHist
    }));

    // Add Series
    // Long Histogram columns
    chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, title: '' }).setData(longHistData);

    // Short Histogram line
    chart.addSeries(LineSeries, { color: '#64748b', lineWidth: 0.8, priceLineVisible: false, lastValueVisible: false, title: '' }).setData(shortHistData);

    // Long MACD and Signal Lines (Cyan and Rose)
    chart.addSeries(LineSeries, { color: '#06b6d4', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, title: '' }).setData(longMacdData);
    chart.addSeries(LineSeries, { color: '#f43f5e', lineWidth: 1.2, priceLineVisible: false, lastValueVisible: false, title: '' }).setData(longSignalData);

    // Short MACD and Signal Lines (Vivid Blue and Gold)
    chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, title: '' }).setData(shortMacdData);
    chart.addSeries(LineSeries, { color: '#eab308', lineWidth: 1.2, priceLineVisible: false, lastValueVisible: false, title: '' }).setData(shortSignalData);

    // OBV MACD main T-Channel/Line - thick vivid violet/magenta
    chart.addSeries(LineSeries, { color: '#d946ef', lineWidth: 2.5, priceLineVisible: false, lastValueVisible: false, title: '' }).setData(obvMacdData);

    // Sync time scale with main chart
    if (chartRef.current) {
      const range = (chartRef.current as any).timeScale().getVisibleRange();
      if (range) chart.timeScale().setVisibleRange(range);
    }
    chart.timeScale().subscribeVisibleTimeRangeChange((range: any) => {
      if (range) {
        try { if (chartRef.current) (chartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (rsiChartRef.current) (rsiChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (macdChartRef.current) (macdChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (cvdChartRef.current) (cvdChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (pineChartRef.current) (pineChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
      }
    });

    const resizer = new ResizeObserver(entries => {
      for (const e of entries) {
        try { if (obvMacdChartRef.current) obvMacdChartRef.current.resize(e.contentRect.width, e.contentRect.height); } catch {}
      }
    });
    resizer.observe(obvMacdContainerRef.current);

    return () => {
      resizer.disconnect();
      try { chart.remove(); } catch {}
      obvMacdChartRef.current = null;
    };
  }, [visibleData, showObvMacdDoubleMacd]);

  // Check if we have active non-overlay Pine plots to display as sub-charts
  const hasPineOscillators = useMemo(() => {
    return !!(pane.pineStrategy && pane.pineStrategy.active && pineStrategyOutput?.plots?.some(p => !p.overlay));
  }, [pane.pineStrategy, pineStrategyOutput]);

  // ── Pine custom sub-chart ──────────────────────────────────────────────────
  useEffect(() => {
    if (!hasPineOscillators || !pineContainerRef.current) return;

    const chart = createChart(pineContainerRef.current, {
      width: pineContainerRef.current.clientWidth,
      height: pineContainerRef.current.clientHeight || 100,
      layout: { background: { color: '#090b10' }, textColor: '#cbd5e1', fontFamily: 'Inter, system-ui, sans-serif' },
      grid: { vertLines: { color: 'rgba(42,46,57,0.02)' }, horzLines: { color: 'rgba(42,46,57,0.06)' } },
      timeScale: { visible: false },
      rightPriceScale: { borderColor: '#1e222e' },
      crosshair: { vertLine: { color: '#5a6a8a', width: 1, style: 3 }, horzLine: { color: '#5a6a8a', width: 1, style: 3 } }
    }) as any;

    pineChartRef.current = chart;

    if (pineStrategyOutput?.plots) {
      pineStrategyOutput.plots
        .filter(plot => !plot.overlay)
        .forEach(plot => {
          let s;
          if (plot.type === 'histogram') {
            s = chart.addSeries(HistogramSeries, {
              color: plot.color,
              priceLineVisible: false,
              lastValueVisible: false,
              title: plot.title
            });
          } else {
            s = chart.addSeries(LineSeries, {
              color: plot.color,
              lineWidth: 1.2,
              title: plot.title,
              priceLineVisible: false,
              lastValueVisible: false
            });
          }
          // Filter data to synchronize with visibleData
          const visibleTimes = new Set((visibleData || []).filter(Boolean).map(c => c.time));
          const filteredData = (plot.data || []).filter(d => d && d.time !== undefined && d.time !== null && visibleTimes.has(d.time));
          s.setData(filteredData as any);
        });
    }

    // Sync time scale with main chart
    if (chartRef.current) {
      const range = (chartRef.current as any).timeScale().getVisibleRange();
      if (range) chart.timeScale().setVisibleRange(range);
    }
    chart.timeScale().subscribeVisibleTimeRangeChange((range: any) => {
      if (range) {
        try { if (chartRef.current) (chartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (rsiChartRef.current) (rsiChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (macdChartRef.current) (macdChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (cvdChartRef.current) (cvdChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
        try { if (obvMacdChartRef.current) (obvMacdChartRef.current as any).timeScale().setVisibleRange(range); } catch {}
      }
    });

    const resizer = new ResizeObserver(entries => {
      for (const entry of entries) {
        try {
          if (pineChartRef.current) {
            pineChartRef.current.resize(entry.contentRect.width, entry.contentRect.height);
          }
        } catch {}
      }
    });
    resizer.observe(pineContainerRef.current);

    return () => {
      resizer.disconnect();
      try { chart.remove(); } catch {}
      pineChartRef.current = null;
    };
  }, [visibleData, hasPineOscillators, pineStrategyOutput]);

  // ── Canvas overlay (drawings + positions + smart signals + fractals) ──────
  useEffect(() => { drawUserOverlay(); }, [pane.drawings, activePosition, lastPriceValue, smartSignals, killerIdmSignals, smcData, pane.indicators, serverBots]);

  const drawUserOverlay = useCallback(() => {
    const canvas = drawingCanvasRef.current;
    const chart  = chartRef.current;
    const cSeries = candleSeriesRef.current;
    if (!canvas || !chart || !cSeries) return;

    try {
      const ts = chart.timeScale();
      const ps = cSeries.priceScale();
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
    canvas.width  = canvas.parentElement?.clientWidth  || 0;
    canvas.height = canvas.parentElement?.clientHeight || 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const priceScale = (chart as any).priceScale('right');
    const timeScale  = (chart as any).timeScale();
    if (!timeScale) return;

    // SMC Order Blocks
    if (pane.indicators.smcOrderBlocks && smcData && Array.isArray(smcData.orderBlocks)) {
      smcData.orderBlocks.forEach(ob => {
        if (!ob || ob.time === undefined || ob.time === null) return;
        const topY = cSeries.priceToCoordinate(ob.top);
        const bottomY = cSeries.priceToCoordinate(ob.bottom);
        const startX = timeScale.timeToCoordinate(ob.time);
        if (topY !== null && bottomY !== null && startX !== null) {
          ctx.fillStyle = ob.type === 'BULL' ? 'rgba(8, 153, 129, 0.1)' : 'rgba(242, 54, 69, 0.1)';
          ctx.fillRect(startX, topY, canvas.width - startX, bottomY - topY);
          
          ctx.fillStyle = ob.type === 'BULL' ? 'rgba(8, 153, 129, 0.8)' : 'rgba(242, 54, 69, 0.8)';
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.fillText(`+OB`, startX + 5, bottomY - 5);
        }
      });
    }

    // SMC Liquidity Sweeps
    if (pane.indicators.smcLiquiditySweeps && smcData && Array.isArray(smcData.sweeps)) {
      smcData.sweeps.forEach(sw => {
        if (!sw || sw.time === undefined || sw.time === null) return;
        const y = cSeries.priceToCoordinate(sw.price);
        const x = timeScale.timeToCoordinate(sw.time);
        if (y !== null && x !== null) {
          ctx.strokeStyle = sw.type === 'BULL' ? '#089981' : '#f23645';
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(x - 5, y);
          ctx.lineTo(x + 5, y);
          ctx.stroke();
          
          ctx.fillStyle = sw.type === 'BULL' ? '#089981' : '#f23645';
          ctx.font = '9px "JetBrains Mono", monospace';
          ctx.fillText(`x`, x - 3, y - 5);
        }
      });
    }

    // Position lines
    if (activePosition?.status === 'OPEN') {
      const toY = (p: number) => cSeries.priceToCoordinate(p);
      const entryY = toY(activePosition.entryPrice);

      const isBuy = activePosition.direction === 'BUY';
      const livePrice = lastPriceValue;
      const amount = activePosition.amount || 1000;
      const leverage = activePosition.leverage || 1;
      const positionSize = amount * leverage; 
      const priceDiffRatio = isBuy 
        ? (livePrice - activePosition.entryPrice) / activePosition.entryPrice 
        : (activePosition.entryPrice - livePrice) / activePosition.entryPrice;
      const unrealizedPnL = positionSize * priceDiffRatio;
      const pnLColor = unrealizedPnL >= 0 ? '#10b981' : '#ef4444';
      const pnlText = `${unrealizedPnL >= 0 ? '+' : ''}$${unrealizedPnL.toFixed(2)} (${(priceDiffRatio * 100).toFixed(2)}%)`;

      if (entryY !== null) {
        ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1.3; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(0, entryY); ctx.lineTo(canvas.width - 60, entryY); ctx.stroke();
        
        ctx.fillStyle = '#1e3a8a'; ctx.fillRect(5, entryY - 10, 85, 20);
        ctx.fillStyle = '#93c5fd'; ctx.font = 'bold 9px monospace';
        ctx.fillText(`ENTRY $${activePosition.entryPrice}`, 9, entryY + 3);

        ctx.fillStyle = `${pnLColor}22`; 
        ctx.fillRect(95, entryY - 10, 110, 20);
        ctx.strokeStyle = pnLColor; ctx.setLineDash([]); ctx.strokeRect(95, entryY - 10, 110, 20);
        ctx.fillStyle = pnLColor; ctx.font = 'bold 9px monospace';
        ctx.fillText(pnlText, 99, entryY + 3);
      }
      if (activePosition.slPrice) {
        const slY = toY(activePosition.slPrice);
        if (slY !== null && slY >= 0 && slY <= canvas.height) {
          ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.3; ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(0, slY); ctx.lineTo(canvas.width - 60, slY); ctx.stroke();
          ctx.fillStyle = '#991b1b'; ctx.fillRect(canvas.width - 145, slY - 10, 90, 20);
          ctx.fillStyle = '#fca5a5'; ctx.font = 'bold 9px monospace';
          ctx.fillText(`SL $${activePosition.slPrice}`, canvas.width - 141, slY + 3);
        }
      }
      if (activePosition.tpPrice) {
        const tpY = toY(activePosition.tpPrice);
        if (tpY !== null && tpY >= 0 && tpY <= canvas.height) {
          ctx.strokeStyle = '#10b981'; ctx.lineWidth = 1.3; ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(0, tpY); ctx.lineTo(canvas.width - 60, tpY); ctx.stroke();
          ctx.fillStyle = '#065f46'; ctx.fillRect(canvas.width - 145, tpY - 10, 90, 20);
          ctx.fillStyle = '#a7f3d0'; ctx.font = 'bold 9px monospace';
          ctx.fillText(`TP $${activePosition.tpPrice}`, canvas.width - 141, tpY + 3);
        }
      }
    }

    // Real-time server-side Autonomous Bot Position lines
    const activeBot = serverBots?.find(b => b?.symbol === pane.symbol && b?.status === 'RUNNING');
    const botPosition = activeBot?.positions?.[0];

    if (botPosition) {
      const toY = (p: number) => cSeries.priceToCoordinate(p);
      const entryY = toY(botPosition.entryPrice);

      const isBuy = botPosition.direction === 'BUY';
      const livePrice = lastPriceValue;
      const amount = botPosition.quantity * botPosition.entryPrice;
      const priceDiffRatio = isBuy 
        ? (livePrice - botPosition.entryPrice) / botPosition.entryPrice 
        : (botPosition.entryPrice - livePrice) / botPosition.entryPrice;
      const unrealizedPnL = amount * priceDiffRatio;
      const pnLColor = unrealizedPnL >= 0 ? '#10b981' : '#ef4444';
      const pnlText = `[AI BOT] ${unrealizedPnL >= 0 ? '+' : ''}$${unrealizedPnL.toFixed(2)} (${(priceDiffRatio * 100).toFixed(2)}%)`;

      if (entryY !== null) {
        ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 1.3; ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(0, entryY); ctx.lineTo(canvas.width - 60, entryY); ctx.stroke();
        
        ctx.fillStyle = '#581c87'; ctx.fillRect(5, entryY - 10, 110, 20);
        ctx.fillStyle = '#e9d5ff'; ctx.font = 'bold 9px monospace';
        ctx.fillText(`🤖 BOT ${botPosition.direction} $${botPosition.entryPrice}`, 9, entryY + 3);

        ctx.fillStyle = `${pnLColor}22`; 
        ctx.fillRect(120, entryY - 10, 140, 20);
        ctx.strokeStyle = pnLColor; ctx.setLineDash([]); ctx.strokeRect(120, entryY - 10, 140, 20);
        ctx.fillStyle = pnLColor; ctx.font = 'bold 9px monospace';
        ctx.fillText(pnlText, 124, entryY + 3);
      }
      if (botPosition.sl) {
        const slY = toY(botPosition.sl);
        if (slY !== null && slY >= 0 && slY <= canvas.height) {
          ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.3; ctx.setLineDash([2, 4]);
          ctx.beginPath(); ctx.moveTo(0, slY); ctx.lineTo(canvas.width - 60, slY); ctx.stroke();
          ctx.fillStyle = '#991b1b'; ctx.fillRect(canvas.width - 145, slY - 10, 90, 20);
          ctx.fillStyle = '#fca5a5'; ctx.font = 'bold 9px monospace';
          ctx.fillText(`BOT SL $${botPosition.sl}`, canvas.width - 141, slY + 3);
        }
      }
      if (botPosition.tp) {
        const tpY = toY(botPosition.tp);
        if (tpY !== null && tpY >= 0 && tpY <= canvas.height) {
          ctx.strokeStyle = '#10b981'; ctx.lineWidth = 1.3; ctx.setLineDash([2, 4]);
          ctx.beginPath(); ctx.moveTo(0, tpY); ctx.lineTo(canvas.width - 60, tpY); ctx.stroke();
          ctx.fillStyle = '#065f46'; ctx.fillRect(canvas.width - 145, tpY - 10, 90, 20);
          ctx.fillStyle = '#a7f3d0'; ctx.font = 'bold 9px monospace';
          ctx.fillText(`BOT TP $${botPosition.tp}`, canvas.width - 141, tpY + 3);
        }
      }
    }

    // Manual drawings
    ctx.setLineDash([]);
    pane.drawings.forEach(line => {
      if (!line || !line.point1 || line.point1.time === undefined || line.point1.time === null) return;
      const x1 = timeScale.timeToCoordinate(line.point1.time as any);
      const y1 = cSeries.priceToCoordinate(line.point1.price);
      if (line.type === 'horizontal' && y1 !== null && y1 >= 0 && y1 <= canvas.height) {
        ctx.strokeStyle = line.color || '#3b82f6'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(canvas.width - 60, y1); ctx.stroke();
      } else if (line.type === 'trend' && line.point2 && line.point2.time !== undefined && line.point2.time !== null) {
        const x2 = timeScale.timeToCoordinate(line.point2.time as any);
        const y2 = cSeries.priceToCoordinate(line.point2.price);
        if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
          ctx.strokeStyle = line.color || '#f59e0b'; ctx.lineWidth = 2.0;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(x1, y1, 3.5, 0, Math.PI * 2); ctx.arc(x2, y2, 3.5, 0, Math.PI * 2); ctx.fill();
        }
      } else if (line.type === 'fibonacci' && line.point2 && line.point2.time !== undefined && line.point2.time !== null) {
        const x2 = timeScale.timeToCoordinate(line.point2.time as any);
        const y2 = cSeries.priceToCoordinate(line.point2.price);
        if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
          const minX = Math.min(x1, x2);
          const maxX = canvas.width - 60; // extend to price scale
          const h = line.point1.price;
          const l = line.point2.price;
          const levels = [
            { ratio: 0, color: '#f23645' },
            { ratio: 0.236, color: '#f59e0b' },
            { ratio: 0.382, color: '#eab308' },
            { ratio: 0.5, color: '#089981' },
            { ratio: 0.618, color: '#0ea5e9' },
            { ratio: 0.786, color: '#6366f1' },
            { ratio: 1, color: '#9333ea' }
          ];
          
          levels.forEach(lvl => {
            const price = h - (h - l) * lvl.ratio;
            const y = cSeries.priceToCoordinate(price);
            if (y !== null) {
              ctx.strokeStyle = lvl.color; ctx.lineWidth = 1;
              ctx.beginPath(); ctx.moveTo(minX, y); ctx.lineTo(maxX, y); ctx.stroke();
              ctx.fillStyle = lvl.color; ctx.font = '10px monospace';
              ctx.fillText(`${lvl.ratio} (${price.toFixed(2)})`, minX + 5, y - 4);
            }
          });
          
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.setLineDash([]);
        }
      } else if (line.type === 'rectangle' && line.point2 && line.point2.time !== undefined && line.point2.time !== null) {
        const x2 = timeScale.timeToCoordinate(line.point2.time as any);
        const y2 = cSeries.priceToCoordinate(line.point2.price);
        if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
          const minX = Math.min(x1, x2);
          const maxX = Math.max(x1, x2);
          const minY = Math.min(y1, y2);
          const maxY = Math.max(y1, y2);
          ctx.fillStyle = (line.color || '#3b82f6') + '20'; // 20 hex alpha ~ 12%
          ctx.strokeStyle = line.color || '#3b82f6';
          ctx.lineWidth = 1.0;
          ctx.beginPath();
          ctx.rect(minX, minY, maxX - minX, maxY - minY);
          ctx.fill();
          ctx.stroke();
          
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(x1, y1, 3.5, 0, Math.PI * 2); ctx.arc(x2, y2, 3.5, 0, Math.PI * 2); ctx.fill();
        }
      }
    });

    // Fractals on canvas
    if (pane.indicators.fractal) {
      const fractals = calcFractals(visibleData);
      if (fractals) {
        ctx.font = 'bold 10px monospace';
        if (Array.isArray(fractals.highs)) {
          fractals.highs.forEach(f => {
            if (!f || f.time === undefined || f.time === null) return;
            const x = timeScale.timeToCoordinate(f.time as any);
            const y = cSeries.priceToCoordinate(f.price);
            if (x !== null && y !== null && y >= 0 && y <= canvas.height) {
              ctx.fillStyle = '#f23645';
              ctx.fillText('▼', x - 5, y - 6);
            }
          });
        }
        if (Array.isArray(fractals.lows)) {
          fractals.lows.forEach(f => {
            if (!f || f.time === undefined || f.time === null) return;
            const x = timeScale.timeToCoordinate(f.time as any);
            const y = cSeries.priceToCoordinate(f.price);
            if (x !== null && y !== null && y >= 0 && y <= canvas.height) {
              ctx.fillStyle = '#089981';
              ctx.fillText('▲', x - 5, y + 14);
            }
          });
        }
      }
    }

    // Smart Signals on canvas
    if (pane.indicators.smartSignal) {
      smartSignals.forEach(sig => {
        if (!sig || sig.time === undefined || sig.time === null) return;
        const x = timeScale.timeToCoordinate(sig.time as any);
        const y = cSeries.priceToCoordinate(sig.entry);
        if (x === null || y === null) return;

        const isBuy = sig.signal === 'BUY';
        const color = isBuy ? '#089981' : '#f23645';
        const arrow = isBuy ? '▲' : '▼';
        const offsetY = isBuy ? 14 : -6;

        // Arrow
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = color;
        ctx.fillText(arrow, x - 6, y + offsetY);

        // TP/SL dashed projections
        const tpY = cSeries.priceToCoordinate(sig.tp);
        const slY = cSeries.priceToCoordinate(sig.sl);
        ctx.setLineDash([2, 4]);
        if (tpY !== null && tpY >= 0 && tpY <= canvas.height) {
          ctx.strokeStyle = '#089981'; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 60, tpY); ctx.stroke();
        }
        if (slY !== null && slY >= 0 && slY <= canvas.height) {
          ctx.strokeStyle = '#f23645'; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 60, slY); ctx.stroke();
        }
        ctx.setLineDash([]);

        // Confidence badge
        if (sig.confidence >= 70) {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(x + 4, y - 18, 32, 13);
          ctx.fillStyle = color;
          ctx.font = 'bold 8px monospace';
          ctx.fillText(`${sig.confidence}%`, x + 6, y - 8);
        }
      });
    }

    // Killer + IDM Overlays on canvas
    if (pane.indicators.killerIdm && killerIdmSignals) {
      killerIdmSignals.forEach(sig => {
        if (!sig || sig.time === undefined || sig.time === null) return;
        const x = timeScale.timeToCoordinate(sig.time as any);
        const y = cSeries.priceToCoordinate(sig.entry);
        if (x === null || y === null) return;

        const isBuy = sig.signal === 'BUY';
        const color = isBuy ? '#10b981' : '#ef4444';
        const arrow = isBuy ? '▲ IDM BUY' : '▼ IDM SELL';
        const offsetY = isBuy ? 16 : -8;

        // Arrow
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = color;
        ctx.fillText(arrow, x - 15, y + offsetY);

        // TP/SL dashed projections
        const tpY = cSeries.priceToCoordinate(sig.tp);
        const slY = cSeries.priceToCoordinate(sig.sl);
        ctx.setLineDash([1, 3]);
        if (tpY !== null && tpY >= 0 && tpY <= canvas.height) {
          ctx.strokeStyle = '#10b981'; ctx.lineWidth = 1.0;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 50, tpY); ctx.stroke();
        }
        if (slY !== null && slY >= 0 && slY <= canvas.height) {
          ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.0;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 50, slY); ctx.stroke();
        }
        ctx.setLineDash([]);
      });
    }

    // Volume Profile
    if (pane.indicators.volumeProfile) {
      const { profile: vp, step } = calcVolumeProfile(visibleData, pane.indicators.volumeProfileBins || 40);
      let maxVol = 1;
      for(let b of vp) if(b.vol > maxVol) maxVol = b.vol;
      const maxWidth = canvas.width * 0.15;
      
      ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
      vp.forEach(b => {
        const yTop = cSeries.priceToCoordinate(b.price + step / 2);
        const yBottom = cSeries.priceToCoordinate(b.price - step / 2);
        
        if (yTop !== null && yBottom !== null) {
          const y = Math.min(yTop, yBottom);
          const h = Math.abs(yBottom - yTop) * 0.85; // 85% of bin height for padding
          const w = (b.vol / maxVol) * maxWidth;
          
          if (y >= 0 && y <= canvas.height || (y + h) >= 0 && (y + h) <= canvas.height) {
            ctx.fillRect(canvas.width - 55 - w, y, w, h);
          }
        }
      });
    }

    // Drawing preview anchor
    if (drawingPoints.length > 0 && drawingPoints[0] && drawingPoints[0].time !== undefined && drawingPoints[0].time !== null) {
      const anchor = drawingPoints[0];
      const aX = timeScale.timeToCoordinate(anchor.time as any);
      const aY = cSeries.priceToCoordinate(anchor.price);
      if (aX !== null && aY !== null) {
        ctx.fillStyle = '#f59e0b'; ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.arc(aX, aY, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
    } catch {}
  }, [pane.drawings, activePosition, lastPriceValue, smartSignals, killerIdmSignals, visibleData, drawingPoints, pane.indicators]);

  // ── Canvas click handler ──────────────────────────────────────────────────
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    onSelectPane();
    if (!pane.activeDrawingType || !chartRef.current || !candleSeriesRef.current) return;
    const rect = drawingCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const timeScaleObj = (chartRef.current as any)?.timeScale();
    if (!timeScaleObj) return;
    const logTime = timeScaleObj.coordinateToTime(x);
    const price   = candleSeriesRef.current.coordinateToPrice(y);
    if (logTime === null || price === null) return;
    const timeNum = typeof logTime === 'object' ? (logTime as any).time || Date.now() / 1000 : Number(logTime);

    if (pane.activeDrawingType === 'horizontal') {
      onUpdatePane({ drawings: [...pane.drawings, { id: Math.random().toString(), type: 'horizontal', point1: { time: timeNum, price }, color: '#3b82f6' }], activeDrawingType: null });
      setDrawingPoints([]);
    } else if (pane.activeDrawingType === 'trend' || pane.activeDrawingType === 'fibonacci' || pane.activeDrawingType === 'rectangle') {
      if (drawingPoints.length === 0) {
        setDrawingPoints([{ x, y, price, time: timeNum }]);
      } else {
        const fp = drawingPoints[0];
        onUpdatePane({ drawings: [...pane.drawings, { id: Math.random().toString(), type: pane.activeDrawingType, point1: { time: fp.time, price: fp.price }, point2: { time: timeNum, price }, color: pane.activeDrawingType === 'trend' ? '#f59e0b' : pane.activeDrawingType === 'rectangle' ? '#ec4899' : '#8b5cf6' }], activeDrawingType: null });
        setDrawingPoints([]);
      }
    }
  };

  // Dynamic theme update for all lightweight charts
  useEffect(() => {
    const isLight = themeMode === 'light';
    const bgColor = isLight ? '#ffffff' : '#090b10';
    const txtColor = isLight ? '#1e293b' : '#cbd5e1';
    const borderCol = isLight ? '#cbd5e1' : '#1e222e';
    const gridCol = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(42,46,57,0.06)';

    const options = {
      layout: { background: { color: bgColor }, textColor: txtColor },
      grid: { vertLines: { color: gridCol }, horzLines: { color: gridCol } },
      timeScale: { borderColor: borderCol },
      rightPriceScale: { borderColor: borderCol }
    };

    chartRef.current?.applyOptions(options);
    rsiChartRef.current?.applyOptions({
      layout: { background: { color: bgColor }, textColor: isLight ? '#475569' : '#6b7280' },
      grid: { vertLines: { color: gridCol }, horzLines: { color: gridCol } },
      timeScale: { borderColor: borderCol },
      rightPriceScale: { borderColor: borderCol }
    });
    macdChartRef.current?.applyOptions({
      layout: { background: { color: bgColor }, textColor: isLight ? '#475569' : '#6b7280' },
      grid: { vertLines: { color: gridCol }, horzLines: { color: gridCol } },
      timeScale: { borderColor: borderCol },
      rightPriceScale: { borderColor: borderCol }
    });
    cvdChartRef.current?.applyOptions({
      layout: { background: { color: bgColor }, textColor: isLight ? '#475569' : '#6b7280' },
      grid: { vertLines: { color: gridCol }, horzLines: { color: gridCol } },
      timeScale: { borderColor: borderCol },
      rightPriceScale: { borderColor: borderCol }
    });
    obvMacdChartRef.current?.applyOptions({
      layout: { background: { color: bgColor }, textColor: isLight ? '#475569' : '#cbd5e1' },
      grid: { vertLines: { color: gridCol }, horzLines: { color: gridCol } },
      timeScale: { borderColor: borderCol },
      rightPriceScale: { borderColor: borderCol }
    });
    pineChartRef.current?.applyOptions({
      layout: { background: { color: bgColor }, textColor: isLight ? '#475569' : '#6b7280' },
      grid: { vertLines: { color: gridCol }, horzLines: { color: gridCol } },
      timeScale: { borderColor: borderCol },
      rightPriceScale: { borderColor: borderCol }
    });
  }, [themeMode]);

  const cycleReplaySpeed = () => {
    const list = [0.1, 0.3, 0.5, 1, 3, 10];
    const idx = list.indexOf(pane.replaySpeed);
    onUpdatePane({ replaySpeed: list[(idx + 1) % list.length] });
  };

  const handleCaptureScreenshot = () => {
    if (!chartRef.current) return;
    try {
      const mainCanvas = chartRef.current.takeScreenshot();
      if (!mainCanvas) return;

      const subCharts: { label: string; canvas: HTMLCanvasElement; height: number }[] = [];

      if (showRSI && rsiChartRef.current) {
        const canvas = rsiChartRef.current.takeScreenshot();
        if (canvas) {
          subCharts.push({ label: `RSI (${pane.indicators.rsiLength || 14})`, canvas, height: rsiHeight });
        }
      }
      if (showMACD && macdChartRef.current) {
        const canvas = macdChartRef.current.takeScreenshot();
        if (canvas) {
          subCharts.push({ label: `MACD (${pane.indicators.macdParams?.join('/') || '12/26/9'})`, canvas, height: macdHeight });
        }
      }
      if (showCVD && cvdChartRef.current) {
        const canvas = cvdChartRef.current.takeScreenshot();
        if (canvas) {
          subCharts.push({ label: 'CVD', canvas, height: cvdHeight });
        }
      }
      if (showObvMacdDoubleMacd && obvMacdChartRef.current) {
        const canvas = obvMacdChartRef.current.takeScreenshot();
        if (canvas) {
          subCharts.push({ label: 'OBV MACD + Double MACD', canvas, height: obvMacdHeight });
        }
      }
      if (hasPineOscillators && pineChartRef.current) {
        const canvas = pineChartRef.current.takeScreenshot();
        if (canvas) {
          subCharts.push({ label: `Pine: ${pane.pineStrategy?.name || 'Indicators'}`, canvas, height: pineHeight });
        }
      }

      const labelHeight = 24;
      let totalHeight = mainCanvas.height;
      subCharts.forEach(sub => {
        totalHeight += sub.height + labelHeight;
      });

      const combined = document.createElement('canvas');
      combined.width = mainCanvas.width;
      combined.height = totalHeight;

      const ctx = combined.getContext('2d');
      if (!ctx) return;

      const isLightMode = themeMode === 'light';

      // Fill background matching theme
      ctx.fillStyle = isLightMode ? '#ffffff' : '#090b10';
      ctx.fillRect(0, 0, combined.width, combined.height);

      // Draw main chart
      ctx.drawImage(mainCanvas, 0, 0);

      // Draw drawing canvas overlays if we have drawings
      if (drawingCanvasRef.current && pane.drawings.length > 0) {
        ctx.drawImage(drawingCanvasRef.current, 0, 0, mainCanvas.width, mainCanvas.height);
      }

      // Draw subcharts
      let currentY = mainCanvas.height;
      subCharts.forEach(sub => {
        // Draw separator line
        ctx.strokeStyle = isLightMode ? '#e2e8f0' : '#1e222e';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, currentY);
        ctx.lineTo(combined.width, currentY);
        ctx.stroke();

        // Draw sub-chart header/label
        ctx.fillStyle = isLightMode ? '#64748b' : '#6b7280';
        ctx.font = 'bold 9px "JetBrains Mono", monospace, sans-serif';
        ctx.fillText(sub.label.toUpperCase(), 12, currentY + 15);

        // Draw sub-chart canvas
        ctx.drawImage(sub.canvas, 0, currentY + labelHeight, combined.width, sub.height);

        currentY += sub.height + labelHeight;
      });

      // Trigger PNG download
      const dataUrl = combined.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `chart_${pane.symbol}_${pane.timeframe}_${new Date().toISOString().split('T')[0]}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to capture chart screenshot:", err);
    }
  };

  const ind = pane.indicators;

  // Indicator toggle helper
  const toggleInd = (key: keyof typeof ind) => {
    onUpdatePane({ indicators: { ...ind, [key]: !ind[key] } });
  };

  // All indicator options for the dropdown
  const indOptions: { key: keyof typeof ind; label: string }[] = [
    { key: 'ema20',        label: 'EMA 20'         },
    { key: 'ema50',        label: 'EMA 50'         },
    { key: 'ema80',        label: 'EMA 80'         },
    { key: 'ema200',       label: 'EMA 200'        },
    { key: 'vwap',         label: 'VWAP'           },
    { key: 'bollingerBands', label: 'Bollinger BB' },
    { key: 'ichimoku',     label: 'Ichimoku Cloud' },
    { key: 'rsi',          label: 'RSI (14)'       },
    { key: 'macd',         label: 'MACD'           },
    { key: 'cvd',          label: 'Cumulative Delta' },
    { key: 'obvMacdDoubleMacd', label: 'OBV MACD + Double MACD Combined' },
    { key: 'killerIdm',          label: '🔥 Killer + IDM Sweep' },
    { key: 'fractal',      label: 'Fractals'       },
    { key: 'smartSignal',  label: '🤖 SmartSignal' },
    { key: 'smcOrderBlocks', label: 'Order Blocks (SMC)' },
    { key: 'smcLiquiditySweeps', label: 'Liquidity (SMC)' },
    { key: 'volumeProfile', label: 'Volume Profile' },
    { key: 'fvg',          label: 'Fair Value Gap' },
  ];

  const theme = PANE_THEMES[paneIndex || 1] || PANE_THEMES[1];
  const isLight = themeMode === 'light';

  return (
    <div
      className={`h-full flex flex-col ${isLight ? 'bg-white' : 'bg-[#090b10]'} border-2 rounded-xl overflow-hidden transition-all duration-150 relative ${
        isActive ? `${theme.border} ${theme.shadow}` : `${isLight ? 'border-slate-200 bg-white/70' : 'border-[#1e222e] bg-[#090b10]/90'} opacity-90`
      }`}
      onClick={onSelectPane}
    >
      {/* ── Title bar ─────────────────────────────────────────────────── */}
      <div className={`${isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-[#0b0e14]/90 border-[#1e222e] text-gray-200'} backdrop-blur-sm border-b py-2 px-3 flex items-center justify-between gap-1 text-xs select-none flex-shrink-0`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? `${theme.bg} animate-ping` : 'bg-gray-600'}`} />
          <span className={`font-bold text-[10px] ${theme.bg} ${theme.text} px-1.5 py-0.5 rounded shadow-sm flex items-center justify-center mr-1`}>{paneIndex || 1}</span>
          <span className={`font-bold tracking-wide uppercase truncate ${isLight ? 'text-slate-800' : 'text-gray-200'}`}>{pane.symbol}</span>
          <span className={`text-[10px] font-mono px-1 py-0.5 rounded uppercase ${isLight ? 'bg-slate-200 border border-slate-300 text-slate-600' : 'text-gray-500 bg-gray-900 border border-gray-800'}`}>{pane.timeframe}</span>
          
          {/* Data source badge */}
          {(() => {
            const latestPriceObj = LiveDataProvider.getInstance().getLatestPrice(pane.symbol);
            const cachedMeta = LiveDataProvider.getInstance().getSourceAndQuality(pane.symbol);
            const rawQuality = cachedMeta?.quality || latestPriceObj?.quality || (pane.isReplayMode ? DataQuality.SYNTHETIC_FALLBACK : (['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'BNB', 'DOT', 'LINK', 'LTC', 'AVAX', 'MATIC', 'UNI', 'ATOM', 'NEAR', 'APT', 'SUI', 'INJ', 'OP', 'ARB'].includes(pane.symbol) ? DataQuality.LIVE_REAL_TIME : DataQuality.DELAYED_15_MIN));
            const sourceName = cachedMeta?.source || (pane.isReplayMode ? DataSource.SYNTHETIC : (['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'BNB', 'DOT', 'LINK', 'LTC', 'AVAX', 'MATIC', 'UNI', 'ATOM', 'NEAR', 'APT', 'SUI', 'INJ', 'OP', 'ARB'].includes(pane.symbol) ? DataSource.BINANCE : DataSource.YAHOO));

            let displayQuality: 'LIVE' | 'DELAYED' | 'SIMULATED' = 'SIMULATED';
            if (!pane.isReplayMode) {
              if (rawQuality === DataQuality.LIVE_REAL_TIME) {
                displayQuality = 'LIVE';
              } else if (rawQuality === DataQuality.DELAYED_15_MIN || rawQuality === DataQuality.END_OF_DAY) {
                displayQuality = 'DELAYED';
              }
            }
            
            return (
              <PriceBadge 
                quality={displayQuality} 
                source={sourceName}
                className="shrink-0"
                {...(pane.isReplayMode ? { title: "Replay Simulation mode utilizing historical bars" } : {})}
              />
            );
          })()}

          <span className={`font-mono text-[10px] font-bold ml-1 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>${lastPriceValue.toFixed(4)}</span>
          {onToggleBotMode && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleBotMode(pane.symbol);
              }}
              className={`ml-2 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-all border shadow-sm shrink-0 ${
                serverBots?.find(b => b?.symbol === pane.symbol && b?.status === 'RUNNING')
                  ? 'bg-purple-600/10 text-purple-400 border-purple-500/30 hover:bg-purple-600/20 animate-pulse'
                  : 'bg-slate-500/10 text-slate-450 border-slate-500/20 hover:bg-slate-500/20'
              }`}
              title={
                serverBots?.find(b => b?.symbol === pane.symbol && b?.status === 'RUNNING')
                  ? "Autonomous 24/7 Server Bot active! Click to pause and return to Manual Co-Pilot mode."
                  : "Manual Co-Pilot active. Click to switch to Autonomous 24/7 AI Server Bot mode."
              }
            >
              <span>{serverBots?.find(b => b?.symbol === pane.symbol && b?.status === 'RUNNING') ? '🤖 AUTONOMOUS AI' : '👤 CO-PILOT'}</span>
            </button>
          )}
        </div>

        {/* Active indicator badges */}
        <div className="hidden sm:flex items-center gap-1 overflow-x-auto no-scrollbar flex-shrink">
          {ind.ema20  && (
            <span onClick={() => setPromptConfig({ isOpen: true, title: 'EMA1 Period:', defaultVal: String(ind.emaPeriods?.[0] || 20), onConfirm: (v) => onUpdatePane({ indicators: { ...ind, emaPeriods: [parseInt(v) || 20, ind.emaPeriods?.[1]||50, ind.emaPeriods?.[2]||80, ind.emaPeriods?.[3]||200] } }) })} className="text-[8px] bg-amber-500/10 text-amber-400 px-1 rounded border border-amber-500/20 cursor-pointer hover:bg-amber-500/20">
              EMA{ind.emaPeriods?.[0]||20}
            </span>
          )}
          {ind.ema50  && (
            <span onClick={() => setPromptConfig({ isOpen: true, title: 'EMA2 Period:', defaultVal: String(ind.emaPeriods?.[1] || 50), onConfirm: (v) => onUpdatePane({ indicators: { ...ind, emaPeriods: [ind.emaPeriods?.[0]||20, parseInt(v) || 50, ind.emaPeriods?.[2]||80, ind.emaPeriods?.[3]||200] } }) })} className="text-[8px] bg-blue-500/10 text-blue-400 px-1 rounded border border-blue-500/20 cursor-pointer hover:bg-blue-500/20">
              EMA{ind.emaPeriods?.[1]||50}
            </span>
          )}
          {ind.ema80  && (
            <span onClick={() => setPromptConfig({ isOpen: true, title: 'EMA3 Period:', defaultVal: String(ind.emaPeriods?.[2] || 80), onConfirm: (v) => onUpdatePane({ indicators: { ...ind, emaPeriods: [ind.emaPeriods?.[0]||20, ind.emaPeriods?.[1]||50, parseInt(v) || 80, ind.emaPeriods?.[3]||200] } }) })} className="text-[8px] bg-violet-500/10 text-violet-400 px-1 rounded border border-violet-500/20 cursor-pointer hover:bg-violet-500/20">
              EMA{ind.emaPeriods?.[2]||80}
            </span>
          )}
          {ind.ema200 && (
            <span onClick={() => setPromptConfig({ isOpen: true, title: 'EMA4 Period:', defaultVal: String(ind.emaPeriods?.[3] || 200), onConfirm: (v) => onUpdatePane({ indicators: { ...ind, emaPeriods: [ind.emaPeriods?.[0]||20, ind.emaPeriods?.[1]||50, ind.emaPeriods?.[2]||80, parseInt(v) || 200] } }) })} className="text-[8px] bg-pink-500/10 text-pink-400 px-1 rounded border border-pink-500/20 cursor-pointer hover:bg-pink-500/20">
              EMA{ind.emaPeriods?.[3]||200}
            </span>
          )}
          {ind.vwap   && <span className="text-[8px] bg-purple-500/10 text-purple-400 px-1 rounded border border-purple-500/20">VWAP</span>}
          {ind.bollingerBands && <span className="text-[8px] bg-green-500/10 text-green-400 px-1 rounded border border-green-500/20">BB</span>}
          {ind.ichimoku && <span className="text-[8px] bg-orange-500/10 text-orange-400 px-1 rounded border border-orange-500/20">ICH</span>}
          {ind.fractal  && <span className="text-[8px] bg-red-500/10 text-red-400 px-1 rounded border border-red-500/20">FRAC</span>}
          {ind.smartSignal && <span className="text-[8px] bg-cyan-500/10 text-cyan-400 px-1 rounded border border-cyan-500/20 animate-pulse">🤖 SIG</span>}
          {pane.pineStrategy && pane.pineStrategy.active && (
            <span className="text-[8px] bg-emerald-500/15 text-emerald-400 px-1 rounded border border-emerald-500/30 font-semibold">
              🌲 PINE: {pane.pineStrategy.name}
            </span>
          )}
          {ind.volumeProfile && (
             <span onClick={() => setPromptConfig({ isOpen: true, title: 'Volume Bins:', defaultVal: String(ind.volumeProfileBins || 40), onConfirm: (v) => onUpdatePane({ indicators: { ...ind, volumeProfileBins: parseInt(v) || 40 } }) })} className="text-[8px] bg-blue-500/10 text-blue-400 px-1 rounded border border-transparent cursor-pointer hover:bg-blue-500/20">
               VP({ind.volumeProfileBins || 40})
             </span>
          )}
          {ind.smcOrderBlocks && <span className="text-[8px] bg-indigo-500/10 text-indigo-400 px-1 rounded border border-indigo-500/20">OB</span>}
          {ind.smcLiquiditySweeps && <span className="text-[8px] bg-teal-500/10 text-teal-400 px-1 rounded border border-teal-500/20">SWP</span>}
          {ind.cvd && <span className="text-[8px] bg-emerald-500/10 text-emerald-400 px-1 rounded border border-emerald-500/20">CVD</span>}
          {ind.obvMacdDoubleMacd && <span className="text-[8px] bg-purple-500/10 text-purple-400 px-1 rounded border border-purple-500/20">OBV+Double MACD</span>}
          {ind.killerIdm && <span className="text-[8px] bg-emerald-500/10 text-emerald-400 px-1 rounded border border-emerald-500/20 animate-pulse">🔥 IDM</span>}
          {ind.rsi  && (
            <span onClick={() => setPromptConfig({ isOpen: true, title: 'RSI Length:', defaultVal: String(ind.rsiLength || 14), onConfirm: (v) => onUpdatePane({ indicators: { ...ind, rsiLength: parseInt(v) || 14 } }) })} className="text-[8px] bg-yellow-500/10 text-yellow-400 px-1 rounded border border-yellow-500/20 cursor-pointer hover:bg-yellow-500/20">
              RSI({ind.rsiLength || 14})
            </span>
          )}
          {ind.macd && (
            <span onClick={() => setPromptConfig({ isOpen: true, title: 'MACD Params (Fast,Slow,Sig):', defaultVal: ind.macdParams?.join(',') || '12,26,9', onConfirm: (v) => { const pts = v.split(',').map(s => parseInt(s.trim())); if(pts.length === 3 && pts.every(x => !isNaN(x))) onUpdatePane({ indicators: { ...ind, macdParams: [pts[0], pts[1], pts[2]] } }); } })} className="text-[8px] bg-blue-500/10 text-blue-400 px-1 rounded border border-blue-500/20 cursor-pointer hover:bg-blue-500/20">
              MACD({ind.macdParams?.join('/') || '12/26/9'})
            </span>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Replay */}
          {pane.isReplayMode ? (
            <div className="flex items-center bg-gray-900 px-1.5 py-0.5 rounded border border-gray-800 gap-1.5 font-mono text-[9px] text-gray-400">
              <span className="text-[8px] text-rose-400 uppercase animate-pulse">REPLAY</span>
              <button onClick={e => { e.stopPropagation(); onUpdatePane({ isPlaying: !pane.isPlaying }); }} className="p-0.5 rounded hover:bg-gray-800 cursor-pointer">
                {pane.isPlaying ? <Pause className="w-3 h-3 text-amber-500" /> : <Play className="w-3 h-3 text-emerald-400" />}
              </button>
              <button onClick={e => { e.stopPropagation(); const c = pane.replayCurrentIndex || 0; if (c < historicData.length - 1) onUpdatePane({ replayCurrentIndex: c + 1 }); }} className="p-0.5 rounded hover:bg-gray-800 cursor-pointer">
                <ChevronRight className="w-3 h-3" />
              </button>
              <button onClick={e => { e.stopPropagation(); cycleReplaySpeed(); }} className="hover:text-blue-400 font-sans text-[8px] cursor-pointer uppercase">{pane.replaySpeed}x</button>
            </div>
          ) : (
            <button onClick={e => { e.stopPropagation(); const half = Math.floor(historicData.length / 2); onUpdatePane({ isReplayMode: true, replayStartIndex: half, replayCurrentIndex: half, isPlaying: false }); }}
              className="text-[9px] bg-rose-500/5 text-rose-300 border border-rose-900/30 font-bold font-mono px-2 py-0.5 rounded-md hover:bg-rose-900/40 cursor-pointer transition-colors">
              REPLAY
            </button>
          )}

          {/* Indicator selector */}
          <button
            onClick={e => { e.stopPropagation(); setIsIndPanelOpen(true); }}
            className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-850 text-gray-300 hover:text-white border border-gray-800 text-[10px] rounded px-2 py-0.5 transition-colors cursor-pointer"
            title="Open Indicators Manager with Search & Settings"
          >
            <Sliders className="w-3 h-3 text-blue-400" />
            <span>Indicators</span>
            {Object.keys(ind).filter(k => k !== 'emaPeriods' && k !== 'rsiLength' && k !== 'macdParams' && k !== 'volumeProfileBins' && k !== 'smartSignalParams' && ind[k as keyof typeof ind] === true).length > 0 && (
              <span className="bg-blue-500/20 text-blue-300 px-1 rounded text-[8px] font-bold font-mono">
                {Object.keys(ind).filter(k => k !== 'emaPeriods' && k !== 'rsiLength' && k !== 'macdParams' && k !== 'volumeProfileBins' && k !== 'smartSignalParams' && ind[k as keyof typeof ind] === true).length}
              </span>
            )}
          </button>

          {/* Capture Snapshot Button */}
          <Tooltip content="Capture Chart View" position="bottom">
            <button
              onClick={e => { e.stopPropagation(); handleCaptureScreenshot(); }}
              className="flex items-center justify-center p-1 rounded bg-gray-900 hover:bg-gray-850 text-gray-400 hover:text-white border border-gray-800 transition-colors cursor-pointer"
              title="Capture chart view as PNG"
            >
              <Camera className="w-3.5 h-3.5 text-emerald-400" />
            </button>
          </Tooltip>

          {/* Maximize Toggle */}
          {onToggleMaximize && (
            <Tooltip content={isMaximized ? "Restore" : "Maximize"} position="bottom">
              <button
                onClick={e => { e.stopPropagation(); onToggleMaximize(); }}
                className="text-gray-400 hover:text-gray-200 cursor-pointer ml-1"
              >
                {isMaximized ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* ── SmartSignal badge ─────────────────────────────────────────── */}
      {ind.smartSignal && latestSignal && (
        <div className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono border-b flex-shrink-0 ${
          latestSignal.signal === 'BUY'
            ? 'bg-emerald-950/60 border-emerald-800/40 text-emerald-300'
            : latestSignal.signal === 'SELL'
              ? 'bg-rose-950/60 border-rose-800/40 text-rose-300'
              : 'bg-gray-900/60 border-gray-800 text-gray-400'
        }`}>
          <span className="font-bold tracking-wider">
            {latestSignal.signal === 'BUY' ? '▲ BUY' : latestSignal.signal === 'SELL' ? '▼ SELL' : '● EXIT'}
          </span>
          <span className="text-gray-500">|</span>
          <span>Entry <strong>${latestSignal.entry.toFixed(4)}</strong></span>
          <span className="text-emerald-400">TP ${latestSignal.tp.toFixed(4)}</span>
          <span className="text-rose-400">SL ${latestSignal.sl.toFixed(4)}</span>
          <span className="text-amber-400">RR {latestSignal.rr}:1</span>
          <span className="ml-auto text-gray-500">{latestSignal.confidence}% conf · {latestSignal.regime}</span>
        </div>
      )}

      {/* ── Main chart ────────────────────────────────────────────────── */}
      <div className="flex-1 relative bg-[#090b10] min-h-0 group" style={{ minHeight: '200px' }}>
        <div ref={chartContainerRef} className="absolute inset-0 pointer-events-auto" />
        <canvas
          ref={drawingCanvasRef}
          onClick={handleCanvasClick}
          className={`absolute inset-0 z-20 ${pane.activeDrawingType ? 'cursor-crosshair' : 'cursor-default pointer-events-none'}`}
        />
        
        {/* Floating Drawing Toolbar */}
        <div className="absolute top-[8%] left-3 z-30 flex flex-col gap-1 p-1 bg-[#121620]/90 backdrop-blur-md rounded-lg shadow-lg border border-[#2a2e39]/80 opacity-60 group-hover:opacity-100 transition-opacity">
          <Tooltip content="Trend line" position="right">
            <button onClick={e => { e.stopPropagation(); onUpdatePane({ activeDrawingType: pane.activeDrawingType === 'trend' ? null : 'trend' }); setDrawingPoints([]); }}
              className={`p-1.5 rounded-md cursor-pointer transition-colors ${pane.activeDrawingType === 'trend' ? 'bg-amber-500/20 text-amber-400' : 'text-gray-400 hover:bg-[#1a1e2b] hover:text-gray-200'}`}>
              <PenTool className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip content="Horizontal line" position="right">
            <button onClick={e => { e.stopPropagation(); onUpdatePane({ activeDrawingType: pane.activeDrawingType === 'horizontal' ? null : 'horizontal' }); setDrawingPoints([]); }}
              className={`p-1.5 rounded-md cursor-pointer transition-colors ${pane.activeDrawingType === 'horizontal' ? 'bg-blue-500/20 text-blue-400' : 'text-gray-400 hover:bg-[#1a1e2b] hover:text-gray-200'}`}>
              <Minus className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip content="Rectangle" position="right">
            <button onClick={e => { e.stopPropagation(); onUpdatePane({ activeDrawingType: pane.activeDrawingType === 'rectangle' ? null : 'rectangle' }); setDrawingPoints([]); }}
              className={`p-1.5 rounded-md cursor-pointer transition-colors ${pane.activeDrawingType === 'rectangle' ? 'bg-pink-500/20 text-pink-400' : 'text-gray-400 hover:bg-[#1a1e2b] hover:text-gray-200'}`}>
              <Square className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip content="Fibonacci Retracement" position="right">
            <button onClick={e => { e.stopPropagation(); onUpdatePane({ activeDrawingType: pane.activeDrawingType === 'fibonacci' ? null : 'fibonacci' }); setDrawingPoints([]); }}
              className={`p-1.5 rounded-md cursor-pointer transition-colors ${pane.activeDrawingType === 'fibonacci' ? 'bg-purple-500/20 text-purple-400' : 'text-gray-400 hover:bg-[#1a1e2b] hover:text-gray-200'}`}>
              <AlignJustify className="w-4 h-4" />
            </button>
          </Tooltip>
          {pane.drawings.length > 0 && (
            <Tooltip content="Clear drawings" position="right">
              <button onClick={e => { e.stopPropagation(); onUpdatePane({ drawings: [] }); }} className="p-1.5 hover:bg-rose-900/40 rounded-md text-rose-500 cursor-pointer transition-colors mt-1 border-t border-[#2a2e39]/50">
                <Trash className="w-4 h-4" />
              </button>
            </Tooltip>
          )}
        </div>

        {historicData.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-gray-950/95 text-xs text-gray-500 z-30">
            {error ? (
              <div className="flex flex-col items-center max-w-sm">
                <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center mb-3 border border-rose-500/20">
                  <span className="text-rose-400 text-lg font-bold">!</span>
                </div>
                <h4 className="text-sm font-semibold text-gray-200 mb-1">Real-time Data Fetch Failed</h4>
                <p className="text-gray-500 mb-4 text-center leading-relaxed text-[11px]">
                  {error}
                </p>
                {onRetryFetch && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRetryFetch();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded transition-colors shadow-lg shadow-blue-600/10 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 animate-spin-once" />
                    Retry Connection
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <RefreshCw className="w-8 h-8 mb-2 animate-spin text-blue-500" />
                <span className="text-gray-400 font-medium">Fetching real-time data...</span>
                <span className="text-[10px] text-gray-600 mt-1 font-mono">Verifying live server streams</span>
              </div>
            )}
          </div>
        )}
        {pane.activeDrawingType && (
          <div className="absolute top-2 left-[50%] -translate-x-[50%] bg-blue-600/90 border border-blue-400 font-bold font-mono text-[9px] px-2 py-1 text-white rounded shadow z-30 animate-pulse pointer-events-none">
            {pane.activeDrawingType === 'trend' ? 'Click pt 1 → Click pt 2 to draw line' : pane.activeDrawingType === 'fibonacci' ? 'Click High/Low → Click Low/High for Fibo' : pane.activeDrawingType === 'rectangle' ? 'Click corner 1 → Click corner 2 for rect' : 'Click to place horizontal line'}
          </div>
        )}
      </div>

      {/* ── RSI sub-pane ─────────────────────────────────────────────── */}
      {showRSI && (
        <div className="flex-shrink-0 flex flex-col border-t border-[#1e222e]" style={{ height: `${rsiHeight}px` }}>
          <DragHandle onDrag={(dy) => setRsiHeight(h => Math.max(50, Math.min(400, h - dy)))} />
          <div className="text-[8px] font-mono text-gray-600 px-2 flex-shrink-0 bg-[#090b10] flex justify-between items-center">
            <span>RSI ({pane.indicators.rsiLength || 14})</span>
          </div>
          <div ref={rsiContainerRef} className="w-full flex-1 min-h-0" />
        </div>
      )}

      {/* ── MACD sub-pane ─────────────────────────────────────────────── */}
      {showMACD && (
        <div className="flex-shrink-0 flex flex-col border-t border-[#1e222e]" style={{ height: `${macdHeight}px` }}>
          <DragHandle onDrag={(dy) => setMacdHeight(h => Math.max(50, Math.min(400, h - dy)))} />
          <div className="text-[8px] font-mono text-gray-600 px-2 flex-shrink-0 bg-[#090b10] flex justify-between items-center">
            <span>MACD ({pane.indicators.macdParams?.join('/') || '12/26/9'})</span>
          </div>
          <div ref={macdContainerRef} className="w-full flex-1 min-h-0" />
        </div>
      )}

      {/* ── CVD sub-pane ─────────────────────────────────────────────── */}
      {showCVD && (
        <div className="flex-shrink-0 flex flex-col border-t border-[#1e222e]" style={{ height: `${cvdHeight}px` }}>
          <DragHandle onDrag={(dy) => setCvdHeight(h => Math.max(50, Math.min(400, h - dy)))} />
          <div className="text-[8px] font-mono text-gray-600 px-2 flex-shrink-0 bg-[#090b10] flex justify-between items-center">
            <span>Cumulative Volume Delta (CVD)</span>
          </div>
          <div ref={cvdContainerRef} className="w-full flex-1 min-h-0" />
        </div>
      )}

      {/* ── OBV MACD + Double MACD Combined sub-pane ─────────────────────────── */}
      {showObvMacdDoubleMacd && (
        <div className="flex-shrink-0 flex flex-col border-t border-[#1e222e]" style={{ height: `${obvMacdHeight}px` }}>
          <DragHandle onDrag={(dy) => setObvMacdHeight(h => Math.max(50, Math.min(400, h - dy)))} />
          <div className="text-[8px] font-mono text-gray-600 px-2 flex-shrink-0 bg-[#090b10] flex justify-between items-center">
            <span>OBV MACD + Double MACD Combined</span>
          </div>
          <div ref={obvMacdContainerRef} className="w-full flex-1 min-h-0" />
        </div>
      )}

      {/* ── Pine Oscillators sub-pane ────────────────────────────────────────── */}
      {hasPineOscillators && (
        <div className="flex-shrink-0 flex flex-col border-t border-[#1e222e]" style={{ height: `${pineHeight}px` }}>
          <DragHandle onDrag={(dy) => setPineHeight(h => Math.max(50, Math.min(400, h - dy)))} />
          <div className="text-[8px] font-mono text-gray-400 px-2 flex-shrink-0 bg-[#090b10] flex justify-between items-center">
            <span>Pine Indicators ({pane.pineStrategy?.name || 'Indicators'})</span>
            <span className="text-[7px] text-[#10b981] font-bold">🌲 ACTIVE</span>
          </div>
          <div ref={pineContainerRef} className="w-full flex-1 min-h-0" />
        </div>
      )}

      {promptConfig && (
        <PromptModal 
          isOpen={true}
          title={promptConfig.title}
          defaultValue={promptConfig.defaultVal}
          onConfirm={(val) => {
             promptConfig.onConfirm(val);
             setPromptConfig(null);
          }}
          onCancel={() => setPromptConfig(null)}
        />
      )}

      {isIndPanelOpen && (
        <IndicatorsPanel
          isOpen={true}
          onClose={() => setIsIndPanelOpen(false)}
          indicators={ind}
          onUpdateIndicators={(updated) => onUpdatePane({ indicators: { ...ind, ...updated } })}
          pane={pane}
          onUpdatePane={onUpdatePane}
          candles={historicData}
        />
      )}
    </div>
  );
};
