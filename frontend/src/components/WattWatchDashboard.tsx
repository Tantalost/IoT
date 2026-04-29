import React, { useState, useEffect, useMemo } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler, ArcElement, Legend } from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import ApplianceModal from './ApplianceModal';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler, ArcElement, Legend);

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
  apiBaseUrl: string;
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
const APPLIANCE_SPECS: Record<string, { expectedWatts: number }> = {
  charger: { expectedWatts: 20 },
  ac: { expectedWatts: 1500 },
  fridge: { expectedWatts: 400 },
  fan: { expectedWatts: 70 },
  desktop: { expectedWatts: 500 },
  microwave: { expectedWatts: 1200 },
  default: { expectedWatts: 1000 }
};

const MetricIcon: React.FC<{ kind: 'power' | 'devices' | 'cost' | 'voltage' }> = ({ kind }) => {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  if (kind === 'power') {
    return (
      <svg {...common}>
        <path d="M13 2 3 14h7l-1 8 10-12h-7z" />
      </svg>
    );
  }
  if (kind === 'devices') {
    return (
      <svg {...common}>
        <rect x="7" y="3" width="10" height="14" rx="2" />
        <path d="M10 21h4" />
        <path d="M12 17v4" />
      </svg>
    );
  }
  if (kind === 'cost') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 14c0 1.5 1.3 2.5 3 2.5s3-1 3-2.5-1.3-2.5-3-2.5-3-1-3-2.5S10.3 6 12 6s3 1 3 2.5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M3 7h18" />
      <path d="M6 7V5" />
      <path d="M18 7V5" />
      <rect x="4" y="7" width="16" height="12" rx="2" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
    </svg>
  );
};

const ApplianceTypeIcon: React.FC<{ type: string }> = ({ type }) => {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  if (type === 'ac') {
    return <svg {...common}><path d="M4 12h16" /><path d="M7 8h10" /><path d="M7 16h10" /><path d="M10 12v7" /><path d="M14 12v7" /></svg>;
  }
  if (type === 'fridge') {
    return <svg {...common}><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M7 11h10" /><path d="M9 8h.01" /><path d="M9 15h.01" /></svg>;
  }
  if (type === 'fan') {
    return <svg {...common}><circle cx="12" cy="12" r="2" /><path d="M12 4c2 0 3 1.5 3 3s-1 3-3 3" /><path d="M20 12c0 2-1.5 3-3 3s-3-1-3-3" /><path d="M12 20c-2 0-3-1.5-3-3s1-3 3-3" /><path d="M4 12c0-2 1.5-3 3-3s3 1 3 3" /></svg>;
  }
  if (type === 'desktop') {
    return <svg {...common}><rect x="4" y="5" width="16" height="10" rx="2" /><path d="M9 19h6" /><path d="M12 15v4" /></svg>;
  }
  if (type === 'microwave') {
    return <svg {...common}><rect x="3" y="6" width="18" height="12" rx="2" /><rect x="6" y="9" width="8" height="6" rx="1" /><path d="M17 9h.01" /><path d="M17 12h.01" /><path d="M17 15h.01" /></svg>;
  }
  if (type === 'charger') {
    return <svg {...common}><rect x="8" y="3" width="8" height="14" rx="2" /><path d="M10 21h4" /><path d="M12 17v4" /></svg>;
  }
  return <svg {...common}><path d="M7 3h10v4H7z" /><path d="M9 7v5" /><path d="M15 7v5" /><rect x="6" y="12" width="12" height="7" rx="2" /></svg>;
};

const WattWatchDashboard: React.FC<DashboardProps> = ({ liveData, history, phpRate, alertThreshold, alertsEnabled, apiBaseUrl }) => {
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth <= 768);
  const [isTablet, setIsTablet] = useState<boolean>(window.innerWidth <= 1280);
  const [powerTimeRange, setPowerTimeRange] = useState<'live' | '1h' | '24h'>('live');
  
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

  // Track connection states in memory to avoid stale localStorage delays.
  const [, setConnectionStates] = useState<Record<number, ConnectionState>>({});

  // 🚀 NEW: Track nodes that need re-identification
  const [nodesNeedingReID, setNodesNeedingReID] = useState<Set<number>>(new Set());

  const setsEqual = (a: Set<number>, b: Set<number>) => {
    if (a.size !== b.size) return false;
    for (const value of a) {
      if (!b.has(value)) return false;
    }
    return true;
  };

  // 🚀 FIX: Save to Local Storage every time you add or remove an appliance
  useEffect(() => {
    localStorage.setItem('wattwatch_dashboard_nodes', JSON.stringify(configuredNodes));
  }, [configuredNodes]);

  // 🚀 NEW: Save alert history to Local Storage
  useEffect(() => {
    localStorage.setItem('wattwatch_alert_history', JSON.stringify(alertHistory));
  }, [alertHistory]);

  // --- 1. APPLY THE NOISE FLOOR (Clean the Ghost Data) ---
  const NOISE_FLOOR_WATTS = 3.0; // Ignore any ghost readings under 3 Watts

  const cleanNodes = useMemo(() => (
    (liveData?.nodes || []).map(node => ({
      ...node,
      // If power is below the noise floor, force power and current to exactly 0
      power: node.power < NOISE_FLOOR_WATTS ? 0 : node.power,
      current: node.power < NOISE_FLOOR_WATTS ? 0 : node.current
    }))
  ), [liveData]);

  // 🚀 NEW: High consumption alert monitoring
  useEffect(() => {
    if (!alertsEnabled) {
      setActiveAlerts(prev => (prev.size ? new Set() : prev));
      return;
    }

    const currentTime = Date.now();
    const ALERT_COOLDOWN = 30000; // 30 seconds between alerts for same node
    const nextActiveAlerts = new Set<number>();

    cleanNodes.forEach(node => {
      if (node.power >= alertThreshold) {
        nextActiveAlerts.add(node.id);
        const config = configuredNodes[node.id];
        const nodeName = config?.name || `Slot ${node.id}`;
        setAlertHistory(prev => {
          // Check if we recently alerted for this node
          const lastAlert = prev
            .filter(alert => alert.nodeId === node.id && !alert.acknowledged)
            .sort((a, b) => b.timestamp - a.timestamp)[0];

          const timeSinceLastAlert = lastAlert ? currentTime - lastAlert.timestamp : Infinity;
          if (timeSinceLastAlert <= ALERT_COOLDOWN) return prev;

          // Trigger new alert
          const newAlert = {
            nodeId: node.id,
            nodeName,
            power: node.power,
            timestamp: currentTime,
            acknowledged: false
          };
          console.log(`🚨 HIGH CONSUMPTION ALERT: ${nodeName} drawing ${node.power.toFixed(1)}W (threshold: ${alertThreshold}W)`);
          return [...prev, newAlert];
        });
      }
    });

    setActiveAlerts(prev => (setsEqual(prev, nextActiveAlerts) ? prev : nextActiveAlerts));
  }, [cleanNodes, alertThreshold, alertsEnabled, configuredNodes]);

  // 🚀 NEW: Detect device connections/disconnections
  useEffect(() => {
    const currentTime = Date.now();
    const POWER_CHANGE_THRESHOLD = 0.5; // 50% change indicates new device
    const MIN_POWER_THRESHOLD = 1.5; // Faster low-load detection (chargers)

    setConnectionStates(prevStates => {
      let changed = false;
      const nextStates = { ...prevStates };

      cleanNodes.forEach(node => {
        const nodeId = node.id;
        const currentPower = node.power;
        const previousState = prevStates[nodeId];

        if (!previousState) {
          changed = true;
          nextStates[nodeId] = {
            isConnected: currentPower > MIN_POWER_THRESHOLD,
            lastPower: currentPower,
            lastTimestamp: currentTime
          };
          return;
        }

        const wasConnected = previousState.isConnected;
        const isNowConnected = currentPower > MIN_POWER_THRESHOLD;
        const powerRatio = previousState.lastPower > 0 ? currentPower / previousState.lastPower : 0;

        // Check for new connection or significant power change
        if (!wasConnected && isNowConnected) {
          console.log(`⚡ Node ${nodeId} connected with ${currentPower.toFixed(1)}W`);
          changed = true;
          nextStates[nodeId] = {
            isConnected: true,
            lastPower: currentPower,
            lastTimestamp: currentTime
          };

          // If this node was previously configured, check if it might be a different device
          if (configuredNodes[nodeId]) {
            const significantPowerChange = powerRatio < (1 - POWER_CHANGE_THRESHOLD) || powerRatio > (1 + POWER_CHANGE_THRESHOLD);
            if (significantPowerChange) {
              console.log(`🤔 Node ${nodeId} power changed significantly, requesting re-identification`);
              setNodesNeedingReID(prev => {
                if (prev.has(nodeId)) return prev;
                const next = new Set(prev);
                next.add(nodeId);
                return next;
              });
            }
          }
          return;
        }

        // Update state when power or connection status changed
        if (wasConnected !== isNowConnected || previousState.lastPower !== currentPower || previousState.lastTimestamp !== currentTime) {
          changed = true;
          nextStates[nodeId] = {
            isConnected: isNowConnected,
            lastPower: currentPower,
            lastTimestamp: currentTime
          };
        }
      });

      return changed ? nextStates : prevStates;
    });
  }, [cleanNodes, configuredNodes]);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  // Inline appliance label editing state (Phase 2).
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
      setIsTablet(window.innerWidth <= 1280);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleOpenModal = (slotId: number) => { setSelectedSlot(slotId); setModalOpen(true); };

  const handleAddAppliance = (name: string, type: string) => {
    if (selectedSlot !== null) {
      const slot = selectedSlot;
      setConfiguredNodes(prev => ({
        ...prev,
        [slot]: {
          name,
          type,
          lastSeenPower: (liveData?.nodes || []).find(n => n.id === slot)?.power || 0,
          lastSeenTimestamp: Date.now()
        }
      }));

      // Persist dashboard-appliance assignment to backend so other pages resolve names.
      fetch(`${apiBaseUrl}/api/appliances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outlet_id: slot,
          appliance_name: name,
          appliance_type: type,
          standard_wattage: APPLIANCE_SPECS[type]?.expectedWatts || APPLIANCE_SPECS.default.expectedWatts
        })
      }).catch((error) => console.error('Failed to save appliance to backend:', error));

      // Remove from re-identification list if it was there
      setNodesNeedingReID(prev => {
        const newSet = new Set(prev);
        newSet.delete(slot);
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

  const handleStartRename = (nodeId: number, currentName: string) => {
    setEditingNodeId(nodeId);
    setEditingName(currentName);
  };

  const handleCancelRename = () => {
    setEditingNodeId(null);
    setEditingName('');
  };

  const handleSaveRename = async (nodeId: number) => {
    const nextName = editingName.trim();
    if (!nextName) return;

    const existing = configuredNodes[nodeId];
    if (!existing) return;

    setConfiguredNodes(prev => ({
      ...prev,
      [nodeId]: {
        ...prev[nodeId],
        name: nextName
      }
    }));

    try {
      await fetch(`${apiBaseUrl}/api/appliances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outlet_id: nodeId,
          appliance_name: nextName,
          appliance_type: existing.type,
          standard_wattage: APPLIANCE_SPECS[existing.type]?.expectedWatts || APPLIANCE_SPECS.default.expectedWatts
        })
      });
    } catch (error) {
      console.error('Failed to rename appliance on backend:', error);
    } finally {
      handleCancelRename();
    }
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

  const now = Date.now();
  const timeRangeMs = powerTimeRange === '1h' ? 60 * 60 * 1000 : powerTimeRange === '24h' ? 24 * 60 * 60 * 1000 : null;
  const timeFilteredHistory = (history || []).filter((item, index, arr) => {
    if (powerTimeRange === 'live') {
      return index >= Math.max(arr.length - 24, 0);
    }
    const ts = item.timestamp ? new Date(item.timestamp).getTime() : 0;
    return ts > 0 && ts >= now - (timeRangeMs || 0);
  });
  const plottedHistory = timeFilteredHistory.length > 0 ? timeFilteredHistory : history;
  const nodeIds = Array.from(new Set(cleanNodes.map(n => n.id).concat([1, 2]))).sort((a, b) => a - b);
  const nodeLineColors = ['#16a34a', '#3b82f6', '#f59e0b', '#ef4444'];

  const toRelativeLabel = (timestamp?: string) => {
    if (!timestamp) return 'now';
    const deltaMs = Math.max(0, now - new Date(timestamp).getTime());
    const mins = Math.floor(deltaMs / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs} hr ago`;
  };

  // Chart configuration (relative-time labels + per-node lines).
  const chartDataConfig = {
    labels: plottedHistory.map(item => toRelativeLabel(item.timestamp)),
    datasets: nodeIds.map((nodeId, idx) => ({
      label: `Node ${nodeId}`,
      data: plottedHistory.map(item => (item.nodes || []).find(n => n.id === nodeId)?.power || 0),
      borderColor: nodeLineColors[idx % nodeLineColors.length],
      backgroundColor: `${nodeLineColors[idx % nodeLineColors.length]}22`,
      fill: false,
      tension: 0.35,
      pointRadius: isMobile ? 0 : 2,
      pointHoverRadius: 4
    }))
  };
  const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
  const chartTickColor = isDarkTheme ? '#9ca3af' : '#6b7280';
  const chartGridColor = isDarkTheme ? 'rgba(148, 163, 184, 0.18)' : 'rgba(15, 23, 42, 0.10)';
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: {
          color: chartTickColor,
          usePointStyle: true,
          pointStyle: 'circle' as const,
          boxWidth: 8,
          padding: 16
        }
      }
    },
    scales: {
      x: {
        grid: { color: chartGridColor },
        ticks: {
          maxTicksLimit: isMobile ? 4 : 6,
          color: chartTickColor,
          autoSkip: true,
          maxRotation: 0
        }
      },
      y: {
        beginAtZero: true,
        grid: { color: chartGridColor },
        ticks: { color: chartTickColor }
      }
    }
  };
  const loadShareData = {
    labels: cleanNodes.map(node => configuredNodes[node.id]?.name || `Outlet ${node.id}`),
    datasets: [{
      data: cleanNodes.map(node => node.power || 0),
      backgroundColor: ['#16a34a', '#3b82f6', '#86efac', '#93c5fd'],
      borderColor: 'rgba(255,255,255,0.9)',
      borderWidth: 2
    }]
  };

  // ════════════════════════════════════════════════════════════
  // 📱 MOBILE LAYOUT RENDER
  // ════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <div className="mob-page visible" id="page-dashboard">
        <div className="mob-sum-grid">
          <div className="mob-sum-card fadein"><div className="mob-sum-row"><div className="mob-sum-ico ico-g">⚡</div><div className="mob-sum-lbl">Total Power</div></div><div className="mob-sum-val g">{totalPower.toFixed(0)}</div><div className="mob-sum-unit">Watts combined</div></div>
          <div className="mob-sum-card fadein"><div className="mob-sum-row"><div className="mob-sum-ico ico-a">💰</div><div className="mob-sum-lbl">Session Cost</div></div><div className="mob-sum-val a">₱{dailyCost}</div><div className="mob-sum-unit">Current kWh × rate</div></div>
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
              const isOverload = node.power > (spec.expectedWatts * 1.3); // 30% over expected limit

              return (
                <div key={node.id} className="mob-ap-item on fadein" style={{ borderLeft: isOverload ? '4px solid #ef4444' : '4px solid var(--primary)' }}>
                  <div className="mob-ap-ico"><ApplianceTypeIcon type={config.type} /></div>
                  <div className="mob-ap-info">
                    <div className="mob-ap-slot">Slot {node.id}</div><div className="mob-ap-name">{config.name}</div>
                    {editingNodeId === node.id ? (
                      <div style={{ display: 'flex', gap: '6px', margin: '6px 0' }}>
                        <input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(node.id);
                            if (e.key === 'Escape') handleCancelRename();
                          }}
                          autoFocus
                          maxLength={32}
                          style={{
                            flex: 1,
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            padding: '6px 8px',
                            color: 'var(--text1)',
                            fontSize: '12px'
                          }}
                        />
                        <button className="mob-rm-btn" onClick={() => handleSaveRename(node.id)} title="Save name">
                          ✓
                        </button>
                      </div>
                    ) : null}
                    <div className="mob-ap-meta">
                      <span><b className={isOverload ? "a" : "g"} style={{ color: isOverload ? '#ef4444' : '' }}>{node.power.toFixed(1)}W</b></span>
                      <span>{node.voltage.toFixed(1)}V / {node.current.toFixed(2)}A</span>
                    </div>
                    {isOverload && <div style={{ color: '#ef4444', fontSize: '11px', fontWeight: 600 }}>⚠️ Exceeds expected {spec.expectedWatts}W</div>}
                  </div>
                  <div className="mob-ap-right">
                    {editingNodeId !== node.id && (
                      <button
                        className="mob-rm-btn"
                        onClick={() => handleStartRename(node.id, config.name)}
                        title="Rename appliance"
                      >
                        ✎
                      </button>
                    )}
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
      <div style={{ display: 'grid', gridTemplateColumns: isTablet ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: '16px', marginTop: '14px' }}>
        <div className="sum-card fadein" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: isDarkTheme ? '0 8px 18px rgba(0,0,0,0.28)' : '0 8px 18px rgba(16,24,40,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div className="sum-lbl">Live Total Draw</div>
            <div style={{ width: '30px', height: '30px', borderRadius: '10px', display: 'grid', placeItems: 'center', background: '#ecfdf3', color: '#16a34a' }}><MetricIcon kind="power" /></div>
          </div>
          <div className="sum-val g" style={{ fontSize: '30px' }}>{totalPower.toFixed(1)}W</div>
          <div className="sum-note">Across all outlets</div>
        </div>
        <div className="sum-card fadein" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: isDarkTheme ? '0 8px 18px rgba(0,0,0,0.28)' : '0 8px 18px rgba(16,24,40,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div className="sum-lbl">Active Appliances</div>
            <div style={{ width: '30px', height: '30px', borderRadius: '10px', display: 'grid', placeItems: 'center', background: '#ecfdf3', color: '#16a34a' }}><MetricIcon kind="devices" /></div>
          </div>
          <div className="sum-val" style={{ fontSize: '30px' }}>{activeNodes.length}</div>
          <div className="sum-note">Currently drawing power</div>
        </div>
        <div className="sum-card fadein" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: isDarkTheme ? '0 8px 18px rgba(0,0,0,0.28)' : '0 8px 18px rgba(16,24,40,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div className="sum-lbl">Session Cost</div>
            <div style={{ width: '30px', height: '30px', borderRadius: '10px', display: 'grid', placeItems: 'center', background: '#ecfdf3', color: '#16a34a' }}><MetricIcon kind="cost" /></div>
          </div>
          <div className="sum-val a" style={{ fontSize: '30px' }}>₱{dailyCost}</div>
          <div className="sum-note">Using ₱{phpRate.toFixed(2)}/kWh</div>
        </div>
        <div className="sum-card fadein" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: isDarkTheme ? '0 8px 18px rgba(0,0,0,0.28)' : '0 8px 18px rgba(16,24,40,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div className="sum-lbl">Line Voltage</div>
            <div style={{ width: '30px', height: '30px', borderRadius: '10px', display: 'grid', placeItems: 'center', background: '#ecfdf3', color: '#16a34a' }}><MetricIcon kind="voltage" /></div>
          </div>
          <div className="sum-val" style={{ fontSize: '30px' }}>{avgVoltage.toFixed(1)}V</div>
          <div className="sum-note">Realtime grid level</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : 'minmax(0, 2fr) minmax(320px, 1fr)', gap: '16px', marginTop: '18px' }}>
        <div className="chart-card" style={{ minWidth: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: isDarkTheme ? '0 8px 18px rgba(0,0,0,0.28)' : '0 8px 18px rgba(16,24,40,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <div>
              <div className="chart-title">Power Draw</div>
              <div className="chart-sub">Node-level patterns with relative time</div>
            </div>
            <div style={{ display: 'flex', gap: '6px', background: 'var(--bg)', border: '1px solid var(--border)', padding: '4px', borderRadius: '999px' }}>
              {(['live', '1h', '24h'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setPowerTimeRange(range)}
                  style={{
                    border: 'none',
                    borderRadius: '999px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: powerTimeRange === range ? '#16a34a' : 'transparent',
                    color: powerTimeRange === range ? '#fff' : 'var(--text2)'
                  }}
                >
                  {range === 'live' ? 'Live' : range}
                </button>
              ))}
            </div>
          </div>
          <div style={{ height: '220px', width: '100%' }}><Line data={chartDataConfig} options={chartOptions} /></div>
        </div>
        <div className="chart-card" style={{ minWidth: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: isDarkTheme ? '0 8px 18px rgba(0,0,0,0.28)' : '0 8px 18px rgba(16,24,40,0.04)' }}>
          <div className="chart-title">Outlet Load Distribution</div>
          <div className="chart-sub">Current draw share by configured outlet</div>
          <div style={{ height: '220px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Doughnut
              data={loadShareData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'bottom',
                    labels: { boxWidth: 10, color: chartTickColor }
                  }
                }
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ marginTop: '18px', display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 260px', alignItems: 'start', gap: '12px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px', boxShadow: isDarkTheme ? '0 8px 18px rgba(0,0,0,0.28)' : '0 8px 18px rgba(16,24,40,0.04)' }}>
          <div className="sec-hdr" style={{ marginTop: 0, marginBottom: '12px' }}>
            <div className="sec-title">Connected Appliances</div>
            <div className="sec-sub">Rename, review live metrics, and monitor overload status</div>
          </div>

          <div className="ap-grid" style={{ marginTop: 0 }}>
            {activeNodes.length === 0 ? (
              <div className="fadein" style={{ gridColumn: '1 / -1', width: '100%', padding: '50px', textAlign: 'center', background: 'var(--surface2)', borderRadius: '16px', border: '1px dashed var(--border)' }}>
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
                <div className="ap-ico"><ApplianceTypeIcon type={config.type} /></div>
                {editingNodeId === node.id ? (
                  <div style={{ marginTop: '4px', width: '100%' }}>
                    <input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename(node.id);
                        if (e.key === 'Escape') handleCancelRename();
                      }}
                      autoFocus
                      maxLength={32}
                      style={{
                        width: '100%',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        color: 'var(--text1)',
                        fontSize: '14px',
                        marginBottom: '8px'
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleSaveRename(node.id)}
                        style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer' }}
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancelRename}
                        style={{ background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="ap-name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{config.name}</span>
                    <button
                      onClick={() => handleStartRename(node.id, config.name)}
                      title="Rename appliance"
                      style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text3)', borderRadius: '8px', padding: '2px 6px', cursor: 'pointer', fontSize: '11px' }}
                    >
                      Edit
                    </button>
                  </div>
                )}
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
        </div>

        <div style={{ display: 'grid', gap: '12px', minWidth: isTablet ? '100%' : '260px' }}>
          <div style={{
            borderRadius: '16px',
            padding: '14px 16px',
            background: 'linear-gradient(145deg, #15803d, #22c55e)',
            color: '#fff',
            boxShadow: '0 10px 20px rgba(22,163,74,0.25)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minHeight: '120px'
          }}>
            <div style={{ fontSize: '11px', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Monthly Estimate</div>
            <div style={{ fontSize: '30px', fontWeight: 800, lineHeight: 1.1, margin: '4px 0' }}>₱{monthlyEst}</div>
            <div style={{ fontSize: '12px', opacity: 0.92 }}>Based on current session cost trend</div>
          </div>

          <div style={{
            borderRadius: '16px',
            padding: '14px 16px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text1)',
            boxShadow: isDarkTheme ? '0 8px 18px rgba(0,0,0,0.28)' : '0 8px 18px rgba(16,24,40,0.04)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minHeight: '120px'
          }}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Live Status</div>
            <div style={{ fontSize: '28px', fontWeight: 800, lineHeight: 1.1, margin: '4px 0', color: '#16a34a' }}>
              {activeNodes.length}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
              Active appliance{activeNodes.length === 1 ? '' : 's'} · {activeAlerts.size} alert{activeAlerts.size === 1 ? '' : 's'}
            </div>
          </div>
        </div>
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