export type IntentFlowTheme = 'system' | 'light' | 'dark';

export type BridgeTransport = 'native' | 'loopback' | 'cloud' | 'offline';

export type BridgeStatus = {
  transport: BridgeTransport;
  connected: boolean;
  desktopAvailable: boolean;
  lastSeenAt?: string;
  desktopVersion?: string;
  protocolVersion?: string;
  error?: string;
};

export type PairingRequest = {
  clientName: string;
  browser?: string;
  extensionId?: string;
  requestedAt: string;
};

export type ExtensionSession = {
  authenticated: boolean;
  userId?: string;
  displayName?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes: string[];
};

export type DashboardSummary = {
  netWorth?: number;
  availableCash?: number;
  monthlyBudgetRemaining?: number;
  accountsNeedingAttention: number;
  pendingTasks: number;
  unreadNotifications: number;
  lastSyncAt?: string;
};

export type QuickActionKind =
  | 'capture-page'
  | 'add-transaction-note'
  | 'open-dashboard'
  | 'sync-now'
  | 'review-alerts'
  | 'connect-bank';

export type QuickAction = {
  id: QuickActionKind;
  label: string;
  description: string;
  shortcut?: string;
};

export type CapturedPageContext = {
  url: string;
  title: string;
  selectedText?: string;
  detectedKind?: 'receipt' | 'invoice' | 'subscription' | 'banking' | 'shopping' | 'general';
  capturedAt: string;
};

export type SyncEnvelope<TPayload = unknown> = {
  id: string;
  type: string;
  payload: TPayload;
  createdAt: string;
  attempts: number;
  status: 'queued' | 'syncing' | 'synced' | 'failed';
  lastError?: string;
};

export type IntentFlowMessage<TPayload = unknown> = {
  id: string;
  protocolVersion: '2026.05';
  source: 'extension' | 'desktop' | 'cloud';
  type: string;
  payload?: TPayload;
  sentAt: string;
  signature?: string;
};
