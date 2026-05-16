import type { QuickAction } from '@/types/contracts';

export const quickActions: QuickAction[] = [
  {
    id: 'capture-page',
    label: 'Capture page',
    description: 'Save this page as a receipt, bill, note, or workflow item.',
    shortcut: '⌘⇧Y'
  },
  {
    id: 'sync-now',
    label: 'Sync now',
    description: 'Refresh IntentFlow desktop and cloud data.'
  },
  {
    id: 'review-alerts',
    label: 'Review alerts',
    description: 'See accounts, bills, and Plaid connections needing attention.'
  },
  {
    id: 'open-dashboard',
    label: 'Open dashboard',
    description: 'Jump into the full IntentFlow desktop dashboard.',
    shortcut: '⌘⇧I'
  }
];
