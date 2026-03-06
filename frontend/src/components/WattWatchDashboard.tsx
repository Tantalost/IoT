import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
// 1. Import Chart.js components
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// 2. Register the Chart.js elements
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler
);

interface EnergyData {
  voltage: number;
  current: number;
  power: number;
  energy: number;
  timestamp?: string; // Added timestamp for the chart
}

const socket = io('http://localhost:3000'); 
const PHP_RATE = 12; 

const WattWatchDashboard: React.FC = () => {
  const [liveData, setLiveData] = useState<EnergyData>({ voltage: 0, current: 0, power: 0, energy: 0 });
  const [history, setHistory] = useState<EnergyData[]>([]);

  useEffect(() => {
    // --- 1. Fetch Historical Data for the Chart ---
    const fetchHistory = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/energy/history');
        const data = await response.json();
        setHistory(data);
      } catch (error) {
        console.error("Failed to fetch history:", error);
      }
    };
    fetchHistory();

    // --- 2. Listen for Live WebSocket Updates ---
    socket.on('live_power_reading', (data: EnergyData) => {
      setLiveData(data);
      
      // Dynamically push the new live reading into the chart history!
      setHistory((prevHistory) => {
        const updatedHistory = [...prevHistory, data];
        // Keep the chart looking clean by only showing the last 20 points
        if (updatedHistory.length > 20) updatedHistory.shift(); 
        return updatedHistory;
      });
    });

    return () => {
      socket.off('live_power_reading');
    };
  }, []);

  const dailyCost = (liveData.energy * PHP_RATE).toFixed(2);
  const monthlyEst = (parseFloat(dailyCost) * 30).toFixed(0);

  // --- 3. Build the Chart Configuration ---
  const chartDataConfig = {
    // Format the timestamps to show just the time (e.g., "14:05:30")
    labels: history.map(item => {
      const date = item.timestamp ? new Date(item.timestamp) : new Date();
      return date.toLocaleTimeString([], { hour12: false }); 
    }),
    datasets: [
      {
        label: 'Power Draw (Watts)',
        data: history.map(item => item.power),
        borderColor: '#16a361', // The WattWatch Green
        backgroundColor: 'rgba(22, 163, 97, 0.1)', // Light green fill
        fill: true,
        tension: 0.4, // Adds that smooth curve to the line
        pointRadius: 3,
        pointBackgroundColor: '#16a361',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } }, // Hide legend to match your clean UI
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true },
    },
  };

  return (
    <div className="content">
      {/* ... (Keep your existing Topbar and sum-grid exact same as before) ... */}
      <div className="topbar">
        <div>
          <div className="page-title">Energy Dashboard</div>
          <div className="page-sub">Real-time monitoring · Main Line Active</div>
        </div>
        <div className="live-pill"><div className="pulse"></div> Live · Connected</div>
      </div>

      <div className="sum-grid">
        <div className="sum-card fadein">
          <div className="sum-ico ico-g">⚡</div>
          <div className="sum-lbl">Total Power</div>
          <div className="sum-val g">{liveData.power.toFixed(1)}</div>
          <div className="sum-unit">Watts</div>
          <div className="sum-note">Live Draw</div>
        </div>
        <div className="sum-card fadein">
          <div className="sum-ico ico-s">📊</div>
          <div className="sum-lbl">Total Usage</div>
          <div className="sum-val">{liveData.energy.toFixed(3)}</div>
          <div className="sum-unit">kWh consumed</div>
          <div className="sum-note">Cumulative</div>
        </div>
        <div className="sum-card fadein">
          <div className="sum-ico ico-a">💰</div>
          <div className="sum-lbl">Estimated Cost</div>
          <div className="sum-val a">₱{dailyCost}</div>
          <div className="sum-unit">at ₱12.00/kWh</div>
          <div className="sum-note">Monthly est: <b>₱{monthlyEst}</b></div>
        </div>
        <div className="sum-card fadein">
          <div className="sum-ico ico-b">🔌</div>
          <div className="sum-lbl">Live Voltage</div>
          <div className="sum-val">{liveData.voltage.toFixed(1)}</div>
          <div className="sum-unit">Volts AC · 60 Hz</div>
          <div className="sum-note">Current: <b>{liveData.current.toFixed(3)} A</b></div>
        </div>
      </div>

      {/* --- NEW: THE CHART ROW --- */}
      <div className="chart-row" style={{ marginTop: '30px' }}>
        <div className="chart-card" style={{ gridColumn: 'span 3', height: '300px' }}>
          <div className="chart-title">Power Usage Over Time</div>
          <div className="chart-sub">Live Wattage History (Main Line)</div>
          <div style={{ height: '220px', width: '100%' }}>
            {/* Render the Line Chart! */}
            <Line data={chartDataConfig} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* --- APPLIANCE SLOTS (Kept exactly the same) --- */}
      <div className="sec-hdr" style={{ marginTop: '30px' }}>
        <div className="sec-title">Hardware Sensors</div>
        <div className="sec-sub">Active PZEM-004T Nodes</div>
      </div>
      <div className="ap-grid">
        <div className="ap-card on fadein">
          <div className="ap-ico">📡</div>
          <div className="ap-name">Main AC Line</div>
          <div className="ap-slot-lbl">Sensor Node 1</div>
          <div className="ap-row"><span className="ap-rlbl">Power</span><span className="ap-rval g">{liveData.power.toFixed(1)}W</span></div>
          <div className="ap-row"><span className="ap-rlbl">Voltage</span><span className="ap-rval">{liveData.voltage.toFixed(1)}V</span></div>
          <div className="ap-row"><span className="ap-rlbl">Current</span><span className="ap-rval">{liveData.current.toFixed(3)}A</span></div>
          <div className="ap-bar-bg"><div className="ap-bar" style={{ width: '100%' }}></div></div>
        </div>
      </div>
    </div>
  );
};

export default WattWatchDashboard;