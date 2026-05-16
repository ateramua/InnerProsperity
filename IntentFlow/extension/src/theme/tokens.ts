export const intentFlowTokens = {
  colors: {
    brand: '#6D5EF7',
    brandStrong: '#4F46E5',
    aqua: '#20C7B5',
    gold: '#F4B740',
    danger: '#EF4444',
    success: '#22C55E',
    slate950: '#0B1020',
    slate900: '#111827',
    slate800: '#1F2937',
    slate700: '#374151',
    slate200: '#E5E7EB',
    slate100: '#F3F4F6',
    white: '#FFFFFF'
  },
  radius: {
    sm: '10px',
    md: '16px',
    lg: '24px',
    pill: '999px'
  },
  shadow: {
    card: '0 18px 60px rgba(15, 23, 42, 0.14)',
    glow: '0 18px 50px rgba(109, 94, 247, 0.30)'
  }
} as const;

export function formatCurrency(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'Not synced';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}
