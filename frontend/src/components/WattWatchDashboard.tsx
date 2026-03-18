import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import ApplianceModal from './ApplianceModal';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler);

// Update interfaces for the array structure
interface EnergyNode {
  id: number;
  voltage: number;
  current: number;
  power: number;
  energy: number;
}

interface EnergyData {
  nodes: EnergyNode[];
  timestamp?: string;
}

interface DashboardProps {
  liveData: EnergyData;
  history: EnergyData[];
  phpRate: number;
}

const WattWatchDashboard: React.FC<DashboardProps> = ({ liveData, history, phpRate }) => {
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth <= 768);

  // Set Slots 1 AND 2 to be real hardware nodes
  const [nodesConfig, setNodesConfig] = useState([
    { id: 1, name: 'Main AC Line', type: 'main', active: true, isReal: true },
    { id: 2, name: 'Second AC Line', type: 'main', active: true, isReal: true },
    { id: 3, name: 'Empty Slot', type: 'empty', active: false, isReal: false },
    { id: 4, name: 'Empty Slot', type: 'empty', active: false, isReal: false },
    { id: 5, name: 'Empty Slot', type: 'empty', active: false, isReal: false },
  ]);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleOpenModal = (slotId: number) => { setSelectedSlot(slotId); setModalOpen(true); };
  const handleAddAppliance = (name: string, type: string) => {
    setNodesConfig(nodesConfig.map(n => n.id === selectedSlot ? { ...n, name, type, active: true } : n));
    setModalOpen(false);
  };
  const handleRemoveAppliance = (slotId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setNodesConfig(nodesConfig.map(n => n.id === slotId ? { ...n, name: 'Empty Slot', type: 'empty', active: false } : n));
  };

  // --- CALCULATE COMBINED TOTALS FOR SUMMARY CARDS ---
  // Safely default to empty array if liveData.nodes is undefined while loading
  const activeNodes = liveData?.nodes || [];
  const totalPower = activeNodes.reduce((sum, node) => sum + (node.power || 0), 0);
  const totalEnergy = activeNodes.reduce((sum, node) => sum + (node.energy || 0), 0);
  const avgVoltage = activeNodes.length > 0 ? activeNodes[0].voltage : 0; // Usually voltage is the same on the same circuit
  
  const dailyCost = (totalEnergy * phpRate).toFixed(2);
  const monthlyEst = (parseFloat(dailyCost) * 30).toFixed(0);

  // Helper function to safely grab a specific node's data for the hardware cards
  const getNodeData = (id: number) => {
    return activeNodes.find(n => n.id === id) || { power: 0, voltage: 0, current: 0 };
  };

  // Chart configuration (Charting Total Power over time)
  const chartDataConfig = {
    labels: history.map(item => {
      const date = item.timestamp ? new Date(item.timestamp) : new Date();
      return date.toLocaleTimeString([], { hour12: false }); 
    }),
    datasets: [{
        label: 'Total Power (Watts)',
        // Sum up the power of all nodes in history array
        data: history.map(item => (item.nodes || []).reduce((sum, n) => sum + (n.power || 0), 0)),
        borderColor: '#16a361', backgroundColor: 'rgba(22, 163, 97, 0.1)', fill: true, tension: 0.4, 
        pointRadius: isMobile ? 0 : 3, pointBackgroundColor: '#16a361',
    }],
  };

  const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: isMobile ? 5 : 10 } }, y: { beginAtZero: true } } };

  // ════════════════════════════════════════════════════════════
  // 📱 MOBILE LAYOUT RENDER
  // ════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <div className="mob-page visible" id="page-dashboard">
        <div className="mob-sum-grid">
          <div className="mob-sum-card fadein"><div className="mob-sum-row"><div className="mob-sum-ico ico-g">⚡</div><div className="mob-sum-lbl">Total Power</div></div><div className="mob-sum-val g">{totalPower.toFixed(0)}</div><div className="mob-sum-unit">Watts combined</div></div>
          <div className="mob-sum-card fadein"><div className="mob-sum-row"><div className="mob-sum-ico ico-a">💰</div><div className="mob-sum-lbl">Cost</div></div><div className="mob-sum-val a">₱{dailyCost}</div><div className="mob-sum-unit">Est. today</div></div>
          <div className="mob-sum-card fadein"><div className="mob-sum-row"><div className="mob-sum-ico ico-s">📊</div><div className="mob-sum-lbl">Usage</div></div><div className="mob-sum-val">{totalEnergy.toFixed(2)}</div><div className="mob-sum-unit">kWh today</div></div>
          <div className="mob-sum-card fadein"><div className="mob-sum-row"><div className="mob-sum-ico ico-b">🔌</div><div className="mob-sum-lbl">Voltage</div></div><div className="mob-sum-val">{avgVoltage.toFixed(1)}</div><div className="mob-sum-unit">Volts avg</div></div>
        </div>

        <div className="sec-hdr"><div className="sec-title">Active Sensor Nodes</div></div>
        <div className="mob-ap-list">
          {nodesConfig.map(nodeConf => {
            if (nodeConf.type === 'empty') {
              return (
                <div key={nodeConf.id} className="mob-ap-item empty fadein" onClick={() => handleOpenModal(nodeConf.id)}>
                  <div className="mob-ap-ico">🔌</div>
                  <div className="mob-ap-info"><div className="mob-ap-slot">Slot {nodeConf.id}</div><div className="mob-add-row">+ Tap to add appliance</div></div>
                </div>
              );
            }
            const liveStats = getNodeData(nodeConf.id);
            return (
              <div key={nodeConf.id} className="mob-ap-item on fadein">
                <div className="mob-ap-ico">{nodeConf.isReal ? '📡' : '🔌'}</div>
                <div className="mob-ap-info">
                  <div className="mob-ap-slot">Slot {nodeConf.id}</div><div className="mob-ap-name">{nodeConf.name}</div>
                  <div className="mob-ap-meta"><span><b className="g">{liveStats.power.toFixed(1)}W</b></span><span>{liveStats.voltage.toFixed(1)}V / {liveStats.current.toFixed(2)}A</span></div>
                </div>
                <div className="mob-ap-right">
                  {!nodeConf.isReal && <button className="mob-rm-btn" onClick={(e) => handleRemoveAppliance(nodeConf.id, e)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                  <div className="mob-ap-tgl"></div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mob-chart-list"><div className="mob-chart-card"><div className="chart-title">Usage Over Time</div><div className="chart-sub">Combined Wattage History</div><div style={{ height: '180px', width: '100%' }}><Line data={chartDataConfig} options={chartOptions} /></div></div></div>
        <ApplianceModal isOpen={modalOpen} slotNumber={selectedSlot || 0} onClose={() => setModalOpen(false)} onAdd={handleAddAppliance} />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // 💻 DESKTOP LAYOUT RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <div className="content">
      <div className="topbar"><div><div className="page-title">Energy Dashboard</div><div className="page-sub">Real-time monitoring · Multi-Node Active</div></div><div className="live-pill"><div className="pulse"></div> Live · Connected</div></div>

      <div className="sum-grid">
        <div className="sum-card fadein"><div className="sum-ico ico-g">⚡</div><div className="sum-lbl">Total Power</div><div className="sum-val g">{totalPower.toFixed(1)}</div><div className="sum-unit">Watts</div><div className="sum-note">Combined Draw</div></div>
        <div className="sum-card fadein"><div className="sum-ico ico-s">📊</div><div className="sum-lbl">Total Usage</div><div className="sum-val">{totalEnergy.toFixed(3)}</div><div className="sum-unit">kWh consumed</div><div className="sum-note">Cumulative</div></div>
        <div className="sum-card fadein"><div className="sum-ico ico-a">💰</div><div className="sum-lbl">Estimated Cost</div><div className="sum-val a">₱{dailyCost}</div><div className="sum-unit">at ₱{phpRate.toFixed(2)}/kWh</div><div className="sum-note">Monthly est: <b>₱{monthlyEst}</b></div></div>
        <div className="sum-card fadein"><div className="sum-ico ico-b">🔌</div><div className="sum-lbl">Live Voltage</div><div className="sum-val">{avgVoltage.toFixed(1)}</div><div className="sum-unit">Volts AC · 60 Hz</div><div className="sum-note">Main Line</div></div>
      </div>

      <div className="chart-row" style={{ marginTop: '30px' }}><div className="chart-card" style={{ gridColumn: 'span 3', height: '300px' }}><div className="chart-title">Power Usage Over Time</div><div className="chart-sub">Combined Wattage History</div><div style={{ height: '220px', width: '100%' }}><Line data={chartDataConfig} options={chartOptions} /></div></div></div>

      <div className="sec-hdr" style={{ marginTop: '30px' }}><div className="sec-title">Hardware Sensors</div><div className="sec-sub">Active PZEM-004T Nodes</div></div>
      <div className="ap-grid">
        {nodesConfig.map(nodeConf => {
          if (nodeConf.type === 'empty') {
            return (
              <div key={nodeConf.id} className="ap-card empty fadein" onClick={() => handleOpenModal(nodeConf.id)}>
                <div className="empty-inner"><div className="empty-ico">🔌</div><div className="empty-lbl">Empty slot</div><div className="empty-cta">+ Add hardware node</div></div>
              </div>
            );
          }
          const liveStats = getNodeData(nodeConf.id);
          return (
            <div key={nodeConf.id} className="ap-card on fadein">
              {!nodeConf.isReal && <button className="ap-rm" onClick={(e) => handleRemoveAppliance(nodeConf.id, e)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
              <div className="ap-ico">{nodeConf.isReal ? '📡' : '🔌'}</div><div className="ap-name">{nodeConf.name}</div><div className="ap-slot-lbl">Sensor Node {nodeConf.id}</div>
              <div className="ap-row"><span className="ap-rlbl">Power</span><span className="ap-rval g">{liveStats.power.toFixed(1)}W</span></div>
              <div className="ap-row"><span className="ap-rlbl">Voltage</span><span className="ap-rval">{liveStats.voltage.toFixed(1)}V</span></div>
              <div className="ap-bar-bg"><div className="ap-bar" style={{ width: nodeConf.isReal ? '100%' : '0%' }}></div></div>
            </div>
          );
        })}
      </div>

      <ApplianceModal isOpen={modalOpen} slotNumber={selectedSlot || 0} onClose={() => setModalOpen(false)} onAdd={handleAddAppliance} />
    </div>
  );
};

export default WattWatchDashboard;