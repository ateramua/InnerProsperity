class RuntimeWatchdog {
  constructor() {
    this.active = new Map();
  }

  start(operationId) {
    this.active.set(operationId, { startedAt: Date.now(), heartbeatAt: Date.now() });
  }

  heartbeat(operationId) {
    const current = this.active.get(operationId);
    if (!current) return;
    this.active.set(operationId, { ...current, heartbeatAt: Date.now() });
  }

  stop(operationId) {
    this.active.delete(operationId);
  }

  listStalled(thresholdMs = 30000) {
    const now = Date.now();
    return Array.from(this.active.entries())
      .filter(([, value]) => (now - value.heartbeatAt) > thresholdMs)
      .map(([id, value]) => ({ id, ...value }));
  }
}

module.exports = RuntimeWatchdog;
