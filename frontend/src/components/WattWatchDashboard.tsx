import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

// Define the shape of our incoming ESP32 data
interface EnergyData {
  voltage: number;
  current: number;
  power: number;
  energy: number;
}

// Connect to your Node.js backend
const socket = io('http://localhost:3000'); 
const PHP_RATE = 12; // ₱12.00 / kWh

const WattWatchDashboard: React.FC = () => {
  const [liveData, setLiveData] = useState<EnergyData>({
    voltage: 0,
    current: 0,
    power: 0,
    energy: 0
  });

  useEffect(() => {
    // Listen for the live data blast from Express
    socket.on('live_power_reading', (data: EnergyData) => {
      setLiveData(data);
    });

    return () => {
      socket.off('live_power_reading');
    };
  }, []);

  // Calculate dynamic costs based on live data
  const dailyCost = (liveData.energy * PHP_RATE).toFixed(2);
  const monthlyEst = (parseFloat(dailyCost) * 30).toFixed(0);

  return (
    <div className="content">
      <div className="topbar">
        <div>
          <div className="page-title">Energy Dashboard</div>
          <div className="page-sub">Real-time monitoring · Main Line Active</div>
        </div>
        <div className="live-pill">
          <div className="pulse"></div> Live · Connected
        </div>
      </div>

      {/* --- LIVE SUMMARY CARDS --- */}
      <div className="sum-grid">
        <div className="sum-card fadein">
          <div className="sum-ico ico-g">⚡</div>
          <div className="sum-lbl">Total Power</div>
          {/* Injecting Live Watts */}
          <div className="sum-val g">{liveData.power.toFixed(1)}</div>
          <div className="sum-unit">Watts</div>
          <div className="sum-note">Live Draw</div>
        </div>

        <div className="sum-card fadein">
          <div className="sum-ico ico-s">📊</div>
          <div className="sum-lbl">Total Usage</div>
          {/* Injecting Live kWh */}
          <div className="sum-val">{liveData.energy.toFixed(3)}</div>
          <div className="sum-unit">kWh consumed</div>
          <div className="sum-note">Cumulative</div>
        </div>

        <div className="sum-card fadein">
          <div className="sum-ico ico-a">💰</div>
          <div className="sum-lbl">Estimated Cost</div>
          {/* Injecting Calculated Cost */}
          <div className="sum-val a">₱{dailyCost}</div>
          <div className="sum-unit">at ₱12.00/kWh</div>
          <div className="sum-note">Monthly est: <b>₱{monthlyEst}</b></div>
        </div>

        <div className="sum-card fadein">
          <div className="sum-ico ico-b">🔌</div>
          <div className="sum-lbl">Live Voltage</div>
          {/* Injecting Live Voltage */}
          <div className="sum-val">{liveData.voltage.toFixed(1)}</div>
          <div className="sum-unit">Volts AC · 60 Hz</div>
          <div className="sum-note">Current: <b>{liveData.current.toFixed(3)} A</b></div>
        </div>
      </div>

      {/* --- APPLIANCE SLOTS --- */}
      <div className="sec-hdr" style={{ marginTop: '30px' }}>
        <div className="sec-title">Hardware Sensors</div>
        <div className="sec-sub">Active PZEM-004T Nodes</div>
      </div>
      
      <div className="ap-grid">
        {/* Slot 1: The REAL Sensor */}
        <div className="ap-card on fadein">
          <div className="ap-ico">📡</div>
          <div className="ap-name">Main AC Line</div>
          <div className="ap-slot-lbl">Sensor Node 1</div>
          
          <div className="ap-row"><span className="ap-rlbl">Power</span><span className="ap-rval g">{liveData.power.toFixed(1)}W</span></div>
          <div className="ap-row"><span className="ap-rlbl">Voltage</span><span className="ap-rval">{liveData.voltage.toFixed(1)}V</span></div>
          <div className="ap-row"><span className="ap-rlbl">Current</span><span className="ap-rval">{liveData.current.toFixed(3)}A</span></div>
          
          <div className="ap-bar-bg"><div className="ap-bar" style={{ width: '100%' }}></div></div>
          <div className="ap-tgl-row">
            <div className="ap-tgl"></div>
            <span className="ap-tgl-lbl">Live</span>
          </div>
        </div>

        {/* Slot 2: Empty Placeholder for future */}
        <div className="ap-card empty fadein">
          <div className="empty-inner">
            <div className="empty-ico">🔌</div>
            <div className="empty-lbl">Empty slot</div>
            <div className="empty-cta">+ Add hardware node</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WattWatchDashboard;