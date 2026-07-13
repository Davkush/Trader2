import { fetchBinanceData } from './binance';
import { fetchPolygonData } from './polygon';
import { generateHistoricCandles } from '../../../src/utils/dataGenerator';
import { CandleData, DataSource, DataQuality } from '../../../src/types';

export interface MarketDataResponse {
  candles: CandleData[];
  source: DataSource;
  quality: DataQuality;
}

export function isCrypto(symbol: string): boolean {
  const sym = symbol.toUpperCase();
  const cryptoSymbols = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'BNB', 'DOT', 'LINK', 'LTC', 'AVAX', 'MATIC', 'UNI', 'ATOM', 'NEAR', 'APT', 'SUI', 'INJ', 'OP', 'ARB'];
  return cryptoSymbols.includes(sym) || sym.includes('USDT') || sym.includes('BTC') || sym.includes('ETH');
}

// Map timeframe to Yahoo parameters as in liveData.ts
const TF_TO_YAHOO: Record<string, { interval: string; range: string }> = {
  '1s':  { interval: '1m',  range: '7d'   },
  '5s':  { interval: '1m',  range: '7d'   },
  '1m':  { interval: '1m',  range: '7d'   },
  '5m':  { interval: '5m',  range: '60d'  },
  '10m': { interval: '5m',  range: '60d'  },
  '15m': { interval: '15m', range: '60d'  },
  '30m': { interval: '30m', range: '60d'  },
  '1h':  { interval: '60m', range: '730d' },
  '2h':  { interval: '60m', range: '730d' },
  '3h':  { interval: '60m', range: '730d' },
  '4h':  { interval: '60m', range: '730d' },
  '1d':  { interval: '1d',  range: '10y'  },
  '1w':  { interval: '1wk', range: 'max'  },
};

const YAHOO_MAP: Record<string, string> = {
  EURUSD: 'EURUSD=X', USDJPY: 'JPY=X',    GBPUSD: 'GBPUSD=X',
  AUDUSD: 'AUDUSD=X', USDCAD: 'CAD=X',    USDCHF: 'CHF=X',
  NZDUSD: 'NZDUSD=X', EURGBP: 'EURGBP=X', EURJPY: 'EURJPY=X',
  GBPJPY: 'GBPJPY=X', GOLD: 'GC=F', OIL: 'CL=F', SILVER: 'SI=F',
  NATGAS: 'NG=F', BRENT: 'BZ=F', COPPER: 'HG=F',
  WHEAT: 'ZW=F', CORN: 'ZC=F', SOYBN: 'ZS=F', COFFEE: 'KC=F',
  SPX: '^GSPC', IXIC: '^IXIC', DJI: '^DJI', SPY: 'SPY', QQQ: 'QQQ',
  VOO: 'VOO', IWM: 'IWM', DIA: 'DIA', ARKK: 'ARKK', GLD: 'GLD',
  USO: 'USO', TLT: 'TLT', EEM: 'EEM', FTSE: '^FTSE', GDAXI: '^GDAXI',
  FCHI: '^FCHI', N225: '^N225', HSI: '^HSI', STOXX50: '^STOXX50',
  NIFTY50: '^NSEI', AAPL: 'AAPL', TSLA: 'TSLA', MSFT: 'MSFT',
  NVDA: 'NVDA', AMZN: 'AMZN', GOOGL: 'GOOGL', META: 'META', LLY: 'LLY',
  AMD: 'AMD', 'BRK.B': 'BRK-B'
};

async function fetchYahooData(symbol: string, timeframe: string, limit = 600): Promise<CandleData[]> {
  const yahooSym = YAHOO_MAP[symbol] ?? symbol;
  const tf = TF_TO_YAHOO[timeframe] ?? { interval: '1d', range: '5y' };
  const url = `https://trader-proxy.thetrader.workers.dev?symbols=${encodeURIComponent(yahooSym)}&interval=${tf.interval}&range=${tf.range}&endpoint=chart`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Yahoo Proxy returned HTTP ${response.status}`);
  const json = await response.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('No chart result in Yahoo response');

  const timestamps: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const opens: number[] = q.open ?? [];
  const highs: number[] = q.high ?? [];
  const lows: number[] = q.low ?? [];
  const closes: number[] = q.close ?? [];
  const volumes: number[] = q.volume ?? [];

  const candles: CandleData[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    const o = opens[i], h = highs[i], l = lows[i], c = closes[i];
    if (o == null || h == null || l == null || c == null) continue;
    candles.push({
      time: t,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: volumes[i] ?? 0
    });
  }
  return candles.slice(-limit);
}

export async function getMarketData(symbol: string, timeframe: string): Promise<MarketDataResponse> {
  if (isCrypto(symbol)) {
    try {
      const data = await fetchBinanceData(symbol, timeframe);
      return { candles: data, source: DataSource.BINANCE, quality: DataQuality.LIVE_REAL_TIME };
    } catch (e) {
      console.warn(`[MarketData] Binance fetch failed for ${symbol}, trying Yahoo fallback:`, e);
      try {
        const data = await fetchYahooData(symbol, timeframe);
        return { candles: data, source: DataSource.YAHOO, quality: DataQuality.DELAYED_15_MIN };
      } catch (yErr) {
        console.warn(`[MarketData] Yahoo fallback failed for ${symbol}, using synthetic:`, yErr);
        const data = generateHistoricCandles(symbol, timeframe, 600);
        return { candles: data, source: DataSource.SYNTHETIC, quality: DataQuality.SYNTHETIC_FALLBACK };
      }
    }
  } else {
    // Stocks / Indices / Forex / Commodities
    const hasPolygonKey = !!process.env.POLYGON_API_KEY;
    if (hasPolygonKey) {
      try {
        const data = await fetchPolygonData(symbol, timeframe);
        return { candles: data, source: DataSource.POLYGON, quality: DataQuality.DELAYED_15_MIN };
      } catch (e) {
        console.warn(`[MarketData] Polygon fetch failed for ${symbol}, trying Yahoo fallback:`, e);
      }
    }

    try {
      const data = await fetchYahooData(symbol, timeframe);
      return { candles: data, source: DataSource.YAHOO, quality: DataQuality.DELAYED_15_MIN };
    } catch (e) {
      console.warn(`[MarketData] Yahoo fetch failed for stock ${symbol}, using synthetic:`, e);
      const data = generateHistoricCandles(symbol, timeframe, 600);
      return { candles: data, source: DataSource.SYNTHETIC, quality: DataQuality.SYNTHETIC_FALLBACK };
    }
  }
}
