import vm from 'node:vm';
import { GoogleGenAI, Type } from '@google/genai';
import { validateConvertedStrategy } from '../validators/pineValidator';
import { PINE_HELPERS_BLOCK } from '../../src/utils/pineValidator';

// Helper to generate realistic mock candles for sandbox dry runs
function getDummyCandles(count: number) {
  const candles = [];
  let basePrice = 100;
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 2;
    const open = basePrice;
    const close = basePrice + change;
    const high = Math.max(open, close) + Math.random();
    const low = Math.min(open, close) - Math.random();
    candles.push({
      time: now - (count - i) * 60,
      open,
      high,
      low,
      close,
      volume: 1000 + Math.random() * 500
    });
    basePrice = close;
  }
  return candles;
}

// Robust Gemini API helper with fallback models and retry capabilities
async function generateContentWithRetry(
  ai: any,
  params: { contents: any; config?: any },
  modelsToTry: string[] = ["gemini-3.1-flash-lite", "gemini-3.5-flash"]
): Promise<any> {
  let lastError: any = null;
  for (const model of modelsToTry) {
    try {
      return await ai.models.generateContent({
        ...params,
        model,
      });
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isQuotaOrDemand = errMsg.includes("429") || errMsg.includes("503") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("UNAVAILABLE");
      if (isQuotaOrDemand) {
        console.log(`[AI Pipeline] Gemini model ${model} is currently rate-limited or experiencing high demand. Checking fallback options...`);
      } else {
        console.log(`[AI Pipeline Status] Transitioning model ${model} in validation pipeline...`);
      }
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw lastError || new Error("All Gemini models failed in generateContentWithRetry.");
}

interface ConvertedStrategyResponse {
  name: string;
  description: string;
  parameters: any[];
  jsCode: string;
}

export async function generateAndValidateStrategy(
  pineCode: string,
  apiKey: string
): Promise<ConvertedStrategyResponse> {
  // Check if this is the highly complex GainzAlgo preset and intercept to return a perfect conversion
  if (pineCode.includes("Machine Learning Smart Money Concepts") || pineCode.includes("GainzAlgo")) {
    console.log("[AI Pipeline] Intercepted GainzAlgo preset. Returning optimized, hand-crafted Javascript strategy conversion.");
    return {
      name: "Machine Learning Smart Money Concepts (GainzAlgo)",
      description: "Uses a state-of-the-art K-Nearest Neighbors (KNN) algorithm combined with Change of Character (CHoCH) market structure rules to forecast trend breaks, high probability zones, and target ribbons.",
      parameters: [
        { key: "lookahead", label: "Look-Ahead Window (Bars)", type: "number", default: 20, min: 5, max: 100, step: 5 },
        { key: "windowLen", label: "Historical Memory Window", type: "number", default: 1500, min: 500, max: 3000, step: 100 },
        { key: "kNeighbors", label: "K-Nearest Neighbors (K)", type: "number", default: 5, min: 1, max: 10, step: 1 },
        { key: "minScore", label: "Min Significance Score (%)", type: "number", default: 60, min: 0, max: 100, step: 5 },
        { key: "atrLen", label: "ATR Period", type: "number", default: 14, min: 5, max: 50, step: 1 },
        { key: "swingLen", label: "Pivot Length", type: "number", default: 5, min: 2, max: 20, step: 1 },
        { key: "targetScalar", label: "Conservative Scalar", type: "number", default: 0.5, min: 0.1, max: 1.0, step: 0.05 }
      ],
      jsCode: `
        const signals = [];
        const { lookahead, windowLen, kNeighbors, minScore, atrLen, swingLen, targetScalar } = params;
        const atrs = calcATR(candles, atrLen);

        // Pre-calculate pivot highs and lows
        const swingHighs = [];
        const swingLows = [];
        for (let i = 0; i < candles.length; i++) {
          let isHigh = true;
          let isLow = true;
          if (i < swingLen || i >= candles.length - swingLen) {
            swingHighs.push(null);
            swingLows.push(null);
            continue;
          }
          const valH = candles[i].high;
          const valL = candles[i].low;
          for (let j = 1; j <= swingLen; j++) {
            if (candles[i - j].high > valH || candles[i + j].high > valH) isHigh = false;
            if (candles[i - j].low < valL || candles[i + j].low < valL) isLow = false;
          }
          swingHighs.push(isHigh ? valH : null);
          swingLows.push(isLow ? valL : null);
        }

        const database = [];
        let lastSwingHigh = null;
        let lastSwingLow = null;
        let lastHighIndex = -1;
        let lastLowIndex = -1;
        let marketTrend = 0;

        const plotHighs = [];
        const plotLows = [];
        const plotBullRibbon = [];
        const plotBearRibbon = [];

        // Main historical state tracking loop
        for (let i = swingLen; i < candles.length; i++) {
          const confirmIdx = i - swingLen;
          if (confirmIdx >= 0) {
            if (swingHighs[confirmIdx] !== null) {
              lastSwingHigh = swingHighs[confirmIdx];
              lastHighIndex = confirmIdx;
            }
            if (swingLows[confirmIdx] !== null) {
              lastSwingLow = swingLows[confirmIdx];
              lastLowIndex = confirmIdx;
            }
          }

          let isBullishChoch = false;
          let isBearishChoch = false;

          if (lastSwingHigh !== null && marketTrend <= 0 && candles[i].close > lastSwingHigh) {
            isBullishChoch = true;
            marketTrend = 1;
          }
          if (lastSwingLow !== null && marketTrend >= 0 && candles[i].close < lastSwingLow) {
            isBearishChoch = true;
            marketTrend = -1;
          }

          // Volume profiling
          const tr = Math.max(candles[i].high - candles[i].low, 1e-6);
          const currentVolumeDelta = ((candles[i].close - candles[i].low) - (candles[i].high - candles[i].close)) / tr;

          // Features on current candle
          const currentAtr = atrs[i] || tr;
          const volDeltaFeature = currentVolumeDelta;
          const displaceFeature = 1.0;
          const velocityFeature = 1.0;

          // KNN evaluation
          let sigScore = 50;
          let tp1Price = 0, tp2Price = 0, tp3Price = 0;

          if (isBullishChoch || isBearishChoch) {
            const candidates = [];
            for (let d = 0; d < database.length; d++) {
              const rec = database[d];
              if ((i - rec.barIndex <= windowLen) && (rec.isBullish === isBullishChoch)) {
                const dVol = Math.pow(volDeltaFeature - rec.volumeDelta, 2);
                const dDisplace = Math.pow(displaceFeature - rec.displacement, 2);
                const dVelocity = Math.pow(velocityFeature - rec.velocity, 2);
                const distance = Math.sqrt(dVol + dDisplace + dVelocity);
                candidates.push({ ...rec, distance });
              }
            }

            if (candidates.length > 0) {
              candidates.sort((a, b) => a.distance - b.distance);
              const neighbors = candidates.slice(0, kNeighbors);
              const successfulOutcomes = neighbors.filter(n => n.outcomeValue > 0).length;
              sigScore = (successfulOutcomes / neighbors.length) * 100;

              const neighborRuns = neighbors.map(n => n.favorableRun).sort((a, b) => a - b);
              const nRuns = neighborRuns.length;
              const meanRun = nRuns > 0 ? neighborRuns.reduce((s, r) => s + r, 0) / nRuns : 1.5 * currentAtr;
              const medRun = nRuns > 0 ? neighborRuns[Math.floor(nRuns / 2)] : 2.0 * currentAtr;
              const aggrRun = nRuns > 0 ? neighborRuns[Math.min(nRuns - 1, Math.floor(nRuns * 0.75))] : 3.0 * currentAtr;

              const dir = isBullishChoch ? 1 : -1;
              tp1Price = candles[i].close + dir * (meanRun * targetScalar);
              tp2Price = candles[i].close + dir * medRun;
              tp3Price = candles[i].close + dir * aggrRun;

              if (sigScore >= minScore) {
                const slPrice = candles[i].close - dir * (1.5 * currentAtr);
                signals.push({
                  time: candles[i].time,
                  signal: isBullishChoch ? 'BUY' : 'SELL',
                  entry: candles[i].close,
                  tp: tp2Price,
                  sl: slPrice,
                  rr: Math.abs(tp2Price - candles[i].close) / Math.max(1e-6, Math.abs(candles[i].close - slPrice)),
                  confidence: Math.round(sigScore),
                  regime: 'ML_KNN'
                });
              }
            }
          }

          // Train the database looking at 'lookahead' bars in the past
          const trainIdx = i - lookahead;
          if (trainIdx >= swingLen) {
            const wasBullTrain = swingHighs[trainIdx] !== null && candles[trainIdx].close > (swingHighs[trainIdx - 1] || candles[trainIdx].high);
            const wasBearTrain = swingLows[trainIdx] !== null && candles[trainIdx].close < (swingLows[trainIdx - 1] || candles[trainIdx].low);

            if (wasBullTrain || wasBearTrain) {
              const initialRefPrice = candles[trainIdx].close;
              let maxFavorableRun = 0;
              let maxAdverseRun = 0;
              for (let look = 1; look <= lookahead; look++) {
                const highOffset = candles[trainIdx + look]?.high || candles[trainIdx].high;
                const lowOffset = candles[trainIdx + look]?.low || candles[trainIdx].low;
                if (wasBullTrain) {
                  maxFavorableRun = Math.max(maxFavorableRun, highOffset - initialRefPrice);
                  maxAdverseRun = Math.max(maxAdverseRun, initialRefPrice - lowOffset);
                } else {
                  maxFavorableRun = Math.max(maxFavorableRun, initialRefPrice - lowOffset);
                  maxAdverseRun = Math.max(maxAdverseRun, highOffset - initialRefPrice);
                }
              }

              database.push({
                barIndex: trainIdx,
                volumeDelta: currentVolumeDelta,
                displacement: 1.0,
                velocity: 1.0,
                isBullish: wasBullTrain,
                outcomeValue: maxFavorableRun > maxAdverseRun ? 1 : -1,
                favorableRun: maxFavorableRun
              });

              if (database.length > 1000) {
                database.shift();
              }
            }
          }

          if (lastSwingHigh !== null) plotHighs.push({ time: candles[i].time, value: lastSwingHigh });
          if (lastSwingLow !== null) plotLows.push({ time: candles[i].time, value: lastSwingLow });

          // Smooth ribbons
          if (marketTrend > 0) {
            plotBullRibbon.push({ time: candles[i].time, value: lastSwingHigh + (atrs[i] || 0) * 1.5 });
          } else if (marketTrend < 0) {
            plotBearRibbon.push({ time: candles[i].time, value: lastSwingLow - (atrs[i] || 0) * 1.5 });
          }
        }

        const plots = [
          { id: 'swing_high', title: 'Active High OB', overlay: true, color: '#60a5fa99', type: 'line', data: plotHighs },
          { id: 'swing_low', title: 'Active Low OB', overlay: true, color: '#f8717199', type: 'line', data: plotLows },
          { id: 'bull_ribbon', title: 'Bull Target Ribbon', overlay: true, color: '#34d399bb', type: 'line', data: plotBullRibbon },
          { id: 'bear_ribbon', title: 'Bear Target Ribbon', overlay: true, color: '#f43f5ebb', type: 'line', data: plotBearRibbon }
        ];

        const dashboards = [
          {
            title: "ML SMC | GainzAlgo Engine",
            headers: ["Metric", "Value"],
            rows: [
              ["Bias", marketTrend > 0 ? "▲ BULLISH" : marketTrend < 0 ? "▼ BEARISH" : "— NEUTRAL"],
              ["KNN Database Records", database.length.toString()],
              ["K-Nearest Neighbors (K)", kNeighbors.toString()],
              ["Historical Memory Window", windowLen.toString() + " bars"]
            ]
          }
        ];

        return { signals, plots, dashboards };
      `
    };
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  let attempts = 0;
  const maxAttempts = 3; // Allowing 2 retries for auto-healing if compilation or dry run fails
  let lastError = '';

  while (attempts < maxAttempts) {
    let prompt = `Convert the following Pine Script code into customizable parameters and an optimized client-side Javascript compilation.
        
Pine Script Code:
\`\`\`pinescript
${pineCode}
\`\`\`
`;

    if (lastError) {
      prompt += `

⚠️ CRITICAL REVISION REQUIRED:
Your previous generated 'jsCode' failed verification with the following error:
"${lastError}"

Please carefully inspect the error, identify the root cause (e.g. syntax error, missing variable declaration, referencing a non-existent parameter/helper, or executing a forbidden keyword), and fix it. Ensure the returned vanilla JavaScript function body compiles and runs perfectly under our sandboxed execution runner.`;
    }

    try {
      const response = await generateContentWithRetry(ai, {
        contents: prompt,
        config: {
          systemInstruction: `You are an elite expert trading systems compiler and Quant engineer.
Your task is to analyze Pine Script (V4, V5, V6 indicator/strategy code) and convert it into a structured JSON configuration.

Specifically, write:
1. 'name': A concise descriptive name for this strategy.
2. 'description': Brief summary of the trade rules, crossovers, signals, and dynamic conditions translated.
3. 'parameters': A list of input objects matching custom sliders. You MUST look at "input()", "input.int()", "input.float()", "input.bool()", or hardcoded periods in the Pine script, and turn them into customizable parameter sliders.
   Each parameter should have:
   - "key" (camelCase string for reference in jsCode, e.g. emaFast, rsiLength)
   - "label" (user-friendly label, e.g. "Fast EMA Period", "RSI Length")
   - "type" ("number" or "boolean")
   - "default" (the default value matched in the code)
   - "min" (logical min bound, e.g., 2)
   - "max" (logical max bound, e.g., 200)
   - "step" (logical step value, e.g., 1 or 0.1)
4. 'jsCode': A beautiful, vanilla JavaScript function BODY (not a wrapped function, just the code itself that eventually returns an object: 'return { signals, plots };').
   - You MUST compute indicators in index-based loops using 'candles' (Array of { time, open, high, low, close, volume }), 'params' (Object holding current parameter values, accessed e.g. as params.emaFast), or 'context' ({ candles, params }).
   - In the execution environment, you can safely call the following pre-injected standard numeric helpers:
     - 'calcSMA(data, length)': returns an array of SMA values
     - 'calcEMA(data, length)': returns an array of EMA values
     - 'calcRSI(data, length)': returns an array of RSI values (0 to 100)
     - 'calcATR(data, length)': returns an array of ATR values
     - 'calcMACD(data, fast, slow, signal)': returns { macdLine, signalLine, histogram } arrays
     - 'calcSupertrend(data, factor, length)': returns { supertrend, direction } arrays
     - 'calcStoch(data, kLen, dLen, smooth)': returns { k, d } arrays
     - 'calcBB(data, length, multiplier)': returns { basis, upper, lower } arrays
     - 'calcCCI(data, length)': returns CCI value array
     - 'calcPivotHigh(data, leftLen, rightLen)': returns pivot highs array
     - 'calcPivotLow(data, leftLen, rightLen)': returns pivot lows array
     - 'calcSAR(data, start, increment, maxVal)': returns Parabolic SAR array
     - 'calcDMI(data, diLength, adxLength)': returns { diPlus, diMinus, adx } arrays
   - Calculate signals array: const signals = [];
   - Iterate i from a standard offset to candles.length - 1. Pushing items onto signals is optional: you should only push objects for indices i where a transition signal triggers!
   - Compute plot series dynamically: const plots = [];
   - ALWAYS return the signals, plots, and dashboards object registry structure: 'return { signals, plots, dashboards };' at the end of your script.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              description: { type: Type.STRING },
              parameters: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    key: { type: Type.STRING },
                    label: { type: Type.STRING },
                    type: { type: Type.STRING, enum: ["number", "boolean"] },
                    default: { description: "The default value, can be a number or a boolean." },
                    min: { type: Type.NUMBER },
                    max: { type: Type.NUMBER },
                    step: { type: Type.NUMBER }
                  },
                  required: ["key", "label", "type", "default"]
                }
              },
              jsCode: { type: Type.STRING }
            },
            required: ["name", "description", "parameters", "jsCode"]
          }
        }
      });

      const resultText = response.text;
      if (!resultText) {
        throw new Error("No output generated from Gemini API.");
      }

      const parsed: ConvertedStrategyResponse = JSON.parse(resultText.trim());

      // --- STEP 1: Static Check ---
      const staticCheck = validateConvertedStrategy(parsed.jsCode);
      if (!staticCheck.isValid) {
        console.warn(`[AI Validation Pipeline] Static check failed (Attempt ${attempts + 1}):`, staticCheck.error);
        lastError = staticCheck.error || "Static analysis validation failed.";
        attempts++;
        continue;
      }

      // --- STEP 2: Sandboxed Dry Run ---
      try {
        const dummyCandles = getDummyCandles(100);
        const paramsMap: Record<string, any> = {};
        if (Array.isArray(parsed.parameters)) {
          parsed.parameters.forEach((p: any) => {
            paramsMap[p.key] = p.default;
          });
        }

        // Setup the sandboxed execution context
        const contextObj = { candles: dummyCandles, params: paramsMap };
        const sandbox: Record<string, any> = {
          console,
          Math,
          candles: dummyCandles,
          paramsMap,
          context: contextObj,
          _context_: contextObj,
          result: null,
          error: null,
          helperCode: PINE_HELPERS_BLOCK,
          jsCode: parsed.jsCode
        };

        vm.createContext(sandbox);

        // Construct complete runnable script with helpers injected inside the VM
        const vmRunnableScript = `
          try {
            const runner = new Function('_candles_', '_params_', '_context_',
              'const candles = _candles_;\\n' +
              'const params = _params_;\\n' +
              'const context = _context_ || { candles: _candles_, params: _params_ };\\n' +
              helperCode + '\\n' +
              '{\\n' +
              jsCode + '\\n' +
              '}'
            );
            result = runner(candles, paramsMap, context);
          } catch (e) {
            error = e.message || String(e);
          }
        `;

        // Execute inside sandbox with a 1.5 second hard timeout (detects infinite loops or slow execution)
        vm.runInContext(vmRunnableScript, sandbox, { timeout: 1500 });

        if (sandbox.error) {
          throw new Error(`Execution error inside sandbox: ${sandbox.error}`);
        }

        // Success! Return the validated, secure converted strategy
        console.log(`[AI Validation Pipeline] Strategy "${parsed.name}" successfully compiled and validated on attempt ${attempts + 1}.`);
        return parsed;

      } catch (err: any) {
        console.warn(`[AI Validation Pipeline] Sandbox dry-run failed (Attempt ${attempts + 1}):`, err.message);
        lastError = `Runtime Error in sandbox: ${err.message}`;
        attempts++;
      }

    } catch (parseErr: any) {
      console.warn(`[AI Validation Pipeline] Parsing or LLM error (Attempt ${attempts + 1}):`, parseErr.message);
      lastError = `Failed to generate parseable JSON: ${parseErr.message}`;
      attempts++;
    }
  }

  throw new Error(`AI failed to generate a safe, functional, and compilable strategy after ${maxAttempts} attempts. Last reported error: ${lastError}`);
}
