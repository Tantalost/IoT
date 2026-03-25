import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler);

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
}

const AppliancesPage: React.FC<AppliancesProps> = ({ liveData, history }) => {
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth <= 1024);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- DATA SANITIZATION (Noise Floor) ---
  const NOISE_FLOOR_WATTS = 3.0; 
  const cleanNodes = (liveData?.nodes || []).map(node => ({
    ...node,
    power: node.power < NOISE_FLOOR_WATTS ? 0 : node.power,
    current: node.power < NOISE_FLOOR_WATTS ? 0 : node.current
  }));

  // Extract exactly Node 1 and Node 2
  const node1 = cleanNodes.find(n => n.id === 1) || { id: 1, voltage: 0, current: 0, power: 0, energy: 0 };
  const node2 = cleanNodes.find(n => n.id === 2) || { id: 2, voltage: 0, current: 0, power: 0, energy: 0 };

  // --- HELPER TO BUILD INDIVIDUAL CHARTS ---
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

  // --- REUSABLE SENSOR CARD COMPONENT ---
  const SensorCard = ({ node, chart, title, themeColor }: { node: EnergyNode, chart: any, title: string, themeColor: string }) => {
    const isActive = node.power > 0;
    
    return (
      <div className="fadein" style={{ background: 'var(--surface)', borderRadius: '20px', padding: '30px', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Card Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: isActive ? themeColor : 'var(--border)', boxShadow: isActive ? `0 0 10px ${themeColor}` : 'none' }}></div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text1)' }}>{title}</h2>
            </div>
            <p style={{ margin: 0, color: 'var(--text3)', fontSize: '14px' }}>Hardware ID: PZEM-004T-{node.id}</p>
          </div>
          <div style={{ background: isActive ? `${themeColor}15` : 'var(--surface2)', color: isActive ? themeColor : 'var(--text3)', padding: '6px 12px', borderRadius: '100px', fontSize: '13px', fontWeight: 600 }}>
            {isActive ? 'Drawing Power' : 'Standby'}
          </div>
        </div>

        {/* 2x2 Detailed Metrics Grid */}
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

        {/* Individual Power Graph */}
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text2)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Power Draw History</h3>
          <div style={{ height: '220px', width: '100%', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px', background: 'var(--bg)' }}>
            <Line data={chart.data} options={chart.options as any} />
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