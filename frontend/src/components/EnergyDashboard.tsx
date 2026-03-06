import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

// 1. Define the TypeScript Interface for our sensor data
interface EnergyData {
  voltage: number;
  current: number;
  power: number;
  energy: number;
}

// 2. Connect to your Express server 
// (If you are viewing this browser on the same PC running the server, use localhost. 
// If viewing on another device, use your Hotspot IP like 'http://192.168.137.1:3000')
const socket = io('http://localhost:3000'); 

const EnergyDashboard: React.FC = () => {
  // 3. Apply the interface to our state
  const [liveData, setLiveData] = useState<EnergyData>({
    voltage: 0,
    current: 0,
    power: 0,
    energy: 0
  });
  const [isConnected, setIsConnected] = useState<boolean>(false);

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    // TypeScript now knows 'data' perfectly matches the EnergyData interface
    socket.on('live_power_reading', (data: EnergyData) => {
      setLiveData(data);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('live_power_reading');
    };
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>⚡ Live Energy Monitor</h2>
      <p style={{ color: isConnected ? 'green' : 'red' }}>
        {isConnected ? '🟢 Server Connected' : '🔴 Server Disconnected'}
      </p>
      
      <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
        <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h3>Voltage</h3>
          <p style={{ fontSize: '24px', color: '#007bff' }}>{liveData.voltage.toFixed(2)} V</p>
        </div>
        <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h3>Current</h3>
          <p style={{ fontSize: '24px', color: '#28a745' }}>{liveData.current.toFixed(3)} A</p>
        </div>
        <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h3>Power</h3>
          <p style={{ fontSize: '24px', color: '#dc3545' }}>{liveData.power.toFixed(2)} W</p>
        </div>
      </div>
    </div>
  );
};

export default EnergyDashboard;