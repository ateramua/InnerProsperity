import { formatIsoDate, roundMoney } from './cashForecastEngine.mjs';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

export function buildExecutiveSummaryHtml(result, meta = {}) {
  const { forecast, monthly, risks, insights, goals } = result;
  const summary = forecast.summary;
  const rows = monthly
    .map(
      (m) =>
        `<tr><td>${m.label}</td><td>${formatCurrency(m.start)}</td><td>${formatCurrency(m.inflow)}</td><td>${formatCurrency(m.outflow)}</td><td>${formatCurrency(m.net)}</td><td>${formatCurrency(m.end)}</td><td>${m.status}</td></tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Personal Cash Forecast</title>
<style>
  body { font-family: system-ui, sans-serif; color: #111; padding: 32px; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .meta { color: #555; font-size: 13px; margin-bottom: 24px; }
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
  .kpi { border: 1px solid #ddd; border-radius: 8px; padding: 12px; }
  .kpi label { font-size: 11px; text-transform: uppercase; color: #666; }
  .kpi strong { display: block; font-size: 20px; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: right; }
  th:first-child, td:first-child { text-align: left; }
  th { background: #f5f5f5; }
  section { margin-bottom: 28px; }
  ul { padding-left: 18px; }
</style></head><body>
  <h1>Personal Cash Forecast — Executive Summary</h1>
  <p class="meta">Generated ${meta.generatedAt || new Date().toLocaleString()} · Mode: ${meta.mode || forecast.mode} · Horizon: ${meta.horizonLabel || `${forecast.horizonDays} days`}</p>
  <div class="kpis">
    <div class="kpi"><label>Current cash</label><strong>${formatCurrency(forecast.startingCash)}</strong></div>
    <div class="kpi"><label>Lowest balance</label><strong>${formatCurrency(summary.lowPoint.balance)}</strong><small> ${summary.lowPoint.date}</small></div>
    <div class="kpi"><label>Health score</label><strong>${summary.healthScore}/100</strong></div>
  </div>
  <section><h2>Monthly forecast</h2><table>
    <thead><tr><th>Month</th><th>Start</th><th>Inflow</th><th>Outflow</th><th>Net</th><th>End</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></section>
  <section><h2>Risk alerts</h2><ul>${risks.slice(0, 8).map((r) => `<li>${r.message}</li>`).join('') || '<li>None detected</li>'}</ul></section>
  <section><h2>Insights</h2><ul>${insights.slice(0, 6).map((i) => `<li><strong>${i.title}</strong> — ${i.body}</li>`).join('') || '<li>None yet</li>'}</ul></section>
  <section><h2>Goals</h2><ul>${goals.slice(0, 6).map((g) => `<li>${g.name}: ${formatCurrency(g.current)} / ${formatCurrency(g.target)}</li>`).join('') || '<li>No goals configured</li>'}</ul></section>
</body></html>`;
}

export function exportForecastPdf(result, meta = {}) {
  const html = buildExecutiveSummaryHtml(result, meta);
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
  return true;
}

export function exportSvgAsPng(svgElement, filename = 'cash-forecast-chart.png') {
  if (!svgElement) return false;
  const clone = svgElement.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const bbox = svgElement.getBoundingClientRect();
  const width = Math.max(800, Math.round(bbox.width));
  const height = Math.max(400, Math.round(bbox.height));
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  const svgData = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#001a40';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(url);
    canvas.toBlob((pngBlob) => {
      if (!pngBlob) return;
      const pngUrl = URL.createObjectURL(pngBlob);
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(pngUrl);
    }, 'image/png');
  };
  img.src = url;
  return true;
}

export function buildSharePayload(result, meta = {}) {
  const { forecast, monthly, risks, insights, goals } = result;
  return {
    version: 1,
    generatedAt: result.generatedAt || new Date().toISOString(),
    mode: meta.mode || forecast.mode,
    horizonLabel: meta.horizonLabel,
    summary: forecast.summary,
    startingCash: forecast.startingCash,
    monthly: monthly.slice(0, 24),
    risks: risks.slice(0, 10),
    insights: insights.slice(0, 8),
    goals: goals.slice(0, 12),
  };
}

export function buildShareUrl(shareId) {
  if (typeof window === 'undefined') return '';
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?view=cashflow&share=${encodeURIComponent(shareId)}`;
}
