// src/pages/_document.jsx
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html>
      <Head>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              body { display: block !important; }
              #intentflow-boot-debug {
                position: fixed;
                z-index: 2147483647;
                right: 12px;
                bottom: 12px;
                max-width: 420px;
                border: 1px solid rgba(148, 163, 184, 0.35);
                border-radius: 14px;
                padding: 10px 12px;
                background: rgba(15, 23, 42, 0.92);
                color: white;
                font: 12px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
              }
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined') {
                window.global = window;
                window.globalThis = window;
                window.__INTENTFLOW_BOOT_EVENTS__ = [];
                window.__intentflowBootLog = function(message) {
                  var entry = new Date().toISOString() + ' ' + message;
                  window.__INTENTFLOW_BOOT_EVENTS__.push(entry);
                  console.log('[IntentFlow boot]', message);
                  var el = document.getElementById('intentflow-boot-debug');
                  if (el) el.textContent = entry;
                };
                window.addEventListener('DOMContentLoaded', function() {
                  document.querySelectorAll('style[data-next-hide-fouc]').forEach(function(node) {
                    node.parentNode && node.parentNode.removeChild(node);
                  });
                  document.body.style.display = 'block';
                  window.__intentflowBootLog('DOM ready; body forced visible');
                  setTimeout(function() {
                    if (!document.getElementById('__next') || !document.getElementById('__next').children.length) {
                      var el = document.createElement('div');
                      el.id = 'intentflow-boot-debug';
                      el.textContent = 'IntentFlow renderer has not mounted yet';
                      document.body.appendChild(el);
                    }
                  }, 2500);
                });
                window.addEventListener('error', function(event) {
                  window.__intentflowBootLog('window.error: ' + (event.message || 'unknown error'));
                });
                window.addEventListener('unhandledrejection', function(event) {
                  var reason = event.reason && (event.reason.stack || event.reason.message || String(event.reason));
                  window.__intentflowBootLog('unhandledrejection: ' + (reason || 'unknown rejection'));
                });
              }
            `,
          }}
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}