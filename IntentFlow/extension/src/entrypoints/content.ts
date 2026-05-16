import browser from 'webextension-polyfill';
import { defineContentScript } from 'wxt/utils/define-content-script';
import type { CapturedPageContext } from '@/types/contracts';

export default defineContentScript({
  matches: ['https://*/*', 'http://*/*'],
  runAt: 'document_idle',
  main() {
    const kind = detectPageKind();
    if (!kind || document.getElementById('intentflow-capture-chip')) return;

    const chip = document.createElement('button');
    chip.id = 'intentflow-capture-chip';
    chip.type = 'button';
    chip.textContent = `Save ${kind} to IntentFlow`;
    chip.setAttribute('aria-label', `Save this ${kind} to IntentFlow`);
    chip.style.cssText = [
      'position:fixed',
      'right:18px',
      'bottom:18px',
      'z-index:2147483647',
      'border:0',
      'border-radius:999px',
      'padding:11px 14px',
      'background:linear-gradient(135deg,#6d5ef7,#20c7b5)',
      'color:white',
      'font:700 13px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'box-shadow:0 16px 40px rgba(15,23,42,.22)',
      'cursor:pointer'
    ].join(';');

    chip.addEventListener('click', () => {
      const selectedText = window.getSelection()?.toString().slice(0, 4000) || undefined;
      const payload: CapturedPageContext = {
        url: location.href,
        title: document.title,
        selectedText,
        detectedKind: kind,
        capturedAt: new Date().toISOString()
      };
      void browser.runtime.sendMessage({ type: 'intentflow.capturePage', payload });
      chip.textContent = 'Saved';
      window.setTimeout(() => chip.remove(), 1600);
    });

    document.documentElement.appendChild(chip);
  }
});

function detectPageKind(): CapturedPageContext['detectedKind'] | null {
  const text = `${document.title} ${document.body?.innerText.slice(0, 4000) ?? ''}`.toLowerCase();
  if (/\breceipt\b|\border confirmation\b|\bpaid\b/.test(text)) return 'receipt';
  if (/\binvoice\b|\bamount due\b|\bdue date\b/.test(text)) return 'invoice';
  if (/\bsubscription\b|\bplan renews\b|\bmonthly plan\b/.test(text)) return 'subscription';
  if (/\bbank\b|\bchecking\b|\bsavings\b|\bcredit card\b/.test(text)) return 'banking';
  if (/\bcart\b|\bcheckout\b|\border total\b/.test(text)) return 'shopping';
  return null;
}
