import { useState, useEffect } from 'react';

/**
 * @param {*} value
 * @param {number} [delayMs=300]
 */
export default function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
