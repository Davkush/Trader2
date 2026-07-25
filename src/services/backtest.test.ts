import { describe, it, expect } from 'vitest';
import { runBacktest, runWalkForwardOptimization } from './backtest';
import { CandleData, PineStrategyData } from '../types';

describe('Financial Backtest Engine Unit Tests', () => {
  // Mock data of 150 rising and falling candles
  const mockCandles: CandleData[] = Array.from({ length: 150 }, (_, idx) => {
    const angle = (idx / 10) * Math.PI;
    const basePrice = 100 + Math.sin(angle) * 10;
    return {
      time: 1700000000 + idx * 300, // 5 min candles
      open: basePrice,
      high: basePrice + 1.5,
      low: basePrice - 1.5,
      close: basePrice + 0.2,
      volume: 5000,
    };
  });

  // Strategy that buys on positive candle momentum and exits on TP/SL
  const mockStrategy: PineStrategyData = {
    name: 'Momentum Strat',
    description: 'Simple Test Strategy',
    pineCode: '//@version=5\nstrategy("Momentum", overlay=true)\nplot(close)',
    parameters: [
      { key: 'period', label: 'Period', type: 'number', default: 10, value: 10 }
    ],
    jsCode: `
      const signals = [];
      // Emit buy signal on index 10 and index 50
      signals.push({
        time: candles[10].time,
        signal: 'BUY',
        entry: candles[10].close,
        tp: candles[10].close * 1.05,
        sl: candles[10].close * 0.95,
        rr: 1.5,
        confidence: 80,
        regime: 'TREND'
      });
      signals.push({
        time: candles[50].time,
        signal: 'BUY',
        entry: candles[50].close,
        tp: candles[50].close * 1.05,
        sl: candles[50].close * 0.95,
        rr: 1.5,
        confidence: 80,
        regime: 'TREND'
      });
      return { signals, plots: [], dashboards: [] };
    `,
    active: true,
  };

  it('should run backtest and return correct schema stats', () => {
    const result = runBacktest(mockCandles, mockStrategy, { initialCapital: 5000 });
    
    expect(result).toHaveProperty('totalTrades');
    expect(result).toHaveProperty('wins');
    expect(result).toHaveProperty('losses');
    expect(result).toHaveProperty('winRate');
    expect(result.initialCapital).toBe(5000);
    expect(result.trades.length).toBeGreaterThan(0);
  });

  it('should deduct maker and taker fees mathematically', () => {
    const configWithFees = {
      initialCapital: 10000,
      makerFee: 0.01, // 1%
      takerFee: 0.02, // 2%
      slippageBps: 0,
      latencyMs: 0
    };

    const result = runBacktest(mockCandles, mockStrategy, configWithFees);
    const trade = result.trades[0];
    
    // Total fees paid should be non-zero
    expect(result.totalFeesPaid).toBeGreaterThan(0);
    expect(trade.feesPaid).toBeGreaterThan(0);
  });

  it('should apply slippage to entry and exit prices mathematically', () => {
    const configWithSlippage = {
      initialCapital: 10000,
      makerFee: 0,
      takerFee: 0,
      slippageBps: 100, // 100 basis points = 1.0%
      latencyMs: 0
    };

    const result = runBacktest(mockCandles, mockStrategy, configWithSlippage);
    const trade = result.trades[0];
    
    expect(result.totalSlippagePaid).toBeGreaterThan(0);
    expect(trade.slippagePaid).toBeGreaterThan(0);
    
    // For a BUY trade, actual entryPrice should be higher than raw entryPrice
    expect(trade.entryPrice).toBeGreaterThan(trade.rawEntryPrice);
  });

  it('should run Walk-Forward Optimization (WFO) over rolling windows', () => {
    const wfo = runWalkForwardOptimization(mockCandles, mockStrategy, { initialCapital: 10000 }, 3, 0.8);
    
    expect(wfo.length).toBe(3);
    const firstWindow = wfo[0];
    expect(firstWindow).toHaveProperty('windowIndex');
    expect(firstWindow).toHaveProperty('inSampleRange');
    expect(firstWindow).toHaveProperty('outOfSampleRange');
    expect(firstWindow).toHaveProperty('inSampleWinRate');
    expect(firstWindow).toHaveProperty('outOfSampleWinRate');
  });
});
