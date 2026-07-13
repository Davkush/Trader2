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
   - You MUST compute indicators in index-based loops using 'candles' (Array of { time, open, high, low, close, volume }) and 'params' (Object holding current parameter values, accessed e.g. as params.emaFast).
   - In the global context of execution, you can safely call the following pre-injected standard numeric helpers:
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
   - ALWAYS return the signals, plots, and dashboards object registry structure: 'return { signals, plots, dashboards };' at the end of your script context.`,
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
        const sandbox: Record<string, any> = {
          console,
          Math,
          candles: dummyCandles,
          paramsMap,
          result: null,
          error: null
        };

        vm.createContext(sandbox);

        // Construct complete runnable script with helpers injected inside the VM
        const vmRunnableScript = `
          try {
            ${PINE_HELPERS_BLOCK}
            
            const runner = new Function('candles', 'params', \`${parsed.jsCode.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`);
            result = runner(candles, paramsMap);
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
