// src/components/UpdateIndicator.jsx
import React, { useState, useEffect } from 'react';

const UpdateIndicator = ({ lastUpdate, onRefresh }) => {
    const [showNotification, setShowNotification] = useState(false);
    const [notificationMessage, setNotificationMessage] = useState('');

    useEffect(() => {
        if (lastUpdate) {
            // Show notification based on update type
            let message = '';
            switch (lastUpdate.event) {
                case 'transaction:added':
                    message = 'New transaction added';
                    break;
                case 'transaction:updated':
                    message = 'Transaction updated';
                    break;
                case 'transaction:deleted':
                    message = 'Transaction deleted';
                    break;
                case 'budget:assigned':
                    message = 'Budget updated';
                    break;
                case 'prosperity:updated':
                    message = 'ProsperityMap refreshed';
                    break;
                default:
                    message = 'Data updated';
            }
            
            setNotificationMessage(message);
            setShowNotification(true);
            
            // Auto-hide after 3 seconds
            const timer = setTimeout(() => {
                setShowNotification(false);
            }, 3000);
            
            return () => clearTimeout(timer);
        }
    }, [lastUpdate]);

    // Add keyframes to document head on component mount
    useEffect(() => {
        // Check if we're in the browser
        if (typeof document !== 'undefined') {
            // Check if styles already exist to avoid duplicates
            if (!document.getElementById('update-indicator-styles')) {
                const style = document.createElement('style');
                style.id = 'update-indicator-styles';
                style.textContent = `
                    @keyframes slideIn {
                        from {
                            transform: translateX(100%);
                            opacity: 0;
                        }
                        to {
                            transform: translateX(0);
                            opacity: 1;
                        }
                    }
                    
                    @keyframes pulse {
                        0% {
                            opacity: 1;
                        }
                        50% {
                            opacity: 0.5;
                        }
                        100% {
                            opacity: 1;
                        }
                    }
                `;
                document.head.appendChild(style);
            }
        }
        
        // Cleanup function (optional - remove styles when component unmounts)
        return () => {
            if (typeof document !== 'undefined') {
                const style = document.getElementById('update-indicator-styles');
                if (style) {
                    document.head.removeChild(style);
                }
            }
        };
    }, []); // Empty dependency array means this runs once on mount

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    };

    return (
        <>
            {/* Update Notification Toast */}
            {showNotification && (
                <div style={styles.notification}>
                    <span style={styles.notificationIcon}>🔄</span>
                    <span style={styles.notificationMessage}>{notificationMessage}</span>
                    <button 
                        style={styles.notificationClose}
                        onClick={() => setShowNotification(false)}
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Update Status Bar */}
            <div style={styles.statusBar}>
                <div style={styles.statusLeft}>
                    <span style={styles.statusDot}></span>
                    <span style={styles.statusText}>Live Updates</span>
                </div>
                {lastUpdate && (
                    <div style={styles.statusRight}>
                        <span style={styles.lastUpdateTime}>
                            Last update: {formatTime(lastUpdate.timestamp)}
                        </span>
                        <button 
                            style={styles.refreshButton}
                            onClick={onRefresh}
                            title="Refresh manually"
                        >
                            ↻
                        </button>
                    </div>
                )}
            </div>
        </>
    );
};

const styles = {
    notification: {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        background: '#1F2937',
        border: '1px solid #3B82F6',
        borderRadius: '0.5rem',
        padding: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        zIndex: 1000,
        animation: 'slideIn 0.3s ease'
    },
    notificationIcon: {
        fontSize: '1.2rem'
    },
    notificationMessage: {
        color: 'white',
        fontSize: '0.95rem'
    },
    notificationClose: {
        background: 'none',
        border: 'none',
        color: '#9CA3AF',
        cursor: 'pointer',
        fontSize: '1rem',
        padding: '0.25rem',
        ':hover': {
            color: 'white'
        }
    },
    statusBar: {
        position: 'fixed',
        bottom: '0',
        left: '280px',
        right: '0',
        background: '#111827',
        borderTop: '1px solid #374151',
        padding: '0.5rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '0.875rem',
        zIndex: 100
    },
    statusLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
    },
    statusDot: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: '#10B981',
        animation: 'pulse 2s infinite'
    },
    statusText: {
        color: '#9CA3AF'
    },
    statusRight: {
        display: 'flex',
        alignItems: 'center',
        gap: '1rem'
    },
    lastUpdateTime: {
        color: '#6B7280'
    },
    refreshButton: {
        background: 'none',
        border: 'none',
        color: '#3B82F6',
        fontSize: '1.2rem',
        cursor: 'pointer',
        padding: '0.25rem 0.5rem',
        borderRadius: '0.25rem',
        ':hover': {
            background: '#374151'
        }
    }
};

export default UpdateIndicator;