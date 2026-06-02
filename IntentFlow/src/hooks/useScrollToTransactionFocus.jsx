import { useLayoutEffect, useRef } from 'react';

const MAX_ATTEMPTS = 12;

/**
 * Scroll the register container so a transaction row is centered and focused.
 * Retries until the row is in the DOM (pagination / async render).
 */
export default function useScrollToTransactionFocus({
  containerRef,
  focusTransactionId,
  active = false,
  ready = true,
  displayRowIds = [],
}) {
  const completedRef = useRef(null);

  useLayoutEffect(() => {
    if (!active || !focusTransactionId || !ready) return;

    const focusKey = String(focusTransactionId);
    if (completedRef.current === focusKey) return;

    let cancelled = false;
    let attempt = 0;

    const tryScroll = () => {
      if (cancelled) return;
      const container = containerRef.current;
      if (!container) {
        scheduleRetry();
        return;
      }

      const selector = `[data-tx-id="${CSS.escape(focusKey)}"]`;
      const row = container.querySelector(selector);
      if (row) {
        completedRef.current = focusKey;
        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (typeof row.focus === 'function') {
          try {
            row.focus({ preventScroll: true });
          } catch {
            /* ignore focus errors on tr */
          }
        }
        return;
      }

      scheduleRetry();
    };

    const scheduleRetry = () => {
      attempt += 1;
      if (attempt >= MAX_ATTEMPTS || cancelled) return;
      requestAnimationFrame(() => {
        setTimeout(tryScroll, 40 + attempt * 35);
      });
    };

    tryScroll();

    return () => {
      cancelled = true;
    };
  }, [active, focusTransactionId, ready, displayRowIds, containerRef]);

  return completedRef;
}
