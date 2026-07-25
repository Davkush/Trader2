import { useState, useEffect } from 'react';
import { LiveDataProvider } from '../services/liveData';
import { LivePrice, DataQuality } from '../types';

export function useLiveFeed(symbol: string) {
  const provider = LiveDataProvider.getInstance();
  const [livePrice, setLivePrice] = useState<LivePrice | undefined>(() => 
    provider.getLatestPrice(symbol)
  );

  useEffect(() => {
    // Initial fetch
    setLivePrice(provider.getLatestPrice(symbol));

    // Poll for changes periodically
    const interval = setInterval(() => {
      const latest = provider.getLatestPrice(symbol);
      setLivePrice((prev) => {
        if (!prev || !latest) return latest;
        if (prev.price !== latest.price || prev.timestamp !== latest.timestamp || prev.quality !== latest.quality) {
          return latest;
        }
        return prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [symbol]);

  return {
    livePrice,
    price: livePrice?.price ?? 0,
    hasLivePrice: provider.hasLivePrice(symbol),
    quality: livePrice?.quality ?? DataQuality.SYNTHETIC_FALLBACK,
    formattedPrice: livePrice?.price 
      ? livePrice.price.toLocaleString(undefined, {
          minimumFractionDigits: livePrice.price < 2 ? 4 : 2,
          maximumFractionDigits: livePrice.price < 2 ? 4 : 2
        })
      : '0.00'
  };
}
