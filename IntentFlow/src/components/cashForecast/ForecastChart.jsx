import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import PM from '../../constants/pmTheme.jsx';
import { exportSvgAsPng } from '../../shared/cashForecastExport.mjs';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
}

function formatShortDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const ForecastChart = forwardRef(function ForecastChart(
  {
    historical = [],
    daily = [],
    threshold = 500,
    selectedAccountFilter = 'all',
    onDayClick,
  },
  ref,
) {
  const containerRef = useRef(null);
  const [brushRange, setBrushRange] = useState(null);

  const fullData = useMemo(() => {
    const hist = (historical || []).map((d) => ({
      date: d.date,
      actual: d.balance,
      projected: null,
      bandLow: null,
      bandHigh: null,
      markers: [],
    }));
    const proj = (daily || [])
      .filter((d) => d.projected)
      .map((d) => ({
        date: d.date,
        actual: null,
        projected: d.balance,
        bandLow: d.confidenceLow,
        bandHigh: d.confidenceHigh,
        markers: d.markers || [],
        events: d.events || [],
      }));
    const merged = [...hist, ...proj];
    if (merged.length > 365) {
      const step = Math.ceil(merged.length / 365);
      return merged.filter((_, i) => i % step === 0 || i === merged.length - 1);
    }
    return merged;
  }, [historical, daily]);

  const chartData = useMemo(() => {
    if (!brushRange) return fullData;
    const [start, end] = brushRange;
    return fullData.slice(start, end + 1);
  }, [fullData, brushRange]);

  const markerDots = useMemo(
    () =>
      chartData.filter(
        (d) =>
          d.projected != null &&
          Array.isArray(d.markers) &&
          d.markers.length > 0 &&
          (d.markers.includes('payday') || d.markers.includes('bill') || d.markers.includes('alert')),
      ),
    [chartData],
  );

  useImperativeHandle(ref, () => ({
    exportPng(filename) {
      const svg = containerRef.current?.querySelector('svg');
      return exportSvgAsPng(svg, filename);
    },
  }));

  if (!fullData.length) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-white/20 bg-[#001a40]/60 text-[#F0F9FF]/70">
        No forecast data yet — add accounts and transactions to begin.
      </div>
    );
  }

  const defaultBrushStart = Math.max(0, fullData.length - Math.min(90, fullData.length));
  const defaultBrushEnd = fullData.length - 1;

  return (
    <div
      ref={containerRef}
      className="h-[360px] w-full min-w-0 rounded-2xl border border-white/20 bg-[#001a40]/80 p-2 md:h-[420px]"
    >
      {selectedAccountFilter !== 'all' && (
        <p className="mb-1 px-2 text-xs text-[#F0F9FF]/60">
          Account-level forecast (balance + transactions for selected account)
        </p>
      )}
      <ResponsiveContainer width="100%" height="92%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="cfBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4ADE80" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#0047AB" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(240,249,255,0.12)" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={formatShortDate}
            stroke={PM.textMuted}
            tick={{ fill: PM.textMuted, fontSize: 11 }}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={(v) => formatCurrency(v)}
            stroke={PM.textMuted}
            tick={{ fill: PM.textMuted, fontSize: 11 }}
            width={72}
          />
          <Tooltip
            contentStyle={{
              background: PM.fg,
              border: `1px solid ${PM.border}`,
              borderRadius: 12,
              color: PM.text,
            }}
            labelFormatter={(l) => formatShortDate(l)}
            formatter={(value, name) => [formatCurrency(value), name === 'actual' ? 'Actual' : 'Forecast']}
          />
          <ReferenceLine
            y={threshold}
            stroke="#FBBF24"
            strokeDasharray="4 4"
            label={{ value: 'Threshold', fill: '#FBBF24', fontSize: 10 }}
          />
          <ReferenceLine y={0} stroke="#F87171" strokeDasharray="2 4" />
          <Area
            type="monotone"
            dataKey="bandHigh"
            stroke="none"
            fill="url(#cfBand)"
            connectNulls
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="bandLow"
            stroke="none"
            fill={PM.bg}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#93C5FD"
            strokeWidth={2.5}
            dot={false}
            connectNulls
            onClick={(d) => onDayClick?.(d?.payload)}
          />
          <Line
            type="monotone"
            dataKey="projected"
            stroke="#4ADE80"
            strokeWidth={2.5}
            strokeDasharray="6 4"
            dot={false}
            connectNulls
            onClick={(d) => onDayClick?.(d?.payload)}
          />
          {markerDots.slice(0, 40).map((d) => (
            <ReferenceDot
              key={d.date}
              x={d.date}
              y={d.projected}
              r={4}
              fill={d.markers.includes('payday') ? '#4ADE80' : d.markers.includes('alert') ? '#FBBF24' : '#F87171'}
              stroke="#001a40"
              strokeWidth={1}
            />
          ))}
          {fullData.length > 30 && (
            <Brush
              dataKey="date"
              height={24}
              stroke="#4ADE80"
              fill="#001a40"
              tickFormatter={formatShortDate}
              startIndex={defaultBrushStart}
              endIndex={defaultBrushEnd}
              onChange={(range) => {
                if (range?.startIndex != null && range?.endIndex != null) {
                  setBrushRange([range.startIndex, range.endIndex]);
                }
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <p className="px-2 text-[10px] text-[#F0F9FF]/50">
        Drag the brush below the chart to zoom · Green dots = paydays · Red = bills · Yellow = alerts
      </p>
    </div>
  );
});

export default ForecastChart;
