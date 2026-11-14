// Бэкенд жоқ кезде желі кідірісін еліктейді, сонда скелет экрандары көрінеді.
import { useEffect, useState } from "react";

const seen = new Set<string>();

export function useMock<T>(key: string, data: T, delay = 650): { data: T | null; loading: boolean } {
  const [loading, setLoading] = useState(!seen.has(key));
  useEffect(() => {
    if (seen.has(key)) return;
    const t = setTimeout(() => { seen.add(key); setLoading(false); }, delay);
    return () => clearTimeout(t);
  }, [key, delay]);
  return { data: loading ? null : data, loading };
}
