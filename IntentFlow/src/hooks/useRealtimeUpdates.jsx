// src/hooks/useRealtimeUpdates.js
import { useState, useEffect, useCallback, useRef } from 'react';

const useRealtimeUpdates = (eventTypes, callback) => {
    const [lastUpdate, setLastUpdate] = useState(null);
    const [isConnected, setIsConnected] = useState(true);
    const callbackRef = useRef(callback);
    
    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    useEffect(() => {
        if (!eventTypes || eventTypes.length === 0) return;

        const unsubscribes = [];

        eventTypes.forEach(eventType => {
            const handleUpdate = (data) => {
                console.log(`🔄 Real-time update received: ${eventType}`, data);
                setLastUpdate({
                    event: eventType,
                    data,
                    timestamp: Date.now()
                });
                
                if (callbackRef.current) {
                    callbackRef.current(eventType, data);
                }
            };

            if (window.electronAPI && window.electronAPI.subscribeToEvent) {
                const unsubscribe = window.electronAPI.subscribeToEvent(eventType, handleUpdate);
                if (unsubscribe) {
                    unsubscribes.push(unsubscribe);
                }
            } else {
                console.warn('electronAPI.subscribeToEvent not available');
                setIsConnected(false);
            }
        });

        return () => {
            unsubscribes.forEach(unsubscribe => {
                if (unsubscribe) unsubscribe();
            });
        };
    }, [eventTypes]);

    const refresh = useCallback(() => {
        setLastUpdate({
            event: 'manual',
            timestamp: Date.now()
        });
    }, []);

    return {
        lastUpdate,
        isConnected,
        refresh
    };
};

export default useRealtimeUpdates;
