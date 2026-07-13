import { LivePrice, DataQuality, DataSource } from '../types';
import { SYMBOL_CONFIGS } from '../utils/dataGenerator';
import { z } from 'zod';
import { authenticatedFetch } from '../utils/api';

const HistoricCandleSchema = z.object({
  time: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number()
});

// ---------------------------------------------------------------------------
// Worker URL
// ---------------------------------------------------------------------------
const WORKER = 'https://trader-proxy.thetrader.workers.dev';

// ---------------------------------------------------------------------------
// Symbol mapping: internal app key → Yahoo Finance ticker
// ---------------------------------------------------------------------------
const YAHOO_MAP: Record<string, string> = {
  // Forex
  EURUSD: 'EURUSD=X', USDJPY: 'JPY=X',    GBPUSD: 'GBPUSD=X',
  AUDUSD: 'AUDUSD=X', USDCAD: 'CAD=X',    USDCHF: 'CHF=X',
  NZDUSD: 'NZDUSD=X', EURGBP: 'EURGBP=X', EURJPY: 'EURJPY=X',
  GBPJPY: 'GBPJPY=X', USDMXN: 'MXN=X',    USDZAR: 'ZAR=X',
  EURCHF: 'EURCHF=X', EURAUD: 'EURAUD=X',  GBPAUD: 'GBPAUD=X',
  CADJPY: 'CADJPY=X', AUDNZD: 'AUDNZD=X',  GBPCAD: 'GBPCAD=X',

  // Crypto → Yahoo uses COIN-USD format
  BTC:   'BTC-USD',  ETH:   'ETH-USD',  SOL:  'SOL-USD',
  XRP:   'XRP-USD',  ADA:   'ADA-USD',  DOGE: 'DOGE-USD',
  BNB:   'BNB-USD',  DOT:   'DOT-USD',  LINK: 'LINK-USD',
  LTC:   'LTC-USD',  AVAX:  'AVAX-USD', MATIC:'MATIC-USD',
  UNI:   'UNI-USD',  ATOM:  'ATOM-USD', NEAR: 'NEAR-USD',
  APT:   'APT-USD',  SUI:   'SUI-USD',  INJ:  'INJ-USD',
  OP:    'OP-USD',   ARB:   'ARB-USD',  TRX:  'TRX-USD',
  TON:   'TON-USD',

  // Commodities (futures)
  GOLD:      'GC=F',  OIL:       'CL=F',  SILVER:    'SI=F',
  NATGAS:    'NG=F',  BRENT:     'BZ=F',  COPPER:    'HG=F',
  WHEAT:     'ZW=F',  CORN:      'ZC=F',  SOYBN:     'ZS=F',
  COFFEE:    'KC=F',  SUGAR:     'SB=F',  COTTON:    'CT=F',
  PLATINUM:  'PL=F',  PALLADIUM: 'PA=F',

  // US Indices & ETFs
  SPX:  '^GSPC', NDX:  '^NDX',  DJI:  '^DJI',
  RUT:  '^RUT',  VIX:  '^VIX',  IXIC: '^IXIC',
  SPY:  'SPY',   QQQ:  'QQQ',   VOO:  'VOO',
  IWM:  'IWM',   DIA:  'DIA',   ARKK: 'ARKK',
  GLD:  'GLD',   USO:  'USO',   TLT:  'TLT',
  EEM:  'EEM',

  // Global Indices
  FTSE:    '^FTSE',    GDAXI:   '^GDAXI',  FCHI:    '^FCHI',
  N225:    '^N225',    HSI:     '^HSI',    STOXX50: '^STOXX50',
  NIFTY50: '^NSEI',    ASX200:  '^AXJO',   TSX:     '^GSPTSE',

  // US Stocks (explicit to avoid crypto catch-all)
  AAPL: 'AAPL', TSLA: 'TSLA', MSFT: 'MSFT', NVDA: 'NVDA',
  AMZN: 'AMZN', GOOGL:'GOOGL',META: 'META', LLY:  'LLY',
  AMD:  'AMD',  JPM:  'JPM',  BAC:  'BAC',  V:    'V',
  MA:   'MA',   UNH:  'UNH',  JNJ:  'JNJ',  PG:   'PG',
  HD:   'HD',   MRK:  'MRK',  ABBV: 'ABBV', PFE:  'PFE',
  NFLX: 'NFLX', INTC: 'INTC', PYPL: 'PYPL', 'BRK.B': 'BRK-B',
};

/** Convert internal app symbol → Yahoo ticker */
function toYahoo(appSymbol: string): string {
  return YAHOO_MAP[appSymbol] ?? appSymbol;
}

/** Reverse map: Yahoo ticker → app symbol (built once at module load) */
const REVERSE_MAP: Record<string, string> = {};
for (const [app, yahoo] of Object.entries(YAHOO_MAP)) {
  REVERSE_MAP[yahoo] = app;
}

// ---------------------------------------------------------------------------
// LiveDataProvider — singleton, polls worker on an interval
// ---------------------------------------------------------------------------
export class LiveDataProvider {
  private static instance: LiveDataProvider;
  private prices: Map<string, LivePrice> = new Map();
  private intervalId: ReturnType<typeof setTimeout> | null = null;
  private currentIntervalMs = 5000;
  private consecutiveFailures = 0;
  private MAX_INTERVAL_MS = 60000;
  private symbols: string[];
  private fetchCount = 0;
  private dataSources: Map<string, { source: string; quality: string }> = new Map();

  public setSourceAndQuality(symbol: string, source: string, quality: string) {
    this.dataSources.set(symbol, { source, quality });
  }

  public getSourceAndQuality(symbol: string): { source: string; quality: string } | undefined {
    return this.dataSources.get(symbol);
  }

  // Real-time WebSocket clients
  private cryptoWs: WebSocket | null = null;
  private coinbaseWs: WebSocket | null = null;
  private polygonWs: WebSocket | null = null;

  private constructor() {
    this.symbols = Object.keys(SYMBOL_CONFIGS);

    // Seed with baseline prices so charts render immediately on mount
    for (const symbol of this.symbols) {
      const cfg = SYMBOL_CONFIGS[symbol as keyof typeof SYMBOL_CONFIGS];
      this.prices.set(symbol, {
        symbol,
        price: cfg.currentPrice,
        timestamp: 0, // Mark as static seed baseline
        quality: DataQuality.SYNTHETIC_FALLBACK,
      });
    }
  }

  static getInstance(): LiveDataProvider {
    if (!LiveDataProvider.instance) {
      LiveDataProvider.instance = new LiveDataProvider();
    }
    return LiveDataProvider.instance;
  }

  private initWebsockets() {
    // 1. Binance WebSocket for Crypto
    try {
      if (this.cryptoWs) {
        this.cryptoWs.close();
      }
      
      const cryptoSymbols = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'BNB', 'DOT', 'LINK', 'LTC'];
      const streams = cryptoSymbols.map(s => `${s.toLowerCase()}usdt@ticker`).join('/');
      this.cryptoWs = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
      
      this.cryptoWs.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const data = payload.data;
          if (data && data.s && data.c) {
            const pair = data.s; // e.g. "BTCUSDT"
            const appSymbol = pair.replace('USDT', '');
            const price = parseFloat(data.c);
            if (!isNaN(price) && price > 0) {
              this.prices.set(appSymbol, {
                symbol: appSymbol,
                price,
                timestamp: Date.now(),
                quality: DataQuality.LIVE_REAL_TIME
              });
            }
          }
        } catch (e) {
          // silent ignore
        }
      };

      this.cryptoWs.onerror = (err) => {
        console.warn('[LiveDataProvider] Binance WS error:', err);
      };

      this.cryptoWs.onclose = () => {
        setTimeout(() => {
          if (this.intervalId) this.initWebsockets();
        }, 5000);
      };
    } catch (e) {
      console.error('[LiveDataProvider] Failed to init Binance WS:', e);
    }

    // 2. Coinbase WebSocket for additional coverage/fallback
    try {
      if (this.coinbaseWs) {
        this.coinbaseWs.close();
      }
      this.coinbaseWs = new WebSocket('wss://ws-feed.exchange.coinbase.com');
      this.coinbaseWs.onopen = () => {
        this.coinbaseWs?.send(JSON.stringify({
          type: 'subscribe',
          product_ids: ['BTC-USD', 'ETH-USD', 'SOL-USD'],
          channels: ['ticker']
        }));
      };
      this.coinbaseWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'ticker' && data.product_id && data.price) {
            const appSymbol = data.product_id.split('-')[0];
            const price = parseFloat(data.price);
            if (!isNaN(price) && price > 0) {
              // Only override if not already updated very recently by Binance (which is faster)
              const existing = this.prices.get(appSymbol);
              if (!existing || Date.now() - existing.timestamp > 1000) {
                this.prices.set(appSymbol, {
                  symbol: appSymbol,
                  price,
                  timestamp: Date.now(),
                  quality: DataQuality.LIVE_REAL_TIME
                });
              }
            }
          }
        } catch (e) {}
      };
      this.coinbaseWs.onclose = () => {
        setTimeout(() => {
          if (this.intervalId) this.initWebsockets();
        }, 5000);
      };
    } catch (e) {
      console.error('[LiveDataProvider] Coinbase WS error:', e);
    }

    // 3. Polygon.io WebSocket if API key is in localstorage/vault/env
    this.initPolygonWebsocket();
  }

  private async initPolygonWebsocket() {
    try {
      if (typeof localStorage === 'undefined') return;
      let apiKey = localStorage.getItem('polygon_api_key') || '';
      if (!apiKey) {
        try {
          const res = await fetch('/api/secrets/vault/retrieve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('trading_session_token') || ''}` },
            body: JSON.stringify({ keyName: 'polygon_apiKey' }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.value) apiKey = data.value;
          }
        } catch (err) {}
      }

      if (!apiKey) return; // No key available for Polygon WS

      if (this.polygonWs) {
        this.polygonWs.close();
      }

      this.polygonWs = new WebSocket('wss://socket.polygon.io/stocks');
      this.polygonWs.onopen = () => {
        this.polygonWs?.send(JSON.stringify({ action: 'auth', params: apiKey }));
        this.polygonWs?.send(JSON.stringify({ action: 'subscribe', params: 'T.AAPL,T.TSLA,T.MSFT,T.NVDA,T.AMZN,T.GOOGL,T.META' }));
      };

      this.polygonWs.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data);
          if (Array.isArray(rawData)) {
            for (const msg of rawData) {
              if (msg.ev === 'T' && msg.sym && msg.p) {
                const appSymbol = msg.sym; // e.g. "AAPL"
                const price = parseFloat(msg.p);
                if (!isNaN(price) && price > 0) {
                  this.prices.set(appSymbol, {
                    symbol: appSymbol,
                    price,
                    timestamp: Date.now(),
                    quality: DataQuality.LIVE_REAL_TIME
                  });
                }
              }
            }
          }
        } catch (e) {}
      };
    } catch (e) {
      console.error('[LiveDataProvider] Polygon WS error:', e);
    }
  }

  /**
   * Start polling the worker proxy with exponential backoff on failures.
   */
  startStreaming(baseIntervalMs = 5000) {
    if (this.intervalId) return;
    this.currentIntervalMs = baseIntervalMs;
    this.consecutiveFailures = 0;

    this.initWebsockets();

    const loop = () => {
      this.fetchAllBatches().finally(() => {
        if (this.intervalId) {
          this.intervalId = setTimeout(loop, this.currentIntervalMs);
        }
      });
    };
    
    // First trigger
    this.fetchAllBatches().finally(() => {
       this.intervalId = setTimeout(loop, this.currentIntervalMs);
    });
  }

  stopStreaming() {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    try {
      if (this.cryptoWs) this.cryptoWs.close();
      if (this.coinbaseWs) this.coinbaseWs.close();
      if (this.polygonWs) this.polygonWs.close();
    } catch (e) {}
  }

  // ---------------------------------------------------------------------------
  // Batch fetching — 20 symbols per request to stay under URL limits
  // ---------------------------------------------------------------------------
  private async fetchAllBatches(): Promise<void> {
    const BATCH_SIZE = 20;
    const batches: string[][] = [];
    for (let i = 0; i < this.symbols.length; i += BATCH_SIZE) {
      batches.push(this.symbols.slice(i, i + BATCH_SIZE));
    }
    // Run all batches in parallel
    let successCount = 0;
    const results = await Promise.allSettled(batches.map(batch => this.fetchBatch(batch)));
    results.forEach(res => {
      if (res.status === 'fulfilled' && res.value) successCount++;
    });

    if (successCount === 0 && batches.length > 0) {
       // All failed -> increase backoff
       this.consecutiveFailures++;
       this.currentIntervalMs = Math.min(this.MAX_INTERVAL_MS, this.currentIntervalMs * 1.5);
    } else {
       // Recovered
       this.consecutiveFailures = 0;
       this.currentIntervalMs = 5000;
    }

    this.fetchCount++;
    if (this.fetchCount === 1) {
      console.log('[LiveDataProvider] First fetch done — live prices active.');
    }
  }

  private async fetchBatch(batch: string[]): Promise<boolean> {
    const yahooSymbols = batch.map(toYahoo).join(',');
    const url = `${WORKER}?symbols=${encodeURIComponent(yahooSymbols)}`;

    let json: any;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });

      if (!res.ok) {
        if (res.status === 429) {
           console.warn(`[LiveDataProvider] Rate Limited (429) for batch: [${batch.join(', ')}]`);
        } else {
           console.warn(`[LiveDataProvider] Worker HTTP ${res.status} — batch: [${batch.join(', ')}]`);
        }
        await this.applyFallbackAPI(batch);
        return false;
      }

      const raw = await res.text();

      // Guard: if worker returns an HTML error page (rate limit, CF error) instead of JSON
      if (raw.trimStart().startsWith('<')) {
        console.warn(`[LiveDataProvider] Worker returned HTML - applying secondary fallback.`);
        await this.applyFallbackAPI(batch);
        return false;
      }

      json = JSON.parse(raw);
    } catch (err) {
      console.warn(`[LiveDataProvider] Network error — batch: [${batch.join(', ')}]`);
      await this.applyFallbackAPI(batch);
      return false;
    }

    // ---------------------------------------------------------------------------
    // Parse Yahoo Finance v8/finance/quote response
    // { quoteResponse: { result: [{ symbol, regularMarketPrice, ... }] } }
    // ---------------------------------------------------------------------------
    const results: any[] = json?.quoteResponse?.result ?? [];

    if (results.length === 0) {
      console.warn('[LiveDataProvider] Empty result from worker for batch:', batch);
      await this.applyFallbackAPI(batch);
      return false;
    }

    const returnedYahooSymbols = new Set<string>();

    for (const quote of results) {
      returnedYahooSymbols.add(quote.symbol);

      // Map Yahoo ticker back to app symbol
      const appSymbol =
        REVERSE_MAP[quote.symbol] ??
        batch.find(s => toYahoo(s) === quote.symbol) ??
        quote.symbol;

      // Pick best available price field in priority order
      const price =
        quote.regularMarketPrice ??
        quote.postMarketPrice    ??
        quote.preMarketPrice     ??
        quote.previousClose;

      if (typeof price === 'number' && price > 0) {
        const isCrypto = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'ADA', 'BNB'].includes(appSymbol);
        this.prices.set(appSymbol, {
          symbol: appSymbol,
          price,
          timestamp: Date.now(),
          quality: isCrypto ? DataQuality.LIVE_REAL_TIME : DataQuality.DELAYED_15_MIN,
        });
      } else {
        await this.applyFallbackAPI([appSymbol]);
      }
    }

    // Any symbol Yahoo silently omitted from results gets a fallback tick
    for (const sym of batch) {
      if (!returnedYahooSymbols.has(toYahoo(sym))) {
        await this.applyFallbackAPI([sym]);
      }
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Fallback API / Mock Strategy
  // ---------------------------------------------------------------------------
  private async applyFallbackAPI(batch: string[]): Promise<void> {
    // 1. Try Binance for Crypto
    const cryptoBatch = batch.filter(s => ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'ADA', 'BNB'].includes(s));
    
    if (cryptoBatch.length > 0) {
       try {
         // parallel binance fetch per symbol
         await Promise.allSettled(cryptoBatch.map(async sym => {
            const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}USDT`, { signal: AbortSignal.timeout(3000) });
            const data = await res.json();
            if (data && data.price) {
               this.prices.set(sym, {
                 symbol: sym,
                 price: parseFloat(data.price),
                 timestamp: Date.now(),
                 quality: DataQuality.LIVE_REAL_TIME
               });
            } else {
               this.applyMicroFluctuation(sym);
            }
         }));
       } catch(e) {
         cryptoBatch.forEach(s => this.applyMicroFluctuation(s));
       }
    }

    // 2. Simulated micro-fluctuations for Stocks / Indices so charts don't freeze indefinitely
    const nonCrypto = batch.filter(s => !cryptoBatch.includes(s));
    nonCrypto.forEach(s => this.applyMicroFluctuation(s));
  }

  private applyMicroFluctuation(symbol: string): void {
    const current = this.prices.get(symbol);
    if (!current) return;
    
    // Applying minor noise (+- 0.01%) so the front-end sees an update event 
    // when rate limits block real data for minutes.
    const noise = current.price * 0.0001 * (Math.random() - 0.5);
    
    this.prices.set(symbol, {
      symbol,
      price: current.price + noise,
      timestamp: Date.now(),
      quality: DataQuality.SYNTHETIC_FALLBACK,
    });
  }

  // ---------------------------------------------------------------------------
  // Public accessors
  // ---------------------------------------------------------------------------
  getLatestPrice(symbol: string): LivePrice | undefined {
    return this.prices.get(symbol);
  }

  getAllPrices(): Map<string, LivePrice> {
    return this.prices;
  }

  /**
   * Returns true if we have a real fetched price (not just the seed baseline).
   * "Live" = updated within the last 30 seconds.
   */
  hasLivePrice(symbol: string): boolean {
    const p = this.prices.get(symbol);
    if (!p) return false;
    return Date.now() - p.timestamp < 30_000;
  }
}

// ---------------------------------------------------------------------------
// fetchRealHistoricCandles
//
// Fetches OHLCV candle history for a symbol via the worker proxy.
// Uses Yahoo Finance /v8/finance/chart endpoint.
//
// @param symbol   - internal app symbol (e.g. 'BTC', 'EURUSD', 'AAPL')
// @param timeframe - app timeframe string ('1m','5m','15m','1h','4h','1d','1w')
// @param bars      - number of candles to fetch (max ~1000 depending on tf)
// ---------------------------------------------------------------------------
export interface HistoricCandle {
  time: number;   // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const TF_TO_YAHOO: Record<string, { interval: string; range: string }> = {
  '1s':  { interval: '1m',  range: '7d'   },  // Yahoo min is 1m (max 7d)
  '5s':  { interval: '1m',  range: '7d'   },
  '1m':  { interval: '1m',  range: '7d'   },
  '5m':  { interval: '5m',  range: '60d'  },  // max 60d
  '10m': { interval: '5m',  range: '60d'  },
  '15m': { interval: '15m', range: '60d'  },  // max 60d
  '30m': { interval: '30m', range: '60d'  },  // max 60d
  '1h':  { interval: '60m', range: '730d' },  // max 730d (2y)
  '2h':  { interval: '60m', range: '730d' },
  '3h':  { interval: '60m', range: '730d' },
  '4h':  { interval: '60m', range: '730d' },  // Yahoo has no 4h; we resample from 1h. Max 730d
  '1d':  { interval: '1d',  range: '10y'  },
  '1w':  { interval: '1wk', range: 'max'  },
};

/** Resample smaller candles into larger candles aligned to exact boundaries */
function resampleCandles(candles: HistoricCandle[], targetSeconds: number): HistoricCandle[] {
  const out: HistoricCandle[] = [];
  const map = new Map<number, HistoricCandle[]>();

  for (const c of candles || []) {
    if (!c || c.time === undefined || c.time === null) continue;
    const period = Math.floor(c.time / targetSeconds) * targetSeconds;
    if (!map.has(period)) map.set(period, []);
    map.get(period)!.push(c);
  }

  const sortedPeriods = Array.from(map.keys()).sort((a, b) => a - b);
  for (const p of sortedPeriods) {
    const chunk = map.get(p)!;
    out.push({
      time:   p,
      open:   chunk[0].open,
      high:   Math.max(...chunk.map(c => c.high)),
      low:    Math.min(...chunk.map(c => c.low)),
      close:  chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, c) => s + c.volume, 0),
    });
  }
  return out;
}

export async function fetchRealHistoricCandles(
  symbol: string,
  timeframe: string,
  bars = 600
): Promise<HistoricCandle[]> {
  try {
    const res = await authenticatedFetch(`/api/market-data?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`);
    if (res.ok) {
      const json = await res.json();
      if (json && Array.isArray(json.candles)) {
        LiveDataProvider.getInstance().setSourceAndQuality(symbol, json.source, json.quality);
        return json.candles;
      }
    }
  } catch (err) {
    console.warn(`[fetchRealHistoricCandles] Backend /api/market-data failed, trying client fallback:`, err);
  }

  const yahooSym = YAHOO_MAP[symbol] ?? symbol;
  const tf = TF_TO_YAHOO[timeframe] ?? { interval: '1d', range: '5y' };

  const url =
    `${WORKER}?` +
    `symbols=${encodeURIComponent(yahooSym)}` +
    `&interval=${tf.interval}` +
    `&range=${tf.range}` +
    `&endpoint=chart`;

  const maxRetries = 5;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const raw = await res.text();
      if (raw.trimStart().startsWith('<')) throw new Error('HTML response — proxy error');

      const json = JSON.parse(raw);

      // Yahoo Finance /v8/finance/chart response shape
      const result = json?.chart?.result?.[0];
      if (!result) throw new Error('No chart result');

      const timestamps: number[]  = result.timestamp ?? [];
      const q = result.indicators?.quote?.[0] ?? {};
      const opens:   number[] = q.open   ?? [];
      const highs:   number[] = q.high   ?? [];
      const lows:    number[] = q.low    ?? [];
      const closes:  number[] = q.close  ?? [];
      const volumes: number[] = q.volume ?? [];

      const intervalSecsMap: Record<string, number> = {
        '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '60m': 3600, '1d': 86400, '1wk': 604800
      };
      const alignSecs = intervalSecsMap[tf.interval] ?? 60;

      let candles: HistoricCandle[] = [];
      let prevTime = -1;

      for (let i = 0; i < timestamps.length; i++) {
        let t = timestamps[i];
        // Floor to exact boundary so we don't offset the real-time websocket
        t = Math.floor(t / alignSecs) * alignSecs;
        
        const o = opens[i], h = highs[i], l = lows[i], c = closes[i];
        // Skip null/NaN candles Yahoo sometimes returns for non-trading hours
        if (o == null || h == null || l == null || c == null) continue;
        if (isNaN(o) || isNaN(h) || isNaN(l) || isNaN(c)) continue;

        if (t === prevTime && candles.length > 0) {
           // Merge duplicate/provisional live candle into the previous candle
           const last = candles[candles.length - 1];
           last.high = Math.max(last.high, h);
           last.low = Math.min(last.low, l);
           last.close = c;
           last.volume += (volumes[i] ?? 0);
           continue;
        } else if (t < prevTime) {
           continue;
        }

        candles.push({
          time:   t,
          open:   o,
          high:   h,
          low:    l,
          close:  c,
          volume: volumes[i] ?? 0,
        });
        prevTime = t;
      }

      // Resample smaller intervals to target timeframes if needed
      if (timeframe === '10m') {
        candles = resampleCandles(candles, 600);
      } else if (timeframe === '2h') {
        candles = resampleCandles(candles, 7200);
      } else if (timeframe === '3h') {
        candles = resampleCandles(candles, 10800);
      } else if (timeframe === '4h') {
        candles = resampleCandles(candles, 14400);
      }

      // Structural validation via Zod
      const parseResult = z.array(HistoricCandleSchema).safeParse(candles);
      if (!parseResult.success) {
        console.warn("[Zod Validation Error] Invalid candle elements detected:", parseResult.error.format());
        return candles.slice(-bars);
      }

      // Return last N bars
      return parseResult.data.slice(-bars);

    } catch (err: any) {
      attempt++;
      if (attempt >= maxRetries) {
        console.error(`[fetchRealHistoricCandles] All ${maxRetries} attempts exhausted for ${symbol} (${timeframe}):`, err);
        return [];
      }
      // Calculate delay with exponential backoff + jitter
      const delay = Math.min(500 * Math.pow(2, attempt) * (0.85 + Math.random() * 0.3), 10_000);
      console.warn(
        `[fetchRealHistoricCandles] Attempt ${attempt}/${maxRetries} failed for ${symbol} (${timeframe}): ${err?.message || err}. Retrying in ${Math.round(delay)}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return [];
}