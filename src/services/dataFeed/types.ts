export interface NormalizedTrade {
  exchange: string;
  symbol: string;
  price: number;
  size?: number;
  side?: 'buy' | 'sell';
  timestamp: number;
}

export interface NormalizedOrderbook {
  exchange: string;
  symbol: string;
  bids: [number, number][]; // [price, size]
  asks: [number, number][]; // [price, size]
  timestamp: number;
}

export type TradeCallback = (trade: NormalizedTrade) => void;
export type OrderbookCallback = (orderbook: NormalizedOrderbook) => void;

export interface ExchangeFeed {
  connect(): void;
  disconnect(): void;
  subscribeTrade(symbol: string, callback: TradeCallback): () => void;
  subscribeOrderbook(symbol: string, callback: OrderbookCallback): () => void;
}
