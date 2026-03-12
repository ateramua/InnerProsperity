// src/services/realtime/updateService.cjs
const { EventEmitter } = require('events');

class UpdateService extends EventEmitter {
    constructor() {
        super();
        this.subscribers = new Map();
        this.updateQueue = [];
        this.processing = false;
    }

    // Events that can be listened to
    static EVENTS = {
        ACCOUNT_UPDATED: 'account:updated',
        ACCOUNT_CREATED: 'account:created',
        ACCOUNT_DELETED: 'account:deleted',
        
        TRANSACTION_ADDED: 'transaction:added',
        TRANSACTION_UPDATED: 'transaction:updated',
        TRANSACTION_DELETED: 'transaction:deleted',
        
        CATEGORY_UPDATED: 'category:updated',
        CATEGORY_CREATED: 'category:created',
        CATEGORY_DELETED: 'category:deleted',
        
        BUDGET_ASSIGNED: 'budget:assigned',
        BUDGET_MOVED: 'budget:moved',
        
        PROSPERITY_MAP_UPDATED: 'prosperity:updated',
        FORECAST_UPDATED: 'forecast:updated',
        MONEY_MAP_UPDATED: 'moneyMap:updated'
    };

    // Subscribe to events
    subscribe(event, callback, subscriberId) {
        if (!this.subscribers.has(event)) {
            this.subscribers.set(event, new Map());
        }
        
        const eventSubscribers = this.subscribers.get(event);
        const id = subscriberId || `subscriber_${Date.now()}_${Math.random()}`;
        
        eventSubscribers.set(id, callback);
        
        console.log(`📡 New subscriber for ${event}: ${id}`);
        
        // Return unsubscribe function
        return () => {
            eventSubscribers.delete(id);
            if (eventSubscribers.size === 0) {
                this.subscribers.delete(event);
            }
            console.log(`📡 Unsubscribed from ${event}: ${id}`);
        };
    }

    // Publish event to all subscribers
    publish(event, data) {
        console.log(`📢 Publishing event: ${event}`);
        
        // Add to queue
        this.updateQueue.push({ event, data, timestamp: Date.now() });
        
        // Process queue
        this.processQueue();
        
        // Notify subscribers immediately
        const subscribers = this.subscribers.get(event);
        if (subscribers) {
            subscribers.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in subscriber for ${event}:`, error);
                }
            });
        }
    }

    // Process update queue (for batch updates)
    async processQueue() {
        if (this.processing || this.updateQueue.length === 0) return;
        
        this.processing = true;
        
        while (this.updateQueue.length > 0) {
            const update = this.updateQueue.shift();
            
            // Special handling for certain event types
            switch (update.event) {
                case UpdateService.EVENTS.TRANSACTION_ADDED:
                case UpdateService.EVENTS.TRANSACTION_UPDATED:
                case UpdateService.EVENTS.TRANSACTION_DELETED:
                    // Trigger related updates
                    this.publish(UpdateService.EVENTS.PROSPERITY_MAP_UPDATED, {
                        reason: 'transaction_change',
                        data: update.data
                    });
                    this.publish(UpdateService.EVENTS.FORECAST_UPDATED, {
                        reason: 'transaction_change',
                        data: update.data
                    });
                    break;
                    
                case UpdateService.EVENTS.BUDGET_ASSIGNED:
                case UpdateService.EVENTS.BUDGET_MOVED:
                    this.publish(UpdateService.EVENTS.PROSPERITY_MAP_UPDATED, {
                        reason: 'budget_change',
                        data: update.data
                    });
                    break;
            }
        }
        
        this.processing = false;
    }

    // Get recent updates
    getRecentUpdates(limit = 10) {
        return this.updateQueue.slice(-limit);
    }

    // Clear all subscribers (for testing/cleanup)
    clearAllSubscribers() {
        this.subscribers.clear();
        console.log('📡 All subscribers cleared');
    }
}

// Singleton instance
const updateService = new UpdateService();

module.exports = updateService;