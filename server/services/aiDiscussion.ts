import { GoogleGenAI, Type } from '@google/genai';

export interface DiscussionTurn {
  model: string;
  role: string;
  message: string;
  decision?: 'BUY' | 'SELL' | 'HOLD';
}

export interface DiscussionResult {
  finalDecision: 'BUY' | 'SELL' | 'HOLD';
  turns: DiscussionTurn[];
  confidence: number;
}

// Simple voter logic
export function simpleVote(
  decisions: Record<string, 'BUY' | 'SELL' | 'HOLD'>,
  models: any[]
): { finalDecision: 'BUY' | 'SELL' | 'HOLD'; confidence: number } {
  const votes = { BUY: 0, SELL: 0, HOLD: 0 };
  let totalWeight = 0;

  for (const model of models) {
    const decision = decisions[model.name] || 'HOLD';
    const weight = model.weight || 1.0;
    votes[decision] += weight;
    totalWeight += weight;
  }

  let finalDecision: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  if (votes.BUY > votes.SELL && votes.BUY > votes.HOLD) {
    finalDecision = 'BUY';
  } else if (votes.SELL > votes.BUY && votes.SELL > votes.HOLD) {
    finalDecision = 'SELL';
  }

  return {
    finalDecision,
    confidence: totalWeight > 0 ? (Math.max(votes.BUY, votes.SELL, votes.HOLD) / totalWeight) : 0,
  };
}

// Combined call helper to route to either OpenRouter or Gemini
async function callModel(
  geminiApiKey: string,
  modelName: string,
  prompt: string,
  jsonSchema?: any
): Promise<{ text: string }> {
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;
  const isGeminiModel = modelName.startsWith("gemini-") || modelName.startsWith("models/gemini-") || modelName === "google/gemini-pro-1.5";

  if (openrouterApiKey && (!isGeminiModel || modelName.includes("/"))) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openrouterApiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ai.studio/build",
          "X-Title": "AI Studio Quant App",
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: "user", content: prompt }],
          response_format: jsonSchema ? { type: "json_object" } : undefined
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.choices && data.choices[0]) {
          return { text: data.choices[0].message.content || "" };
        }
      } else {
        const text = await response.text();
        console.warn(`[AI Discussion] OpenRouter for ${modelName} returned status ${response.status}: ${text}`);
      }
    } catch (err) {
      console.error(`[AI Discussion] Error calling OpenRouter for ${modelName}:`, err);
    }
  }

  // Fallback or Direct Gemini call
  const actualGeminiModel = isGeminiModel 
    ? (modelName.startsWith("models/") ? modelName : modelName === "google/gemini-pro-1.5" ? "gemini-3.1-pro-preview" : modelName)
    : "gemini-3.1-flash-lite"; // Default fallback model

  const modelsToTry = [actualGeminiModel];
  if (actualGeminiModel === "gemini-3.5-flash") {
    modelsToTry.push("gemini-3.1-flash-lite");
  } else if (actualGeminiModel === "gemini-3.1-flash-lite") {
    modelsToTry.push("gemini-3.5-flash");
  } else if (actualGeminiModel !== "gemini-3.1-flash-lite") {
    modelsToTry.push("gemini-3.1-flash-lite");
  }

  const ai = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  let lastError: any = null;
  for (const modelToUse of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: modelToUse,
        contents: prompt,
        config: jsonSchema ? {
          responseMimeType: "application/json",
          responseSchema: jsonSchema
        } : undefined
      });
      return { text: response.text || "" };
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || String(err);
      const isQuotaOrDemand = errMsg.includes("429") || errMsg.includes("503") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("UNAVAILABLE");
      if (isQuotaOrDemand) {
        console.log(`[AI Discussion Status] Gemini engine ${modelToUse} is handling heavy request volume. Transitioning to alternative engine...`);
      } else {
        console.log(`[AI Discussion Status] Custom engine ${modelToUse} update. Transitioning to alternative engine...`);
      }
      // Give a tiny breather before trying the fallback
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  throw lastError || new Error(`All Gemini models failed in callModel.`);
}

export async function runDiscussion(
  apiKey: string,
  symbol: string,
  timeframe: string,
  currentPrice: number,
  aiModels: any[],
  discussionMode: string,
  marketDataSummary: string
): Promise<DiscussionResult> {
  const turns: DiscussionTurn[] = [];
  const decisions: Record<string, 'BUY' | 'SELL' | 'HOLD'> = {};

  // 1. Each model produces an initial opinion based on their specific role and the provided market context
  for (const modelConfig of aiModels) {
    const rolePrompt = buildRolePrompt(modelConfig.role, symbol, timeframe, currentPrice, marketDataSummary);
    const targetModel = modelConfig.modelName || 'gemini-3.1-flash-lite';

    try {
      const response = await callModel(
        apiKey,
        targetModel,
        rolePrompt,
        {
          type: Type.OBJECT,
          properties: {
            decision: { type: Type.STRING, enum: ["BUY", "SELL", "HOLD"] },
            reasoning: { type: Type.STRING }
          },
          required: ["decision", "reasoning"]
        }
      );

      const text = response.text;
      let decision: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let reasoning = 'No response generated.';

      if (text) {
        try {
          const parsed = JSON.parse(text.trim());
          decision = (parsed.decision || parsed.synthesizedDecision || parsed.finalDecision || 'HOLD') as 'BUY' | 'SELL' | 'HOLD';
          reasoning = parsed.reasoning || text;
        } catch {
          if (text.includes('"BUY"') || text.includes('BUY')) decision = 'BUY';
          else if (text.includes('"SELL"') || text.includes('SELL')) decision = 'SELL';
          reasoning = text;
        }
      }

      decisions[modelConfig.name] = decision;
      turns.push({
        model: targetModel,
        role: modelConfig.role,
        message: reasoning,
        decision,
      });

    } catch (e: any) {
      console.error(`[AI Discussion] opinion phase failed for model ${modelConfig.name} (${targetModel}):`, e.message || e);
      turns.push({
        model: targetModel,
        role: modelConfig.role,
        message: `Analysis execution failed: ${e.message || String(e)}`,
        decision: 'HOLD',
      });
      decisions[modelConfig.name] = 'HOLD';
    }
  }

  // 2. Process based on Mode
  if (discussionMode === 'SIMPLE_VOTE' || !discussionMode) {
    const voteResult = simpleVote(decisions, aiModels);
    return {
      finalDecision: voteResult.finalDecision,
      turns,
      confidence: voteResult.confidence,
    };
  }

  if (discussionMode === 'JUDGE') {
    // Find designated JUDGE model, or use first one
    const judgeConfig = aiModels.find(m => m.role === 'JUDGE') || aiModels[0];
    const judgeModel = judgeConfig.modelName || 'gemini-3.1-flash-lite';
    const judgePrompt = `You are the ultimate Arbitrator and Judge model.
You must review the individual, differing, or aligned arguments of our quantitative market models:

${turns.map(t => `- [${t.role}] (${t.model}) decided to: ${t.decision}\n  Argument: ${t.message}`).join('\n\n')}

Current Market State for ${symbol} at $${currentPrice}:
${marketDataSummary}

Please weigh all arguments carefully, evaluate their validity, resolve conflict, and make the absolute final, professional trading decision (BUY, SELL, or HOLD).
Provide your response in JSON format.`;

    try {
      const response = await callModel(
        apiKey,
        judgeModel,
        judgePrompt,
        {
          type: Type.OBJECT,
          properties: {
            finalDecision: { type: Type.STRING, enum: ["BUY", "SELL", "HOLD"] },
            reasoning: { type: Type.STRING }
          },
          required: ["finalDecision", "reasoning"]
        }
      );

      const text = response.text;
      let finalDecision: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let judgeReasoning = '';

      if (text) {
        try {
          const parsed = JSON.parse(text.trim());
          finalDecision = (parsed.finalDecision || parsed.decision || 'HOLD') as 'BUY' | 'SELL' | 'HOLD';
          judgeReasoning = parsed.reasoning || text;
        } catch {
          if (text.includes('"BUY"') || text.includes('BUY')) finalDecision = 'BUY';
          else if (text.includes('"SELL"') || text.includes('SELL')) finalDecision = 'SELL';
          judgeReasoning = text;
        }
      }

      turns.push({
        model: judgeModel,
        role: 'JUDGE_SUMMATION',
        message: judgeReasoning,
        decision: finalDecision,
      });

      return {
        finalDecision,
        turns,
        confidence: 0.95,
      };
    } catch (e: any) {
      console.error("[AI Discussion] Judge mode finalization failed, falling back to simple vote:", e);
      const voteResult = simpleVote(decisions, aiModels);
      return {
        finalDecision: voteResult.finalDecision,
        turns,
        confidence: voteResult.confidence,
      };
    }
  }

  if (discussionMode === 'DISCUSSION') {
    // Multi-turn discussion: the last model (acting as moderator) reviews opinions, responds, and makes a synthesized final decision
    const moderatorModel = aiModels[aiModels.length - 1];
    const moderatorModelName = moderatorModel.modelName || 'gemini-3.1-flash-lite';
    const discussionPrompt = `You are the lead moderator model of the AI Discussion Board.
Review the previous round of arguments by our specialists:

${turns.map(t => `- [${t.role}] decided: ${t.decision}\n  Reasoning: ${t.message}`).join('\n\n')}

Your goal is to lead the discussion to consensus or make a final decision by summarizing the synthesis.
Provide your final, synthesized decision in JSON format.`;

    try {
      const response = await callModel(
        apiKey,
        moderatorModelName,
        discussionPrompt,
        {
          type: Type.OBJECT,
          properties: {
            synthesizedDecision: { type: Type.STRING, enum: ["BUY", "SELL", "HOLD"] },
            reasoning: { type: Type.STRING }
          },
          required: ["synthesizedDecision", "reasoning"]
        }
      );

      const text = response.text;
      let finalDecision: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let synthesis = '';

      if (text) {
        try {
          const parsed = JSON.parse(text.trim());
          finalDecision = (parsed.synthesizedDecision || parsed.decision || 'HOLD') as 'BUY' | 'SELL' | 'HOLD';
          synthesis = parsed.reasoning || text;
        } catch {
          if (text.includes('"BUY"') || text.includes('BUY')) finalDecision = 'BUY';
          else if (text.includes('"SELL"') || text.includes('SELL')) finalDecision = 'SELL';
          synthesis = text;
        }
      }

      turns.push({
        model: moderatorModelName,
        role: 'DISCUSSION_SYNTHESIS',
        message: synthesis,
        decision: finalDecision,
      });

      return {
        finalDecision,
        turns,
        confidence: 0.90,
      };
    } catch (e: any) {
      console.error("[AI Discussion] Multi-turn discussion failed, falling back to simple vote:", e);
      const voteResult = simpleVote(decisions, aiModels);
      return {
        finalDecision: voteResult.finalDecision,
        turns,
        confidence: voteResult.confidence,
      };
    }
  }

  // Fallback to simple vote
  const voteResult = simpleVote(decisions, aiModels);
  return {
    finalDecision: voteResult.finalDecision,
    turns,
    confidence: voteResult.confidence,
  };
}

function buildRolePrompt(
  role: string,
  symbol: string,
  timeframe: string,
  currentPrice: number,
  marketDataSummary: string
): string {
  let instructions = '';
  switch (role) {
    case 'TECHNICAL_ANALYST':
      instructions = `You are a TECHNICAL ANALYST.
Your sole job is to analyze the technical indicators, support/resistance levels, moving average crossovers, and price actions.
Do NOT consider macroeconomic indicators or news. Focus entirely on technical chart factors.`;
      break;
    case 'FUNDAMENTAL_ANALYST':
      instructions = `You are a FUNDAMENTAL ANALYST.
Your job is to analyze macroeconomic conditions, tokenomics, news sentiment, order flow depth, and structural demand.
Ignore short-term minor technical noise. Look at the larger fundamental trend.`;
      break;
    case 'RISK_MANAGER':
      instructions = `You are a RISK MANAGER.
Your job is to prioritize capital preservation. Analyze current volatility levels, potential stop-loss risk, and make a conservative decision.
Only approve BUY or SELL if market conditions show an excellent risk-to-reward ratio. Otherwise, favor holding (HOLD).`;
      break;
    case 'JUDGE':
      instructions = `You are a market JUDGE and generalist advisor.
Analyze the indicators, trend strength, and general market momentum to form your own initial objective stance.`;
      break;
    default:
      instructions = `You are a quantitative trading system model. Formulate an objective trading decision based on market inputs.`;
  }

  return `${instructions}

Current Market State:
- Instrument: ${symbol}
- Timeframe: ${timeframe}
- Current Price: $${currentPrice}

Market Summary / Indicators:
${marketDataSummary}

Decide whether to execute a BUY, SELL, or HOLD.
Provide your response in JSON format with "decision" ("BUY", "SELL", or "HOLD") and "reasoning".`;
}
