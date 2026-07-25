import { ExchangeFeed, TradeCallback, OrderbookCallback } from './types';
import { BinanceFeed } from './BinanceFeed';
import { HyperliquidFeed } from './HyperliquidFeed';

export class DataFeedManager {
  private static instance: DataFeedManager;
  private binanceFeed: BinanceFeed;
  private hyperliquidFeed: HyperliquidFeed;
  
  // A mapping to know which exchange handles which symbol, or if we want to fallback.
  // We'll use Binance for everything by default, and Hyperliquid/Simulation as fallback if needed.
  // For the sake of this prototype, we'll route popular cryptos to Binance, and everything else to HyperliquidFeed (which handles simulation for non-crypto).

  private constructor() {
    this.binanceFeed = new BinanceFeed();
    this.hyperliquidFeed = new HyperliquidFeed();
  }

  public static getInstance(): DataFeedManager {
    if (!DataFeedManager.instance) {
      DataFeedManager.instance = new DataFeedManager();
    }
    return DataFeedManager.instance;
  }

  /**
   * Determine which feed to use for a given symbol.
   */
  private getFeedForSymbol(symbol: string): ExchangeFeed {
    const cryptoSet = new Set(['BTC','ETH','SOL','XRP','ADA','DOGE','BNB','DOT','LINK','LTC',
      'AVAX','MATIC','UNI','ATOM','NEAR','APT','SUI','INJ','OP','ARB']);
    
    // Route major cryptos to Binance, everything else (Forex/Stocks/Commodities) to HyperliquidFeed (which does the simulated Yahoo polling)
    if (cryptoSet.has(symbol)) {
      return this.binanceFeed;
    }
    return this.hyperliquidFeed;
  }

  public subscribeTrade(symbol: string, callback: TradeCallback): () => void {
    const feed = this.getFeedForSymbol(symbol);
    return feed.subscribeTrade(symbol, callback);
  }

  public subscribeOrderbook(symbol: string, callback: OrderbookCallback): () => void {
    const feed = this.getFeedForSymbol(symbol);
    return feed.subscribeOrderbook(symbol, callback);
  }
}
