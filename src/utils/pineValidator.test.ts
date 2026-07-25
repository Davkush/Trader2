import { describe, it, expect } from 'vitest';
import { validatePineSyntax, dryRunStrategyInWorker } from './pineValidator';
import { CandleData } from '../types';

describe('Pine Script Validator Unit Tests', () => {
  const mockCandles: CandleData[] = Array.from({ length: 110 }, (_, idx) => ({
    time: 1700000000 + idx * 60,
    open: 100 + idx,
    high: 105 + idx,
    low: 95 + idx,
    close: 101 + idx,
    volume: 1000,
  }));

  it('should invalidate Pine Script with missing version directive', () => {
    const invalidCode = `
      strategy("My Simple Strat", overlay=true)
      plot(close)
    `;
    const report = validatePineSyntax(invalidCode);
    expect(report.valid).toBe(false);
    expect(report.error).toContain('version directive');
  });

  it('should invalidate Pine Script with missing strategy or indicator definition', () => {
    const invalidCode = `
      //@version=5
      plot(close)
    `;
    const report = validatePineSyntax(invalidCode);
    expect(report.valid).toBe(false);
    expect(report.error).toContain('definition block');
  });

  it('should invalidate Pine Script with missing visual plot', () => {
    const invalidCode = `
      //@version=5
      strategy("No Plots Here", overlay=true)
      a = close * 2
    `;
    const report = validatePineSyntax(invalidCode);
    expect(report.valid).toBe(false);
    expect(report.error).toContain('visual reporting');
  });

  it('should validate complete correct Pine Script', () => {
    const validCode = `
      //@version=5
      strategy("EMA Golden Cross", overlay=true)
      plot(ta.ema(close, 20))
    `;
    const report = validatePineSyntax(validCode);
    expect(report.valid).toBe(true);
    expect(report.error).toBeUndefined();
  });

  it('should successfully dry run correct compiled strategy JS code in sandbox', async () => {
    const correctJs = `
      const rsi = calcRSI(candles, 14);
      return [];
    `;
    const result = await dryRunStrategyInWorker(mockCandles, correctJs, [{ key: 'rsiPeriod', default: 14 }]);
    expect(result.success).toBe(true);
  });

  it('should report runtime errors for buggy strategy JS code in sandbox', async () => {
    const buggyJs = `
      const val = undefinedVar.someProperty;
      return [];
    `;
    const result = await dryRunStrategyInWorker(mockCandles, buggyJs, []);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
