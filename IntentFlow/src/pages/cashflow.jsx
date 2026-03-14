// src/pages/cashflow.jsx
import React from 'react';
import dynamic from 'next/dynamic';

// Dynamically import to avoid SSR issues
const CashFlowView = dynamic(() => import('../views/CashFlowView'), { ssr: false });

export default function CashFlowPage() {
  return <CashFlowView />;
}