import React, { useState, useEffect, useMemo } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler);

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
}

const AppliancesPage: React.FC<AppliancesProps> = ({ liveData, history, phpRate }) => {
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth <= 1024);
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

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

        const activeReadings = nodeHistory.filter(n => n.power > 0).length;
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

  const createChartConfig = (nodeId: number, colorHex: string, rgbaFill: string) => {
    const nodeHistory = history.map(item => {
      const targetNode = (item.nodes || []).find(n => n.id === nodeId);
      return targetNode ? targetNode.power : 0;
    });

    return {
      data: {
        labels: history.map(() => ''),
        datasets: [{
          data: nodeHistory,
          borderColor: colorHex,
          backgroundColor: rgbaFill,
          fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: { 
            border: { display: false }, 
            grid: { color: 'rgba(150, 150, 150, 0.15)' }, 
            ticks: { color: '#888', maxTicksLimit: 5 } 
          }
        }
      }
    };
  };

  const chart1 = createChartConfig(1, '#3b82f6', 'rgba(59, 130, 246, 0.15)'); // Blue theme
  const chart2 = createChartConfig(2, '#10b981', 'rgba(16, 185, 129, 0.15)'); // Green theme
  const node1 = cleanNodes.find(n => n.id === 1) || { id: 1, voltage: 0, current: 0, power: 0, energy: 0 };
  const node2 = cleanNodes.find(n => n.id === 2) || { id: 2, voltage: 0, current: 0, power: 0, energy: 0 };
  const totalPower = cleanNodes.reduce((sum, node) => sum + (node.power || 0), 0);
  const totalEnergy = cleanNodes.reduce((sum, node) => sum + (node.energy || 0), 0);

  const SensorCard = ({ node, chart, title, themeColor }: { node: EnergyNode, chart: any, title: string, themeColor: string }) => {
    const costPerHour = (node.power / 1000) * phpRate;
    const estimatedDailyCost = costPerHour * 24;
    const estimatedMonthlyCost = estimatedDailyCost * 30;
    const sessionCost = node.energy * phpRate;

    const isActive = node.power > 0;
    const diagnostic = diagnostics[node.id];

    const healthScore = Math.round((
      diagnostic.connectionUptime * 0.3 +
      diagnostic.voltageStability * 0.25 +
      diagnostic.signalQuality * 0.25 +
      diagnostic.dataConsistency * 0.2
    ));

    const getHealthColor = (score: number) => {
      if (score >= 90) return '#10b981'; // Green
      if (score >= 70) return '#f59e0b'; // Yellow
      return '#ef4444'; // Red
    };

    const getHealthLabel = (score: number) => {
      if (score >= 90) return 'Excellent';
      if (score >= 70) return 'Good';
      if (score >= 50) return 'Fair';
      return 'Poor';
    };

    return (
      <div className="fadein" style={{ background: 'var(--surface)', borderRadius: '20px', padding: '30px', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: isActive ? themeColor : 'var(--border)', boxShadow: isActive ? `0 0 10px ${themeColor}` : 'none' }}></div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text1)' }}>{title}</h2>
            </div>
            <p style={{ margin: 0, color: 'var(--text3)', fontSize: '14px' }}>Hardware ID: PZEM-004T-{node.id}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            <div style={{ background: isActive ? `${themeColor}15` : 'var(--surface2)', color: isActive ? themeColor : 'var(--text3)', padding: '6px 12px', borderRadius: '100px', fontSize: '13px', fontWeight: 600 }}>
              {isActive ? 'Drawing Power' : 'Standby'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ 
                width: '8px', 
                height: '8px', 
                borderRadius: '50%', 
                backgroundColor: getHealthColor(healthScore)
              }}></div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: getHealthColor(healthScore) }}>
                {getHealthLabel(healthScore)} ({healthScore}%)
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text2)', fontSize: '13px', marginBottom: '4px', fontWeight: 600 }}>LIVE POWER</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: themeColor }}>{node.power.toFixed(1)} <span style={{ fontSize: '16px', color: 'var(--text3)' }}>W</span></div>
          </div>
          <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text2)', fontSize: '13px', marginBottom: '4px', fontWeight: 600 }}>LIVE CURRENT</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text1)' }}>{node.current.toFixed(2)} <span style={{ fontSize: '16px', color: 'var(--text3)' }}>A</span></div>
          </div>
          <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text2)', fontSize: '13px', marginBottom: '4px', fontWeight: 600 }}>VOLTAGE</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text1)' }}>{node.voltage.toFixed(1)} <span style={{ fontSize: '16px', color: 'var(--text3)' }}>V</span></div>
          </div>
          <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text2)', fontSize: '13px', marginBottom: '4px', fontWeight: 600 }}>ENERGY USED</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text1)' }}>{node.energy.toFixed(3)} <span style={{ fontSize: '16px', color: 'var(--text3)' }}>kWh</span></div>
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text2)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Consumption Cost Metrics</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--text2)', fontSize: '12px', marginBottom: '6px', fontWeight: 600 }}>COST PER HOUR</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: themeColor }}>₱{costPerHour.toFixed(3)}</div>
            </div>
            <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--text2)', fontSize: '12px', marginBottom: '6px', fontWeight: 600 }}>EST. DAILY COST</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text1)' }}>₱{estimatedDailyCost.toFixed(2)}</div>
            </div>
            <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--text2)', fontSize: '12px', marginBottom: '6px', fontWeight: 600 }}>EST. MONTHLY COST</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text1)' }}>₱{estimatedMonthlyCost.toFixed(2)}</div>
            </div>
            <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--text2)', fontSize: '12px', marginBottom: '6px', fontWeight: 600 }}>SESSION ENERGY COST</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text1)' }}>₱{sessionCost.toFixed(2)}</div>
            </div>
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text2)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Power Draw History</h3>
          <div style={{ height: '220px', width: '100%', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px', background: 'var(--bg)' }}>
            <Line data={chart.data} options={chart.options as any} />
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text2)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Hardware Diagnostics</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--text2)', fontSize: '12px', marginBottom: '6px', fontWeight: 600 }}>CONNECTION UPTIME</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: diagnostic.connectionUptime > 80 ? '#10b981' : diagnostic.connectionUptime > 50 ? '#f59e0b' : '#ef4444' }}>
                {diagnostic.connectionUptime}% <span style={{ fontSize: '12px', color: 'var(--text3)' }}>(last hour)</span>
              </div>
            </div>
            <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--text2)', fontSize: '12px', marginBottom: '6px', fontWeight: 600 }}>VOLTAGE STABILITY</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: diagnostic.voltageStability > 80 ? '#10b981' : diagnostic.voltageStability > 60 ? '#f59e0b' : '#ef4444' }}>
                {diagnostic.voltageStability}% <span style={{ fontSize: '12px', color: 'var(--text3)' }}>(±{Math.round(220 - diagnostic.avgVoltage)}V)</span>
              </div>
            </div>
            <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--text2)', fontSize: '12px', marginBottom: '6px', fontWeight: 600 }}>SIGNAL QUALITY</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: diagnostic.signalQuality > 80 ? '#10b981' : diagnostic.signalQuality > 60 ? '#f59e0b' : '#ef4444' }}>
                {diagnostic.signalQuality}% <span style={{ fontSize: '12px', color: 'var(--text3)' }}>({diagnostic.disconnectCount} disconnects)</span>
              </div>
            </div>
            <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--text2)', fontSize: '12px', marginBottom: '6px', fontWeight: 600 }}>DATA CONSISTENCY</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: diagnostic.dataConsistency > 80 ? '#10b981' : diagnostic.dataConsistency > 60 ? '#f59e0b' : '#ef4444' }}>
                {diagnostic.dataConsistency}% <span style={{ fontSize: '12px', color: 'var(--text3)' }}>stable</span>
              </div>
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
        
        {/* Page Header */}
        <div style={{ marginBottom: '30px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text1)', margin: '0 0 8px 0' }}>Hardware Diagnostics</h1>
          <p style={{ color: 'var(--text2)', margin: 0, fontSize: '16px' }}>Detailed telemetry for active ESP32 sensor nodes.</p>
        </div>

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

        {/* 2-Split Grid Layout */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', 
          gap: '40px' // Increased the gap slightly so the massive cards don't touch
        }}>
          {/* Left Side: Sensor 1 */}
          <SensorCard node={node1} chart={chart1} title="Sensor Node 1" themeColor="#3b82f6" />
          
          {/* Right Side: Sensor 2 */}
          <SensorCard node={node2} chart={chart2} title="Sensor Node 2" themeColor="#10b981" />
        </div>

      </div>
    </div>
  );
};

export default AppliancesPage;