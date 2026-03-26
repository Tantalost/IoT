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
  
  // 🧠 Load the smart memory so the Analytics page knows what devices are plugged in
  const [deviceMemory, setDeviceMemory] = useState<SavedDeviceSignature[]>(() => {
    const saved = localStorage.getItem('wattwatch_fingerprints');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- DATA SANITIZATION ---
  const NOISE_FLOOR_WATTS = 3.0; 
  const cleanNodes = (liveData?.nodes || []).map(node => ({
    ...node,
    power: node.power < NOISE_FLOOR_WATTS ? 0 : node.power
  }));

  const node1 = cleanNodes.find(n => n.id === 1) || { id: 1, power: 0, energy: 0 };
  const node2 = cleanNodes.find(n => n.id === 2) || { id: 2, power: 0, energy: 0 };
  const activeNodes = cleanNodes.filter(n => n.power > 0);

  // --- FINANCIAL FORECASTING ---
  const totalKwh = node1.energy + node2.energy; 
  const currentCost = totalKwh * phpRate;
  const estimatedDaily = currentCost > 0 ? currentCost * 4 : 0; 
  const estimatedMonthly = estimatedDaily * 30;

  // --- CHART 1: ENERGY DISTRIBUTION (DOUGHNUT) ---
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

  // --- CHART 2: HISTORICAL USAGE TRENDS (BAR CHART) ---
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

  // --- 🧠 CATEGORY-BASED SMART INSIGHTS ENGINE ---
  let insights: Array<{title: string, text: string, type: 'warning' | 'success' | 'info', icon: string}> = [];

  if (activeNodes.length === 0) {
    insights.push({ title: 'System Idle', text: 'All monitored outlets are currently empty or devices are completely powered off. Excellent energy conservation!', type: 'success', icon: '💤' });
  } else {
    activeNodes.forEach(node => {
      // 1. Identify what appliance is plugged in based on its power fingerprint
      const matchedDevice = deviceMemory.find(memory => {
        const difference = Math.abs(memory.expectedPower - node.power);
        const tolerance = Math.max(15, memory.expectedPower * 0.15); // 15% tolerance
        return difference <= tolerance;
      });

      if (matchedDevice) {
        // 2. We know what it is! Get the category baseline specs
        const spec = APPLIANCE_SPECS[matchedDevice.type] || APPLIANCE_SPECS.default;
        const baseline = spec.expectedWatts;
        
        // 3. Compare real-time draw against the category average
        if (node.power > baseline * 1.25) {
          // It's pulling 25% MORE than a normal appliance of this type
          insights.push({ 
            title: `Inefficient Draw: ${matchedDevice.name}`, 
            text: `Pulling ${node.power.toFixed(0)}W, which is significantly higher than the typical ${baseline}W for this category. Check the appliance for dirty filters, failing motors, or faults.`, 
            type: 'warning', icon: '⚠️' 
          });
        } else if (node.power >= baseline * 0.75 && node.power <= baseline * 1.25) {
          // It's right in the sweet spot
          insights.push({ 
            title: `Healthy Operation: ${matchedDevice.name}`, 
            text: `Running at ${node.power.toFixed(0)}W, which perfectly matches the optimal baseline for this category.`, 
            type: 'success', icon: '✅' 
          });
        } else {
          // It's pulling less than expected (likely Standby or Eco mode)
          insights.push({ 
            title: `Eco/Standby Mode: ${matchedDevice.name}`, 
            text: `Drawing only ${node.power.toFixed(0)}W. It is operating below standard capacity or resting in standby mode.`, 
            type: 'info', icon: '🔋' 
          });
        }
      } else {
        // We don't recognize this power signature
        insights.push({ 
          title: `Uncategorized Load (Node ${node.id})`, 
          text: `Drawing ${node.power.toFixed(0)}W. Please identify this device on the Appliances tab so we can analyze its efficiency against category standards.`, 
          type: 'info', icon: '🔍' 
        });
      }
    });
  }

  // Add a generic cost projection insight if things are getting expensive
  if (estimatedMonthly > 3000) {
    insights.push({ title: 'High Projection Alert', text: `Your current burn rate projects a massive monthly bill of ₱${estimatedMonthly.toFixed(0)}. Consider turning off heavy appliances during peak hours.`, type: 'warning', icon: '💸' });
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '40px 20px', fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '1200px' }}>
        
        {/* Header */}
        <div style={{ marginBottom: '30px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text1)', margin: '0 0 8px 0' }}>Energy Analytics</h1>
          <p style={{ color: 'var(--text2)', margin: 0, fontSize: '16px' }}>Cost forecasting and consumption breakdowns.</p>
        </div>

        {/* Top Row: Financial Forecast */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' }}>
          <div className="fadein" style={{ background: 'var(--surface)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text2)', fontSize: '14px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}><span>⏱️</span> CURRENT SESSION</div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text1)', fontVariantNumeric: 'tabular-nums' }}>₱{currentCost.toFixed(2)}</div>
            <div style={{ color: 'var(--text3)', fontSize: '13px', marginTop: '4px' }}>Total consumed since boot</div>
          </div>
          <div className="fadein" style={{ background: 'var(--surface)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text2)', fontSize: '14px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}><span>📅</span> 24H FORECAST</div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text1)', fontVariantNumeric: 'tabular-nums' }}>₱{estimatedDaily.toFixed(2)}</div>
            <div style={{ color: 'var(--text3)', fontSize: '13px', marginTop: '4px' }}>Estimated daily burn rate</div>
          </div>
          <div className="fadein" style={{ background: 'var(--surface)', padding: '24px', borderRadius: '16px', border: '1px solid #3b82f6', boxShadow: '0 0 15px rgba(59, 130, 246, 0.1)' }}>
            <div style={{ color: '#3b82f6', fontSize: '14px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}><span>🔮</span> 30-DAY PROJECTION</div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text1)', fontVariantNumeric: 'tabular-nums' }}>₱{estimatedMonthly.toFixed(2)}</div>
            <div style={{ color: 'var(--text3)', fontSize: '13px', marginTop: '4px' }}>Based on current active load</div>
          </div>
        </div>

        {/* Middle Row: Charts & Insights */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr', gap: '30px' }}>
          
          {/* Left: Distribution & Insights */}
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

            {/* Smart Insights Engine */}
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

          {/* Right: Trend Chart */}
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