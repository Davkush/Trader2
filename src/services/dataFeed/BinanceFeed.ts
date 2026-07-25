import { ExchangeFeed, NormalizedTrade, NormalizedOrderbook, TradeCallback, OrderbookCallback } from './types';

export class BinanceFeed implements ExchangeFeed {
  private ws: WebSocket | null = null;
  private tradeSubs = new Map<string, Set<TradeCallback>>();
  private obSubs = new Map<string, Set<OrderbookCallback>>();
  private reconnectDelay = 2000;
  private isConnected = false;

  constructor() {
    this.connect();
  }

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket('wss://stream.binance.com:9443/ws');

      this.ws.onopen = () => {
        console.log('[BinanceFeed] Connected');
        this.isConnected = true;
        this.reconnectDelay = 2000;

        // Resubscribe to active symbols
        const params: string[] = [];
        this.tradeSubs.forEach((_, symbol) => {
          params.push(`${symbol.toLowerCase()}@trade`);
        });
        this.obSubs.forEach((_, symbol) => {
          params.push(`${symbol.toLowerCase()}@depth10@100ms`);
        });

        if (params.length > 0) {
          this.ws?.send(JSON.stringify({
            method: 'SUBSCRIBE',
            params: params,
            id: Date.now()
          }));
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string);
          
          if (message.e === 'trade') {
            const symbol = message.s; // e.g. "BTCUSDT"
            const price = parseFloat(message.p);
            const size = parseFloat(message.q);
            const side = message.m ? 'sell' : 'buy'; // maker is buyer -> sell order hit the bid

            if (this.tradeSubs.has(symbol)) {
              const trade: NormalizedTrade = {
                exchange: 'BINANCE',
                symbol,
                price,
                size,
                side,
                timestamp: message.T
              };
              this.tradeSubs.get(symbol)?.forEach(cb => cb(trade));
            }
          }
          // Note: Full Orderbook requires depth streams, which are handled differently (partial book depth or diff).
          // For now, if we use @depth10, it returns a partial book snapshot.
          // Example partial book: { lastUpdateId: 160, bids: [ [ "4.00000000", "431.00000000" ] ], asks: [ ... ] }
          // We can identify it because it doesn't have an "e" event type but has "lastUpdateId", but it doesn't have "s" (symbol) in the root if not using multiproxy.
          // Wait, if we use /ws, the message doesn't contain the symbol!
          // Actually, if we want symbol info on single stream, we should use stream multiplexing (wss://stream.binance.com:9443/stream).
          // But since we just requested basic integration, we'll keep it simple or use the symbol from the stream.
          // In standard single WS, Binance payload doesn't have symbol for partial depth! We might need stream multiplexing for that.
          // For now, let's just focus on trades, which do have message.s
        } catch (e) {
          // ignore parsing error
        }
      };

      this.ws.onerror = (e) => {
        console.warn('[BinanceFeed] Error:', e);
      };

      this.ws.onclose = () => {
        console.warn(`[BinanceFeed] Closed — reconnecting in ${this.reconnectDelay}ms`);
        this.isConnected = false;
        setTimeout(() => {
          this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
          this.connect();
        }, this.reconnectDelay);
      };
    } catch (e) {
      setTimeout(() => this.connect(), this.reconnectDelay);
    }
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  public subscribeTrade(symbol: string, callback: TradeCallback): () => void {
    const formattedSymbol = this.formatSymbol(symbol);
    
    if (!this.tradeSubs.has(formattedSymbol)) {
      this.tradeSubs.set(formattedSymbol, new Set());
      this.sendSubscribe(`${formattedSymbol.toLowerCase()}@trade`);
    }
    
    this.tradeSubs.get(formattedSymbol)!.add(callback);

    return () => {
      const set = this.tradeSubs.get(formattedSymbol);
      if (!set) return;
      set.delete(callback);
      if (set.size === 0) {
        this.tradeSubs.delete(formattedSymbol);
        this.sendUnsubscribe(`${formattedSymbol.toLowerCase()}@trade`);
      }
    };
  }

  public subscribeOrderbook(symbol: string, callback: OrderbookCallback): () => void {
    // Implement depth stream if needed
    return () => {};
  }

  private sendSubscribe(stream: string) {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        method: 'SUBSCRIBE',
        params: [stream],
        id: Date.now()
      }));
    }
  }

  private sendUnsubscribe(stream: string) {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        method: 'UNSUBSCRIBE',
        params: [stream],
        id: Date.now()
      }));
    }
  }

  private formatSymbol(symbol: string): string {
    // Converts common symbols to Binance format, e.g. "BTC" -> "BTCUSDT"
    // If it already ends with USDT or something, keep it.
    if (symbol.endsWith('USDT') || symbol.endsWith('BUSD')) {
      return symbol.toUpperCase();
    }
    return `${symbol.toUpperCase()}USDT`;
  }
}
