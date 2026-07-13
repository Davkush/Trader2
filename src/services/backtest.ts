import { CandleData, PineStrategyData, SmartSignalOutput, BacktestConfig, BacktestStats } from '../types';
import { runPineStrategy } from '../utils/pineRunner';
import { calcSmartSignals } from '../components/TradingChart';

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  rawEntryPrice: number;
  rawExitPrice: number;
  pnl: number;
  pnlPercent: number;
  feesPaid: number;
  slippagePaid: number;
  outcome: 'WIN' | 'LOSS' | 'PENDING';
}

export interface BacktestResult {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  initialCapital: number;
  finalCapital: number;
  grossCapital: number;
  totalFeesPaid: number;
  totalSlippagePaid: number;
  maxDrawdown: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  expectancy: number;
  trades: BacktestTrade[];
  wfo?: WFOWindowResult[];
}

export interface WFOWindowResult {
  windowIndex: number;
  inSampleRange: string;
  outOfSampleRange: string;
  inSampleWinRate: number;
  outOfSampleWinRate: number;
  inSampleProfitPercent: number;
  outOfSampleProfitPercent: number;
  bestParameters: Record<string, any>;
}

/**
 * Executes a comprehensive backtest over historical candles with sophisticated friction parameters.
 */
export function runBacktest(
  candles: CandleData[],
  strategy: PineStrategyData | null,
  config?: Partial<BacktestConfig>
): BacktestResult {
  const initialCapital = config?.initialCapital ?? 10000;
  const makerFee = config?.makerFee ?? 0.001;     // 0.1%
  const takerFee = config?.takerFee ?? 0.002;     // 0.2%
  const slippageBps = config?.slippageBps ?? 5;   // 5 basis points
  const latencyMs = config?.latencyMs ?? 200;     // 200ms delay

  const result: BacktestResult = {
    totalTrades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    initialCapital,
    finalCapital: initialCapital,
    grossCapital: initialCapital,
    totalFeesPaid: 0,
    totalSlippagePaid: 0,
    maxDrawdown: 0,
    profitFactor: 0,
    avgWin: 0,
    avgLoss: 0,
    largestWin: 0,
    largestLoss: 0,
    expectancy: 0,
    trades: []
  };

  if (!candles || candles.length < 50) {
    return result;
  }

  // Generate strategy signals
  let rawSignals: SmartSignalOutput[] = [];
  if (strategy && strategy.active) {
    rawSignals = runPineStrategy(candles, strategy);
  } else {
    rawSignals = calcSmartSignals(candles, config?.smartSignalParams);
  }

  // Filter signals to ensure they contain times and are valid
  const signals = (rawSignals || []).filter(sig => sig && sig.time !== undefined && sig.time !== null);
  if (signals.length === 0) {
    return result;
  }

  let currentCapital = initialCapital;
  let grossCapital = initialCapital;
  let peakCapital = initialCapital;
  let totalFeesPaid = 0;
  let totalSlippagePaid = 0;

  let totalWinPnL = 0;
  let totalLossPnL = 0;
  let largestWin = 0;
  let largestLoss = 0;

  const trades: BacktestTrade[] = [];

  signals.forEach((sig) => {
    const origIdx = candles.findIndex(d => d?.time === sig.time);
    if (origIdx === -1 || origIdx >= candles.length - 1) return;

    // Apply execution latency delay mathematically
    // For large daily timeframes, 200ms is tiny, but standard protocol shifts to next candle's open as delay simulation.
    let entryIdx = origIdx;
    if (latencyMs > 0 && origIdx + 1 < candles.length) {
      entryIdx = origIdx + 1; // Execute at open of next candle to model execution delay
    }

    const entryCandle = candles[entryIdx];
    const rawEntryPrice = entryCandle.open;

    // Apply entry slippage
    const direction = sig.signal === 'BUY' ? 'BUY' : 'SELL';
    const slippageMultiplier = slippageBps / 10000;
    const entrySlippage = rawEntryPrice * slippageMultiplier;
    const entryPrice = direction === 'BUY' 
      ? rawEntryPrice + entrySlippage 
      : rawEntryPrice - entrySlippage;

    totalSlippagePaid += entrySlippage;

    // Calculate trade size (using 10% of current capital safely)
    const riskFactor = 0.10;
    const positionSize = currentCapital * riskFactor;
    const quantity = positionSize / entryPrice;

    // Deduct entry transaction fee (Taker fee for market execution crossing the spread)
    const entryFee = positionSize * takerFee;
    currentCapital -= entryFee;
    totalFeesPaid += entryFee;

    let resolved = false;
    let exitPrice = entryPrice;
    let rawExitPrice = rawEntryPrice;
    let exitTime = entryCandle.time;
    let outcome: 'WIN' | 'LOSS' | 'PENDING' = 'PENDING';
    let exitFee = 0;

    // Walk forward through candles to evaluate TP / SL or EXIT signals
    for (let i = entryIdx + 1; i < candles.length; i++) {
      const c = candles[i];
      if (!c) continue;

      if (direction === 'BUY') {
        // High hits Take Profit first (Limit order -> Maker fee)
        if (c.high >= sig.tp) {
          rawExitPrice = sig.tp;
          const exitSlippage = rawExitPrice * slippageMultiplier;
          exitPrice = rawExitPrice - exitSlippage; // slippage hurts exit
          totalSlippagePaid += exitSlippage;
          
          exitFee = (quantity * rawExitPrice) * makerFee; // Limit order fill
          outcome = 'WIN';
          exitTime = c.time;
          resolved = true;
          break;
        }
        // Low hits Stop Loss (Stop Market order -> Taker fee)
        if (c.low <= sig.sl) {
          rawExitPrice = sig.sl;
          const exitSlippage = rawExitPrice * slippageMultiplier;
          exitPrice = rawExitPrice - exitSlippage;
          totalSlippagePaid += exitSlippage;

          exitFee = (quantity * rawExitPrice) * takerFee; // Stop trigger fill
          outcome = 'LOSS';
          exitTime = c.time;
          resolved = true;
          break;
        }
      } else { // SELL (Short position)
        // Low hits Take Profit (Limit order -> Maker fee)
        if (c.low <= sig.tp) {
          rawExitPrice = sig.tp;
          const exitSlippage = rawExitPrice * slippageMultiplier;
          exitPrice = rawExitPrice + exitSlippage; // slippage increases repurchase price
          totalSlippagePaid += exitSlippage;

          exitFee = (quantity * rawExitPrice) * makerFee;
          outcome = 'WIN';
          exitTime = c.time;
          resolved = true;
          break;
        }
        // High hits Stop Loss (Stop Market -> Taker fee)
        if (c.high >= sig.sl) {
          rawExitPrice = sig.sl;
          const exitSlippage = rawExitPrice * slippageMultiplier;
          exitPrice = rawExitPrice + exitSlippage;
          totalSlippagePaid += exitSlippage;

          exitFee = (quantity * rawExitPrice) * takerFee;
          outcome = 'LOSS';
          exitTime = c.time;
          resolved = true;
          break;
        }
      }
    }

    // Fallback: unresolved trade forced closed at last close price
    if (!resolved) {
      const lastCandle = candles[candles.length - 1];
      rawExitPrice = lastCandle.close;
      const exitSlippage = rawExitPrice * slippageMultiplier;
      exitPrice = direction === 'BUY' ? rawExitPrice - exitSlippage : rawExitPrice + exitSlippage;
      totalSlippagePaid += exitSlippage;

      exitFee = (quantity * rawExitPrice) * takerFee;
      exitTime = lastCandle.time;
      outcome = 'PENDING';
    }

    // Calculate returns mathematically
    const grossReturn = direction === 'BUY'
      ? quantity * (exitPrice - entryPrice)
      : quantity * (entryPrice - exitPrice);

    const netTradePnL = grossReturn - exitFee;
    currentCapital += netTradePnL;

    // Track gross capital with zero friction for comparison
    const rawPnL = direction === 'BUY'
      ? quantity * (rawExitPrice - rawEntryPrice)
      : quantity * (rawEntryPrice - rawExitPrice);
    grossCapital += rawPnL;

    totalFeesPaid += exitFee;

    // Track statistics
    if (outcome === 'WIN') {
      result.wins++;
      totalWinPnL += netTradePnL;
      largestWin = Math.max(largestWin, netTradePnL);
    } else if (outcome === 'LOSS') {
      result.losses++;
      totalLossPnL += Math.abs(netTradePnL);
      largestLoss = Math.max(largestLoss, Math.abs(netTradePnL));
    } else {
      if (netTradePnL >= 0) {
        totalWinPnL += netTradePnL;
        largestWin = Math.max(largestWin, netTradePnL);
      } else {
        totalLossPnL += Math.abs(netTradePnL);
        largestLoss = Math.max(largestLoss, Math.abs(netTradePnL));
      }
    }

    // Update Max Drawdown tracking
    peakCapital = Math.max(peakCapital, currentCapital);
    const drawdown = (peakCapital - currentCapital) / peakCapital;
    result.maxDrawdown = Math.max(result.maxDrawdown, drawdown);

    trades.push({
      entryTime: entryCandle.time,
      exitTime,
      direction,
      entryPrice,
      exitPrice,
      rawEntryPrice,
      rawExitPrice,
      pnl: netTradePnL,
      pnlPercent: (netTradePnL / positionSize) * 100,
      feesPaid: entryFee + exitFee,
      slippagePaid: entrySlippage + (rawExitPrice * slippageMultiplier),
      outcome
    });
  });

  const totalTrades = trades.length;
  const winsAndLosses = result.wins + result.losses;
  const winRate = winsAndLosses > 0 ? result.wins / winsAndLosses : 0;

  result.totalTrades = totalTrades;
  result.finalCapital = currentCapital;
  result.grossCapital = grossCapital;
  result.totalFeesPaid = totalFeesPaid;
  result.totalSlippagePaid = totalSlippagePaid;
  result.winRate = winRate;
  result.largestWin = largestWin;
  result.largestLoss = largestLoss;
  result.avgWin = result.wins > 0 ? totalWinPnL / result.wins : 0;
  result.avgLoss = result.losses > 0 ? totalLossPnL / result.losses : 0;
  result.profitFactor = totalLossPnL > 0 ? totalWinPnL / totalLossPnL : totalWinPnL > 0 ? 999 : 0;
  result.expectancy = (winRate * result.avgWin) - ((1 - winRate) * result.avgLoss);
  result.trades = trades;

  return result;
}

/**
 * Implements Walk-Forward Optimization (WFO) over rolling windows.
 * Splits candles into segments, optimizes parameters on "In-Sample" (80%), and runs validation on "Out-of-Sample" (20%).
 */
export function runWalkForwardOptimization(
  candles: CandleData[],
  strategy: PineStrategyData,
  config?: Partial<BacktestConfig>,
  numWindows = 3,
  inSampleRatio = 0.8
): WFOWindowResult[] {
  const windowResults: WFOWindowResult[] = [];
  if (!candles || candles.length < 100 || !strategy) return windowResults;

  const windowSize = Math.floor(candles.length / numWindows);

  for (let w = 0; w < numWindows; w++) {
    // Determine the rolling slice boundaries
    const startIdx = w * Math.floor(windowSize * 0.5);
    const endIdx = Math.min(startIdx + windowSize, candles.length);
    if (endIdx - startIdx < 50) continue;

    const windowCandles = candles.slice(startIdx, endIdx);
    const splitPoint = Math.floor(windowCandles.length * inSampleRatio);

    const inSampleCandles = windowCandles.slice(0, splitPoint);
    const outOfSampleCandles = windowCandles.slice(splitPoint);

    // Simple robust parameters sweep training simulation
    // We try tweaking the first parameter slightly to simulate a smart quantitative solver
    const paramToTweak = strategy.parameters.find(p => p.type === 'number');
    let bestParamVal = paramToTweak?.value ?? paramToTweak?.default ?? 14;
    let bestInSampleWinRate = 0;
    let bestInSampleProfit = 0;

    if (paramToTweak) {
      const baseVal = Number(bestParamVal);
      const testValues = [Math.max(2, baseVal - 5), baseVal, baseVal + 5];

      testValues.forEach(val => {
        const tweakedStrategy = {
          ...strategy,
          parameters: strategy.parameters.map(p => p.key === paramToTweak.key ? { ...p, value: val } : p)
        };
        const res = runBacktest(inSampleCandles, tweakedStrategy, config);
        if (res.winRate > bestInSampleWinRate || (res.winRate === bestInSampleWinRate && res.finalCapital > bestInSampleProfit)) {
          bestInSampleWinRate = res.winRate;
          bestInSampleProfit = ((res.finalCapital - res.initialCapital) / res.initialCapital) * 100;
          bestParamVal = val;
        }
      });
    }

    // Evaluate the optimized parameters on Out-of-Sample (OOS) data
    const optimizedStrategy = {
      ...strategy,
      parameters: strategy.parameters.map(p => paramToTweak && p.key === paramToTweak.key ? { ...p, value: bestParamVal } : p)
    };

    const oosResult = runBacktest(outOfSampleCandles, optimizedStrategy, config);
    const outOfSampleWinRate = oosResult.winRate;
    const outOfSampleProfitPercent = ((oosResult.finalCapital - oosResult.initialCapital) / oosResult.initialCapital) * 100;

    const formatTime = (time: number) => new Date(time * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    windowResults.push({
      windowIndex: w + 1,
      inSampleRange: `${formatTime(inSampleCandles[0].time)} - ${formatTime(inSampleCandles[inSampleCandles.length - 1].time)}`,
      outOfSampleRange: `${formatTime(outOfSampleCandles[0].time)} - ${formatTime(outOfSampleCandles[outOfSampleCandles.length - 1].time)}`,
      inSampleWinRate: bestInSampleWinRate,
      outOfSampleWinRate,
      inSampleProfitPercent: bestInSampleProfit,
      outOfSampleProfitPercent,
      bestParameters: paramToTweak ? { [paramToTweak.key]: bestParamVal } : {}
    });
  }

  return windowResults;
}
