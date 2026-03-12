const WebSocket = require('ws');
const http = require('http');
const os = require('os');

class NetworkSharing {
  constructor() {
    this.server = null;
    this.clients = new Set();
    this.isHosting = false;
    this.isConnected = false;
    this.connection = null;
    this.budgetData = null;
    this.onDataUpdate = null;
    this.hostAddress = null;
    this.port = 8080;
  }

  // Get local IP address
  getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // Skip internal and non-IPv4 addresses
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

  // Start hosting a budget
  startHosting(budgetData, onClientConnected = null, port = 8080) {
    return new Promise((resolve, reject) => {
      try {
        this.port = port;
        this.budgetData = budgetData;
        
        // Create HTTP server
        const server = http.createServer();
        this.server = new WebSocket.Server({ server });

        // Handle WebSocket connections
        this.server.on('connection', (ws, req) => {
          const clientAddress = req.socket.remoteAddress;
          console.log(`📡 Client connected from ${clientAddress}`);
          
          this.clients.add(ws);

          // Send current budget data to new client
          ws.send(JSON.stringify({
            type: 'initial',
            data: this.budgetData,
            timestamp: new Date().toISOString()
          }));

          // Handle messages from client
          ws.on('message', (message) => {
            try {
              const data = JSON.parse(message.toString());
              this.handleClientMessage(ws, data);
            } catch (error) {
              console.error('Error parsing message:', error);
            }
          });

          // Handle client disconnect
          ws.on('close', () => {
            console.log(`📡 Client disconnected from ${clientAddress}`);
            this.clients.delete(ws);
          });

          // Notify callback
          if (onClientConnected) {
            onClientConnected(clientAddress);
          }
        });

        // Start server
        server.listen(this.port, () => {
          this.isHosting = true;
          const ip = this.getLocalIp();
          console.log(`🎯 Hosting budget at ws://${ip}:${this.port}`);
          resolve({
            success: true,
            address: `${ip}:${this.port}`,
            ip,
            port: this.port
          });
        });

        server.on('error', (error) => {
          console.error('Server error:', error);
          reject(error);
        });

      } catch (error) {
        console.error('Error starting host:', error);
        reject(error);
      }
    });
  }

  // Connect to a hosted budget
  connectToHost(hostAddress, port = 8080, onDataUpdate = null, onConnectionChange = null) {
    return new Promise((resolve, reject) => {
      try {
        this.onDataUpdate = onDataUpdate;
        const url = `ws://${hostAddress}:${port}`;
        
        console.log(`🔌 Connecting to ${url}...`);
        this.connection = new WebSocket(url);

        this.connection.on('open', () => {
          console.log('✅ Connected to host');
          this.isConnected = true;
          this.hostAddress = hostAddress;
          if (onConnectionChange) onConnectionChange(true);
          resolve({ success: true });
        });

        this.connection.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());
            this.handleHostMessage(data);
          } catch (error) {
            console.error('Error parsing host message:', error);
          }
        });

        this.connection.on('close', () => {
          console.log('🔌 Disconnected from host');
          this.isConnected = false;
          this.connection = null;
          if (onConnectionChange) onConnectionChange(false);
        });

        this.connection.on('error', (error) => {
          console.error('Connection error:', error);
          reject(error);
        });

      } catch (error) {
        console.error('Error connecting to host:', error);
        reject(error);
      }
    });
  }

  // Handle messages from clients (host side)
  handleClientMessage(client, message) {
    switch (message.type) {
      case 'update':
        // Client is sending an update
        console.log('📝 Received update from client');
        this.budgetData = message.data;
        
        // Broadcast to all other clients
        this.broadcastToClients({
          type: 'update',
          data: message.data,
          timestamp: new Date().toISOString(),
          source: 'client'
        }, client);
        break;

      case 'request':
        // Client requesting current data
        client.send(JSON.stringify({
          type: 'initial',
          data: this.budgetData,
          timestamp: new Date().toISOString()
        }));
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  // Handle messages from host (client side)
  handleHostMessage(message) {
    switch (message.type) {
      case 'initial':
        console.log('📥 Received initial data from host');
        if (this.onDataUpdate) {
          this.onDataUpdate(message.data, true);
        }
        break;

      case 'update':
        console.log('📥 Received update from host');
        if (this.onDataUpdate) {
          this.onDataUpdate(message.data, false);
        }
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  // Send update to all connected clients (host)
  broadcastUpdate(budgetData) {
    this.budgetData = budgetData;
    this.broadcastToClients({
      type: 'update',
      data: budgetData,
      timestamp: new Date().toISOString(),
      source: 'host'
    });
  }

  // Send update to host (client)
  sendUpdate(budgetData) {
    if (this.connection && this.isConnected) {
      this.connection.send(JSON.stringify({
        type: 'update',
        data: budgetData,
        timestamp: new Date().toISOString()
      }));
    }
  }

  // Broadcast to all clients except one
  broadcastToClients(message, excludeClient = null) {
    this.clients.forEach(client => {
      if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }

  // Stop hosting
  stopHosting() {
    if (this.server) {
      // Close all client connections
      this.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.close();
        }
      });
      this.clients.clear();

      // Close server
      this.server.close(() => {
        console.log('🛑 Hosting stopped');
        this.isHosting = false;
        this.server = null;
      });
    }
  }

  // Disconnect from host
  disconnect() {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
      this.isConnected = false;
      this.hostAddress = null;
    }
  }

  // Get status
  getStatus() {
    return {
      isHosting: this.isHosting,
      isConnected: this.isConnected,
      hostAddress: this.hostAddress,
      clientCount: this.clients.size,
      localIp: this.getLocalIp()
    };
  }
}

module.exports = new NetworkSharing();
