import { describe, it, expect } from 'vitest';
import { calculateEMA, calculateBollingerBands, calculateVWAP, calcKillerIdmSignals } from './indicators';
import { CandleData } from '../types';

describe('Indicators Pure Functions - Fixed Math Vectors', () => {
  // Fixed set of simple mock candles
  const mockCandles: CandleData[] = [
    { time: 1000, open: 10, high: 12, low: 9, close: 10, volume: 100 },
    { time: 2000, open: 10, high: 13, low: 10, close: 12, volume: 150 },
    { time: 3000, open: 12, high: 15, low: 11, close: 14, volume: 200 },
    { time: 4000, open: 14, high: 16, low: 13, close: 13, volume: 100 },
    { time: 5000, open: 13, high: 17, low: 12, close: 16, volume: 300 },
  ];

  describe('calculateEMA', () => {
    it('should return empty array if dataset is shorter than period', () => {
      expect(calculateEMA(mockCandles, 10)).toEqual([]);
    });

    it('should calculate correct EMA values for period 3', () => {
      // Period 3 means:
      // First point (index 2): simple average of close prices (10 + 12 + 14)/3 = 12
      // Second point (index 3): close = 13, k = 2 / (3 + 1) = 0.5. ema = 13 * 0.5 + 12 * 0.5 = 12.5
      // Third point (index 4): close = 16, k = 0.5. ema = 16 * 0.5 + 12.5 * 0.5 = 14.25
      const ema = calculateEMA(mockCandles, 3);
      expect(ema.length).toBe(3);
      expect(ema[0]).toEqual({ time: 3000, value: 12 });
      expect(ema[1]).toEqual({ time: 4000, value: 12.5 });
      expect(ema[2]).toEqual({ time: 5000, value: 14.25 });
    });
  });

  describe('calculateBollingerBands', () => {
    it('should calculate correct Bollinger Bands values for period 3, multiplier 2', () => {
      // Period 3 close values at i=2: [10, 12, 14] -> mean = 12, stdDev = sqrt(((10-12)^2 + 0 + (14-12)^2)/3) = sqrt(8/3) ~ 1.63299
      // upper = 12 + 2 * 1.63299 = 15.27
      // lower = 12 - 2 * 1.63299 = 8.73
      const bb = calculateBollingerBands(mockCandles, 3, 2);
      expect(bb.length).toBe(3);
      expect(bb[0].time).toBe(3000);
      expect(bb[0].middle).toBe(12);
      expect(bb[0].upper).toBeCloseTo(15.27, 1);
      expect(bb[0].lower).toBeCloseTo(8.73, 1);
    });
  });

  describe('calculateVWAP', () => {
    it('should calculate correct VWAP values', () => {
      // VWAP cumulative PV / cumulative Volume
      // typicalPrice = (high + low + close) / 3
      // C1: tp = (12+9+10)/3 = 10.33, vol = 100, pv = 1033.33, cumPV = 1033.33, cumVol = 100 -> vwap = 10.33
      // C2: tp = (13+10+12)/3 = 11.67, vol = 150, pv = 1750, cumPV = 2783.33, cumVol = 250 -> vwap = 11.13
      const vwap = calculateVWAP(mockCandles);
      expect(vwap.length).toBe(mockCandles.length);
      expect(vwap[0].value).toBeCloseTo(10.33, 1);
      expect(vwap[1].value).toBeCloseTo(11.13, 1);
    });
  });

  describe('calcKillerIdmSignals', () => {
    it('should return empty list if dataset has less than 50 candles', () => {
      expect(calcKillerIdmSignals(mockCandles)).toEqual([]);
    });

    it('should run smoothly and generate output with 60 mock candles', () => {
      const longMockCandles: CandleData[] = Array.from({ length: 60 }, (_, i) => ({
        time: (i + 1) * 1000,
        open: 100 + Math.sin(i / 5) * 10,
        high: 102 + Math.sin(i / 5) * 10,
        low: 98 + Math.sin(i / 5) * 10,
        close: 100 + Math.sin(i / 5) * 10,
        volume: 100
      }));
      const signals = calcKillerIdmSignals(longMockCandles);
      expect(Array.isArray(signals)).toBe(true);
    });
  });
});
