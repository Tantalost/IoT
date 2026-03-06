import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { EnergyData } from '../App'; // Import the type we defined in App.tsx

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler);

// Define what props this component expects to receive from App.tsx
interface DashboardProps {
  liveData: EnergyData;
  history: EnergyData[];
  phpRate: number;
}

const WattWatchDashboard: React.FC<DashboardProps> = ({ liveData, history, phpRate }) => {
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const dailyCost = (liveData.energy * phpRate).toFixed(2);
  const monthlyEst = (parseFloat(dailyCost) * 30).toFixed(0);

  const chartDataConfig = {
    labels: history.map(item => {
      const date = item.timestamp ? new Date(item.timestamp) : new Date();
      return date.toLocaleTimeString([], { hour12: false }); 
    }),
    datasets: [
      {
        label: 'Power Draw (Watts)',
        data: history.map(item => item.power),
        borderColor: '#16a361', 
        backgroundColor: 'rgba(22, 163, 97, 0.1)', 
        fill: true,
        tension: 0.4, 
        pointRadius: isMobile ? 0 : 3,
        pointBackgroundColor: '#16a361',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } }, 
    scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: isMobile ? 5 : 10 } }, y: { beginAtZero: true } },
  };

  if (isMobile) {
    return (
      <div className="mob-page visible" id="page-dashboard">
        <div className="mob-sum-grid">
          <div className="mob-sum-card fadein">
            <div className="mob-sum-row"><div className="mob-sum-ico ico-g">⚡</div><div className="mob-sum-lbl">Power</div></div>
            <div className="mob-sum-val g">{liveData.power.toFixed(0)}</div><div className="mob-sum-unit">Watts total</div>
          </div>
          <div className="mob-sum-card fadein">
            <div className="mob-sum-row"><div className="mob-sum-ico ico-a">💰</div><div className="mob-sum-lbl">Cost</div></div>
            <div className="mob-sum-val a">₱{dailyCost}</div><div className="mob-sum-unit">Est. today</div>
          </div>
          <div className="mob-sum-card fadein">
            <div className="mob-sum-row"><div className="mob-sum-ico ico-s">📊</div><div className="mob-sum-lbl">Usage</div></div>
            <div className="mob-sum-val">{liveData.energy.toFixed(2)}</div><div className="mob-sum-unit">kWh today</div>
          </div>
          <div className="mob-sum-card fadein">
            <div className="mob-sum-row"><div className="mob-sum-ico ico-b">🔌</div><div className="mob-sum-lbl">Voltage</div></div>
            <div className="mob-sum-val">{liveData.voltage.toFixed(1)}</div><div className="mob-sum-unit">Volts avg</div>
          </div>
        </div>

        <div className="sec-hdr"><div className="sec-title">Active Sensor Nodes</div></div>
        <div className="mob-ap-list">
          <div className="mob-ap-item on fadein">
            <div className="mob-ap-ico">📡</div>
            <div className="mob-ap-info">
              <div className="mob-ap-slot">Sensor Node 1</div><div className="mob-ap-name">Main AC Line</div>
              <div className="mob-ap-meta"><span><b className="g">{liveData.power.toFixed(1)}W</b></span><span>{liveData.voltage.toFixed(1)}V / {liveData.current.toFixed(3)}A</span></div>
            </div>
            <div className="mob-ap-right"><div className="mob-ap-tgl"></div></div>
          </div>
        </div>

        <div className="mob-chart-list">
          <div className="mob-chart-card">
            <div className="chart-title">Usage Over Time</div><div className="chart-sub">Live Wattage History</div>
            <div style={{ height: '180px', width: '100%' }}><Line data={chartDataConfig} options={chartOptions} /></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="topbar">
        <div><div className="page-title">Energy Dashboard</div><div className="page-sub">Real-time monitoring · Main Line Active</div></div>
        <div className="live-pill"><div className="pulse"></div> Live · Connected</div>
      </div>

      <div className="sum-grid">
        <div className="sum-card fadein">
          <div className="sum-ico ico-g">⚡</div><div className="sum-lbl">Total Power</div>
          <div className="sum-val g">{liveData.power.toFixed(1)}</div><div className="sum-unit">Watts</div><div className="sum-note">Live Draw</div>
        </div>
        <div className="sum-card fadein">
          <div className="sum-ico ico-s">📊</div><div className="sum-lbl">Total Usage</div>
          <div className="sum-val">{liveData.energy.toFixed(3)}</div><div className="sum-unit">kWh consumed</div><div className="sum-note">Cumulative</div>
        </div>
        <div className="sum-card fadein">
          <div className="sum-ico ico-a">💰</div><div className="sum-lbl">Estimated Cost</div>
          <div className="sum-val a">₱{dailyCost}</div><div className="sum-unit">at ₱{phpRate.toFixed(2)}/kWh</div><div className="sum-note">Monthly est: <b>₱{monthlyEst}</b></div>
        </div>
        <div className="sum-card fadein">
          <div className="sum-ico ico-b">🔌</div><div className="sum-lbl">Live Voltage</div>
          <div className="sum-val">{liveData.voltage.toFixed(1)}</div><div className="sum-unit">Volts AC · 60 Hz</div><div className="sum-note">Current: <b>{liveData.current.toFixed(3)} A</b></div>
        </div>
      </div>

      <div className="chart-row" style={{ marginTop: '30px' }}>
        <div className="chart-card" style={{ gridColumn: 'span 3', height: '300px' }}>
          <div className="chart-title">Power Usage Over Time</div><div className="chart-sub">Live Wattage History (Main Line)</div>
          <div style={{ height: '220px', width: '100%' }}><Line data={chartDataConfig} options={chartOptions} /></div>
        </div>
      </div>

      <div className="sec-hdr" style={{ marginTop: '30px' }}><div className="sec-title">Hardware Sensors</div><div className="sec-sub">Active PZEM-004T Nodes</div></div>
      <div className="ap-grid">
        <div className="ap-card on fadein">
          <div className="ap-ico">📡</div><div className="ap-name">Main AC Line</div><div className="ap-slot-lbl">Sensor Node 1</div>
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