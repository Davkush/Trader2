import { useEffect } from 'react';
import { useTerminalStore, ServerBot } from '../store/useTerminalStore';

export function useBotsList(autoPoll = true, pollIntervalMs = 5000) {
  const {
    bots,
    botsLoading,
    botsError,
    fetchBots,
    createBot,
    toggleBot,
    closeBotPosition,
    resetBot,
    deleteBot,
  } = useTerminalStore();

  useEffect(() => {
    // Initial fetch of bots
    fetchBots(false);

    if (!autoPoll) return;

    const interval = setInterval(() => {
      fetchBots(true);
    }, pollIntervalMs);

    return () => clearInterval(interval);
  }, [fetchBots, autoPoll, pollIntervalMs]);

  return {
    bots,
    loading: botsLoading,
    error: botsError,
    fetchBots,
    createBot,
    toggleBot,
    closeBotPosition,
    resetBot,
    deleteBot,
  };
}
