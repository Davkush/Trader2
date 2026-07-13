import { CandleData } from '../../../src/types';

const TIMEFRAME_MAPPING: Record<string, string> = {
  '1s': '1m',
  '5s': '1m',
  '1m': '1m',
  '5m': '5m',
  '10m': '5m', // needs resampling
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '2h': '2h',
  '3h': '1h', // needs resampling
  '4h': '4h',
  '1d': '1d',
  '1w': '1w'
};

function resampleCandles(candles: CandleData[], targetSeconds: number): CandleData[] {
  const out: CandleData[] = [];
  const map = new Map<number, CandleData[]>();

  for (const c of candles) {
    if (!c || c.time === undefined || c.time === null) continue;
    const period = Math.floor(c.time / targetSeconds) * targetSeconds;
    if (!map.has(period)) map.set(period, []);
    map.get(period)!.push(c);
  }

  const sortedPeriods = Array.from(map.keys()).sort((a, b) => a - b);
  for (const p of sortedPeriods) {
    const chunk = map.get(p)!;
    out.push({
      time: p,
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, c) => s + c.volume, 0),
    });
  }
  return out;
}

export async function fetchBinanceData(symbol: string, timeframe: string, limit = 600): Promise<CandleData[]> {
  // Normalize symbol for Binance (e.g. BTC -> BTCUSDT)
  let binanceSymbol = symbol.toUpperCase();
  if (!binanceSymbol.endsWith('USDT') && !binanceSymbol.endsWith('BUSD')) {
    binanceSymbol = `${binanceSymbol}USDT`;
  }

  const binanceInterval = TIMEFRAME_MAPPING[timeframe] || '1d';
  
  // If resampling is needed, fetch more bars
  let fetchLimit = limit;
  if (timeframe === '10m' || timeframe === '3h') {
    fetchLimit = limit * 3;
  }

  const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${binanceInterval}&limit=${fetchLimit}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Binance API returned HTTP ${response.status}`);
  }

  const rawData = await response.json();
  if (!Array.isArray(rawData)) {
    throw new Error('Invalid response format from Binance');
  }

  let candles: CandleData[] = rawData.map((item: any) => ({
    time: Math.floor(item[0] / 1000), // convert ms to seconds
    open: parseFloat(item[1]),
    high: parseFloat(item[2]),
    low: parseFloat(item[3]),
    close: parseFloat(item[4]),
    volume: parseFloat(item[5])
  }));

  // Perform resampling if necessary
  if (timeframe === '10m') {
    candles = resampleCandles(candles, 600);
  } else if (timeframe === '3h') {
    candles = resampleCandles(candles, 10800);
  }

  return candles.slice(-limit);
}
