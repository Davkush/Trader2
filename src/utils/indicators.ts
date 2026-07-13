import { CandleData, SmartSignalOutput } from '../types';

export interface BBValue {
  time: number;
  upper: number;
  middle: number;
  lower: number;
}

export interface MACDValue {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
}

export interface FVGValue {
  time1: number;
  time2: number;
  top: number;
  bottom: number;
  direction: 'BULLISH' | 'BEARISH';
}

export interface VolumeProfileBin {
  price: number;
  volume: number;
  isHighVolumeNode: boolean;
}

// EMA calculation
export function calculateEMA(d: CandleData[], period: number): { time: number; value: number }[] {
  const data = (d || []).filter(Boolean);
  if (!period || isNaN(period) || period <= 0 || data.length < period || !data[period - 1]) return [];
  const emaValues: { time: number; value: number }[] = [];
  const k = 2 / (period + 1);

  // Simple moving average for the first point
  let currentEma = data.slice(0, period).reduce((sum, bar) => sum + bar.close, 0) / period;
  emaValues.push({ time: data[period - 1].time, value: Number(currentEma.toFixed(2)) });

  for (let i = period; i < data.length; i++) {
    currentEma = data[i].close * k + currentEma * (1 - k);
    emaValues.push({ time: data[i].time, value: Number(currentEma.toFixed(2)) });
  }

  return emaValues;
}

// VWAP calculation
export function calculateVWAP(d: CandleData[]): { time: number; value: number }[] {
  const data = (d || []).filter(Boolean);
  const vwapValues: { time: number; value: number }[] = [];
  let cumulativePV = 0;
  let cumulativeVolume = 0;

  for (let i = 0; i < data.length; i++) {
    const bar = data[i];
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumulativePV += typicalPrice * bar.volume;
    cumulativeVolume += bar.volume;

    if (cumulativeVolume === 0) {
      vwapValues.push({ time: bar.time, value: bar.close });
    } else {
      vwapValues.push({ time: bar.time, value: Number((cumulativePV / cumulativeVolume).toFixed(2)) });
    }
  }

  return vwapValues;
}

// Bollinger Bands calculation
export function calculateBollingerBands(d: CandleData[], period: number = 20, multiplier: number = 2): BBValue[] {
  const data = (d || []).filter(Boolean);
  if (!period || isNaN(period) || period <= 0 || data.length < period || !data[period - 1]) return [];
  const bbValues: BBValue[] = [];

  for (let i = period - 1; i < data.length; i++) {
    const subset = data.slice(i - period + 1, i + 1);
    const middle = subset.reduce((sum, bar) => sum + bar.close, 0) / period;
    
    // Variance calculation
    const variance = subset.reduce((sum, bar) => sum + Math.pow(bar.close - middle, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    bbValues.push({
      time: data[i].time,
      upper: Number((middle + multiplier * stdDev).toFixed(2)),
      middle: Number(middle.toFixed(2)),
      lower: Number((middle - multiplier * stdDev).toFixed(2))
    });
  }

  return bbValues;
}

// RSI (14) calculation
export function calculateRSI(d: CandleData[], period: number = 14): { time: number; value: number }[] {
  const data = (d || []).filter(Boolean);
  if (!period || isNaN(period) || period <= 0 || data.length <= period || !data[period]) return [];
  const rsiValues: { time: number; value: number }[] = [];

  let gains = 0;
  let losses = 0;

  // First RSI block
  for (let i = 1; i <= period; i++) {
    const difference = data[i].close - data[i - 1].close;
    if (difference > 0) {
      gains += difference;
    } else {
      losses -= difference;
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
  rsiValues.push({ time: data[period].time, value: Number(rsi.toFixed(2)) });

  for (let i = period + 1; i < data.length; i++) {
    const difference = data[i].close - data[i - 1].close;
    const gain = difference > 0 ? difference : 0;
    const loss = difference < 0 ? -difference : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

    rsiValues.push({ time: data[i].time, value: Number(rsi.toFixed(2)) });
  }

  return rsiValues;
}

// MACD calculation
export function calculateMACD(
  d: CandleData[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDValue[] {
  const data = (d || []).filter(Boolean);
  if (
    !fastPeriod || isNaN(fastPeriod) || fastPeriod <= 0 ||
    !slowPeriod || isNaN(slowPeriod) || slowPeriod <= 0 ||
    !signalPeriod || isNaN(signalPeriod) || signalPeriod <= 0 ||
    data.length < slowPeriod
  ) return [];

  const fastEMA = calculateEMA(data, fastPeriod);
  const slowEMA = calculateEMA(data, slowPeriod);

  // Align Fast and Slow EMA values
  const macdLinePoints: { time: number; value: number }[] = [];
  
  fastEMA.forEach(f => {
    const s = slowEMA.find(x => x.time === f.time);
    if (s) {
      macdLinePoints.push({
        time: f.time,
        value: Number((f.value - s.value).toFixed(2))
      });
    }
  });

  if (macdLinePoints.length < signalPeriod) return [];

  // Signal line is the EMA of MACD Line
  const k = 2 / (signalPeriod + 1);
  let currentSignal = macdLinePoints.slice(0, signalPeriod).reduce((sum, bar) => sum + bar.value, 0) / signalPeriod;
  
  const macdValues: MACDValue[] = [];
  macdValues.push({
    time: macdLinePoints[signalPeriod - 1].time,
    macd: macdLinePoints[signalPeriod - 1].value,
    signal: Number(currentSignal.toFixed(2)),
    histogram: Number((macdLinePoints[signalPeriod - 1].value - currentSignal).toFixed(2))
  });

  for (let i = signalPeriod; i < macdLinePoints.length; i++) {
    const macdVal = macdLinePoints[i].value;
    currentSignal = macdVal * k + currentSignal * (1 - k);
    
    macdValues.push({
      time: macdLinePoints[i].time,
      macd: Number(macdVal.toFixed(2)),
      signal: Number(currentSignal.toFixed(2)),
      histogram: Number((macdVal - currentSignal).toFixed(2))
    });
  }

  return macdValues;
}

// Fair Value Gaps (FVG) Detector
// Highlight market imbalances between Candle i-1 (High/Low) and Candle i+1 (Low/High)
export function detectFairValueGaps(d: CandleData[]): FVGValue[] {
  const data = (d || []).filter(Boolean);
  if (data.length < 3) return [];
  const gvgs: FVGValue[] = [];

  for (let i = 1; i < data.length - 1; i++) {
    const prev = data[i - 1]; // Candle 1
    const curr = data[i];     // Candle 2 (large momentum expansion candle)
    const next = data[i + 1]; // Candle 3

    // Bullish FVG: Candle 3 Low is greater than Candle 1 High
    if (next.low > prev.high && curr.close > curr.open) {
      gvgs.push({
        time1: prev.time,
        time2: next.time,
        top: next.low,
        bottom: prev.high,
        direction: 'BULLISH'
      });
    }
    // Bearish FVG: Candle 3 High is lower than Candle 1 Low
    else if (next.high < prev.low && curr.close < curr.open) {
      gvgs.push({
        time1: prev.time,
        time2: next.time,
        top: prev.low,
        bottom: next.high,
        direction: 'BEARISH'
      });
    }
  }

  return gvgs;
}

// Volume Profile Session calculator (Bins the price vertical axis and aggregates volume counts)
export function calculateVolumeProfile(d: CandleData[], binCount: number = 24): VolumeProfileBin[] {
  const data = (d || []).filter(Boolean);
  if (data.length === 0) return [];
  
  let minPrice = Infinity;
  let maxPrice = -Infinity;

  for (let i = 0; i < data.length; i++) {
    const bar = data[i];
    if (bar.low < minPrice) minPrice = bar.low;
    if (bar.high > maxPrice) maxPrice = bar.high;
  }

  const priceRange = maxPrice - minPrice;
  if (priceRange === 0) return [];

  const binSize = priceRange / binCount;
  const bins: VolumeProfileBin[] = Array.from({ length: binCount }, (_, index) => ({
    price: Number((minPrice + index * binSize + binSize / 2).toFixed(2)),
    volume: 0,
    isHighVolumeNode: false
  }));

  // Map each candle volume to bins based on Close price
  for (let i = 0; i < data.length; i++) {
    const bar = data[i];
    const binIndex = Math.min(
      Math.floor((bar.close - minPrice) / binSize),
      binCount - 1
    );
    if (binIndex >= 0 && binIndex < binCount) {
      bins[binIndex].volume += bar.volume;
    }
  }

  // Find Peak Node (Point of Control - POC)
  let maxVolume = 0;
  for (let i = 0; i < binCount; i++) {
    if (bins[i].volume > maxVolume) {
      maxVolume = bins[i].volume;
    }
  }

  // Designate upper volume nodes
  if (maxVolume > 0) {
    for (let i = 0; i < binCount; i++) {
      if (bins[i].volume >= maxVolume * 0.75) {
        bins[i].isHighVolumeNode = true;
      }
    }
  }

  return bins;
}

// Find key Swing Support and Resistance levels
export function detectSupportAndResistance(d: CandleData[]): number[] {
  const data = (d || []).filter(Boolean);
  if (data.length < 50) return [];
  const lines: number[] = [];
  const peaks: { price: number, strength: number }[] = [];

  // 1. Identify pivots in past 150 bars
  const window = 5;
  const startIdx = Math.max(0, data.length - 150);

  for (let i = startIdx + window; i < data.length - window; i++) {
    const curr = data[i];
    let isSwingHigh = true;
    let isSwingLow = true;

    for (let j = 1; j <= window; j++) {
      if (data[i - j].high >= curr.high || data[i + j].high >= curr.high) {
        isSwingHigh = false;
      }
      if (data[i - j].low <= curr.low || data[i + j].low <= curr.low) {
        isSwingLow = false;
      }
    }

    if (isSwingHigh) {
      peaks.push({ price: curr.high, strength: 1 });
    }
    if (isSwingLow) {
      peaks.push({ price: curr.low, strength: 1 });
    }
  }

  // 2. Cluster peaks that are within 0.75% of each other
  const clusters: { centerPrice: number, count: number }[] = [];
  
  peaks.forEach(peak => {
    let matched = false;
    for (let i = 0; i < clusters.length; i++) {
      const dist = Math.abs(clusters[i].centerPrice - peak.price) / clusters[i].centerPrice;
      if (dist < 0.0075) {
        clusters[i].centerPrice = (clusters[i].centerPrice * clusters[i].count + peak.price) / (clusters[i].count + 1);
        clusters[i].count += 1;
        matched = true;
        break;
      }
    }
    if (!matched) {
      clusters.push({ centerPrice: peak.price, count: 1 });
    }
  });

  // 3. Take clusters with count >= 2 or higher, sorted by occurrences
  clusters.sort((a, b) => b.count - a.count);
  const selectedLines = clusters.slice(0, 6).map(c => Number(c.centerPrice.toFixed(2)));

  return selectedLines;
}

export interface ObvMacdDoubleMacdValue {
  time: number;
  obvMacd: number;          // macd line from OBV MACD
  longMacd: number;         // dm_macd1
  longSignal: number;       // dm_signal1
  longHist: number;         // dm_hist1
  shortMacd: number;        // dm_macd2
  shortSignal: number;      // dm_signal2
  shortHist: number;        // dm_hist2
}

function emaArray(values: number[], period: number): number[] {
  const ema: number[] = [];
  if (values.length === 0) return [];
  let currentEma = values[0];
  ema.push(currentEma);
  const k = 2 / (period + 1);
  for (let i = 1; i < values.length; i++) {
    currentEma = values[i] * k + currentEma * (1 - k);
    ema.push(currentEma);
  }
  return ema;
}

export function calculateObvMacdDoubleMacd(d: CandleData[]): ObvMacdDoubleMacdValue[] {
  const data = (d || []).filter(Boolean);
  if (data.length < 55) return [];

  // 1. Calculate OBV
  const obv: number[] = [];
  let currentObv = 0;
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      obv.push(0);
    } else {
      const change = data[i].close - data[i - 1].close;
      if (change > 0) {
        currentObv += data[i].volume;
      } else if (change < 0) {
        currentObv -= data[i].volume;
      }
      obv.push(currentObv);
    }
  }

  // 2. smooth = sma(v, 14)
  const smooth: number[] = [];
  for (let i = 0; i < obv.length; i++) {
    if (i < 13) {
      smooth.push(0);
    } else {
      const sum = obv.slice(i - 13, i + 1).reduce((a, b) => a + b, 0);
      smooth.push(sum / 14);
    }
  }

  // 3. price_spread = stdev(high - low, 28)
  const spreads = data.map(d => d.high - d.low);
  const price_spread: number[] = [];
  for (let i = 0; i < spreads.length; i++) {
    if (i < 27) {
      price_spread.push(0);
    } else {
      const subset = spreads.slice(i - 27, i + 1);
      const mean = subset.reduce((a, b) => a + b, 0) / 28;
      const variance = subset.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / 28;
      price_spread.push(Math.sqrt(variance));
    }
  }

  // 4. v_spread = stdev(v - smooth, 28)
  const obvDiff = obv.map((v_val, idx) => v_val - smooth[idx]);
  const v_spread: number[] = [];
  for (let i = 0; i < obvDiff.length; i++) {
    if (i < 27) {
      v_spread.push(0);
    } else {
      const subset = obvDiff.slice(i - 27, i + 1);
      const mean = subset.reduce((a, b) => a + b, 0) / 28;
      const variance = subset.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / 28;
      v_spread.push(Math.sqrt(variance) || 1); // fallback to avoid division by zero
    }
  }

  // 5. shadow = (v - smooth) / v_spread * price_spread
  const shadow: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const diff = obvDiff[i];
    const vs = v_spread[i];
    const ps = price_spread[i];
    shadow.push((diff / (vs || 1)) * ps);
  }

  // 6. out = shadow > 0 ? high + shadow : low + shadow
  const out: number[] = [];
  for (let i = 0; i < data.length; i++) {
    out.push(shadow[i] > 0 ? data[i].high + shadow[i] : data[i].low + shadow[i]);
  }

  // 7. ma = myma(src, len) where type = "DEMA" and len = 9
  const ma1 = emaArray(out, 9);
  const ma2 = emaArray(ma1, 9);
  const dema: number[] = [];
  for (let i = 0; i < data.length; i++) {
    dema.push(2 * ma1[i] - ma2[i]);
  }

  // 8. slow_ma = ema(close, 26)
  const closeValues = data.map(d => d.close);
  const slow_ma = emaArray(closeValues, 26);

  // 9. macd = ma - slow_ma
  const obvMacd: number[] = [];
  for (let i = 0; i < data.length; i++) {
    obvMacd.push(dema[i] - slow_ma[i]);
  }

  // Double MACD calculation
  // Long Cloud: Fast 21, Slow 55, Smoothing 9
  const dm_fast_ma1 = emaArray(closeValues, 21);
  const dm_slow_ma1 = emaArray(closeValues, 55);
  const dm_macd1: number[] = [];
  for (let i = 0; i < data.length; i++) {
    dm_macd1.push(dm_fast_ma1[i] - dm_slow_ma1[i]);
  }
  const dm_signal1 = emaArray(dm_macd1, 9);
  const dm_hist1: number[] = [];
  for (let i = 0; i < data.length; i++) {
    dm_hist1.push(dm_macd1[i] - dm_signal1[i]);
  }

  // Short Cloud: Fast 5, Slow 13, Smoothing 6
  const dm_fast_ma2 = emaArray(closeValues, 5);
  const dm_slow_ma2 = emaArray(closeValues, 13);
  const dm_macd2: number[] = [];
  for (let i = 0; i < data.length; i++) {
    dm_macd2.push(dm_fast_ma2[i] - dm_slow_ma2[i]);
  }
  const dm_signal2 = emaArray(dm_macd2, 6);
  const dm_hist2: number[] = [];
  for (let i = 0; i < data.length; i++) {
    dm_hist2.push(dm_macd2[i] - dm_signal2[i]);
  }

  const values: ObvMacdDoubleMacdValue[] = [];
  const startIdx = Math.min(55, data.length - 1);
  for (let i = startIdx; i < data.length; i++) {
    values.push({
      time: data[i].time,
      obvMacd: Number(obvMacd[i].toFixed(4)),
      longMacd: Number(dm_macd1[i].toFixed(4)),
      longSignal: Number(dm_signal1[i].toFixed(4)),
      longHist: Number(dm_hist1[i].toFixed(4)),
      shortMacd: Number(dm_macd2[i].toFixed(4)),
      shortSignal: Number(dm_signal2[i].toFixed(4)),
      shortHist: Number(dm_hist2[i].toFixed(4)),
    });
  }

  return values;
}

// ─── Killer + IDM Sweep Signals Engine ──────────────────────────────────────
// Custom-built indicator extracting the liquidity sweep and confluence mechanics
// of the Killer + IDM trading script. Tracks pivot swing points, inducement points (IDM),
// and filters sweeps via a confluence of Supertrend, Braid Filter, and VWAP.
export function calcKillerIdmSignals(d: CandleData[]): SmartSignalOutput[] {
  const data = (d || []).filter(Boolean);
  if (data.length < 50) return [];

  // 1. Calculate ATR (14)
  const atr: number[] = new Array(data.length).fill(0);
  if (data.length > 0) {
    let trSum = 0;
    for (let i = 0; i < Math.min(14, data.length); i++) {
      const prev = data[i - 1];
      const curr = data[i];
      const tr = prev 
        ? Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close))
        : curr.high - curr.low;
      trSum += tr;
      atr[i] = tr;
    }
    let prevAtr = trSum / Math.min(14, data.length);
    atr[Math.min(14, data.length) - 1] = prevAtr;
    for (let i = Math.min(14, data.length); i < data.length; i++) {
      const curr = data[i];
      const prev = data[i - 1];
      const tr = Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close));
      const currentAtr = (prevAtr * 13 + tr) / 14;
      atr[i] = currentAtr;
      prevAtr = currentAtr;
    }
  }

  // 2. Supertrend (10, 3.0)
  const supertrendDir: number[] = new Array(data.length).fill(0); // -1 for bull, 1 for bear
  const supertrendValue: number[] = new Array(data.length).fill(0);
  
  let lowerBand = 0;
  let upperBand = 0;

  for (let i = 0; i < data.length; i++) {
    const curAtr = atr[i] || 0.01;
    const hl2 = (data[i].high + data[i].low) / 2;
    
    let tempUpper = hl2 + 3.0 * curAtr;
    let tempLower = hl2 - 3.0 * curAtr;

    if (i > 0) {
      const prevCloseVal = data[i - 1].close;
      upperBand = tempUpper < upperBand || prevCloseVal > upperBand ? tempUpper : upperBand;
      lowerBand = tempLower > lowerBand || prevCloseVal < lowerBand ? tempLower : lowerBand;
    } else {
      upperBand = tempUpper;
      lowerBand = tempLower;
    }

    if (i > 0) {
      const prevTrendVal = supertrendDir[i - 1];
      let curTrend = prevTrendVal === 0 ? 1 : prevTrendVal;
      
      if (curTrend === -1) { // Bullish
        if (data[i].close < lowerBand) {
          curTrend = 1; // Flip to Bearish
        }
      } else { // Bearish
        if (data[i].close > upperBand) {
          curTrend = -1; // Flip to Bullish
        }
      }
      supertrendDir[i] = curTrend;
      supertrendValue[i] = curTrend === -1 ? lowerBand : upperBand;
    } else {
      supertrendDir[i] = -1; // Default to Bullish first bar
      supertrendValue[i] = lowerBand;
    }
  }

  // 3. Braid Filter
  const ema3 = calculateEMA(data, 3);
  const ema7_open = calculateEMA(data.map(c => ({ ...c, close: c.open })), 7);
  const ema14 = calculateEMA(data, 14);

  const getEmaValue = (emaArr: { time: number; value: number }[], time: number, fallback: number) => {
    const match = emaArr.find(x => x.time === time);
    return match ? match.value : fallback;
  };

  // 4. VWAP
  const vwapArr = calculateVWAP(data);
  const getVwapValue = (time: number, fallback: number) => {
    const match = vwapArr.find(x => x.time === time);
    return match ? match.value : fallback;
  };

  // 5. Pivots & IDM logic
  const swing_len = 5;
  const pivotHighs: { index: number; price: number; high: number }[] = [];
  const pivotLows: { index: number; price: number; low: number }[] = [];

  for (let i = swing_len; i < data.length - swing_len; i++) {
    const candidateHigh = data[i].high;
    const candidateLow = data[i].low;
    let isPH = true;
    let isPL = true;

    for (let j = i - swing_len; j <= i + swing_len; j++) {
      if (j !== i) {
        if (data[j].high > candidateHigh) isPH = false;
        if (data[j].low < candidateLow) isPL = false;
      }
    }

    if (isPH) {
      pivotHighs.push({ index: i, price: candidateHigh, high: candidateHigh });
    }
    if (isPL) {
      pivotLows.push({ index: i, price: candidateLow, low: candidateLow });
    }
  }

  // State machine for IDM
  let currentTrend = 1; // 1 for bull, -1 for bear
  let lastHigh = 0;
  let lastLow = 0;
  
  interface IndPoint {
    index: number;
    time: number;
    price: number;
    isBull: boolean;
    broken: boolean;
    candleSl: number;
  }
  const indPoints: IndPoint[] = [];
  const signals: SmartSignalOutput[] = [];

  let lastSignalIndex = -50; // Cooldown of 5 bars

  // Iterate bar-by-bar
  for (let i = 10; i < data.length; i++) {
    const bar = data[i];
    const prevBar = data[i - 1];
    
    // Check if any swing pivot occurred at i - swing_len
    const targetIdx = i - swing_len;
    if (targetIdx >= 0) {
      const ph = pivotHighs.find(p => p.index === targetIdx);
      const pl = pivotLows.find(p => p.index === targetIdx);

      if (ph) {
        if (ph.price > lastHigh) {
          lastHigh = ph.price;
        }
        if (ph.price < lastHigh && ph.price > lastLow) {
          indPoints.push({
            index: targetIdx,
            time: data[targetIdx].time,
            price: ph.price,
            isBull: true,
            broken: false,
            candleSl: ph.high
          });
        }
      }

      if (pl) {
        if (pl.price < lastLow || lastLow === 0) {
          lastLow = pl.price;
        }
        if (pl.price > lastLow && pl.price < lastHigh) {
          indPoints.push({
            index: targetIdx,
            time: data[targetIdx].time,
            price: pl.price,
            isBull: false,
            broken: false,
            candleSl: pl.low
          });
        }
      }
    }

    // Sweep detection at bar i
    let indBullBroken = false;
    let indBearBroken = false;
    let activeIp: IndPoint | null = null;

    for (let j = indPoints.length - 1; j >= 0; j--) {
      const ip = indPoints[j];
      if (!ip.broken) {
        if (ip.isBull && prevBar.low < ip.price) {
          ip.broken = true;
          indBullBroken = true;
          activeIp = ip;
        } else if (!ip.isBull && prevBar.high > ip.price) {
          ip.broken = true;
          indBearBroken = true;
          activeIp = ip;
        }
      }
    }

    // Evaluate Confluence Filters
    const curAtr = atr[i] || 0.01;
    const curTime = bar.time;
    const closeVal = bar.close;

    // Supertrend
    const supertrendIsBull = supertrendDir[i] === -1;
    
    // Braid Filter
    const ma1 = getEmaValue(ema3, curTime, closeVal);
    const ma2 = getEmaValue(ema7_open, curTime, bar.open);
    const ma3 = getEmaValue(ema14, curTime, closeVal);
    const dif = Math.max(ma1, ma2, ma3) - Math.min(ma1, ma2, ma3);
    const filter = curAtr * 0.40;
    const braidBull = ma1 > ma2 && dif > filter;
    const braidBear = ma2 > ma1 && dif > filter;

    const macroBullish = supertrendIsBull && braidBull;
    const macroBearish = !supertrendIsBull && braidBear;

    // VWAP
    const vwapVal = getVwapValue(curTime, closeVal);
    const priceAboveVwap = closeVal > vwapVal;
    const priceBelowVwap = closeVal < vwapVal;

    const longConfluence = macroBullish && priceAboveVwap;
    const shortConfluence = macroBearish && priceBelowVwap;

    if (indBearBroken && longConfluence && i - lastSignalIndex >= 5) {
      const entry = closeVal;
      const pivotSl = activeIp ? activeIp.candleSl : bar.low;
      const sl = Math.min(pivotSl, prevBar.low) - curAtr * 1.0;
      const risk = entry - sl;
      if (risk > 0) {
        const tp = entry + risk * 1.5;
        const confidence = Math.min(99, Math.round(75 + (braidBull ? 15 : 5) + (priceAboveVwap ? 9 : 0)));
        signals.push({
          time: bar.time,
          signal: 'BUY',
          entry,
          tp,
          sl,
          rr: 1.5,
          confidence,
          regime: supertrendIsBull ? 'TREND' : 'RANGE'
        });
        lastSignalIndex = i;
        currentTrend = 1;
        lastLow = bar.low;
      }
    } else if (indBullBroken && shortConfluence && i - lastSignalIndex >= 5) {
      const entry = closeVal;
      const pivotSl = activeIp ? activeIp.candleSl : bar.high;
      const sl = Math.max(pivotSl, prevBar.high) + curAtr * 1.0;
      const risk = sl - entry;
      if (risk > 0) {
        const tp = entry - risk * 1.5;
        const confidence = Math.min(99, Math.round(75 + (braidBear ? 15 : 5) + (priceBelowVwap ? 9 : 0)));
        signals.push({
          time: bar.time,
          signal: 'SELL',
          entry,
          tp,
          sl,
          rr: 1.5,
          confidence,
          regime: !supertrendIsBull ? 'TREND' : 'RANGE'
        });
        lastSignalIndex = i;
        currentTrend = -1;
        lastHigh = bar.high;
      }
    }
  }

  return signals;
}
