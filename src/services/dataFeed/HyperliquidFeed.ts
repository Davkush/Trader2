import { ExchangeFeed, NormalizedTrade, NormalizedOrderbook, TradeCallback, OrderbookCallback } from './types';
import { LiveDataProvider } from '../liveData';

const HYPERLIQUID_CRYPTOS = new Set([
  'BTC','ETH','SOL','XRP','ADA','DOGE','BNB','DOT','LINK','LTC',
  'AVAX','MATIC','UNI','ATOM','NEAR','APT','SUI','INJ','OP','ARB',
]);

export class HyperliquidFeed implements ExchangeFeed {
  private ws: WebSocket | null = null;
  private tradeSubs = new Map<string, Set<TradeCallback>>();
  private simulatedIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private reconnectDelay = 2000;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private isConnected = false;

  constructor() {
    this.connect();
    // Keep Yahoo Finance polling alive for simulated non-crypto symbols
    LiveDataProvider.getInstance().startStreaming(3000);
  }

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket('wss://api.hyperliquid.xyz/ws');

      this.ws.onopen = () => {
        console.log('[HyperliquidFeed] Connected');
        this.isConnected = true;
        this.reconnectDelay = 2000;

        // Resubscribe to all crypto symbols that were active
        this.tradeSubs.forEach((_, symbol) => {
          if (this.isHyperliquidCrypto(symbol)) {
            this.sendSubscribe(symbol);
          }
        });

        // Heartbeat
        this.heartbeatInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ method: 'ping' }));
          }
        }, 20_000);
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string);
          if (message.channel === 'trades' && Array.isArray(message.data) && message.data.length > 0) {
            const tradeData = message.data[0];
            const symbol: string = tradeData.coin;
            const price = parseFloat(tradeData.px);
            const size = parseFloat(tradeData.sz);
            const side = tradeData.side === 'B' ? 'buy' : 'sell';
            const timestamp = tradeData.time;

            if (symbol && !isNaN(price) && price > 0) {
              const trade: NormalizedTrade = {
                exchange: 'HYPERLIQUID',
                symbol,
                price,
                size,
                side,
                timestamp
              };
              this.tradeSubs.get(symbol)?.forEach((cb) => cb(trade));
            }
          }
        } catch {
          // ignore parse errors
        }
      };

      this.ws.onerror = (e) => {
        console.warn('[HyperliquidFeed] Error:', e);
      };

      this.ws.onclose = () => {
        console.warn(`[HyperliquidFeed] Closed — reconnecting in ${this.reconnectDelay}ms`);
        this.isConnected = false;
        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = null;
        }
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
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  public subscribeTrade(symbol: string, callback: TradeCallback): () => void {
    if (!this.tradeSubs.has(symbol)) {
      this.tradeSubs.set(symbol, new Set());
    }
    this.tradeSubs.get(symbol)!.add(callback);

    if (this.isHyperliquidCrypto(symbol)) {
      this.sendSubscribe(symbol);
    } else {
      this.startSimulation(symbol);
    }

    return () => {
      const set = this.tradeSubs.get(symbol);
      if (!set) return;
      set.delete(callback);
      if (set.size === 0) {
        this.tradeSubs.delete(symbol);
        if (this.isHyperliquidCrypto(symbol)) {
          this.sendUnsubscribe(symbol);
        } else {
          this.stopSimulation(symbol);
        }
      }
    };
  }

  public subscribeOrderbook(symbol: string, callback: OrderbookCallback): () => void {
    // Hyperliquid L2 book subscription logic can be added here
    return () => {};
  }

  private isHyperliquidCrypto(symbol: string): boolean {
    return HYPERLIQUID_CRYPTOS.has(symbol);
  }

  private sendSubscribe(symbol: string) {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        method: 'subscribe',
        subscription: { type: 'trades', coin: symbol },
      }));
    }
  }

  private sendUnsubscribe(symbol: string) {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        method: 'unsubscribe',
        subscription: { type: 'trades', coin: symbol },
      }));
    }
  }

  // --- Simulation for non-crypto ---
  private startSimulation(symbol: string) {
    if (this.simulatedIntervals.has(symbol)) return;

    let lastSentTimestamp = -1;
    
    const interval = setInterval(() => {
      const liveObj = LiveDataProvider.getInstance().getLatestPrice(symbol);

      if (liveObj?.price && liveObj.price > 0 && liveObj.timestamp !== lastSentTimestamp) {
        lastSentTimestamp = liveObj.timestamp;
        const trade: NormalizedTrade = {
          exchange: 'SIMULATION',
          symbol,
          price: liveObj.price,
          timestamp: liveObj.timestamp
        };
        this.tradeSubs.get(symbol)?.forEach((cb) => cb(trade));
      }
    }, 1000);

    this.simulatedIntervals.set(symbol, interval);
  }

  private stopSimulation(symbol: string) {
    const iv = this.simulatedIntervals.get(symbol);
    if (iv) {
      clearInterval(iv);
      this.simulatedIntervals.delete(symbol);
    }
  }
}
