import { describe, it, expect } from 'vitest';
import { runPineStrategyFull, PineStrategyData } from './pineRunner';
import { CandleData } from '../types';

describe('Pine Script Runner - Pure Code Sandbox', () => {
  // Need at least 20 candles to trigger execution
  const mockCandles: CandleData[] = Array.from({ length: 30 }, (_, idx) => ({
    time: 1000 * (idx + 1),
    open: 100 + idx,
    high: 105 + idx,
    low: 95 + idx,
    close: 101 + idx,
    volume: 1000,
  }));

  it('should return empty results if candle data is insufficient or jsCode is missing', () => {
    const emptyStrategy: PineStrategyData = {
      name: 'Empty EMA',
      description: 'Desc',
      pineCode: '// nothing',
      parameters: [],
      jsCode: '',
      active: true,
    };

    const result = runPineStrategyFull(mockCandles.slice(0, 10), emptyStrategy);
    expect(result.signals).toEqual([]);
    expect(result.plots).toEqual([]);
  });

  it('should execute a simple javascript strategy and return plots/signals correctly', () => {
    // Strategy code that calculates SMA and triggers a buy on candle close crossover
    const strategy: PineStrategyData = {
      name: 'Simple SMA Crossover',
      description: 'SMA Cross strategy',
      pineCode: '// pine',
      parameters: [
        { key: 'smaPeriod', label: 'SMA Period', type: 'number', default: 5, value: 5 },
      ],
      jsCode: `
        const sma = calcSMA(candles, params.smaPeriod);
        const signals = [];
        const plots = [
          {
            id: 'sma_line',
            title: 'SMA',
            overlay: true,
            color: '#10b981',
            type: 'line',
            data: sma.map((v, idx) => ({ time: candles[idx].time, value: v })).filter(d => d.value !== null)
          }
        ];

        // Trigger a fake BUY on last index just to test the output
        const lastIdx = candles.length - 1;
        signals.push({
          time: candles[lastIdx].time,
          signal: 'BUY',
          entry: candles[lastIdx].close,
          tp: candles[lastIdx].close * 1.02,
          sl: candles[lastIdx].close * 0.98,
          rr: 1.5,
          confidence: 85,
          regime: 'TREND'
        });

        return { signals, plots, dashboards: [] };
      `,
      active: true,
    };

    const output = runPineStrategyFull(mockCandles, strategy);
    
    // Check signals
    expect(output.signals.length).toBe(1);
    expect(output.signals[0].signal).toBe('BUY');
    expect(output.signals[0].entry).toBe(mockCandles[mockCandles.length - 1].close);

    // Check plots
    expect(output.plots.length).toBe(1);
    expect(output.plots[0].id).toBe('sma_line');
    // Ensure SMA of period 5 is calculated. 
    // First 4 elements of SMA are null, so 30 - 4 = 26 data points in the plot
    expect(output.plots[0].data.length).toBe(26);
    expect(output.plots[0].data[0].value).toBe((mockCandles[0].close + mockCandles[1].close + mockCandles[2].close + mockCandles[3].close + mockCandles[4].close) / 5);
  });
});
