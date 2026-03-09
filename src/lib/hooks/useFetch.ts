'use client';
import { useState, useEffect, useCallback } from 'react';

export function useFetch<T>(url: string, defaultValue: T) {
  const [data, setData] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error(`Failed to fetch ${url}:`, e);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { refetch(); }, [refetch]);

  return { data, loading, refetch, setData };
}
