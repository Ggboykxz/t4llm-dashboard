"use client";

import { useEffect, useRef, useState } from "react";

export function usePolling<T>(
  loader: () => Promise<T>,
  intervalMs: number
): { data?: T; error?: Error; refreshing: boolean; refresh: () => void } {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const refresh = () => {
    setRefreshing(true);
    loaderRef
      .current()
      .then((value) => {
        setData(value);
        setError(undefined);
      })
      .catch((err: Error) => {
        setError(err);
      })
      .finally(() => setRefreshing(false));
  };

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);

  return { data, error, refreshing, refresh };
}
