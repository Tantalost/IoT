import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import ApplianceModal from './ApplianceModal';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler);

// Update interfaces
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
  alertThreshold: number;
  alertsEnabled: boolean;
}

interface ApplianceConfig {
  name: string;
  type: string;
  lastSeenPower?: number;
  lastSeenTimestamp?: number;
}

interface ConnectionState {
  isConnected: boolean;
  lastPower: number;
  lastTimestamp: number;
}

// Smart Dictionary: Expected maximum wattage for different types to calculate usage percentages
const APPLIANCE_SPECS: Record<string, { expectedWatts: number, icon: string }> = {
  ac: { expectedWatts: 1500, icon: '❄️' },
  fridge: { expectedWatts: 400, icon: '🧊' },
  fan: { expectedWatts: 70, icon: '🌀' },
  desktop: { expectedWatts: 500, icon: '💻' },
  microwave: { expectedWatts: 1200, icon: '🍱' },
  default: { expectedWatts: 1000, icon: '🔌' }
};

const WattWatchDashboard: React.FC<DashboardProps> = ({ liveData, history, phpRate, alertThreshold, alertsEnabled }) => {
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth <= 768);
  
  // 🚀 NEW: Alert system state
  const [activeAlerts, setActiveAlerts] = useState<Set<number>>(new Set());
  const [alertHistory, setAlertHistory] = useState<Array<{
    nodeId: number;
    nodeName: string;
    power: number;
    timestamp: number;
    acknowledged: boolean;
  }>>(() => {
    const saved = localStorage.getItem('wattwatch_alert_history');
    return saved ? JSON.parse(saved) : [];
  });
  
  // 🚀 FIX: Load the saved nodes from Local Storage on boot!
  const [configuredNodes, setConfiguredNodes] = useState<Record<number, ApplianceConfig>>(() => {
    const saved = localStorage.getItem('wattwatch_dashboard_nodes');
    return saved ? JSON.parse(saved) : {};
  });

  // 🚀 NEW: Track connection states for each node
  const [connectionStates, setConnectionStates] = useState<Record<number, ConnectionState>>(() => {
    const saved = localStorage.getItem('wattwatch_connection_states');
    return saved ? JSON.parse(saved) : {};
  });

  // 🚀 NEW: Track nodes that need re-identification
  const [nodesNeedingReID, setNodesNeedingReID] = useState<Set<number>>(new Set());

  // 🚀 FIX: Save to Local Storage every time you add or remove an appliance
  useEffect(() => {
    localStorage.setItem('wattwatch_dashboard_nodes', JSON.stringify(configuredNodes));
  }, [configuredNodes]);

  // 🚀 NEW: Save connection states to Local Storage
  useEffect(() => {
    localStorage.setItem('wattwatch_connection_states', JSON.stringify(connectionStates));
  }, [connectionStates]);

  // 🚀 NEW: Save alert history to Local Storage
  useEffect(() => {
    localStorage.setItem('wattwatch_alert_history', JSON.stringify(alertHistory));
  }, [alertHistory]);

  // --- 1. APPLY THE NOISE FLOOR (Clean the Ghost Data) ---
  const NOISE_FLOOR_WATTS = 3.0; // Ignore any ghost readings under 3 Watts

  const cleanNodes = (liveData?.nodes || []).map(node => ({
    ...node,
    // If power is below the noise floor, force power and current to exactly 0
    power: node.power < NOISE_FLOOR_WATTS ? 0 : node.power,
    current: node.power < NOISE_FLOOR_WATTS ? 0 : node.current
  }));

  // 🚀 NEW: High consumption alert monitoring
  useEffect(() => {
    if (!alertsEnabled) return;

    const currentTime = Date.now();
    const ALERT_COOLDOWN = 30000; // 30 seconds between alerts for same node

    cleanNodes.forEach(node => {
      if (node.power >= alertThreshold) {
        const config = configuredNodes[node.id];
        const nodeName = config?.name || `Slot ${node.id}`;
        
        // Check if we recently alerted for this node
        const lastAlert = alertHistory
          .filter(alert => alert.nodeId === node.id && !alert.acknowledged)
          .sort((a, b) => b.timestamp - a.timestamp)[0];
        
        const timeSinceLastAlert = lastAlert ? currentTime - lastAlert.timestamp : Infinity;
        
        if (timeSinceLastAlert > ALERT_COOLDOWN) {
          // Trigger new alert
          const newAlert = {
            nodeId: node.id,
            nodeName,
            power: node.power,
            timestamp: currentTime,
            acknowledged: false
          };
          
          setAlertHistory(prev => [...prev, newAlert]);
          setActiveAlerts(prev => new Set(prev).add(node.id));
          
          console.log(`🚨 HIGH CONSUMPTION ALERT: ${nodeName} drawing ${node.power.toFixed(1)}W (threshold: ${alertThreshold}W)`);
          
          // Auto-remove alert after 10 seconds if not acknowledged
          setTimeout(() => {
            setActiveAlerts(prev => {
              const newSet = new Set(prev);
              newSet.delete(node.id);
              return newSet;
            });
          }, 10000);
        }
      } else {
        // Remove from active alerts if power dropped below threshold
        setActiveAlerts(prev => {
          const newSet = new Set(prev);
          newSet.delete(node.id);
          return newSet;
        });
      }
    });
  }, [cleanNodes, alertThreshold, alertsEnabled, configuredNodes, alertHistory]);

  // 🚀 NEW: Detect device connections/disconnections
  useEffect(() => {
    const currentTime = Date.now();
    const POWER_CHANGE_THRESHOLD = 0.5; // 50% change indicates new device
    const MIN_POWER_THRESHOLD = 5.0; // Minimum power to consider a device "connected"
    const DISCONNECT_TIMEOUT = 10000; // 10 seconds without power = disconnected

    const nodesForConnectionCheck = cleanNodes;

    nodesForConnectionCheck.forEach(node => {
      const nodeId = node.id;
      const currentPower = node.power;
      const previousState = connectionStates[nodeId];

      if (!previousState) {
        // First time seeing this node
        setConnectionStates(prev => ({
          ...prev,
          [nodeId]: {
            isConnected: currentPower > MIN_POWER_THRESHOLD,
            lastPower: currentPower,
            lastTimestamp: currentTime
          }
        }));
        return;
      }

      const timeSinceLastSeen = currentTime - previousState.lastTimestamp;
      const wasConnected = previousState.isConnected;
      const isNowConnected = currentPower > MIN_POWER_THRESHOLD;
      const powerRatio = previousState.lastPower > 0 ? currentPower / previousState.lastPower : 0;

      // Check for disconnection (no power for timeout period)
      if (wasConnected && timeSinceLastSeen > DISCONNECT_TIMEOUT && !isNowConnected) {
        console.log(`🔌 Node ${nodeId} disconnected`);
        setConnectionStates(prev => ({
          ...prev,
          [nodeId]: {
            isConnected: false,
            lastPower: currentPower,
            lastTimestamp: currentTime
          }
        }));
        return;
      }

      // Check for new connection or significant power change
      if (!wasConnected && isNowConnected) {
        console.log(`⚡ Node ${nodeId} connected with ${currentPower.toFixed(1)}W`);
        setConnectionStates(prev => ({
          ...prev,
          [nodeId]: {
            isConnected: true,
            lastPower: currentPower,
            lastTimestamp: currentTime
          }
        }));

        // If this node was previously configured, check if it might be a different device
        if (configuredNodes[nodeId]) {
          const significantPowerChange = powerRatio < (1 - POWER_CHANGE_THRESHOLD) || powerRatio > (1 + POWER_CHANGE_THRESHOLD);
          if (significantPowerChange) {
            console.log(`🤔 Node ${nodeId} power changed significantly, requesting re-identification`);
            setNodesNeedingReID(prev => new Set(prev).add(nodeId));
          }
        }
      } else if (wasConnected && isNowConnected) {
        // Update timestamp for connected device
        setConnectionStates(prev => ({
          ...prev,
          [nodeId]: {
            ...prev[nodeId],
            lastTimestamp: currentTime
          }
        }));
      }
    });
  }, [liveData, configuredNodes, connectionStates]);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleOpenModal = (slotId: number) => { setSelectedSlot(slotId); setModalOpen(true); };

  const handleAddAppliance = (name: string, type: string) => {
    if (selectedSlot !== null) {
      setConfiguredNodes(prev => ({
        ...prev,
        [selectedSlot]: {
          name,
          type,
          lastSeenPower: (liveData?.nodes || []).find(n => n.id === selectedSlot)?.power || 0,
          lastSeenTimestamp: Date.now()
        }
      }));
      // Remove from re-identification list if it was there
      setNodesNeedingReID(prev => {
        const newSet = new Set(prev);
        newSet.delete(selectedSlot);
        return newSet;
      });
    }
    setModalOpen(false);
  };

  const handleRemoveAppliance = (slotId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfiguredNodes(prev => {
      const updated = { ...prev };
      delete updated[slotId];
      return updated;
    });
    // Also remove from re-identification list
    setNodesNeedingReID(prev => {
      const newSet = new Set(prev);
      newSet.delete(slotId);
      return newSet;
    });
  };

  // 🚀 NEW: Handle alert acknowledgment
  const handleAcknowledgeAlert = (nodeId: number) => {
    setActiveAlerts(prev => {
      const newSet = new Set(prev);
      newSet.delete(nodeId);
      return newSet;
    });
    
    setAlertHistory(prev => prev.map(alert => 
      alert.nodeId === nodeId && !alert.acknowledged 
        ? { ...alert, acknowledged: true }
        : alert
    ));
  };

  // 🚀 NEW: Handle device re-confirmation
  const handleConfirmSameDevice = (nodeId: number) => {
    // Update the power baseline for this device
    const currentPower = (liveData?.nodes || []).find(n => n.id === nodeId)?.power || 0;
    setConfiguredNodes(prev => ({
      ...prev,
      [nodeId]: {
        ...prev[nodeId],
        lastSeenPower: currentPower,
        lastSeenTimestamp: Date.now()
      }
    }));
    setNodesNeedingReID(prev => {
      const newSet = new Set(prev);
      newSet.delete(nodeId);
      return newSet;
    });
  };

  const handleConfirmNewDevice = (nodeId: number) => {
    // Remove the old configuration and open modal for new device
    setConfiguredNodes(prev => {
      const updated = { ...prev };
      delete updated[nodeId];
      return updated;
    });
    setNodesNeedingReID(prev => {
      const newSet = new Set(prev);
      newSet.delete(nodeId);
      return newSet;
    });
    setSelectedSlot(nodeId);
    setModalOpen(true);
  };

  // --- 2. CALCULATE SUMMARY TOTALS (Using Cleaned Data) ---
  const totalPower = cleanNodes.reduce((sum, node) => sum + (node.power || 0), 0);
  const totalEnergy = cleanNodes.reduce((sum, node) => sum + (node.energy || 0), 0);

  // Get voltage from any node that is active, otherwise 0
  const avgVoltage = cleanNodes.find(n => n.voltage > 0)?.voltage || 0;

  const dailyCost = (totalEnergy * phpRate).toFixed(2);
  const monthlyEst = (parseFloat(dailyCost) * 30).toFixed(0);

  // --- 3. THE SMART FILTER ---
  // Only show widgets for nodes that are actually drawing real power (above 0)
  const activeNodes = cleanNodes.filter(node => node.power > 0);

  // Chart configuration
  const chartDataConfig = {
    labels: history.map(item => {
      const date = item.timestamp ? new Date(item.timestamp) : new Date();
      return date.toLocaleTimeString([], { hour12: false });
    }),
    datasets: [{
      label: 'Total Power (Watts)',
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

        <div className="sec-hdr"><div className="sec-title">Active Devices Detected</div></div>
        <div className="mob-ap-list">
          {activeNodes.length === 0 ? (
            <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--text3)' }}>
              🔌 No appliances currently drawing power.
            </div>
          ) : (
            activeNodes.map(node => {
              const config = configuredNodes[node.id];

              // IF NOT CONFIGURED YET: Show identification prompt
              if (!config || nodesNeedingReID.has(node.id)) {
                const needsReID = nodesNeedingReID.has(node.id);
                return (
                  <div key={node.id} className="mob-ap-item empty fadein" onClick={() => handleOpenModal(node.id)} style={{ border: needsReID ? '2px dashed #ef4444' : '2px dashed var(--primary)' }}>
                    <div className="mob-ap-ico" style={{ animation: 'pulse 2s infinite' }}>⚡</div>
                    <div className="mob-ap-info">
                      <div className="mob-ap-slot">
                        {needsReID ? `Slot ${node.id} - New Device Detected` : `Slot ${node.id} Active (${node.power.toFixed(0)}W)`}
                      </div>
                      <div className="mob-add-row">
                        {needsReID ? '+ Tap to confirm device' : '+ Tap to identify device'}
                      </div>
                    </div>
                  </div>
                );
              }

              // IF CONFIGURED: Calculate logic against its type
              const spec = APPLIANCE_SPECS[config.type] || APPLIANCE_SPECS.default;
              const usagePercent = Math.min((node.power / spec.expectedWatts) * 100, 100);
              const isOverload = node.power > (spec.expectedWatts * 1.3); // 30% over expected limit

              return (
                <div key={node.id} className="mob-ap-item on fadein" style={{ borderLeft: isOverload ? '4px solid #ef4444' : '4px solid var(--primary)' }}>
                  <div className="mob-ap-ico">{spec.icon}</div>
                  <div className="mob-ap-info">
                    <div className="mob-ap-slot">Slot {node.id}</div><div className="mob-ap-name">{config.name}</div>
                    <div className="mob-ap-meta">
                      <span><b className={isOverload ? "a" : "g"} style={{ color: isOverload ? '#ef4444' : '' }}>{node.power.toFixed(1)}W</b></span>
                      <span>{node.voltage.toFixed(1)}V / {node.current.toFixed(2)}A</span>
                    </div>
                    {isOverload && <div style={{ color: '#ef4444', fontSize: '11px', fontWeight: 600 }}>⚠️ Exceeds expected {spec.expectedWatts}W</div>}
                  </div>
                  <div className="mob-ap-right">
                    <button className="mob-rm-btn" onClick={(e) => handleRemoveAppliance(node.id, e)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mob-chart-list"><div className="mob-chart-card"><div className="chart-title">Usage Over Time</div><div className="chart-sub">Combined Wattage History</div><div style={{ height: '180px', width: '100%' }}><Line data={chartDataConfig} options={chartOptions} /></div></div></div>
        <ApplianceModal 
          isOpen={modalOpen} 
          slotNumber={selectedSlot || 0} 
          onClose={() => setModalOpen(false)} 
          onAdd={handleAddAppliance}
          needsReID={selectedSlot !== null && nodesNeedingReID.has(selectedSlot)}
          onConfirmSameDevice={selectedSlot !== null ? () => handleConfirmSameDevice(selectedSlot) : undefined}
          onConfirmNewDevice={selectedSlot !== null ? () => handleConfirmNewDevice(selectedSlot) : undefined}
          previousDeviceName={selectedSlot !== null ? configuredNodes[selectedSlot]?.name : undefined}
        />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // 💻 DESKTOP LAYOUT RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <div className="content">
      <div className="topbar"><div><div className="page-title">Energy Dashboard</div><div className="page-sub">Reactive Sensor Network Active</div></div><div className="live-pill"><div className="pulse"></div> Live · Connected</div></div>

      <div className="sum-grid">
        <div className="sum-card fadein"><div className="sum-ico ico-g">⚡</div><div className="sum-lbl">Total Power</div><div className="sum-val g">{totalPower.toFixed(1)}</div><div className="sum-unit">Watts</div><div className="sum-note">Combined Draw</div></div>
        <div className="sum-card fadein"><div className="sum-ico ico-s">📊</div><div className="sum-lbl">Total Usage</div><div className="sum-val">{totalEnergy.toFixed(3)}</div><div className="sum-unit">kWh consumed</div><div className="sum-note">Cumulative</div></div>
        <div className="sum-card fadein"><div className="sum-ico ico-a">💰</div><div className="sum-lbl">Estimated Cost</div><div className="sum-val a">₱{dailyCost}</div><div className="sum-unit">at ₱{phpRate.toFixed(2)}/kWh</div><div className="sum-note">Monthly est: <b>₱{monthlyEst}</b></div></div>
        <div className="sum-card fadein"><div className="sum-ico ico-b">🔌</div><div className="sum-lbl">Live Voltage</div><div className="sum-val">{avgVoltage.toFixed(1)}</div><div className="sum-unit">Volts AC · 60 Hz</div><div className="sum-note">Main Line</div></div>
      </div>

      <div className="chart-row" style={{ marginTop: '30px' }}><div className="chart-card" style={{ gridColumn: 'span 3', height: '300px' }}><div className="chart-title">Power Usage Over Time</div><div className="chart-sub">Combined Wattage History</div><div style={{ height: '220px', width: '100%' }}><Line data={chartDataConfig} options={chartOptions} /></div></div></div>

      <div className="sec-hdr" style={{ marginTop: '30px' }}><div className="sec-title">Active Devices Detected</div><div className="sec-sub">Widgets only appear when power is drawn</div></div>

      <div className="ap-grid">
        {activeNodes.length === 0 ? (
          <div className="fadein" style={{ gridColumn: 'span 3', padding: '50px', textAlign: 'center', background: 'var(--surface2)', borderRadius: '16px', border: '1px dashed var(--border)' }}>
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>🔌</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text1)' }}>All outlets are idle</div>
            <div style={{ fontSize: '14px', color: 'var(--text3)' }}>Turn an appliance on to view its smart widget.</div>
          </div>
        ) : (
          activeNodes.map(node => {
            const config = configuredNodes[node.id];

            // IF NOT CONFIGURED YET
            if (!config || nodesNeedingReID.has(node.id)) {
              const needsReID = nodesNeedingReID.has(node.id);
              return (
                <div key={node.id} className="ap-card empty fadein" onClick={() => handleOpenModal(node.id)} style={{ cursor: 'pointer', borderColor: needsReID ? '#ef4444' : 'var(--primary)', borderStyle: 'dashed' }}>
                  <div className="empty-inner">
                    <div className="empty-ico" style={{ animation: 'pulse 2s infinite' }}>⚡</div>
                    <div className="empty-lbl" style={{ color: needsReID ? '#ef4444' : 'var(--text1)' }}>
                      {needsReID ? `New Device Detected: ${node.power.toFixed(0)}W` : `Power Spike: ${node.power.toFixed(0)}W`}
                    </div>
                    <div className="empty-cta" style={{ color: needsReID ? '#ef4444' : 'var(--primary)' }}>
                      {needsReID ? `+ Click to confirm Slot ${node.id} device` : `+ Click to Identify Slot ${node.id}`}
                    </div>
                  </div>
                </div>
              );
            }

            // IF CONFIGURED: Calculate logic
            const spec = APPLIANCE_SPECS[config.type] || APPLIANCE_SPECS.default;
            const usagePercent = Math.min((node.power / spec.expectedWatts) * 100, 100);
            const isOverload = node.power > (spec.expectedWatts * 1.3);

            return (
              <div key={node.id} className="ap-card on fadein" style={{ border: isOverload ? '1px solid #ef4444' : '' }}>
                <button className="ap-rm" onClick={(e) => handleRemoveAppliance(node.id, e)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                <div className="ap-ico">{spec.icon}</div>
                <div className="ap-name">{config.name}</div>
                <div className="ap-slot-lbl">Sensor Node {node.id}</div>
                
                <div className="ap-row">
                  <span className="ap-rlbl">Power</span>
                  <span className="ap-rval g" style={{ color: isOverload ? '#ef4444' : '' }}>{node.power.toFixed(1)}W</span>
                </div>
                <div className="ap-row"><span className="ap-rlbl">Current</span><span className="ap-rval">{node.current.toFixed(2)}A</span></div>
                
                {isOverload && <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '8px', fontWeight: 600 }}>⚠️ Exceeds expected draw for {config.type}</div>}
                
                <div className="ap-bar-bg" style={{ marginTop: isOverload ? '5px' : '15px' }}>
                  <div className="ap-bar" style={{ width: `${usagePercent}%`, backgroundColor: isOverload ? '#ef4444' : 'var(--primary)', transition: 'width 0.5s ease-out' }}></div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <ApplianceModal 
        isOpen={modalOpen} 
        slotNumber={selectedSlot || 0} 
        onClose={() => setModalOpen(false)} 
        onAdd={handleAddAppliance}
        needsReID={selectedSlot !== null && nodesNeedingReID.has(selectedSlot)}
        onConfirmSameDevice={selectedSlot !== null ? () => handleConfirmSameDevice(selectedSlot) : undefined}
        onConfirmNewDevice={selectedSlot !== null ? () => handleConfirmNewDevice(selectedSlot) : undefined}
        previousDeviceName={selectedSlot !== null ? configuredNodes[selectedSlot]?.name : undefined}
      />
    </div>
  );
};

export default WattWatchDashboard;