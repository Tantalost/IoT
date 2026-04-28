import React, { useState, useEffect, useMemo } from 'react';

interface NodeDiagnostics {
  nodeId: number;
  connectionUptime: number; // percentage in last hour
  disconnectCount: number;
  avgVoltage: number;
  voltageStability: number; // 0-100 score
  signalQuality: number; // 0-100 score
  lastDataAge: number; // milliseconds since last data
  dataConsistency: number; // 0-100 score
}

interface EnergyNode {
  id: number;
  voltage: number;
  current: number;
  power: number;
  energy: number;
}

interface AppliancesProps {
  liveData: { nodes: EnergyNode[]; timestamp?: string };
  history: { nodes: EnergyNode[]; timestamp?: string }[];
  phpRate: number;
  apiBaseUrl: string;
}

interface ApplianceRecord {
  outlet_id: number | null;
  appliance_name: string;
  appliance_type: string;
  created_at?: string;
}

const AppliancesPage: React.FC<AppliancesProps> = ({ liveData, history, phpRate, apiBaseUrl }) => {
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth <= 1024);
  const UPTIME_WARNING_THRESHOLD = 50;
  const NOISE_FLOOR_WATTS = 3.0;
  const cleanNodes = useMemo(() => (
    (liveData?.nodes || []).map(node => ({
      ...node,
      power: node.power < NOISE_FLOOR_WATTS ? 0 : node.power,
      current: node.power < NOISE_FLOOR_WATTS ? 0 : node.current
    }))
  ), [liveData]);

  const [diagnostics, setDiagnostics] = useState<Record<number, NodeDiagnostics>>(() => {
    const initial: Record<number, NodeDiagnostics> = {
      1: {
        nodeId: 1,
        connectionUptime: 100,
        disconnectCount: 0,
        avgVoltage: 220,
        voltageStability: 95,
        signalQuality: 98,
        lastDataAge: 0,
        dataConsistency: 100
      },
      2: {
        nodeId: 2,
        connectionUptime: 100,
        disconnectCount: 0,
        avgVoltage: 220,
        voltageStability: 95,
        signalQuality: 98,
        lastDataAge: 0,
        dataConsistency: 100
      }
    };
    return initial;
  });
  const [nodeIdentity, setNodeIdentity] = useState<Record<number, { outletName: string; appliance: string }>>({});

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const formatTypeLabel = (rawType: string) => {
      if (!rawType) return 'Unidentified appliance';
      return rawType
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
    };

    const buildFallbackFromLocalStorage = () => {
      try {
        const saved = localStorage.getItem('wattwatch_dashboard_nodes');
        const parsed = saved ? JSON.parse(saved) : {};
        const fallback: Record<number, { outletName: string; appliance: string }> = {};
        Object.entries(parsed).forEach(([nodeId, config]) => {
          const id = Number(nodeId);
          const entry = config as { name?: string; type?: string };
          fallback[id] = {
            outletName: entry?.name || `Outlet ${id}`,
            appliance: formatTypeLabel(entry?.type || '')
          };
        });
        setNodeIdentity(fallback);
      } catch {
        setNodeIdentity({});
      }
    };

    const loadIdentity = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/appliances`);
        if (!response.ok) {
          buildFallbackFromLocalStorage();
          return;
        }

        const data: ApplianceRecord[] = await response.json();
        const latestByOutlet: Record<number, ApplianceRecord> = {};
        data.forEach((item) => {
          if (item.outlet_id === null || item.outlet_id === undefined) return;
          const existing = latestByOutlet[item.outlet_id];
          if (!existing) {
            latestByOutlet[item.outlet_id] = item;
            return;
          }
          const existingTime = existing.created_at ? new Date(existing.created_at).getTime() : 0;
          const currentTime = item.created_at ? new Date(item.created_at).getTime() : 0;
          if (currentTime > existingTime) latestByOutlet[item.outlet_id] = item;
        });

        const mapped: Record<number, { outletName: string; appliance: string }> = {};
        Object.entries(latestByOutlet).forEach(([outletId, item]) => {
          const id = Number(outletId);
          mapped[id] = {
            outletName: item.appliance_name || `Outlet ${id}`,
            appliance: formatTypeLabel(item.appliance_type || '')
          };
        });

        if (Object.keys(mapped).length === 0) {
          buildFallbackFromLocalStorage();
          return;
        }
        setNodeIdentity(mapped);
      } catch {
        buildFallbackFromLocalStorage();
      }
    };

    loadIdentity();
  }, [apiBaseUrl]);

  useEffect(() => {
    const calculateDiagnostics = () => {
      const currentTime = Date.now();
      const oneHourAgo = currentTime - (60 * 60 * 1000);

      const recentHistory = history.filter(item => {
        const timestamp = item.timestamp ? new Date(item.timestamp).getTime() : 0;
        return timestamp >= oneHourAgo;
      });

      [1, 2].forEach(nodeId => {
        const nodeHistory = recentHistory.map(item => {
          const node = (item.nodes || []).find(n => n.id === nodeId);
          return node || { id: nodeId, voltage: 0, current: 0, power: 0, energy: 0 };
        });

        const currentNode = cleanNodes.find(n => n.id === nodeId);

        // Use voltage presence for sensor uptime so unplugged appliances are not treated as disconnects.
        const activeReadings = nodeHistory.filter(n => n.voltage > 0).length;
        const connectionUptime = nodeHistory.length > 0 ? (activeReadings / nodeHistory.length) * 100 : 0;

        const voltages = nodeHistory.map(n => n.voltage).filter(v => v > 0);
        const avgVoltage = voltages.length > 0 ? voltages.reduce((sum, v) => sum + v, 0) / voltages.length : 220;
        const variance = voltages.length > 0 ? voltages.reduce((sum, v) => sum + Math.pow(v - avgVoltage, 2), 0) / voltages.length : 0;
        const voltageStability = Math.max(0, 100 - (Math.sqrt(variance) / avgVoltage * 100));

        const expectedReadings = 60; // Expected readings per hour
        const actualReadings = nodeHistory.length;
        const signalQuality = Math.min(100, (actualReadings / expectedReadings) * 100);

        const powers = nodeHistory.map(n => n.power);
        const avgPower = powers.reduce((sum, p) => sum + p, 0) / powers.length;
        const outliers = powers.filter(p => Math.abs(p - avgPower) > avgPower * 2).length;
        const dataConsistency = Math.max(0, 100 - (outliers / powers.length * 100));

        const lastDataAge = currentNode ? currentTime - (currentTime % 5000) : 30000; // Assume 5s interval

        setDiagnostics(prev => ({
          ...prev,
          [nodeId]: {
            nodeId,
            connectionUptime: Math.round(connectionUptime),
            disconnectCount: prev[nodeId].disconnectCount + (currentNode && currentNode.power === 0 && prev[nodeId].connectionUptime > 50 ? 1 : 0),
            avgVoltage: Math.round(avgVoltage * 10) / 10,
            voltageStability: Math.round(voltageStability),
            signalQuality: Math.round(signalQuality),
            lastDataAge,
            dataConsistency: Math.round(dataConsistency)
          }
        }));
      });
    };

    calculateDiagnostics();
    const interval = setInterval(calculateDiagnostics, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, [history, cleanNodes]);

  const node1 = cleanNodes.find(n => n.id === 1) || { id: 1, voltage: 0, current: 0, power: 0, energy: 0 };
  const node2 = cleanNodes.find(n => n.id === 2) || { id: 2, voltage: 0, current: 0, power: 0, energy: 0 };
  const totalPower = cleanNodes.reduce((sum, node) => sum + (node.power || 0), 0);
  const totalEnergy = cleanNodes.reduce((sum, node) => sum + (node.energy || 0), 0);
  // Per-appliance baseline thresholds so "high consumption" is contextual.
  const applianceThresholds: Record<string, number> = {
    'phone charger': 30,
    'laptop charger': 120,
    'desktop pc': 500,
    television: 220,
    'electric fan': 120,
    'air conditioner': 1500,
    refrigerator: 350,
    microwave: 1400,
    'rice cooker': 900,
    'coffee maker': 1200,
    'washing machine': 1000,
    'hair dryer': 1500,
    'clothes iron': 1300,
    'led light': 25,
    default: 250
  };
  const getThresholdForAppliance = (applianceName: string) => {
    const key = applianceName.trim().toLowerCase();
    return applianceThresholds[key] ?? applianceThresholds.default;
  };
  const overallUptime = Math.round(
    (Object.values(diagnostics).reduce((sum, metric) => sum + metric.connectionUptime, 0) /
      Math.max(Object.keys(diagnostics).length, 1))
  );
  const nodeConsumptionSummary = useMemo(() => {
    return [1, 2].map(nodeId => {
      const nodeSamples = history
        .slice(-30)
        .map(item => (item.nodes || []).find(n => n.id === nodeId)?.power ?? 0);
      const avgPower = nodeSamples.length
        ? nodeSamples.reduce((sum, power) => sum + power, 0) / nodeSamples.length
        : 0;

      return {
        nodeId,
        threshold: getThresholdForAppliance(nodeIdentity[nodeId]?.appliance || 'default'),
        avgPower,
        isHigh: avgPower >= getThresholdForAppliance(nodeIdentity[nodeId]?.appliance || 'default')
      };
    });
  }, [history, nodeIdentity]);
  const highConsumptionCount = nodeConsumptionSummary.filter(node => node.isHigh).length;
  const overallConsumptionHealth = Math.round(
    ((Math.max(nodeConsumptionSummary.length - highConsumptionCount, 0)) / Math.max(nodeConsumptionSummary.length, 1)) * 100
  );
  const hasHighConsumption = highConsumptionCount > 0;

  const SensorCard = ({ node }: { node: EnergyNode }) => {
    const identity = nodeIdentity[node.id] || { outletName: `Outlet ${node.id}`, appliance: 'Unidentified appliance' };
    const isActive = node.power > 0;
    // Per-node pricing + consumption context.
    const nodeThreshold = getThresholdForAppliance(identity.appliance || 'default');
    const costPerHour = (node.power / 1000) * phpRate;
    const estimatedDailyCost = costPerHour * 24;
    const consumptionVsTarget = nodeThreshold > 0 ? Math.min((node.power / nodeThreshold) * 100, 999) : 0;
    const recentNodeSamples = history
      .slice(-6)
      .map(item => (item.nodes || []).find(n => n.id === node.id)?.power ?? 0);
    const previousPower = recentNodeSamples.length >= 2 ? recentNodeSamples[recentNodeSamples.length - 2] : node.power;
    const powerDelta = node.power - previousPower;
    const costDelta = (powerDelta / 1000) * phpRate;
    const trendDirection = powerDelta > 0.2 ? 'up' : powerDelta < -0.2 ? 'down' : 'steady';
    const trendColor = trendDirection === 'up' ? '#ef4444' : trendDirection === 'down' ? '#10b981' : 'var(--text3)';
    const trendArrow = trendDirection === 'up' ? '↑' : trendDirection === 'down' ? '↓' : '→';

    return (
      <div
        className="fadein"
        style={{
          background: 'var(--surface)',
          borderRadius: '18px',
          padding: isMobile ? '18px' : '22px',
          border: '1px solid var(--border)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div>
            <h2 style={{ margin: '0 0 2px 0', fontSize: isMobile ? '27px' : '32px', fontWeight: 700, color: 'var(--text1)' }}>
              Node {node.id} - {identity.outletName}
            </h2>
            <p style={{ margin: '0 0 6px 0', color: 'var(--text2)', fontSize: '15px', fontWeight: 500 }}>
              {identity.appliance}
            </p>
            <p style={{ margin: 0, color: 'var(--text3)', fontSize: '12px', letterSpacing: '0.2px' }}>
              PZEM-004T-{node.id}
            </p>
          </div>
          <div
            style={{
              background: isActive ? 'rgba(16, 185, 129, 0.14)' : 'rgba(245, 158, 11, 0.14)',
              color: isActive ? '#10b981' : '#f59e0b',
              border: `1px solid ${isActive ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
              padding: '6px 14px',
              borderRadius: '999px',
              fontSize: '13px',
              fontWeight: 700,
              whiteSpace: 'nowrap'
            }}
          >
              {isActive ? 'Drawing Power' : 'Standby'}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: '12px' }}>
          <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text3)', fontSize: '12px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Power</div>
            <div style={{ fontSize: '36px', lineHeight: 1.05, fontWeight: 700, color: 'var(--text1)' }}>{node.power.toFixed(1)} W</div>
          </div>
          <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text3)', fontSize: '12px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Current</div>
            <div style={{ fontSize: '36px', lineHeight: 1.05, fontWeight: 700, color: 'var(--text1)' }}>{node.current.toFixed(2)} A</div>
          </div>
          <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text3)', fontSize: '12px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Voltage</div>
            <div style={{ fontSize: '36px', lineHeight: 1.05, fontWeight: 700, color: 'var(--text1)' }}>{node.voltage.toFixed(0)} V</div>
          </div>
          <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text3)', fontSize: '12px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Energy</div>
            <div style={{ fontSize: '36px', lineHeight: 1.05, fontWeight: 700, color: 'var(--text1)' }}>{node.energy.toFixed(3)} kWh</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
          <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text3)', fontSize: '12px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Power Consumption</div>
            <div style={{ fontSize: '24px', lineHeight: 1.15, fontWeight: 700, color: consumptionVsTarget > 100 ? '#ef4444' : '#10b981' }}>
              {consumptionVsTarget.toFixed(0)}% <span style={{ fontSize: '14px', color: 'var(--text2)' }}>of {nodeThreshold}W target</span>
            </div>
            <div style={{ marginTop: '4px', color: trendColor, fontSize: '12px', fontWeight: 600 }}>
              {trendArrow} {Math.abs(powerDelta).toFixed(1)}W vs previous sample
            </div>
          </div>
          <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text3)', fontSize: '12px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Price Impact</div>
            <div style={{ fontSize: '24px', lineHeight: 1.15, fontWeight: 700, color: '#f59e0b' }}>
              ₱{costPerHour.toFixed(3)} <span style={{ fontSize: '14px', color: 'var(--text2)' }}>/ hour</span>
            </div>
            <div style={{ marginTop: '4px', color: 'var(--text3)', fontSize: '12px' }}>Est. ₱{estimatedDailyCost.toFixed(2)} / day</div>
            <div style={{ marginTop: '2px', color: trendColor, fontSize: '12px', fontWeight: 600 }}>
              {trendArrow} ₱{Math.abs(costDelta).toFixed(3)} / hour vs previous sample
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ 
      background: 'var(--bg)', 
      minHeight: '100vh', 
      padding: '40px', // Increased padding for breathing room on wide screens
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',             
      alignItems: 'center',        
      justifyContent: 'center'     
    }}>
      {/* 🚀 Changed maxWidth to 1440px to cover the screen beautifully */}
      <div style={{ width: '100%', maxWidth: '1440px' }}>

        <div style={{ marginBottom: '18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '10px' }}>
            <div>
              <div style={{ color: 'var(--text2)', fontSize: '13px', fontWeight: 600 }}>APPLIANCE CONSUMPTION HEALTH</div>
              <div style={{ fontSize: '24px', color: overallConsumptionHealth >= 80 ? '#10b981' : overallConsumptionHealth >= 50 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>
                {overallConsumptionHealth}% <span style={{ fontSize: '14px', color: 'var(--text3)' }}>within target usage</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>
                Sensor feed uptime: {overallUptime}%
              </div>
            </div>
            <div style={{
              background: hasHighConsumption ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
              color: hasHighConsumption ? '#ef4444' : '#10b981',
              border: `1px solid ${hasHighConsumption ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`,
              borderRadius: '999px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 700
            }}>
              {hasHighConsumption ? 'Warning: High Consumption' : 'Usage in Normal Range'}
            </div>
          </div>

          {/* Top-level per-node usage health cards */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
            {nodeConsumptionSummary.map(node => (
              <div key={node.nodeId} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ color: 'var(--text2)', fontSize: '12px', marginBottom: '4px' }}>Node {node.nodeId}</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: node.isHigh ? '#ef4444' : '#10b981' }}>
                  Avg {node.avgPower.toFixed(1)}W
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
                  {node.isHigh ? `Above ${node.threshold}W target` : `Within ${node.threshold}W target`}
                </div>
              </div>
            ))}
          </div>
        </div>

        {hasHighConsumption && (
          <div style={{
            marginBottom: '18px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '12px',
            padding: '12px 14px',
            color: '#ef4444',
            fontWeight: 600,
            fontSize: '14px'
          }}>
            Consumption warning: one or more appliances are averaging above their device-specific threshold in the recent monitoring window.
          </div>
        )}

        <div style={{ marginBottom: '24px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px' }}>
          <div style={{ color: 'var(--text2)', fontSize: '13px', marginBottom: '8px', fontWeight: 600 }}>COMBINED REAL-TIME COST SNAPSHOT</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px' }}>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Total Power</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text1)' }}>{totalPower.toFixed(1)}W</div>
            </div>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Cost / Hour</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text1)' }}>₱{((totalPower / 1000) * phpRate).toFixed(3)}</div>
            </div>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Est. Daily Cost</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text1)' }}>₱{(((totalPower / 1000) * phpRate) * 24).toFixed(2)}</div>
            </div>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Session Cost</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text1)' }}>₱{(totalEnergy * phpRate).toFixed(2)}</div>
            </div>
          </div>
        </div>

        {/* Flattened stack layout: one card per node with breathing room */}
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: '20px'
        }}>
          <SensorCard node={node1} />
          <SensorCard node={node2} />
        </div>

      </div>
    </div>
  );
};

export default AppliancesPage;