// src/pages/cashflow-forecast.jsx
import React from 'react';
import dynamic from 'next/dynamic';

const CashFlowForecast = dynamic(() => import('../views/CashFlowForecast'), { ssr: false });

export default function CashFlowForecastPage() {
  return <CashFlowForecast />;
}