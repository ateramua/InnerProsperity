import React, { useState, useEffect } from 'react';

export default function NetworkSharing({ currentBudget, onBudgetUpdate }) {
  const [mode, setMode] = useState(null); // 'host' or 'client'
  const [status, setStatus] = useState('disconnected');
  const [hostAddress, setHostAddress] = useState('');
  const [port, setPort] = useState('8080');
  const [localIp, setLocalIp] = useState('');
  const [clientCount, setClientCount] = useState(0);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  
  // ==================== NETWORK STATUS STATE ====================
  const [networkStatus, setNetworkStatus] = useState(null);
  const [networkLoading, setNetworkLoading] = useState(true);

  // ==================== NETWORK STATUS CHECK ====================
  const checkNetworkStatus = async () => {
    try {
      setNetworkLoading(true);
      
      if (window.electronAPI?.getNetworkStatus) {
        const result = await window.electronAPI.getNetworkStatus();
        setNetworkStatus(result);
        
        // Update local IP if available from network status
        if (result.success && result.data.activeConnections > 0) {
          const firstActiveInterface = result.data.interfaces[0];
          if (firstActiveInterface?.addresses[0]?.address) {
            setLocalIp(firstActiveInterface.addresses[0].address);
          }
        }
      } else {
        // Fallback to browser API
        setNetworkStatus({
          success: true,
          data: {
            isOnline: navigator.onLine,
            isOffline: !navigator.onLine,
            effectiveType: navigator.connection?.effectiveType || 'unknown',
            downlink: navigator.connection?.downlink,
            rtt: navigator.connection?.rtt,
            timestamp: new Date().toISOString()
          }
        });
      }
    } catch (error) {
      console.error('Error checking network status:', error);
      setNetworkStatus({ 
        success: false, 
        error: error.message,
        data: { isOnline: false, isOffline: true }
      });
    } finally {
      setNetworkLoading(false);
    }
  };

  // Check sharing status periodically
  const checkSharingStatus = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.getNetworkStatus();
      if (result.success) {
        setStatus(result.data.isHosting ? 'hosting' : result.data.isConnected ? 'connected' : 'disconnected');
        setClientCount(result.data.clientCount || 0);
      }
    }
  };

  // Combined useEffect for all periodic checks
  useEffect(() => {
    // Initial checks
    checkNetworkStatus();
    checkSharingStatus();
    
    // Set up intervals
    const networkInterval = setInterval(checkNetworkStatus, 30000); // Check network every 30 seconds
    const sharingInterval = setInterval(checkSharingStatus, 2000); // Check sharing every 2 seconds
    
    // Set up listeners for real-time network updates
    let unsubscribeNetwork;
    if (window.electronAPI?.onNetworkChange) {
      unsubscribeNetwork = window.electronAPI.onNetworkChange((status) => {
        console.log('Network status changed:', status);
        setNetworkStatus({ success: true, data: status });
        
        // Update local IP if available
        if (status.interfaces?.[0]?.addresses[0]?.address) {
          setLocalIp(status.interfaces[0].addresses[0].address);
        }
      });
    }
    
    // Listen for online/offline events (browser fallback)
    window.addEventListener('online', checkNetworkStatus);
    window.addEventListener('offline', checkNetworkStatus);
    
    // Cleanup
    return () => {
      clearInterval(networkInterval);
      clearInterval(sharingInterval);
      window.removeEventListener('online', checkNetworkStatus);
      window.removeEventListener('offline', checkNetworkStatus);
      if (unsubscribeNetwork) unsubscribeNetwork();
    };
  }, []);

  const handleStartHosting = async () => {
    try {
      setError('');
      
      // Check if we're online before hosting
      if (networkStatus?.data?.isOnline === false) {
        setError('Cannot host while offline. Please check your network connection.');
        return;
      }
      
      const result = await window.electronAPI.startHosting({
        budget: currentBudget,
        port: parseInt(port)
      });
      
      if (result.success) {
        setMode('host');
        setStatus('hosting');
        setLocalIp(result.ip || localIp);
        alert(`✅ Hosting started at ${result.address}`);
      } else {
        setError(result.error || 'Failed to start hosting');
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const handleConnect = async () => {
    try {
      setError('');
      
      // Check if we're online before connecting
      if (networkStatus?.data?.isOnline === false) {
        setError('Cannot connect while offline. Please check your network connection.');
        return;
      }
      
      const result = await window.electronAPI.connectToHost({
        address: hostAddress,
        port: parseInt(port)
      });
      
      if (result.success) {
        setMode('client');
        setStatus('connected');
        alert('✅ Connected to host');
      } else {
        setError(result.error || 'Failed to connect');
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const handleDisconnect = async () => {
    if (mode === 'host') {
      await window.electronAPI.stopHosting();
      setMode(null);
      setStatus('disconnected');
    } else {
      await window.electronAPI.disconnect();
      setMode(null);
      setStatus('disconnected');
    }
  };

  const handleSendUpdate = () => {
    if (mode === 'host') {
      window.electronAPI.broadcastUpdate(currentBudget);
    } else {
      window.electronAPI.sendUpdate(currentBudget);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Network Button with Status Indicator */}
      <button
        onClick={() => setShowModal(!showModal)}
        style={{
          background: status === 'hosting' ? '#10B981' : status === 'connected' ? '#3B82F6' : '#1F2937',
          border: `1px solid ${status === 'hosting' ? '#10B981' : status === 'connected' ? '#3B82F6' : '#374151'}`,
          color: 'white',
          padding: '6px 12px',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          opacity: networkStatus?.data?.isOnline === false ? 0.7 : 1
        }}
        title={networkStatus?.data?.isOnline === false ? 'Offline - Check connection' : ''}
      >
        <span>{networkStatus?.data?.isOnline === false ? '🔴' : '🌐'}</span>
        {status === 'hosting' && `Hosting (${clientCount})`}
        {status === 'connected' && 'Connected'}
        {status === 'disconnected' && (networkStatus?.data?.isOnline === false ? 'Offline' : 'Share')}
      </button>

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '5px',
          background: '#1F2937',
          borderRadius: '8px',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
          border: '1px solid #374151',
          width: '300px',
          zIndex: 1000,
          padding: '15px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0, fontSize: '16px' }}>🌐 Network Sharing</h3>
            <button
              onClick={() => setShowModal(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#9CA3AF',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              ✕
            </button>
          </div>

          {/* Network Status Display */}
          {!networkLoading && networkStatus && (
            <div style={{
              background: networkStatus.data?.isOnline ? '#10B98120' : '#EF444420',
              border: `1px solid ${networkStatus.data?.isOnline ? '#10B981' : '#EF4444'}`,
              borderRadius: '4px',
              padding: '8px',
              marginBottom: '15px',
              fontSize: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#9CA3AF' }}>Network:</span>
                <span style={{ color: networkStatus.data?.isOnline ? '#10B981' : '#EF4444', fontWeight: 'bold' }}>
                  {networkStatus.data?.isOnline ? '● Online' : '○ Offline'}
                </span>
              </div>
              {networkStatus.data?.effectiveType && networkStatus.data.isOnline && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                  <span style={{ color: '#9CA3AF' }}>Connection:</span>
                  <span>{networkStatus.data.effectiveType}</span>
                </div>
              )}
              {networkStatus.data?.downlink > 0 && networkStatus.data.isOnline && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                  <span style={{ color: '#9CA3AF' }}>Speed:</span>
                  <span>{networkStatus.data.downlink} Mbps</span>
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{
              background: '#EF444420',
              border: '1px solid #EF4444',
              color: '#EF4444',
              padding: '8px',
              borderRadius: '4px',
              fontSize: '12px',
              marginBottom: '15px'
            }}>
              {error}
            </div>
          )}

          {status === 'disconnected' && (
            <>
              {/* Host or Connect options */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                  Port
                </label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  min="1024"
                  max="65535"
                  style={{
                    width: '100%',
                    background: '#111827',
                    border: '1px solid #374151',
                    color: 'white',
                    padding: '8px',
                    borderRadius: '4px',
                    marginBottom: '10px'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <button
                  onClick={handleStartHosting}
                  disabled={!networkStatus?.data?.isOnline}
                  style={{
                    flex: 1,
                    background: networkStatus?.data?.isOnline ? '#10B981' : '#6B7280',
                    color: 'white',
                    border: 'none',
                    padding: '8px',
                    borderRadius: '4px',
                    cursor: networkStatus?.data?.isOnline ? 'pointer' : 'not-allowed'
                  }}
                  title={!networkStatus?.data?.isOnline ? 'You are offline' : ''}
                >
                  Host Budget
                </button>
              </div>

              <div style={{ position: 'relative', textAlign: 'center', marginBottom: '15px' }}>
                <span style={{ color: '#9CA3AF', fontSize: '12px' }}>or connect to existing</span>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                  Host Address
                </label>
                <input
                  type="text"
                  value={hostAddress}
                  onChange={(e) => setHostAddress(e.target.value)}
                  placeholder="e.g., 192.168.1.100"
                  style={{
                    width: '100%',
                    background: '#111827',
                    border: '1px solid #374151',
                    color: 'white',
                    padding: '8px',
                    borderRadius: '4px',
                    marginBottom: '10px'
                  }}
                />
                <button
                  onClick={handleConnect}
                  disabled={!hostAddress || !networkStatus?.data?.isOnline}
                  style={{
                    width: '100%',
                    background: (hostAddress && networkStatus?.data?.isOnline) ? '#3B82F6' : '#6B7280',
                    color: 'white',
                    border: 'none',
                    padding: '8px',
                    borderRadius: '4px',
                    cursor: (hostAddress && networkStatus?.data?.isOnline) ? 'pointer' : 'not-allowed'
                  }}
                >
                  Connect
                </button>
              </div>
            </>
          )}

          {(status === 'hosting' || status === 'connected') && (
            <>
              {/* Status display */}
              <div style={{
                background: '#111827',
                padding: '10px',
                borderRadius: '4px',
                marginBottom: '15px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ color: '#9CA3AF' }}>Status:</span>
                  <span style={{ color: status === 'hosting' ? '#10B981' : '#3B82F6' }}>
                    {status === 'hosting' ? 'Hosting' : 'Connected'}
                  </span>
                </div>
                {status === 'hosting' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ color: '#9CA3AF' }}>Your IP:</span>
                    <span>{localIp}</span>
                  </div>
                )}
                {status === 'hosting' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#9CA3AF' }}>Clients:</span>
                    <span>{clientCount}</span>
                  </div>
                )}
                {status === 'connected' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#9CA3AF' }}>Host:</span>
                    <span>{hostAddress}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleSendUpdate}
                  disabled={!networkStatus?.data?.isOnline}
                  style={{
                    flex: 1,
                    background: networkStatus?.data?.isOnline ? '#3B82F6' : '#6B7280',
                    color: 'white',
                    border: 'none',
                    padding: '8px',
                    borderRadius: '4px',
                    cursor: networkStatus?.data?.isOnline ? 'pointer' : 'not-allowed'
                  }}
                >
                  Sync Now
                </button>
                <button
                  onClick={handleDisconnect}
                  style={{
                    flex: 1,
                    background: '#EF4444',
                    color: 'white',
                    border: 'none',
                    padding: '8px',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Disconnect
                </button>
              </div>
            </>
          )}
          
          {/* Last updated timestamp */}
          {networkStatus?.data?.timestamp && (
            <div style={{
              marginTop: '10px',
              fontSize: '10px',
              color: '#6B7280',
              textAlign: 'right'
            }}>
              Updated: {new Date(networkStatus.data.timestamp).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}