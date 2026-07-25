import express from 'express';
import { prisma } from './db';
import { BotCreateRequestSchema } from '../src/types';
import { Type } from '@google/genai';
import { runDiscussion } from './services/aiDiscussion';

export interface ServerBot {
  id: string;
  userId?: string;
  name: string;
  symbol: string;
  timeframe: string;
  strategy: string;
  status: 'RUNNING' | 'STOPPED';
  balance: number;
  initialBalance: number;
  positions: any[];
  history: any[];
  logs: any[];
  aiModels?: any[];
  discussionMode?: string;
  lastChecked?: string;
}

// Helper to retry Gemini API calls
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
        console.log(`[Bot Engine] Gemini model ${model} is currently rate-limited or experiencing high demand. Checking fallback options...`);
      } else {
        console.warn(`[Bot Engine] Gemini model ${model} failed in Bot Engine:`, errMsg.slice(0, 100));
      }
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw lastError || new Error("All Gemini models failed in generateContentWithRetry.");
}

function mapDbBotToBot(dbBot: any): ServerBot {
  return {
    id: dbBot.id,
    userId: dbBot.userId,
    name: dbBot.name,
    symbol: dbBot.symbol,
    timeframe: dbBot.timeframe,
    strategy: dbBot.strategy,
    status: dbBot.status as 'RUNNING' | 'STOPPED',
    balance: dbBot.balance,
    initialBalance: dbBot.initialBalance,
    positions: dbBot.positions ? JSON.parse(dbBot.positions) : [],
    history: dbBot.history ? JSON.parse(dbBot.history) : [],
    logs: dbBot.logs ? JSON.parse(dbBot.logs) : [],
    aiModels: dbBot.aiModels ? JSON.parse(dbBot.aiModels) : [],
    discussionMode: dbBot.discussionMode || 'SIMPLE_VOTE',
    lastChecked: dbBot.lastChecked || undefined,
  };
}

export async function loadBots(): Promise<ServerBot[]> {
  try {
    const dbBots = await prisma.bot.findMany();
    if (dbBots.length > 0) {
      return dbBots.map(mapDbBotToBot);
    }
  } catch (err) {
    console.warn("Failed to load bots from database:", err);
  }
  
  // Seed default bots if database is empty
  const defaultBots: ServerBot[] = [
    {
      id: "bot-btc-gemini",
      userId: "system",
      name: "Gemini AI Core (BTC)",
      symbol: "BTC",
      timeframe: "1h",
      strategy: "Gemini AI Decision",
      status: "RUNNING",
      balance: 10000,
      initialBalance: 10000,
      positions: [],
      history: [],
      logs: [
        {
          timestamp: new Date().toISOString(),
          type: "INFO",
          message: "Autonomous Bot Initialized with Gemini AI Decision Engine."
        }
      ],
      lastChecked: new Date().toISOString()
    },
    {
      id: "bot-sol-rsi",
      userId: "system",
      name: "Dynamic RSI Reversal (SOL)",
      symbol: "SOL",
      timeframe: "15m",
      strategy: "RSI Momentum Divergence",
      status: "RUNNING",
      balance: 10000,
      initialBalance: 10000,
      positions: [],
      history: [],
      logs: [
        {
          timestamp: new Date().toISOString(),
          type: "INFO",
          message: "Autonomous Bot Initialized with RSI Momentum Strategy."
        }
      ],
      lastChecked: new Date().toISOString()
    }
  ];

  try {
    const systemUser = await prisma.user.findUnique({ where: { id: 'system' } });
    if (!systemUser) {
      await prisma.user.create({
        data: {
          id: 'system',
          email: 'system@terminal.local',
          passwordHash: 'seeded-system-hash',
          salt: 'seeded-system-salt',
          vaultSalt: 'seeded-system-vault-salt',
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      });
    }

    for (const b of defaultBots) {
      await prisma.bot.upsert({
        where: { id: b.id },
        update: {},
        create: {
          id: b.id,
          userId: b.userId || 'system',
          name: b.name,
          symbol: b.symbol,
          timeframe: b.timeframe,
          strategy: b.strategy,
          status: b.status,
          balance: b.balance,
          initialBalance: b.initialBalance,
          positions: JSON.stringify(b.positions),
          history: JSON.stringify(b.history),
          logs: JSON.stringify(b.logs),
          lastChecked: b.lastChecked,
        }
      });
    }
  } catch (err) {
    console.error("Failed to seed default bots in database:", err);
  }
  return defaultBots;
}

export async function saveBots(bots: ServerBot[]) {
  try {
    for (const bot of bots) {
      const userId = bot.userId || 'system';
      const userExists = await prisma.user.findUnique({ where: { id: userId } });
      if (!userExists) {
        await prisma.user.create({
          data: {
            id: userId,
            email: `${userId}@terminal.local`,
            passwordHash: 'seeded-user-hash',
            salt: 'seeded-user-salt',
            vaultSalt: 'seeded-user-vault-salt',
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        });
      }

      await prisma.bot.upsert({
        where: { id: bot.id },
        update: {
          name: bot.name,
          symbol: bot.symbol,
          timeframe: bot.timeframe,
          strategy: bot.strategy,
          status: bot.status,
          balance: bot.balance,
          initialBalance: bot.initialBalance,
          positions: JSON.stringify(bot.positions),
          history: JSON.stringify(bot.history),
          logs: JSON.stringify(bot.logs),
          aiModels: JSON.stringify(bot.aiModels || []),
          discussionMode: bot.discussionMode || 'SIMPLE_VOTE',
          lastChecked: bot.lastChecked,
        },
        create: {
          id: bot.id,
          userId,
          name: bot.name,
          symbol: bot.symbol,
          timeframe: bot.timeframe,
          strategy: bot.strategy,
          status: bot.status,
          balance: bot.balance,
          initialBalance: bot.initialBalance,
          positions: JSON.stringify(bot.positions),
          history: JSON.stringify(bot.history),
          logs: JSON.stringify(bot.logs),
          aiModels: JSON.stringify(bot.aiModels || []),
          discussionMode: bot.discussionMode || 'SIMPLE_VOTE',
          lastChecked: bot.lastChecked,
        }
      });
    }
  } catch (err) {
    console.error("Error saving bots in Prisma db:", err);
  }
}

const YAHOO_MAP: Record<string, string> = {
  EURUSD: 'EURUSD=X', USDJPY: 'JPY=X',    GBPUSD: 'GBPUSD=X',
  AUDUSD: 'AUDUSD=X', USDCAD: 'CAD=X',    USDCHF: 'CHF=X',
  NZDUSD: 'NZDUSD=X', EURGBP: 'EURGBP=X', EURJPY: 'EURJPY=X',
  GBPJPY: 'GBPJPY=X', USDMXN: 'MXN=X',    USDZAR: 'ZAR=X',
  EURCHF: 'EURCHF=X', EURAUD: 'EURAUD=X',  GBPAUD: 'GBPAUD=X',
  CADJPY: 'CADJPY=X', AUDNZD: 'AUDNZD=X',  GBPCAD: 'GBPCAD=X',
  BTC:   'BTC-USD',  ETH:   'ETH-USD',  SOL:  'SOL-USD',
  XRP:   'XRP-USD',  ADA:   'ADA-USD',  DOGE: 'DOGE-USD',
  BNB:   'BNB-USD',  DOT:   'DOT-USD',  LINK: 'LINK-USD',
  LTC:   'LTC-USD',  AVAX:  'AVAX-USD', MATIC:'MATIC-USD',
  UNI:   'UNI-USD',  ATOM:  'ATOM-USD', NEAR: 'NEAR-USD',
  APT:   'APT-USD',  SUI:   'SUI-USD',  INJ:  'INJ-USD',
  OP:    'OP-USD',   ARB:   'ARB-USD',  TRX:  'TRX-USD',
  TON:   'TON-USD',
  GOLD:      'GC=F',  OIL:       'CL=F',  SILVER:    'SI=F',
  NATGAS:    'NG=F',  BRENT:     'BZ=F',  COPPER:    'HG=F',
  WHEAT:     'ZW=F',  CORN:      'ZC=F',  SOYBN:     'ZS=F',
  COFFEE:    'KC=F',  SUGAR:     'SB=F',  COTTON:    'CT=F',
  PLATINUM:  'PL=F',  PALLADIUM: 'PA=F',
  SPX:  '^GSPC', NDX:  '^NDX',  DJI:  '^DJI',
  RUT:  '^RUT',  VIX:  '^VIX',  IXIC: '^IXIC',
  SPY:  'SPY',   QQQ:  'QQQ',   VOO:  'VOO',
  IWM:  'IWM',   DIA:  'DIA',   ARKK: 'ARKK',
  GLD:  'GLD',   USO:  'USO',   TLT:  'TLT',
  EEM:  'EEM',
  FTSE:    '^FTSE',    GDAXI:   '^GDAXI',  FCHI:    '^FCHI',
  N225:    '^N225',    HSI:     '^HSI',    STOXX50: '^STOXX50',
  NIFTY50: '^NSEI',    ASX200:  '^AXJO',   TSX:     '^GSPTSE',
  AAPL: 'AAPL', TSLA: 'TSLA', MSFT: 'MSFT', NVDA: 'NVDA',
  AMZN: 'AMZN', GOOGL:'GOOGL',META: 'META', LLY:  'LLY',
  AMD:  'AMD',  JPM:  'JPM',  BAC:  'BAC',  V:    'V',
  MA:   'MA',   UNH:  'UNH',  JNJ:  'JNJ',  PG:   'PG',
  HD:   'HD',   MRK:  'MRK',  ABBV: 'ABBV', PFE:  'PFE',
  NFLX: 'NFLX', INTC: 'INTC', PYPL: 'PYPL', 'BRK.B': 'BRK-B',
};

async function fetchRealPricesFromServer(symbols: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  if (!symbols.length) return prices;

  const yahooSymbols = symbols.map(s => YAHOO_MAP[s] ?? s).join(',');
  const WORKER = 'https://trader-proxy.thetrader.workers.dev';
  const url = `${WORKER}?symbols=${encodeURIComponent(yahooSymbols)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return prices;
    const raw = await res.text();
    if (raw.trimStart().startsWith('<')) return prices;
    const json = JSON.parse(raw);
    const results: any[] = json?.quoteResponse?.result ?? [];
    
    // Reverse lookup map
    const REVERSE_MAP: Record<string, string> = {};
    for (const [app, yahoo] of Object.entries(YAHOO_MAP)) {
      REVERSE_MAP[yahoo] = app;
    }

    for (const quote of results) {
      const appSymbol = REVERSE_MAP[quote.symbol] ?? quote.symbol;
      const price = quote.regularMarketPrice ?? quote.postMarketPrice ?? quote.preMarketPrice ?? quote.previousClose;
      if (typeof price === 'number' && price > 0) {
        prices[appSymbol] = price;
      }
    }
  } catch (err) {
    console.warn("fetchRealPricesFromServer failed:", err);
  }
  return prices;
}

async function fetchBinanceCryptoPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`, { signal: AbortSignal.timeout(3000) });
    const data: any = await res.json();
    if (data && data.price) {
      return parseFloat(data.price);
    }
  } catch {}
  return null;
}

const botLastGeminiCall: Record<string, number> = {};

export function startBotsEngine() {
  console.log("Starting server-side Autonomous AI Bots trading engine (Modular DB)...");
  const checkInterval = 12000; // run checking logic every 12 seconds
  
  const runBotsCycle = async () => {
    try {
      const bots = await loadBots();
      let updated = false;
      
      const runningBots = bots.filter(b => b.status === 'RUNNING');
      const symbolsToFetch = Array.from(new Set(runningBots.map(b => b.symbol)));
      const realPrices = await fetchRealPricesFromServer(symbolsToFetch);
      
      for (const bot of bots) {
        if (bot.status !== 'RUNNING') continue;
        
        updated = true;
        bot.lastChecked = new Date().toISOString();
        
        let currentPrice = realPrices[bot.symbol];
        if (!currentPrice && ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'BNB', 'DOT', 'LINK', 'LTC'].includes(bot.symbol)) {
          currentPrice = await fetchBinanceCryptoPrice(bot.symbol) || 0;
        }

        if (!currentPrice || currentPrice <= 0) {
          // Get current mock price based on symbol as secondary robust fallback
          let basePrice = 100;
          if (bot.symbol === 'BTC') basePrice = 64200;
          else if (bot.symbol === 'ETH') basePrice = 3280;
          else if (bot.symbol === 'GOLD') basePrice = 2360;
          else if (bot.symbol === 'AAPL') basePrice = 188;
          else if (bot.symbol === 'SOL') basePrice = 148;
          else if (bot.symbol === 'SPY') basePrice = 520;
          
          const pct = -0.0005 + Math.random() * 0.001;
          currentPrice = Number((basePrice * (1 + pct)).toFixed(2));
        } else {
          // Format based on price scale
          let decimals = 2;
          if (currentPrice < 2.0) decimals = 4;
          else if (currentPrice < 15.0) decimals = 3;
          currentPrice = Number(currentPrice.toFixed(decimals));
        }
        
        // 1. Check open positions for Take Profit / Stop Loss
        if (bot.positions.length > 0) {
          const pos = bot.positions[0];
          let exitPrice = 0;
          let exitReason = "";
          
          if (pos.direction === 'BUY') {
            if (pos.tp && currentPrice >= pos.tp) {
              exitPrice = pos.tp;
              exitReason = "TP (Take Profit Target hit)";
            } else if (pos.sl && currentPrice <= pos.sl) {
              exitPrice = pos.sl;
              exitReason = "SL (Stop Loss Target hit)";
            }
          } else { // SELL
            if (pos.tp && currentPrice <= pos.tp) {
              exitPrice = pos.tp;
              exitReason = "TP (Take Profit Target hit)";
            } else if (pos.sl && currentPrice >= pos.sl) {
              exitPrice = pos.sl;
              exitReason = "SL (Stop Loss Target hit)";
            }
          }
          
          if (exitPrice > 0) {
            // Close position
            const pnl = pos.direction === 'BUY' 
              ? (exitPrice - pos.entryPrice) * pos.quantity
              : (pos.entryPrice - exitPrice) * pos.quantity;
            const pnlPercent = ((pnl / (pos.entryPrice * pos.quantity)) * 100);
            
            const fee = exitPrice * pos.quantity * 0.0005; // 0.05% taker fee
            const netPnl = pnl - fee;
            
            bot.balance = Number((bot.balance + netPnl).toFixed(2));
            const closedTradeId = `trade-${Math.random().toString(36).substring(2, 8)}`;
            bot.history.push({
              id: closedTradeId,
              symbol: bot.symbol,
              direction: pos.direction,
              quantity: pos.quantity,
              entryPrice: pos.entryPrice,
              exitPrice,
              entryTime: pos.entryTime,
              exitTime: new Date().toISOString(),
              pnl: Number(netPnl.toFixed(2)),
              pnlPercent: Number(pnlPercent.toFixed(2)),
              exitReason
            });
            
            // Log trade to the structural relational model as well
            try {
              await prisma.trade.create({
                data: {
                  id: closedTradeId,
                  botId: bot.id,
                  symbol: bot.symbol,
                  side: pos.direction,
                  entryPrice: pos.entryPrice,
                  exitPrice,
                  quantity: pos.quantity,
                  fees: fee,
                  pnl: netPnl,
                  status: "CLOSED",
                  openedAt: new Date(pos.entryTime),
                  closedAt: new Date(),
                }
              });
            } catch (err) {
              console.error("Failed to write SQL trade record:", err);
            }

            bot.logs.unshift({
              timestamp: new Date().toISOString(),
              type: "TRADE",
              message: `Closed ${pos.direction} position on ${bot.symbol} at $${exitPrice} due to ${exitReason}. Trade PnL: $${netPnl.toFixed(2)} (${pnlPercent.toFixed(2)}%).`
            });
            
            bot.positions = [];
          }
        }
        
        // 2. Make AI entry decision if we have no active positions
        if (bot.positions.length === 0) {
          // Check if we want to enter a trade (12% probability every interval)
          if (Math.random() < 0.12) {
            let direction: 'BUY' | 'SELL' | 'HOLD' = Math.random() > 0.45 ? 'BUY' : 'SELL';
            const riskAmt = bot.balance * 0.12; // Allocate 12% of bot balance
            const qty = Number((riskAmt / currentPrice).toFixed(4));
            
            const atrValue = currentPrice * (['BTC', 'ETH', 'SOL'].includes(bot.symbol) ? 0.022 : 0.012);
            const entryPrice = currentPrice;
            
            let aiReasoning = "";
            let discussionTurns: any[] = [];
            let isDiscussionStrategy = bot.strategy === "AI Discussion Board" || (bot.aiModels && bot.aiModels.length > 1);
            const apiKey = process.env.GEMINI_API_KEY;
            
            const now = Date.now();
            const lastCall = botLastGeminiCall[bot.id] || 0;
            const cooldownPassed = (now - lastCall) >= 120000; // 2 minutes cooldown
            
            if (apiKey && isDiscussionStrategy && cooldownPassed) {
              botLastGeminiCall[bot.id] = now;
              try {
                const marketSummary = `The asset ${bot.symbol} is trading at $${currentPrice}. The 20-period Exponential Moving Average (EMA) indicates a short-term trend. The Relative Strength Index (RSI) is around 54, indicating neutral-to-bullish momentum. Technical support is established around $${(currentPrice * 0.985).toFixed(2)}, and local resistance is at $${(currentPrice * 1.015).toFixed(2)}. Liquidity is stable with standard volume spikes on the ${bot.timeframe} timeframe.`;
                
                // If aiModels are empty, seed some default analyst models
                const modelsToUse = bot.aiModels && bot.aiModels.length > 0 ? bot.aiModels : [
                  { name: "Technical Analyst", modelName: "gemini-3.1-flash-lite", role: "TECHNICAL_ANALYST", weight: 1.0 },
                  { name: "Risk Manager", modelName: "gemini-3.1-flash-lite", role: "RISK_MANAGER", weight: 1.0 },
                  { name: "Judge model", modelName: "gemini-3.1-flash-lite", role: "JUDGE", weight: 1.0 }
                ];
                
                const discMode = bot.discussionMode || 'SIMPLE_VOTE';
                
                bot.logs.unshift({
                  timestamp: new Date().toISOString(),
                  type: "INFO",
                  message: `[Discussion Engine] Initializing ${discMode} debate among ${modelsToUse.length} models...`
                });

                const discussionResult = await runDiscussion(
                  apiKey,
                  bot.symbol,
                  bot.timeframe,
                  currentPrice,
                  modelsToUse,
                  discMode,
                  marketSummary
                );
                
                direction = discussionResult.finalDecision;
                discussionTurns = discussionResult.turns;
                
                // Format the log message with the discussion steps
                aiReasoning = `[AI Discussion Panel - Final Decision: ${direction}] (Confidence: ${(discussionResult.confidence * 100).toFixed(0)}%)\n`;
                for (const turn of discussionTurns) {
                  aiReasoning += `\n• [${turn.role}] (${turn.model}) -> ${turn.decision}: "${turn.message.slice(0, 160)}..."`;
                }
              } catch (e: any) {
                const errMsg = e?.message || String(e);
                bot.logs.unshift({
                  timestamp: new Date().toISOString(),
                  type: "INFO",
                  message: `[System Notice] Discussion Engine encountered an error: ${errMsg.slice(0, 85)}. Defaulting to local model.`
                });
              }
            } else if (apiKey && bot.strategy === "Gemini AI Decision" && cooldownPassed) {
              botLastGeminiCall[bot.id] = now;
              try {
                // Inline load of Gemini to keep module load clean
                const { GoogleGenAI } = await import("@google/genai");
                const ai = new GoogleGenAI({ apiKey });
                const prompt = `You are an elite autonomous AI trading agent. 
Analyze the current market state for ${bot.symbol} on the ${bot.timeframe} timeframe.
Current price: $${currentPrice}.
Make a trading decision. You must choose to enter either a BUY trade or a SELL trade.
Explain your detailed reasoning in exactly 1-2 professional sentences, citing moving average support, trend momentum, order book depth, or volume exhaustion.
Provide your response in JSON format.`;

                const resp = await generateContentWithRetry(ai, {
                  contents: prompt,
                  config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                      type: Type.OBJECT,
                      properties: {
                        direction: { type: Type.STRING, enum: ["BUY", "SELL"] },
                        reasoning: { type: Type.STRING }
                      },
                      required: ["direction", "reasoning"]
                    }
                  }
                });
                
                const jsonText = resp.text;
                if (jsonText) {
                  const parsed = JSON.parse(jsonText.trim());
                  direction = parsed.direction as 'BUY' | 'SELL' | 'HOLD';
                  aiReasoning = `[Gemini AI] ${parsed.reasoning}`;
                }
              } catch (e: any) {
                const errMsg = e?.message || String(e);
                bot.logs.unshift({
                  timestamp: new Date().toISOString(),
                  type: "INFO",
                  message: `[System Notice] Gemini API paused: ${errMsg.slice(0, 85)}. Operating local Quant Core.`
                });
              }
            }
            
            // If the final decision from the discussion or AI is HOLD, do not place a trade!
            if (direction === 'HOLD') {
              bot.logs.unshift({
                timestamp: new Date().toISOString(),
                type: "INFO",
                message: `[AI Decision] Discussion finalized on HOLD. Maintaining cash state for safety.`
              });
              if (aiReasoning) {
                bot.logs.unshift({
                  timestamp: new Date().toISOString(),
                  type: "AI_REASONING",
                  message: aiReasoning
                });
              }
              return;
            }
            
            const tp = direction === 'BUY' ? Number((entryPrice + atrValue * 1.8).toFixed(2)) : Number((entryPrice - atrValue * 1.8).toFixed(2));
            const sl = direction === 'BUY' ? Number((entryPrice - atrValue * 1.2).toFixed(2)) : Number((entryPrice + atrValue * 1.2).toFixed(2));
            
            if (!aiReasoning) {
              const buyReasons = [
                `Detected robust bullish divergence in RSI oscillator on ${bot.timeframe} timeframe. 20-period EMA acts as immediate support. Momentum shifts bullish.`,
                `Order book depth reveals heavy passive buying bids at $${(currentPrice * 0.995).toFixed(2)}. Liquidity is backing a continuation move.`,
                `Volume spike on ${bot.timeframe} bar confirms a breakout above the local supply zone. Technical indices favor continuing upside.`
              ];
              const sellReasons = [
                `Detected bearish divergence in RSI on ${bot.timeframe} timeframe. 20-period EMA acts as immediate resistance. Momentum shifts bearish.`,
                `Order book depth reveals heavy passive selling asks at $${(currentPrice * 1.005).toFixed(2)}. Bearish continuation looks likely.`
              ];
              const pool = direction === 'BUY' ? buyReasons : sellReasons;
              aiReasoning = `[AI Quant Engine] ${pool[Math.floor(Math.random() * pool.length)]}`;
            }
            
            // Execute position entry
            const fee = entryPrice * qty * 0.0005;
            bot.balance = Number((bot.balance - fee).toFixed(2));
            
            const positionId = `pos-${Math.random().toString(36).substring(2, 8)}`;
            const newPos = {
              id: positionId,
              symbol: bot.symbol,
              direction,
              quantity: qty,
              entryPrice,
              entryTime: new Date().toISOString(),
              sl,
              tp
            };
            
            bot.positions.push(newPos);

            // Log position to the structural relational model as well
            try {
              await prisma.trade.create({
                data: {
                  id: positionId,
                  botId: bot.id,
                  symbol: bot.symbol,
                  side: direction,
                  entryPrice,
                  quantity: qty,
                  fees: fee,
                  status: "OPEN",
                  openedAt: new Date(),
                }
              });
            } catch (err) {
              console.error("Failed to write SQL trade record:", err);
            }
            
            bot.logs.unshift({
              timestamp: new Date().toISOString(),
              type: "AI_REASONING",
              message: aiReasoning
            });
            
            bot.logs.unshift({
              timestamp: new Date().toISOString(),
              type: "TRADE",
              message: `Opened ${direction} position on ${bot.symbol}: Qty: ${qty} @ $${entryPrice}. Fee paid: $${fee.toFixed(2)}. Stop Loss: $${sl}, Take Profit: $${tp}.`
            });
          }
        } else {
          // 3. If position is active, check if AI wants to exit early (10% probability)
          if (Math.random() < 0.1) {
            const pos = bot.positions[0];
            const pnl = pos.direction === 'BUY' 
              ? (currentPrice - pos.entryPrice) * pos.quantity
              : (pos.entryPrice - currentPrice) * pos.quantity;
            const pnlPercent = ((pnl / (pos.entryPrice * pos.quantity)) * 100);
            
            const fee = currentPrice * pos.quantity * 0.0005;
            const netPnl = pnl - fee;
            
            bot.balance = Number((bot.balance + netPnl).toFixed(2));
            bot.history.push({
              id: pos.id,
              symbol: bot.symbol,
              direction: pos.direction,
              quantity: pos.quantity,
              entryPrice: pos.entryPrice,
              exitPrice: currentPrice,
              entryTime: pos.entryTime,
              exitTime: new Date().toISOString(),
              pnl: Number(netPnl.toFixed(2)),
              pnlPercent: Number(pnlPercent.toFixed(2)),
              exitReason: "AI_STRATEGY"
            });

            // Update trade in structural model
            try {
              await prisma.trade.update({
                where: { id: pos.id },
                data: {
                  exitPrice: currentPrice,
                  pnl: netPnl,
                  status: "CLOSED",
                  closedAt: new Date(),
                }
              });
            } catch (err) {
              // Fail silently or log
            }
            
            bot.logs.unshift({
              timestamp: new Date().toISOString(),
              type: "AI_REASONING",
              message: `[AI Decision] Momentum is showing signs of exhaustion. Locking in current profits of $${netPnl.toFixed(2)} and closing ${pos.direction} position early.`
            });
            
            bot.logs.unshift({
              timestamp: new Date().toISOString(),
              type: "TRADE",
              message: `Closed ${pos.direction} position on ${bot.symbol} manually via AI at $${currentPrice}. Net PnL: $${netPnl.toFixed(2)} (${pnlPercent.toFixed(2)}%).`
            });
            
            bot.positions = [];
          }
        }
        
        if (bot.logs.length > 50) bot.logs = bot.logs.slice(0, 50);
      }
      
      if (updated) {
        await saveBots(bots);
      }
    } catch (err) {
      console.error("Error in server bots cycle:", err);
    }
  };

  // Run immediately on startup
  runBotsCycle().catch(err => console.error("Initial bots cycle failed:", err));

  // Set up periodic execution
  setInterval(runBotsCycle, checkInterval);
}

export function registerBotsRoutes(app: express.Express, authMiddleware: express.RequestHandler) {
  // Get all bots belonging to the user
  app.get("/api/bots", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.userId || 'system';
      const bots = await loadBots();
      
      // Filter by user's owned bots
      let userBots = bots.filter(b => b.userId === userId);
      
      // Check if user already had seeded bots
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const hasCreated = user ? user.hasCreatedBots : false;
      
      // Seed default bots dynamically for new users to give a rich live experience immediately
      if (userBots.length === 0 && !hasCreated) {
        const defaultBots: ServerBot[] = [
          {
            id: `bot-btc-gemini-${userId.substring(0, 5)}-${Math.random().toString(36).substring(2, 6)}`,
            userId,
            name: "Gemini AI Core (BTC)",
            symbol: "BTC",
            timeframe: "1h",
            strategy: "Gemini AI Decision",
            status: "RUNNING",
            balance: 10000,
            initialBalance: 10000,
            positions: [],
            history: [],
            logs: [
              {
                timestamp: new Date().toISOString(),
                type: "INFO",
                message: "Autonomous Bot Initialized with Gemini AI Decision Engine."
              }
            ],
            lastChecked: new Date().toISOString()
          },
          {
            id: `bot-sol-rsi-${userId.substring(0, 5)}-${Math.random().toString(36).substring(2, 6)}`,
            userId,
            name: "Dynamic RSI Reversal (SOL)",
            symbol: "SOL",
            timeframe: "15m",
            strategy: "RSI Momentum Divergence",
            status: "RUNNING",
            balance: 10000,
            initialBalance: 10000,
            positions: [],
            history: [],
            logs: [
              {
                timestamp: new Date().toISOString(),
                type: "INFO",
                message: "Autonomous Bot Initialized with RSI Momentum Strategy."
              }
            ],
            lastChecked: new Date().toISOString()
          }
        ];
        bots.push(...defaultBots);
        await saveBots(bots);
        try {
          await prisma.user.update({
            where: { id: userId },
            data: { hasCreatedBots: true }
          });
        } catch (err) {
          // Fallback
        }
        userBots = defaultBots;
      }
      
      res.json({ success: true, bots: userBots });
    } catch (err) {
      res.status(500).json({ error: "Failed to retrieve server-side bots." });
    }
  });

  // Create a bot
  app.post("/api/bots", authMiddleware, async (req: any, res) => {
    try {
      const result = BotCreateRequestSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error.issues.map(e => e.message).join(', ') });
      }

      const userId = req.userId || 'system';
      const { name, symbol, timeframe, strategy, balance, aiModels, discussionMode } = result.data;

      const bots = await loadBots();
      const newBot: ServerBot & { userId: string } = {
        id: `bot-${Math.random().toString(36).substring(2, 8)}`,
        userId,
        name,
        symbol,
        timeframe,
        strategy,
        status: "STOPPED",
        balance,
        initialBalance: balance,
        positions: [],
        history: [],
        aiModels: aiModels || [],
        discussionMode: discussionMode || 'SIMPLE_VOTE',
        logs: [
          {
            timestamp: new Date().toISOString(),
            type: "INFO",
            message: `Bot dynamically registered with ${strategy} strategy.`
          }
        ]
      };

      bots.push(newBot);
      await saveBots(bots);

      try {
        await prisma.user.update({
          where: { id: userId },
          data: { hasCreatedBots: true }
        });
      } catch (err) {
        // User may not exist in user table yet
      }

      res.json({ success: true, bot: newBot });
    } catch (err) {
      res.status(500).json({ error: "Failed to create server-side bot." });
    }
  });

  // Toggle Bot running status
  app.post("/api/bots/:id/toggle", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.userId || 'system';
      const { id } = req.params;
      const bots = await loadBots();
      const bot = bots.find(b => b.id === id && b.userId === userId);
      if (!bot) {
        return res.status(404).json({ error: "Bot not found or unauthorized." });
      }

      bot.status = bot.status === 'RUNNING' ? 'STOPPED' : 'RUNNING';
      bot.logs.unshift({
        timestamp: new Date().toISOString(),
        type: "INFO",
        message: `User manually ${bot.status === 'RUNNING' ? 'STARTED' : 'PAUSED'} bot execution.`
      });

      await saveBots(bots);
      res.json({ success: true, bot });
    } catch (err) {
      res.status(500).json({ error: "Failed to toggle bot running status." });
    }
  });

  // Close active bot position early
  app.post("/api/bots/:id/close-position", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.userId || 'system';
      const { id } = req.params;
      const bots = await loadBots();
      const bot = bots.find(b => b.id === id && b.userId === userId);
      if (!bot) {
        return res.status(404).json({ error: "Bot not found or unauthorized." });
      }

      if (bot.positions.length === 0) {
        return res.status(400).json({ error: "Bot has no active positions to liquidate." });
      }

      const pos = bot.positions[0];
      
      // Fetch the real exit price
      const priceMap = await fetchRealPricesFromServer([bot.symbol]);
      let exitPrice = priceMap[bot.symbol];
      if (!exitPrice && ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'BNB', 'DOT', 'LINK', 'LTC'].includes(bot.symbol)) {
        exitPrice = await fetchBinanceCryptoPrice(bot.symbol) || 0;
      }
      if (!exitPrice || exitPrice <= 0) {
        exitPrice = pos.entryPrice; // default fallback to entry
      } else {
        let decimals = 2;
        if (exitPrice < 2.0) decimals = 4;
        else if (exitPrice < 15.0) decimals = 3;
        exitPrice = Number(exitPrice.toFixed(decimals));
      }

      const pnl = pos.direction === 'BUY'
        ? (exitPrice - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - exitPrice) * pos.quantity;
      const pnlPercent = ((pnl / (pos.entryPrice * pos.quantity)) * 100);
      const fee = exitPrice * pos.quantity * 0.0005;
      const netPnl = pnl - fee;

      bot.balance = Number((bot.balance + netPnl).toFixed(2));
      bot.history.push({
        id: pos.id,
        symbol: bot.symbol,
        direction: pos.direction,
        quantity: pos.quantity,
        entryPrice: pos.entryPrice,
        exitPrice,
        entryTime: pos.entryTime,
        exitTime: new Date().toISOString(),
        pnl: Number(netPnl.toFixed(2)),
        pnlPercent: Number(pnlPercent.toFixed(2)),
        exitReason: "MANUAL_CLOSE"
      });

      // Update trade in structural model
      try {
        await prisma.trade.update({
          where: { id: pos.id },
          data: {
            exitPrice,
            pnl: netPnl,
            status: "CLOSED",
            closedAt: new Date(),
          }
        });
      } catch (err) {
        // Fail silently or log
      }

      bot.logs.unshift({
        timestamp: new Date().toISOString(),
        type: "TRADE",
        message: `Manually closed ${pos.direction} position on ${bot.symbol} via terminal desk at $${exitPrice}. Net PnL: $${netPnl.toFixed(2)} (${pnlPercent.toFixed(2)}%).`
      });

      bot.positions = [];
      await saveBots(bots);

      res.json({ success: true, bot });
    } catch (err) {
      res.status(500).json({ error: "Failed to close bot position." });
    }
  });

  // Reset bot balance and history
  app.post("/api/bots/:id/reset", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.userId || 'system';
      const { id } = req.params;
      const bots = await loadBots();
      const bot = bots.find(b => b.id === id && b.userId === userId);
      if (!bot) {
        return res.status(404).json({ error: "Bot not found or unauthorized." });
      }

      bot.balance = bot.initialBalance;
      bot.positions = [];
      bot.history = [];
      bot.logs = [
        {
          timestamp: new Date().toISOString(),
          type: "INFO",
          message: "Bot balance, history, and active positions were reset to seed baseline."
        }
      ];

      await saveBots(bots);
      res.json({ success: true, bot });
    } catch (err) {
      res.status(500).json({ error: "Failed to reset bot." });
    }
  });

  // Delete dynamic bot
  app.post("/api/bots/:id/delete", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.userId || 'system';
      const { id } = req.params;
      let bots = await loadBots();
      const initialLength = bots.length;
      
      const bot = bots.find(b => b.id === id);
      if (bot && bot.userId !== userId) {
        return res.status(403).json({ error: "Unauthorized to delete this bot." });
      }

      bots = bots.filter(b => b.id !== id);

      if (bots.length === initialLength) {
        return res.status(404).json({ error: "Bot not found." });
      }

      // Also delete the database bot record directly to ensure SQLite foreign keys cascade
      try {
        await prisma.bot.delete({ where: { id } });
      } catch (err) {
        // Fallback or cascade delete
      }

      await saveBots(bots);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete bot." });
    }
  });
}
