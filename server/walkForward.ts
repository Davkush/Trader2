import express from 'express';

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
 * Runs a server-side backtest simulation with simple friction logic
 */
function runServerBacktest(
  candles: any[],
  strategyParams: { symbol: string; rsiLength: number; overbought: number; oversold: number }
) {
  const rsiLength = strategyParams.rsiLength || 14;
  const overbought = strategyParams.overbought || 70;
  const oversold = strategyParams.oversold || 30;

  // Simple RSI calculation
  const rsi: (number | null)[] = Array(candles.length).fill(null);
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    if (i <= rsiLength) {
      avgGain += gain;
      avgLoss += loss;
      if (i === rsiLength) {
        avgGain /= rsiLength;
        avgLoss /= rsiLength;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi[i] = 100 - 100 / (1 + rs);
      }
    } else {
      avgGain = (avgGain * (rsiLength - 1) + gain) / rsiLength;
      avgLoss = (avgLoss * (rsiLength - 1) + loss) / rsiLength;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi[i] = 100 - 100 / (1 + rs);
    }
  }

  let capital = 10000;
  let position: { direction: 'BUY' | 'SELL'; entryPrice: number; quantity: number } | null = null;
  let wins = 0;
  let losses = 0;

  for (let i = rsiLength + 1; i < candles.length; i++) {
    const c = candles[i];
    const prevRsi = rsi[i - 1];
    const curRsi = rsi[i];

    if (!prevRsi || !curRsi) continue;

    // Check exit
    if (position) {
      const pnl = position.direction === 'BUY'
        ? (c.close - position.entryPrice) * position.quantity
        : (position.entryPrice - c.close) * position.quantity;
      
      const profitPct = (pnl / (position.entryPrice * position.quantity)) * 100;

      // Close if RSI reverses or 2% profit/loss target hit
      const shouldClose = position.direction === 'BUY'
        ? (curRsi > overbought || profitPct > 2.5 || profitPct < -1.5)
        : (curRsi < oversold || profitPct > 2.5 || profitPct < -1.5);

      if (shouldClose) {
        capital += pnl;
        if (pnl > 0) wins++;
        else losses++;
        position = null;
      }
    } else {
      // Check entry
      if (prevRsi < oversold && curRsi >= oversold) {
        // Buy entry
        const qty = (capital * 0.15) / c.close; // 15% size allocation
        position = { direction: 'BUY', entryPrice: c.close, quantity: qty };
      } else if (prevRsi > overbought && curRsi <= overbought) {
        // Sell entry
        const qty = (capital * 0.15) / c.close;
        position = { direction: 'SELL', entryPrice: c.close, quantity: qty };
      }
    }
  }

  const profitPct = ((capital - 10000) / 10000) * 100;
  const total = wins + losses;
  const winRate = total > 0 ? wins / total : 0;

  return { winRate, profitPercent: profitPct };
}

/**
 * Registers Walk-Forward Optimization Express route
 */
export function registerWalkForwardRoutes(app: express.Express, authMiddleware: express.RequestHandler) {
  app.post("/api/backtest/wfo", authMiddleware, (req, res) => {
    try {
      const { candles, rsiLength = 14, overbought = 70, oversold = 30 } = req.body;

      if (!candles || !Array.isArray(candles) || candles.length < 50) {
        return res.status(400).json({ error: "Insufficient candle history. Need at least 50 periods." });
      }

      const numWindows = 3;
      const inSampleRatio = 0.8;
      const windowSize = Math.floor(candles.length / numWindows);
      const windowResults: WFOWindowResult[] = [];

      for (let w = 0; w < numWindows; w++) {
        const startIdx = w * Math.floor(windowSize * 0.5);
        const endIdx = Math.min(startIdx + windowSize, candles.length);
        if (endIdx - startIdx < 40) continue;

        const windowCandles = candles.slice(startIdx, endIdx);
        const splitPoint = Math.floor(windowCandles.length * inSampleRatio);

        const inSampleCandles = windowCandles.slice(0, splitPoint);
        const outOfSampleCandles = windowCandles.slice(splitPoint);

        // Sweeping param search (RSI Lengths: [10, 14, 20])
        let bestRsiLength = rsiLength;
        let bestInSampleWinRate = 0;
        let bestInSampleProfit = 0;

        const testLengths = [10, 14, 20];
        for (const length of testLengths) {
          const resSim = runServerBacktest(inSampleCandles, {
            symbol: 'ASSET',
            rsiLength: length,
            overbought,
            oversold,
          });

          if (resSim.winRate > bestInSampleWinRate || (resSim.winRate === bestInSampleWinRate && resSim.profitPercent > bestInSampleProfit)) {
            bestInSampleWinRate = resSim.winRate;
            bestInSampleProfit = resSim.profitPercent;
            bestRsiLength = length;
          }
        }

        // Validate optimized params on Out-Of-Sample data
        const oosSim = runServerBacktest(outOfSampleCandles, {
          symbol: 'ASSET',
          rsiLength: bestRsiLength,
          overbought,
          oversold,
        });

        const formatDate = (epochSec: number) => {
          return new Date(epochSec * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        };

        windowResults.push({
          windowIndex: w + 1,
          inSampleRange: `${formatDate(inSampleCandles[0].time)} - ${formatDate(inSampleCandles[inSampleCandles.length - 1].time)}`,
          outOfSampleRange: `${formatDate(outOfSampleCandles[0].time)} - ${formatDate(outOfSampleCandles[outOfSampleCandles.length - 1].time)}`,
          inSampleWinRate: Number(bestInSampleWinRate.toFixed(4)),
          outOfSampleWinRate: Number(oosSim.winRate.toFixed(4)),
          inSampleProfitPercent: Number(bestInSampleProfit.toFixed(2)),
          outOfSampleProfitPercent: Number(oosSim.profitPercent.toFixed(2)),
          bestParameters: { rsiLength: bestRsiLength },
        });
      }

      res.json({ success: true, results: windowResults });
    } catch (err: any) {
      console.error("WFO Route Error:", err);
      res.status(500).json({ error: "Failed to run Walk-Forward Optimization sweep." });
    }
  });
}
