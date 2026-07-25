import { useState, useEffect, useCallback } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';

export function useVaultStatus(exchange?: string) {
  const {
    vaultStatus,
    checkVaultStatus,
    storeVaultSecrets,
    clearVaultSecrets,
  } = useTerminalStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(
    async (exch: string) => {
      setLoading(true);
      setError(null);
      try {
        const hasKey = await checkVaultStatus(exch);
        return hasKey;
      } catch (err: any) {
        setError(err?.message || `Failed to verify vault status for ${exch}`);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [checkVaultStatus]
  );

  const storeSecrets = useCallback(
    async (exch: string, apiKey: string, apiSecret: string) => {
      setLoading(true);
      setError(null);
      try {
        const success = await storeVaultSecrets(exch, apiKey, apiSecret);
        if (!success) {
          throw new Error(`Failed to store credentials for ${exch}`);
        }
        return true;
      } catch (err: any) {
        setError(err?.message || `Failed to encrypt credentials for ${exch}`);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [storeVaultSecrets]
  );

  const clearSecrets = useCallback(
    async (exch: string) => {
      setLoading(true);
      setError(null);
      try {
        const success = await clearVaultSecrets(exch);
        if (!success) {
          throw new Error(`Failed to clear credentials for ${exch}`);
        }
        return true;
      } catch (err: any) {
        setError(err?.message || `Failed to purge credentials for ${exch}`);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [clearVaultSecrets]
  );

  // Auto-check vault status on mount if an exchange is specified
  useEffect(() => {
    if (exchange) {
      checkStatus(exchange);
    }
  }, [exchange, checkStatus]);

  return {
    vaultStatus,
    isKeyLoaded: exchange ? !!vaultStatus[exchange] : false,
    loading,
    error,
    checkStatus,
    storeSecrets,
    clearSecrets,
  };
}
