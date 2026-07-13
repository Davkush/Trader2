import { CandleData } from '../types';

/**
 * Validates the syntax of Pine Script strategy code against standard requirements.
 * Ensures the code contains key syntax components like //@version, strategy/indicator blocks, and plots.
 */
export function validatePineSyntax(code: string): { valid: boolean; error?: string } {
  if (!code || !code.trim()) {
    return { valid: false, error: 'Pine Script is empty.' };
  }

  // Check version directive
  const hasVersion = code.includes('//@version=5') || code.includes('//@version=6') || code.includes('//@version=4') || code.includes('//@version=');
  if (!hasVersion) {
    return { valid: false, error: 'Missing required version directive. Please specify //@version=5 at the top of your Pine Script.' };
  }

  // Check for required strategy/indicator/study blocks
  const hasDefinition = /strategy\s*\(/i.test(code) || /indicator\s*\(/i.test(code) || /study\s*\(/i.test(code);
  if (!hasDefinition) {
    return { valid: false, error: 'Missing strategy(...) or indicator(...) definition block.' };
  }

  // Check for required plot blocks (plot, plotshape, plotchar, plotarrow, plotbar, plotcandle)
  const hasPlot = /plot\s*\(/i.test(code) || /plotshape\s*\(/i.test(code) || /plotchar\s*\(/i.test(code) || /plotarrow\s*\(/i.test(code);
  if (!hasPlot) {
    return { valid: false, error: 'Missing visual reporting output (plot, plotshape, etc.). Every strategy should plot its metrics or signal shapes.' };
  }

  return { valid: true };
}

export const PINE_HELPERS_BLOCK = `
  const calcSMA = (data, len) => {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
      if (i < len - 1) { sma.push(null); continue; }
      let sum = 0;
      for (let j = 0; j < len; j++) sum += data[i - j].close;
      sma.push(sum / len);
    }
    return sma;
  };

  const calcEMA = (data, len) => {
    const ema = [];
    const k = 2 / (len + 1);
    let prevEma = null;
    for (let i = 0; i < data.length; i++) {
      if (i < len - 1) { ema.push(null); continue; }
      if (prevEma === null) {
        let sum = 0;
        for (let j = 0; j < len; j++) sum += data[i - j].close;
        prevEma = sum / len;
        ema.push(prevEma);
      } else {
        const curEma = data[i].close * k + prevEma * (1 - k);
        ema.push(curEma);
        prevEma = curEma;
      }
    }
    return ema;
  };

  const calcRSI = (data, len) => {
    const rsi = [];
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 0; i < data.length; i++) {
      if (i === 0) { rsi.push(null); continue; }
      const change = data[i].close - data[i - 1].close;
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;
      if (i < len) {
        avgGain += gain;
        avgLoss += loss;
        if (i === len - 1) {
          avgGain /= len;
          avgLoss /= len;
          const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
          rsi.push(100 - 100 / (1 + rs));
        } else {
          rsi.push(null);
        }
      } else {
        avgGain = (avgGain * (len - 1) + gain) / len;
        avgLoss = (avgLoss * (len - 1) + loss) / len;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi.push(100 - 100 / (1 + rs));
      }
    }
    return rsi;
  };

  const calcATR = (data, len) => {
    const atr = [];
    const trs = [];
    for (let i = 0; i < data.length; i++) {
      if (i === 0) {
        trs.push(data[i].high - data[i].low);
        atr.push(data[i].high - data[i].low);
        continue;
      }
      const tr = Math.max(
        data[i].high - data[i].low,
        Math.abs(data[i].high - data[i - 1].close),
        Math.abs(data[i].low - data[i - 1].close)
      );
      trs.push(tr);
      if (i < len) {
        atr.push(trs.reduce((a, b) => a + b, 0) / (i + 1));
      } else {
        atr.push((atr[atr.length - 1] * (len - 1) + tr) / len);
      }
    }
    return atr;
  };

  const calcMACD = (data, fast, slow, sig) => {
    const emaFast = calcEMA(data, fast);
    const emaSlow = calcEMA(data, slow);
    const macdLine = [];
    for (let i = 0; i < data.length; i++) {
      if (emaFast[i] === null || emaSlow[i] === null) {
        macdLine.push(null);
      } else {
        macdLine.push(emaFast[i] - emaSlow[i]);
      }
    }
    const signalLine = [];
    const k = 2 / (sig + 1);
    let prevEma = null;
    for (let i = 0; i < data.length; i++) {
      if (macdLine[i] === null) {
        signalLine.push(null);
        continue;
      }
      if (prevEma === null) {
        let startIdx = 0;
        while (startIdx < data.length && macdLine[startIdx] === null) startIdx++;
        if (i < startIdx + sig - 1) {
          signalLine.push(null);
        } else {
          let sum = 0;
          for (let j = 0; j < sig; j++) sum += macdLine[i - j];
          prevEma = sum / sig;
          signalLine.push(prevEma);
        }
      } else {
        const curEma = macdLine[i] * k + prevEma * (1 - k);
        signalLine.push(curEma);
        prevEma = curEma;
      }
    }
    const histogram = [];
    for (let i = 0; i < data.length; i++) {
      if (macdLine[i] === null || signalLine[i] === null) {
        histogram.push(null);
      } else {
        histogram.push(macdLine[i] - signalLine[i]);
      }
    }
    return { macdLine, signalLine, histogram };
  };

  const calcSupertrend = (data, factor, len) => {
    const atr = calcATR(data, len);
    const supertrend = [];
    const direction = [];
    let prevFinalUpper = null;
    let prevFinalLower = null;
    let prevTrend = 1;
    for (let i = 0; i < data.length; i++) {
      if (i < len) {
        supertrend.push(null);
        direction.push(null);
        continue;
      }
      const hl2 = (data[i].high + data[i].low) / 2;
      const basicUpper = hl2 + factor * atr[i];
      const basicLower = hl2 - factor * atr[i];
      let finalUpper = basicUpper;
      let finalLower = basicLower;
      const prevClose = data[i - 1].close;
      if (prevFinalUpper !== null) {
        finalUpper = (basicUpper < prevFinalUpper || prevClose > prevFinalUpper) ? basicUpper : prevFinalUpper;
      }
      if (prevFinalLower !== null) {
        finalLower = (basicLower > prevFinalLower || prevClose < prevFinalLower) ? basicLower : prevFinalLower;
      }
      let trend = prevTrend;
      if (data[i].close > finalUpper) {
        trend = 1;
      } else if (data[i].close < finalLower) {
        trend = -1;
      }
      const val = (trend === 1) ? finalLower : finalUpper;
      supertrend.push(val);
      direction.push(trend);
      prevFinalUpper = finalUpper;
      prevFinalLower = finalLower;
      prevTrend = trend;
    }
    return { supertrend, direction };
  };

  const calcStoch = (data, kLen, dLen, smooth) => {
    const rawK = [];
    for (let i = 0; i < data.length; i++) {
      if (i < kLen - 1) {
        rawK.push(null);
        continue;
      }
      let lowestLow = data[i].low;
      let highestHigh = data[i].high;
      for (let j = 0; j < kLen; j++) {
        lowestLow = Math.min(lowestLow, data[i - j].low);
        highestHigh = Math.max(highestHigh, data[i - j].high);
      }
      const denom = highestHigh - lowestLow;
      const kVal = denom === 0 ? 50 : 100 * (data[i].close - lowestLow) / denom;
      rawK.push(kVal);
    }
    const k = [];
    for (let i = 0; i < data.length; i++) {
      if (i < kLen - 1 + smooth - 1) {
        k.push(null);
        continue;
      }
      let sum = 0;
      let valid = true;
      for (let j = 0; j < smooth; j++) {
        const v = rawK[i - j];
        if (v === null) { valid = false; break; }
        sum += v;
      }
      k.push(valid ? sum / smooth : null);
    }
    const d = [];
    for (let i = 0; i < data.length; i++) {
      if (i < kLen - 1 + smooth - 1 + dLen - 1) {
        d.push(null);
        continue;
      }
      let sum = 0;
      let valid = true;
      for (let j = 0; j < dLen; j++) {
        const v = k[i - j];
        if (v === null) { valid = false; break; }
        sum += v;
      }
      d.push(valid ? sum / dLen : null);
    }
    return { k, d };
  };

  const calcBB = (data, len, mult) => {
    const basis = calcSMA(data, len);
    const upper = [];
    const lower = [];
    for (let i = 0; i < data.length; i++) {
      if (basis[i] === null) {
        upper.push(null);
        lower.push(null);
        continue;
      }
      let sumSq = 0;
      for (let j = 0; j < len; j++) {
        sumSq += Math.pow(data[i - j].close - basis[i], 2);
      }
      const dev = Math.sqrt(sumSq / len);
      upper.push(basis[i] + mult * dev);
      lower.push(basis[i] - mult * dev);
    }
    return { basis, upper, lower };
  };

  const calcCCI = (data, len) => {
    const tps = data.map(d => (d.high + d.low + d.close) / 3);
    const cci = [];
    for (let i = 0; i < data.length; i++) {
      if (i < len - 1) {
        cci.push(null);
        continue;
      }
      let sum = 0;
      for (let j = 0; j < len; j++) sum += tps[i - j];
      const smaTP = sum / len;
      let sumDev = 0;
      for (let j = 0; j < len; j++) sumDev += Math.abs(tps[i - j] - smaTP);
      const meanDev = sumDev / len;
      if (meanDev === 0) {
        cci.push(0);
      } else {
        cci.push((tps[i] - smaTP) / (0.015 * meanDev));
      }
    }
    return cci;
  };

  const calcPivotHigh = (data, leftLen, rightLen) => {
    const ph = Array(data.length).fill(null);
    for (let i = leftLen; i < data.length - rightLen; i++) {
      const val = data[i].high;
      let isPivot = true;
      for (let j = 1; j <= leftLen; j++) {
        if (data[i - j].high > val) { isPivot = false; break; }
      }
      if (!isPivot) continue;
      for (let j = 1; j <= rightLen; j++) {
        if (data[i + j].high >= val) { isPivot = false; break; }
      }
      if (isPivot) {
        ph[i] = val;
      }
    }
    return ph;
  };

  const calcPivotLow = (data, leftLen, rightLen) => {
    const pl = Array(data.length).fill(null);
    for (let i = leftLen; i < data.length - rightLen; i++) {
      const val = data[i].low;
      let isPivot = true;
      for (let j = 1; j <= leftLen; j++) {
        if (data[i - j].low < val) { isPivot = false; break; }
      }
      if (!isPivot) continue;
      for (let j = 1; j <= rightLen; j++) {
        if (data[i + j].low <= val) { isPivot = false; break; }
      }
      if (isPivot) {
        pl[i] = val;
      }
    }
    return pl;
  };

  const calcSAR = (data, start, inc, maxVal) => {
    const sar = Array(data.length).fill(null);
    if (data.length < 2) return sar;
    let isLong = data[1].close > data[0].close;
    let ep = isLong ? Math.max(data[0].high, data[1].high) : Math.min(data[0].low, data[1].low);
    let af = start;
    let curSar = isLong ? data[0].low : data[0].high;
    sar[0] = curSar;
    for (let i = 1; i < data.length; i++) {
      let nextSar = curSar + af * (ep - curSar);
      if (isLong) {
        nextSar = Math.min(nextSar, data[i - 1].low, data[Math.max(0, i - 2)].low);
        if (data[i].low < nextSar) {
          isLong = false;
          nextSar = Math.max(ep, data[i].high, data[i - 1].high);
          ep = data[i].low;
          af = start;
        } else {
          if (data[i].high > ep) {
            ep = data[i].high;
            af = Math.min(maxVal, af + inc);
          }
        }
      } else {
        nextSar = Math.max(nextSar, data[i - 1].high, data[Math.max(0, i - 2)].high);
        if (data[i].high > nextSar) {
          isLong = true;
          nextSar = Math.min(ep, data[i].low, data[i - 1].low);
          ep = data[i].high;
          af = start;
        } else {
          if (data[i].low < ep) {
            ep = data[i].low;
            af = Math.min(maxVal, af + inc);
          }
        }
      }
      sar[i] = nextSar;
      curSar = nextSar;
    }
    return sar;
  };

  const calcDMI = (data, len, adxLen) => {
    const plusDM = [];
    const minusDM = [];
    const trs = [];
    for (let i = 0; i < data.length; i++) {
      if (i === 0) {
        plusDM.push(0);
        minusDM.push(0);
        trs.push(data[i].high - data[i].low);
        continue;
      }
      const up = data[i].high - data[i - 1].high;
      const down = data[i - 1].low - data[i].low;
      plusDM.push(up > down && up > 0 ? up : 0);
      minusDM.push(down > up && down > 0 ? down : 0);
      trs.push(Math.max(
        data[i].high - data[i].low,
        Math.abs(data[i].high - data[i - 1].close),
        Math.abs(data[i].low - data[i - 1].close)
      ));
    }
    const smoothTR = [];
    const smoothPlusDM = [];
    const smoothMinusDM = [];
    let trSum = 0, pSum = 0, mSum = 0;
    for (let i = 0; i < len; i++) {
      trSum += trs[i];
      pSum += plusDM[i];
      mSum += minusDM[i];
    }
    for (let i = 0; i < data.length; i++) {
      if (i < len - 1) {
        smoothTR.push(null);
        smoothPlusDM.push(null);
        smoothMinusDM.push(null);
      } else if (i === len - 1) {
        smoothTR.push(trSum);
        smoothPlusDM.push(pSum);
        smoothMinusDM.push(mSum);
      } else {
        const prevTR = smoothTR[i - 1];
        const prevPlus = smoothPlusDM[i - 1];
        const prevMinus = smoothMinusDM[i - 1];
        smoothTR.push(prevTR - prevTR / len + trs[i]);
        smoothPlusDM.push(prevPlus - prevPlus / len + plusDM[i]);
        smoothMinusDM.push(prevMinus - prevMinus / len + minusDM[i]);
      }
    }
    const diPlus = [];
    const diMinus = [];
    const dx = [];
    for (let i = 0; i < data.length; i++) {
      if (smoothTR[i] === null || smoothTR[i] === 0) {
        diPlus.push(null);
        diMinus.push(null);
        dx.push(null);
      } else {
        const plusVal = 100 * smoothPlusDM[i] / smoothTR[i];
        const minusVal = 100 * smoothMinusDM[i] / smoothTR[i];
        diPlus.push(plusVal);
        diMinus.push(minusVal);
        const sum = plusVal + minusVal;
        const diff = Math.abs(plusVal - minusVal);
        dx.push(sum === 0 ? 0 : 100 * diff / sum);
      }
    }
    const adx = [];
    let dxSum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i++) {
      if (dx[i] !== null && count < adxLen) {
        dxSum += dx[i];
        count++;
      }
      if (count < adxLen) {
        adx.push(null);
      } else if (count === adxLen && adx[adx.length - 1] === null) {
        adx.push(dxSum / adxLen);
      } else {
        const prevAdx = adx[i - 1];
        adx.push(prevAdx - prevAdx / adxLen + dx[i]);
      }
    }
    return { diPlus, diMinus, adx };
  };
`;

/**
 * Executes a high-fidelity dry run of compiled JS code in an isolated sandboxed Web Worker.
 * If Web Workers are unavailable or blocked by iFrame security boundaries, it gracefully runs in a main-thread try-catch sandbox.
 */
export function dryRunStrategyInWorker(
  candles: CandleData[],
  jsCode: string,
  parameters: { key: string; default: number | boolean; value?: number | boolean }[]
): Promise<{ success: boolean; error?: string }> {
  const last100Candles = candles.slice(-100);

  return new Promise((resolve) => {
    try {
      // Create inline Web Worker payload
      const workerCode = `
        self.onmessage = function(e) {
          const { candles, jsCode, params } = e.data;
          try {
            // Setup robust mathematical helpers inside the sandbox
            const fullJsCode = \`
              ${PINE_HELPERS_BLOCK}
              \\n
              \${jsCode}
            \`;
            const runner = new Function('candles', 'params', fullJsCode);
            const output = runner(candles, params);
            self.postMessage({ success: true, hasOutput: !!output });
          } catch (err) {
            self.postMessage({ success: false, error: err.toString() });
          }
        };
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);

      const timeoutId = setTimeout(() => {
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
        resolve({ success: false, error: 'Web Worker execution timed out after 1500ms.' });
      }, 1500);

      worker.onmessage = (e) => {
        clearTimeout(timeoutId);
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
        if (e.data.success) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: e.data.error || 'Execution runtime error.' });
        }
      };

      worker.onerror = (err) => {
        clearTimeout(timeoutId);
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
        resolve({ success: false, error: err.message || 'Worker syntax/runtime failure.' });
      };

      const paramsMap: Record<string, any> = {};
      parameters.forEach((p) => {
        paramsMap[p.key] = p.value !== undefined ? p.value : p.default;
      });

      worker.postMessage({ candles: last100Candles, jsCode, params: paramsMap });
    } catch (e: any) {
      // Graceful fallback to main thread standard compiler sandbox
      try {
        const fullCode = `
          ${PINE_HELPERS_BLOCK}
          ${jsCode}
        `;
        const runner = new Function('candles', 'params', fullCode);
        const paramsMap: Record<string, any> = {};
        parameters.forEach((p) => {
          paramsMap[p.key] = p.value !== undefined ? p.value : p.default;
        });
        runner(last100Candles, paramsMap);
        resolve({ success: true });
      } catch (errInner: any) {
        resolve({ success: false, error: errInner.message || errInner.toString() });
      }
    }
  });
}
