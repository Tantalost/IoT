import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

interface EnergyNode {
  id: number;
  voltage: number;
  current: number;
  power: number;
  energy: number;
}

interface AnalyticsProps {
  liveData: { nodes: EnergyNode[]; timestamp?: string };
  history: { nodes: EnergyNode[]; timestamp?: string }[];
  phpRate: number;
}

interface SavedDeviceSignature {
  name: string;
  type: string;
  expectedPower: number;
}

interface TimeComparison {
  period: string;
  totalKwh: number;
  cost: number;
  peakPower: number;
  avgPower: number;
  applianceBreakdown: Record<string, number>;
}

interface EfficiencyRanking {
  name: string;
  type: string;
  currentPower: number;
  expectedPower: number;
  efficiency: number; // 0-100%
  dailyCost: number;
  monthlyProjection: number;
}

interface ApplianceStandard {
  label: string;
  watts: number;
}

const APPLIANCE_WATTAGE_STANDARDS: Record<string, ApplianceStandard> = {
  charger: { label: 'Charger', watts: 20 },
  fan: { label: 'Fan', watts: 60 },
  laptop: { label: 'Laptop', watts: 80 },
  tv: { label: 'TV', watts: 150 },
  refrigerator: { label: 'Refrigerator', watts: 200 },
  rice_cooker: { label: 'Rice Cooker', watts: 700 },
  microwave: { label: 'Microwave', watts: 1200 },
  air_conditioner: { label: 'Air Conditioner', watts: 1200 },
  washing_machine: { label: 'Washing Machine', watts: 500 },
  light_bulb: { label: 'Light Bulb', watts: 12 },
  phone: { label: 'Charger', watts: 20 },
  ac: { label: 'Air Conditioner', watts: 1200 },
  fridge: { label: 'Refrigerator', watts: 200 },
  rice: { label: 'Rice Cooker', watts: 700 },
  washer: { label: 'Washing Machine', watts: 500 },
  light: { label: 'Light Bulb', watts: 12 }
};

const APPLIANCE_TYPE_ALIASES: Record<string, string> = {
  phone: 'charger',
  ac: 'air_conditioner',
  fridge: 'refrigerator',
  rice: 'rice_cooker',
  washer: 'washing_machine',
  light: 'light_bulb'
};

const APPLIANCE_SPECS: Record<string, { expectedWatts: number, icon: string }> = {
  phone: { expectedWatts: 30, icon: '📱' },
  laptop: { expectedWatts: 80, icon: '💻' },
  desktop: { expectedWatts: 500, icon: '🖥️' },
  tv: { expectedWatts: 150, icon: '📺' },
  fan: { expectedWatts: 70, icon: '🌀' },
  ac: { expectedWatts: 1500, icon: '❄️' },
  fridge: { expectedWatts: 400, icon: '🧊' },
  microwave: { expectedWatts: 1200, icon: '🍱' },
  light: { expectedWatts: 15, icon: '💡' },
  router: { expectedWatts: 15, icon: '📶' },
  default: { expectedWatts: 1000, icon: '🔌' }
};

const AnalyticsPage: React.FC<AnalyticsProps> = ({ liveData, history, phpRate }) => {
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth <= 1024);
  const [showApplianceModal, setShowApplianceModal] = useState(false);
  const [pendingNodeId, setPendingNodeId] = useState<number | null>(null);
  const [selectedApplianceKey, setSelectedApplianceKey] = useState<string>('charger');
  
  const [comparisonPeriod, setComparisonPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [efficiencyRankings, setEfficiencyRankings] = useState<EfficiencyRanking[]>([]);
  
  const [deviceMemory] = useState<SavedDeviceSignature[]>(() => {
    const saved = localStorage.getItem('wattwatch_fingerprints');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [configuredNodes, setConfiguredNodes] = useState<Record<number, { name: string; type: string }>>(() => {
    const saved = localStorage.getItem('wattwatch_dashboard_nodes');
    return saved ? JSON.parse(saved) : {};
  });

  const NOISE_FLOOR_WATTS = 3.0;
  const cleanNodes = (liveData?.nodes || []).map(node => ({
    ...node,
    power: node.power < NOISE_FLOOR_WATTS ? 0 : node.power
  }));

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const calculateEfficiencyRankings = () => {
    const rankings: EfficiencyRanking[] = [];
    
    Object.entries(configuredNodes).forEach(([nodeIdStr, config]) => {
      const nodeId = parseInt(nodeIdStr);
      const currentNode = cleanNodes.find(n => n.id === nodeId);
      
      if (currentNode && currentNode.power > 0) {
        const spec = APPLIANCE_SPECS[config.type] || APPLIANCE_SPECS.default;
        const expectedPower = spec.expectedWatts;
        const actualPower = currentNode.power;
        
        let efficiency = 100;
        if (actualPower > 0) {
          const ratio = actualPower / expectedPower;
          if (ratio > 1.5) efficiency = 50; // Overpowering
          else if (ratio > 1.25) efficiency = 75; // Slightly high
          else if (ratio >= 0.75 && ratio <= 1.25) efficiency = 100; // Optimal
          else if (ratio >= 0.5) efficiency = 85; // Eco mode
          else efficiency = 70; // Very low power
        }
        
        const dailyKwh = (actualPower / 1000) * 24; // Assuming 24h operation
        const dailyCost = dailyKwh * phpRate;
        const monthlyProjection = dailyCost * 30;
        
        rankings.push({
          name: config.name,
          type: config.type,
          currentPower: actualPower,
          expectedPower,
          efficiency,
          dailyCost,
          monthlyProjection
        });
      }
    });
    
    rankings.sort((a, b) => a.efficiency - b.efficiency);
    setEfficiencyRankings(rankings);
  };

  useEffect(() => {
    calculateEfficiencyRankings();
    const interval = setInterval(calculateEfficiencyRankings, 15000); // Update every 15 seconds
    return () => clearInterval(interval);
  }, [cleanNodes, configuredNodes, phpRate]);

  const calculateTimeComparisons = (): TimeComparison[] => {
    const comparisons: TimeComparison[] = [];
    
    const todayData = history.slice(-10); // Last 10 readings as "today"
    const yesterdayData = history.slice(-20, -10); // Previous 10 as "yesterday"
    
    const calculatePeriodStats = (data: any[], periodName: string): TimeComparison => {
      const totalKwh = data.reduce((sum, item) => {
        return sum + (item.nodes || []).reduce((nodeSum: number, node: any) => nodeSum + (node.energy || 0), 0);
      }, 0) / data.length || 0;
      
      const totalPower = data.reduce((sum, item) => {
        return sum + (item.nodes || []).reduce((nodeSum: number, node: any) => nodeSum + (node.power || 0), 0);
      }, 0);
      
      const peakPower = Math.max(...data.map(item => 
        Math.max(...(item.nodes || []).map((node: any) => node.power || 0))
      ));
      
      const avgPower = totalPower / (data.length || 1);
      const cost = totalKwh * phpRate;
      
      const applianceBreakdown: Record<string, number> = {};
      data.forEach(item => {
        (item.nodes || []).forEach((node: any) => {
          const config = configuredNodes[node.id];
          if (config && node.power > 0) {
            applianceBreakdown[config.name] = (applianceBreakdown[config.name] || 0) + node.power;
          }
        });
      });
      
      return {
        period: periodName,
        totalKwh,
        cost,
        peakPower,
        avgPower,
        applianceBreakdown
      };
    };
    
    if (todayData.length > 0) {
      comparisons.push(calculatePeriodStats(todayData, 'Today'));
    }
    
    if (yesterdayData.length > 0) {
      comparisons.push(calculatePeriodStats(yesterdayData, 'Yesterday'));
    }
    
    return comparisons;
  };

  const node1 = cleanNodes.find(n => n.id === 1) || { id: 1, power: 0, energy: 0 };
  const node2 = cleanNodes.find(n => n.id === 2) || { id: 2, power: 0, energy: 0 };
  const activeNodes = cleanNodes.filter(n => n.power > 0);

  useEffect(() => {
    const unconfiguredNode = activeNodes.find(node => !configuredNodes[node.id]);
    if (unconfiguredNode && pendingNodeId === null) {
      setPendingNodeId(unconfiguredNode.id);
      setSelectedApplianceKey('charger');
      setShowApplianceModal(true);
    }
  }, [activeNodes, configuredNodes, pendingNodeId]);

  const saveApplianceSelection = () => {
    if (pendingNodeId === null) return;
    const selected = APPLIANCE_WATTAGE_STANDARDS[selectedApplianceKey];
    const nextConfigured = {
      ...configuredNodes,
      [pendingNodeId]: {
        name: `${selected.label} (Node ${pendingNodeId})`,
        type: selectedApplianceKey
      }
    };
    setConfiguredNodes(nextConfigured);
    localStorage.setItem('wattwatch_dashboard_nodes', JSON.stringify(nextConfigured));
    setShowApplianceModal(false);
    setPendingNodeId(null);
  };

  const getRuleBasedAdvice = (actualWattage: number, standardWattage: number): string => {
    if (actualWattage > standardWattage * 1.2) {
      return 'This device is consuming 20% more power than standard. It may be inefficient or faulty.';
    }
    if (actualWattage < standardWattage * 0.8) {
      return 'This device is drawing lower than normal power. It may be in standby/eco mode or under light load.';
    }
    return 'This device is operating within the expected power range.';
  };

  const comparisonRows = activeNodes.map((node) => {
    const rawType = configuredNodes[node.id]?.type;
    const mappedType = rawType ? (APPLIANCE_TYPE_ALIASES[rawType] || rawType) : null;
    const standardInfo = mappedType ? APPLIANCE_WATTAGE_STANDARDS[mappedType] : null;
    const standardWattage = standardInfo?.watts ?? 0;
    const variancePercent = standardWattage > 0 ? ((node.power - standardWattage) / standardWattage) * 100 : 0;
    const estimatedHourlyCost = (node.power / 1000) * phpRate;

    return {
      nodeId: node.id,
      applianceLabel: standardInfo?.label ?? 'Unassigned',
      actualWattage: node.power,
      standardWattage,
      variancePercent,
      estimatedHourlyCost,
      advice: standardWattage > 0
        ? getRuleBasedAdvice(node.power, standardWattage)
        : 'Please select an appliance type to enable comparison and advice.'
    };
  });

  const totalKwh = node1.energy + node2.energy; 
  const currentCost = totalKwh * phpRate;
  const estimatedDaily = currentCost > 0 ? currentCost * 4 : 0; 
  const estimatedMonthly = estimatedDaily * 30;

  const distributionData = {
    labels: ['Sensor Node 1', 'Sensor Node 2'],
    datasets: [{
      data: [node1.energy, node2.energy],
      backgroundColor: ['#3b82f6', '#10b981'],
      borderWidth: 0,
      hoverOffset: 4
    }]
  };

  const doughnutOptions = {
    cutout: '75%',
    plugins: {
      legend: { position: 'bottom' as const, labels: { color: '#888', usePointStyle: true, padding: 20 } },
      tooltip: { callbacks: { label: (context: any) => ` ${context.raw.toFixed(3)} kWh` } }
    }
  };

  const barData = {
    labels: history.map(() => ''),
    datasets: [
      { label: 'Node 1 (W)', data: history.map(h => { const n = h.nodes.find(x => x.id === 1); return n && n.power > NOISE_FLOOR_WATTS ? n.power : 0; }), backgroundColor: '#3b82f6', borderRadius: 4 },
      { label: 'Node 2 (W)', data: history.map(h => { const n = h.nodes.find(x => x.id === 2); return n && n.power > NOISE_FLOOR_WATTS ? n.power : 0; }), backgroundColor: '#10b981', borderRadius: 4 }
    ]
  };

  const barOptions = {
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { stacked: true, display: false },
      y: { stacked: true, border: { display: false }, grid: { color: 'rgba(150, 150, 150, 0.1)' }, ticks: { color: '#888' } }
    }
  };

  let insights: Array<{title: string, text: string, type: 'warning' | 'success' | 'info', icon: string}> = [];

  if (activeNodes.length === 0) {
    insights.push({ title: 'System Idle', text: 'All monitored outlets are currently empty or devices are completely powered off. Excellent energy conservation!', type: 'success', icon: '💤' });
  } else {
    activeNodes.forEach(node => {
      const matchedDevice = deviceMemory.find(memory => {
        const difference = Math.abs(memory.expectedPower - node.power);
        const tolerance = Math.max(15, memory.expectedPower * 0.15); // 15% tolerance
        return difference <= tolerance;
      });

      if (matchedDevice) {
        const spec = APPLIANCE_SPECS[matchedDevice.type] || APPLIANCE_SPECS.default;
        const baseline = spec.expectedWatts;
        
        if (node.power > baseline * 1.25) {
          insights.push({ 
            title: `Inefficient Draw: ${matchedDevice.name}`, 
            text: `Pulling ${node.power.toFixed(0)}W, which is significantly higher than the typical ${baseline}W for this category. Check the appliance for dirty filters, failing motors, or faults.`, 
            type: 'warning', icon: '⚠️' 
          });
        } else if (node.power >= baseline * 0.75 && node.power <= baseline * 1.25) {
          insights.push({ 
            title: `Healthy Operation: ${matchedDevice.name}`, 
            text: `Running at ${node.power.toFixed(0)}W, which perfectly matches the optimal baseline for this category.`, 
            type: 'success', icon: '✅' 
          });
        } else {
          insights.push({ 
            title: `Eco/Standby Mode: ${matchedDevice.name}`, 
            text: `Drawing only ${node.power.toFixed(0)}W. It is operating below standard capacity or resting in standby mode.`, 
            type: 'info', icon: '🔋' 
          });
        }
      } else {
        insights.push({ 
          title: `Uncategorized Load (Node ${node.id})`, 
          text: `Drawing ${node.power.toFixed(0)}W. Please identify this device on the Appliances tab so we can analyze its efficiency against category standards.`, 
          type: 'info', icon: '🔍' 
        });
      }
    });
  }

  if (estimatedMonthly > 3000) {
    insights.push({ title: 'High Projection Alert', text: `Your current burn rate projects a massive monthly bill of ₱${estimatedMonthly.toFixed(0)}. Consider turning off heavy appliances during peak hours.`, type: 'warning', icon: '💸' });
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '44px 24px', fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', justifyContent: 'center' }}>
      {showApplianceModal && pendingNodeId !== null && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '440px',
            background: 'var(--surface)',
            borderRadius: '16px',
            border: '1px solid var(--border)',
            padding: '24px',
            boxShadow: '0 16px 40px rgba(0,0,0,0.25)'
          }}>
            <h3 style={{ margin: '0 0 10px 0', color: 'var(--text1)' }}>New Connection Detected</h3>
            <p style={{ margin: '0 0 16px 0', color: 'var(--text2)', fontSize: '14px' }}>
              Node {pendingNodeId} is now drawing power. Select the appliance type to enable standard-wattage comparison.
            </p>
            <select
              value={selectedApplianceKey}
              onChange={(e) => setSelectedApplianceKey(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text1)',
                marginBottom: '16px'
              }}
            >
              {Object.entries(APPLIANCE_WATTAGE_STANDARDS).map(([key, appliance]) => (
                <option key={key} value={key}>
                  {appliance.label} ({appliance.watts}W)
                </option>
              ))}
            </select>
            <button
              onClick={saveApplianceSelection}
              style={{
                width: '100%',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 14px',
                background: 'var(--primary)',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Save Appliance Type
            </button>
          </div>
        </div>
      )}
      <div style={{ width: '100%', maxWidth: '1200px' }}>
        
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '30px', letterSpacing: '-0.02em', fontWeight: 700, color: 'var(--text1)', margin: '0 0 8px 0' }}>Energy Analytics</h1>
          <p style={{ color: 'var(--text2)', margin: 0, fontSize: '15px' }}>Cost forecasting, consumption breakdowns, and efficiency comparisons.</p>
        </div>

        <div style={{ marginBottom: '30px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: '17px', color: 'var(--text1)' }}>Consumption Comparison</h3>
            <div style={{ display: 'flex', gap: '8px', padding: '4px', background: 'var(--bg)', borderRadius: '10px', border: '1px solid var(--border)' }}>
              {['today', 'week', 'month'].map(period => (
                <button
                  key={period}
                  onClick={() => setComparisonPeriod(period as any)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    boxShadow: comparisonPeriod === period ? '0 4px 14px rgba(59,130,246,0.25)' : 'none',
                    background: comparisonPeriod === period ? 'var(--primary)' : 'transparent',
                    color: comparisonPeriod === period ? 'white' : 'var(--text1)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textTransform: 'capitalize'
                  }}
                >
                  {period === 'today' ? 'Today vs Yesterday' : period === 'week' ? 'This Week vs Last Week' : 'This Month vs Last Month'}
                </button>
              ))}
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '14px' }}>
            {calculateTimeComparisons().map((comparison, idx) => (
              <div key={idx} className="fadein" style={{ background: 'var(--bg)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--text2)', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>{comparison.period}</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text1)', marginBottom: '12px', letterSpacing: '-0.02em' }}>
                  {comparison.totalKwh.toFixed(3)} <span style={{ fontSize: '14px', color: 'var(--text3)' }}>kWh</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Cost: <span style={{ color: 'var(--text1)', fontWeight: 600 }}>₱{comparison.cost.toFixed(2)}</span></div>
                  <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Peak: <span style={{ color: 'var(--text1)', fontWeight: 600 }}>{comparison.peakPower.toFixed(0)}W</span></div>
                  <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Average: <span style={{ color: 'var(--text1)', fontWeight: 600 }}>{comparison.avgPower.toFixed(0)}W</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ margin: '0 0 14px 0', fontSize: '17px', color: 'var(--text1)' }}>Real-Time Appliance Comparison</h3>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '14px' }}>
            {comparisonRows.length === 0 ? (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px', color: 'var(--text2)' }}>
                No active load detected yet.
              </div>
            ) : (
              comparisonRows.map((row) => (
                <div key={row.nodeId} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text1)', marginBottom: '10px' }}>
                    Node {row.nodeId} - {row.applianceLabel}
                  </div>
                  <div style={{ color: 'var(--text2)', fontSize: '14px', lineHeight: 1.6 }}>
                    <div>Actual Wattage: <span style={{ color: 'var(--text1)', fontWeight: 600 }}>{row.actualWattage.toFixed(1)}W</span></div>
                    <div>Standard Wattage: <span style={{ color: 'var(--text1)', fontWeight: 600 }}>{row.standardWattage.toFixed(1)}W</span></div>
                    <div>Difference: <span style={{ color: row.variancePercent > 20 ? '#ef4444' : 'var(--text1)', fontWeight: 600 }}>{row.variancePercent.toFixed(1)}%</span></div>
                    <div>Cost / Hour: <span style={{ color: 'var(--text1)', fontWeight: 600 }}>₱{row.estimatedHourlyCost.toFixed(3)}</span></div>
                  </div>
                  <div style={{
                    marginTop: '10px',
                    fontSize: '13px',
                    color: 'var(--text2)',
                    background: 'var(--bg)',
                    borderRadius: '8px',
                    padding: '10px',
                    borderLeft: `3px solid ${row.variancePercent > 20 ? '#ef4444' : '#3b82f6'}`
                  }}>
                    {row.advice}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' }}>
          <div className="fadein" style={{ background: 'var(--surface)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: '0 6px 20px rgba(0,0,0,0.08)' }}>
            <div style={{ color: 'var(--text2)', fontSize: '14px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}><span>⏱️</span> CURRENT SESSION</div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text1)', fontVariantNumeric: 'tabular-nums' }}>₱{currentCost.toFixed(2)}</div>
            <div style={{ color: 'var(--text3)', fontSize: '13px', marginTop: '4px' }}>Total consumed since boot</div>
          </div>
          <div className="fadein" style={{ background: 'var(--surface)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: '0 6px 20px rgba(0,0,0,0.08)' }}>
            <div style={{ color: 'var(--text2)', fontSize: '14px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}><span>📅</span> EST. DAILY COST</div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text1)', fontVariantNumeric: 'tabular-nums' }}>₱{estimatedDaily.toFixed(2)}</div>
            <div style={{ color: 'var(--text3)', fontSize: '13px', marginTop: '4px' }}>Estimated daily burn rate</div>
          </div>
          <div className="fadein" style={{ background: 'var(--surface)', padding: '24px', borderRadius: '16px', border: '1px solid #3b82f6', boxShadow: '0 8px 24px rgba(59,130,246,0.16)' }}>
            <div style={{ color: '#3b82f6', fontSize: '14px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}><span>🔮</span> EST. MONTHLY COST</div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text1)', fontVariantNumeric: 'tabular-nums' }}>₱{estimatedMonthly.toFixed(2)}</div>
            <div style={{ color: 'var(--text3)', fontSize: '13px', marginTop: '4px' }}>Based on current active load</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr', gap: '30px' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div className="fadein" style={{ background: 'var(--surface)', padding: '30px', borderRadius: '20px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', color: 'var(--text1)', width: '100%' }}>Total Consumption Share</h3>
              <div style={{ width: '220px', height: '220px', position: 'relative' }}>
                <Doughnut data={distributionData} options={doughnutOptions} />
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text1)' }}>{totalKwh.toFixed(3)}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Total kWh</div>
                </div>
              </div>
            </div>

            <div className="fadein" style={{ background: 'var(--surface)', padding: '24px', borderRadius: '20px', border: '1px solid var(--border)' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--text1)', display: 'flex', alignItems: 'center', gap: '8px' }}><span>⚡</span> Efficiency Rankings</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {efficiencyRankings.length === 0 ? (
                  <div style={{ color: 'var(--text3)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
                    No active appliances to rank
                  </div>
                ) : (
                  efficiencyRankings.map((ranking, idx) => (
                    <div key={idx} style={{ 
                      padding: '12px', borderRadius: '8px', background: 'var(--bg)', 
                      borderLeft: `4px solid ${ranking.efficiency >= 90 ? '#10b981' : ranking.efficiency >= 70 ? '#f59e0b' : '#ef4444'}` 
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text1)', fontSize: '14px' }}>{ranking.name}</div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: ranking.efficiency >= 90 ? '#10b981' : ranking.efficiency >= 70 ? '#f59e0b' : '#ef4444' }}>
                          {ranking.efficiency}%
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', color: 'var(--text2)' }}>
                        <div>Actual: {ranking.currentPower.toFixed(0)}W</div>
                        <div>Expected: {ranking.expectedPower}W</div>
                        <div>Daily: ₱{ranking.dailyCost.toFixed(2)}</div>
                        <div>Monthly: ₱{ranking.monthlyProjection.toFixed(0)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="fadein" style={{ background: 'var(--surface)', padding: '24px', borderRadius: '20px', border: '1px solid var(--border)' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--text1)', display: 'flex', alignItems: 'center', gap: '8px' }}><span>🧠</span> Smart Insights</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {insights.map((insight, idx) => (
                  <div key={idx} style={{ 
                    padding: '16px', borderRadius: '12px', background: 'var(--bg)', 
                    borderLeft: `4px solid ${insight.type === 'warning' ? '#ef4444' : insight.type === 'success' ? '#10b981' : '#3b82f6'}` 
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: 'var(--text1)', marginBottom: '4px', fontSize: '14px' }}>
                      <span>{insight.icon}</span> {insight.title}
                    </div>
                    <div style={{ color: 'var(--text2)', fontSize: '13px', lineHeight: '1.5' }}>{insight.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="fadein" style={{ background: 'var(--surface)', padding: '30px', borderRadius: '20px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text1)' }}>Load Stacking Analysis</h3>
              <span style={{ fontSize: '12px', color: 'var(--text3)', background: 'var(--bg)', padding: '4px 10px', borderRadius: '100px' }}>Live Stacked Draw</span>
            </div>
            <p style={{ color: 'var(--text2)', fontSize: '14px', marginBottom: '24px', marginTop: 0 }}>This graph stacks your active appliances to show your total power footprint and exactly which device is contributing to spikes.</p>
            <div style={{ flex: 1, minHeight: '300px', width: '100%' }}>
              <Bar data={barData} options={barOptions as any} />
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default AnalyticsPage;