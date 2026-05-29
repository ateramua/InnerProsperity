const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class QueueService {
  constructor(queueFilePath) {
    this.queueFilePath = queueFilePath;
  }

  ensureQueueFile() {
    const dir = path.dirname(this.queueFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.queueFilePath)) {
      fs.writeFileSync(this.queueFilePath, JSON.stringify({ operations: [] }, null, 2), 'utf8');
    }
  }

  readQueue() {
    this.ensureQueueFile();
    try {
      const raw = fs.readFileSync(this.queueFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.operations)) {
        return { operations: [] };
      }
      return parsed;
    } catch (error) {
      return { operations: [] };
    }
  }

  writeQueue(queue) {
    this.ensureQueueFile();
    fs.writeFileSync(this.queueFilePath, JSON.stringify(queue, null, 2), 'utf8');
  }

  list() {
    return this.readQueue().operations;
  }

  enqueue(operation) {
    const queue = this.readQueue();
    const op = {
      id: operation.id || crypto.randomUUID(),
      type: operation.type,
      payload: operation.payload || {},
      status: 'queued',
      retries: 0,
      maxRetries: Number(operation.maxRetries) || 5,
      nextAttemptAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: null
    };
    queue.operations.push(op);
    this.writeQueue(queue);
    return op;
  }

  update(operationId, updates) {
    const queue = this.readQueue();
    const index = queue.operations.findIndex((op) => op.id === operationId);
    if (index < 0) return null;
    queue.operations[index] = {
      ...queue.operations[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.writeQueue(queue);
    return queue.operations[index];
  }
}

module.exports = QueueService;
