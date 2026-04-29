import React, { useState, useEffect, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

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
  apiBaseUrl?: string;
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

interface ApplianceSession {
  id: string;
  outlet_id: number;
  appliance_name: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  avg_power: number;
  peak_power: number;
  energy_used: number;
  rate_per_kwh?: number;
  estimated_cost: number;
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

const ANALYTICS_APPLIANCE_TYPE_MAP: Record<string, keyof typeof APPLIANCE_DATA> = {
  charger: 'charger',
  phone: 'charger',
  fan: 'fan',
  lamp: 'lamp',
  light: 'lamp',
  light_bulb: 'lamp',
  tv: 'tv',
  laptop: 'laptop',
  ref: 'ref',
  refrigerator: 'ref',
  fridge: 'ref',
  aircon: 'aircon',
  ac: 'aircon',
  air_conditioner: 'aircon',
  washer: 'washer',
  washing_machine: 'washer'
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

const APPLIANCE_DATA = {
  charger: { label: 'Charger', icon: '🔌', standard: 20, desc: 'Typical smartphone charger' },
  fan: { label: 'Electric Fan', icon: '💨', standard: 60, desc: 'Typical desk/stand fan' },
  lamp: { label: 'LED Lamp', icon: '💡', standard: 12, desc: 'Typical LED bulb' },
  tv: { label: 'LED TV', icon: '📺', standard: 120, desc: 'Typical 32" LED TV' },
  laptop: { label: 'Laptop', icon: '💻', standard: 65, desc: 'Typical 65W adapter' },
  ref: { label: 'Refrigerator', icon: '❄️', standard: 150, desc: 'Inverter ref, compressor on' },
  aircon: { label: 'Air Con', icon: '🌡️', standard: 900, desc: 'Typical 0.75HP window-type' },
  washer: { label: 'Washer', icon: '🫧', standard: 500, desc: 'Fully-automatic washer' }
} as const;

const APPLIANCE_INSIGHTS = {
  charger: {
    under: 'Drawing less than rated — battery may be full or charging efficiently. Great for your bill!',
    over: 'Above rated wattage may mean a faulty cable or incompatible charger. Use the original.',
    match: 'Operating at rated wattage — normal during active charging.'
  },
  fan: {
    under: 'Below rated power — likely on low speed or a high-efficiency motor.',
    over: 'Higher than expected draw. Dust in the motor can cause this — clean the blades.',
    match: 'Fan is performing at rated efficiency.'
  },
  lamp: {
    under: 'Below rated is unusual for LEDs — may be on a dimmer circuit.',
    over: 'Above rated draw may mean a defective LED driver. Consider replacing the bulb.',
    match: 'LED lamp at peak efficiency — 80% more efficient than incandescent.'
  },
  tv: {
    under: 'Power-saving mode or dark content — great habit for reducing your bill!',
    over: 'Above rated draw could mean max brightness or failing power supply. Reduce backlight to 70%.',
    match: 'At rated consumption. Reducing brightness 30% can cut draw by up to 20%.'
  },
  laptop: {
    under: 'Low-power mode or battery full — excellent efficiency!',
    over: 'Above adapter rating happens under heavy CPU/GPU load. Check ventilation.',
    match: 'Adapter at rated power — moderate workload.'
  },
  ref: {
    under: 'Compressor in rest cycle — normal for inverter refrigerators.',
    over: 'High draw may mean broken door seal or dirty coils. Clean condenser every 6 months.',
    match: 'Running at rated draw. Keep at 3°C for optimal efficiency.'
  },
  aircon: {
    under: 'Fan-only or eco mode — great for reducing cost!',
    over: 'Well above rated draw — possible refrigerant leak or clogged filter. Have it serviced.',
    match: 'At rated power. Set to 25–26°C for best comfort-to-cost ratio.'
  },
  washer: {
    under: 'Light load or cold-water cycle — saves up to 40% vs hot wash.',
    over: 'Overloading causes excess motor draw. Wash at 70–80% drum capacity.',
    match: 'At rated efficiency. Always run full loads for best energy per kg.'
  }
} as const;

const AnalyticsPage: React.FC<AnalyticsProps> = ({ liveData, history, phpRate, apiBaseUrl }) => {
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth <= 1024);
  const [showApplianceModal, setShowApplianceModal] = useState(false);
  const [pendingNodeId, setPendingNodeId] = useState<number | null>(null);
  const [selectedApplianceKey, setSelectedApplianceKey] = useState<string>('charger');
  
  const [comparisonPeriod, setComparisonPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [efficiencyRankings, setEfficiencyRankings] = useState<EfficiencyRanking[]>([]);
  const [selectedComparisonNodeId, setSelectedComparisonNodeId] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showAppliancePanel, setShowAppliancePanel] = useState(false);
  const [sessions, setSessions] = useState<ApplianceSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<number>>(new Set());
  
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

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const baseUrl = (apiBaseUrl || '').trim();
        const res = await fetch(`${baseUrl}/api/appliance-sessions?limit=100`);
        if (res.ok) {
          const data: ApplianceSession[] = await res.json();
          setSessions(data);
        }
      } catch (_) {
        // no-op
      } finally {
        setSessionsLoading(false);
      }
    };
    load();
  }, [apiBaseUrl]);

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

  useEffect(() => {
    setDismissedAlerts(prev => {
      const next = new Set(prev);
      comparisonRows.forEach(row => {
        if (row.variancePercent <= 15) next.delete(row.nodeId);
      });
      return next;
    });
  }, [comparisonRows]);

  const activeAlerts = comparisonRows.filter(
    row => row.variancePercent > 15 && !dismissedAlerts.has(row.nodeId)
  );

  const savingsData = useMemo(() => {
    const completed = sessions.filter(s => s.ended_at !== null);

    let totalActualCost = 0;
    let totalStandardCost = 0;
    let totalEnergyKwh = 0;

    completed.forEach(session => {
      const rate = session.rate_per_kwh ?? phpRate;
      const actualCost = Number(session.estimated_cost) ||
                         (Number(session.energy_used) * rate);
      totalActualCost += actualCost;
      totalEnergyKwh += Number(session.energy_used) || 0;

      const nameLC = (session.appliance_name || '').toLowerCase();
      let stdWatts = 0;
      for (const [key, val] of Object.entries(APPLIANCE_WATTAGE_STANDARDS)) {
        if (nameLC.includes(key) || nameLC.includes(val.label.toLowerCase())) {
          stdWatts = val.watts;
          break;
        }
      }
      if (stdWatts === 0) stdWatts = Number(session.avg_power) || 0;

      const stdEnergyKwh = (stdWatts / 1000) *
                           (Number(session.duration_seconds) / 3600);
      totalStandardCost += stdEnergyKwh * rate;
    });

    const saved = totalStandardCost - totalActualCost;
    const sessionCount = completed.length;
    const avgCostPerSession = sessionCount > 0 ?
                              totalActualCost / sessionCount : 0;

    return {
      saved,
      totalActualCost,
      totalStandardCost,
      totalEnergyKwh,
      sessionCount,
      avgCostPerSession
    };
  }, [sessions, phpRate]);

  const comparableActiveNodes = activeNodes
    .map((node) => {
      const configuredType = configuredNodes[node.id]?.type;
      if (!configuredType) return null;
      const normalizedType = APPLIANCE_TYPE_ALIASES[configuredType] || configuredType;
      const mappedType = ANALYTICS_APPLIANCE_TYPE_MAP[normalizedType];
      if (!mappedType) return null;
      return {
        nodeId: node.id,
        nodeName: configuredNodes[node.id]?.name || `Node ${node.id}`,
        typeKey: mappedType,
        actualWattage: node.power
      };
    })
    .filter((entry): entry is { nodeId: number; nodeName: string; typeKey: keyof typeof APPLIANCE_DATA; actualWattage: number } => entry !== null);

  useEffect(() => {
    if (comparableActiveNodes.length === 0) {
      if (selectedComparisonNodeId !== null) setSelectedComparisonNodeId(null);
      return;
    }
    const stillActive = selectedComparisonNodeId !== null && comparableActiveNodes.some(entry => entry.nodeId === selectedComparisonNodeId);
    if (!stillActive) setSelectedComparisonNodeId(comparableActiveNodes[0].nodeId);
  }, [comparableActiveNodes, selectedComparisonNodeId]);

  useEffect(() => {
    setShowAppliancePanel(false);
    if (selectedComparisonNodeId !== null) {
      const t = setTimeout(() => setShowAppliancePanel(true), 40);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [selectedComparisonNodeId]);

  const totalKwh = node1.energy + node2.energy; 
  const currentCost = totalKwh * phpRate;
  const estimatedDaily = currentCost > 0 ? currentCost * 4 : 0; 
  const estimatedMonthly = estimatedDaily * 30;

  const distributionData = {
    labels: ['Sensor Node 1', 'Sensor Node 2'],
    datasets: [{
      data: [node1.energy, node2.energy],
      backgroundColor: ['rgba(59,130,246,0.45)', 'rgba(74,222,128,0.28)'],
      borderColor: ['#3b82f6', '#4ade80'],
      borderWidth: 1,
      hoverOffset: 4
    }]
  };

  const doughnutOptions = {
    cutout: '75%',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e2130',
        borderColor: '#2a2d3a',
        borderWidth: 1,
        titleColor: '#e0e0e0',
        bodyColor: '#6b7080',
        padding: 10,
        cornerRadius: 8,
        callbacks: { label: (context: any) => ` ${context.raw.toFixed(3)} kWh` }
      }
    }
  };

  const barData = {
    labels: history.map(() => ''),
    datasets: [
      {
        label: 'Node 1 (W)',
        data: history.map(h => {
          const n = h.nodes.find(x => x.id === 1);
          return n && n.power > NOISE_FLOOR_WATTS ? n.power : 0;
        }),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.15)',
        fill: true,
        tension: 0.4,
        borderWidth: 1.5,
        pointRadius: 0
      },
      {
        label: 'Node 2 (W)',
        data: history.map(h => {
          const n = h.nodes.find(x => x.id === 2);
          return n && n.power > NOISE_FLOOR_WATTS ? n.power : 0;
        }),
        borderColor: '#4ade80',
        backgroundColor: 'rgba(74,222,128,0.10)',
        fill: true,
        tension: 0.4,
        borderWidth: 1.5,
        pointRadius: 0
      }
    ]
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e2130',
        borderColor: '#2a2d3a',
        borderWidth: 1,
        titleColor: '#e0e0e0',
        bodyColor: '#6b7080',
        padding: 10,
        cornerRadius: 8
      }
    },
    scales: {
      x: {
        stacked: true,
        ticks: { color: '#6b7080', font: { size: 10 } },
        grid: { color: 'rgba(255,255,255,0.04)' },
        border: { color: '#2a2d3a' }
      },
      y: {
        stacked: true,
        ticks: { color: '#6b7080', font: { size: 10 } },
        grid: { color: 'rgba(255,255,255,0.04)' },
        border: { color: '#2a2d3a' }
      }
    }
  };

  const getComparisonSeries = () => {
    const windowSize = comparisonPeriod === 'today' ? 8 : comparisonPeriod === 'week' ? 7 : 6;
    const stride = comparisonPeriod === 'today' ? 1 : comparisonPeriod === 'week' ? 2 : 3;
    const labels = Array.from({ length: windowSize }, (_, idx) =>
      comparisonPeriod === 'today' ? `${idx * 3}h` : comparisonPeriod === 'week' ? `D${idx + 1}` : `W${idx + 1}`
    );
    const chunks: number[] = [];
    for (let i = 0; i < history.length; i += stride) {
      const sum = history
        .slice(i, i + stride)
        .reduce((acc, snap) => acc + (snap.nodes || []).reduce((nAcc, n) => nAcc + (n.power || 0), 0), 0);
      chunks.push(sum / Math.max(stride, 1));
    }
    const current = chunks.slice(-windowSize);
    const previous = chunks.slice(-(windowSize * 2), -windowSize);
    const normalizedCurrent = labels.map((_, i) => current[i] ?? 0);
    const normalizedPrevious = labels.map((_, i) => previous[i] ?? 0);
    return { labels, normalizedCurrent, normalizedPrevious };
  };

  const comparisonSeries = getComparisonSeries();
  const timeComparisons = calculateTimeComparisons();
  const lineData = {
    labels: comparisonSeries.labels,
    datasets: [
      {
        label: 'Current',
        data: comparisonSeries.normalizedCurrent,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.08)',
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 3,
        fill: true
      },
      {
        label: 'Previous',
        data: comparisonSeries.normalizedPrevious,
        borderColor: '#4a4d5a',
        backgroundColor: 'transparent',
        borderDash: [4, 3],
        tension: 0.4,
        borderWidth: 1.5,
        pointRadius: 2,
        fill: false
      }
    ]
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e2130',
        borderColor: '#2a2d3a',
        borderWidth: 1,
        titleColor: '#e0e0e0',
        bodyColor: '#6b7080',
        padding: 10,
        cornerRadius: 8
      }
    },
    scales: {
      x: {
        ticks: { color: '#6b7080', font: { size: 10 } },
        grid: { color: 'rgba(255,255,255,0.04)' },
        border: { color: '#2a2d3a' }
      },
      y: {
        ticks: { color: '#6b7080', font: { size: 10 } },
        grid: { color: 'rgba(255,255,255,0.04)' },
        border: { color: '#2a2d3a' }
      }
    }
  };

  const RATE = 11.8;
  const HRS = 8;
  const DAYS = 30;
  const selectedComparison = comparableActiveNodes.find(entry => entry.nodeId === selectedComparisonNodeId) || null;
  const selectedAppliance = selectedComparison ? selectedComparison.typeKey : null;
  const std = selectedAppliance ? APPLIANCE_DATA[selectedAppliance].standard : 0;
  const actual = selectedComparison ? selectedComparison.actualWattage : 0;
  const isOver = actual > std * 1.05;
  const isUnder = actual < std * 0.95;
  const adviceKey = isOver ? 'over' : isUnder ? 'under' : 'match';
  const dailyStd = (std / 1000) * HRS * RATE;
  const dailyAct = (actual / 1000) * HRS * RATE;
  const monStd = dailyStd * DAYS;
  const monAct = dailyAct * DAYS;
  const monthlySaving = monStd - monAct;
  const maxW = Math.max(std, actual, 1);
  const stdWidth = `${(std / maxW) * 100}%`;
  const actWidth = `${(actual / maxW) * 100}%`;

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
    <div className="content" style={{ background: '#0f1117', minHeight: '100vh', padding: '20px' }}>
      {activeAlerts.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
          {activeAlerts.map(alert => (
            <div key={alert.nodeId} style={{
              background: '#2e1a1a',
              border: '1px solid #7f1d1d',
              borderLeft: '4px solid #f87171',
              borderRadius: '10px',
              padding: '12px 16px',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '12px'
            }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '13px', fontWeight: 600, color: '#fca5a5',
                  marginBottom: '4px', display: 'flex',
                  alignItems: 'center', gap: '6px'
                }}>
                  ⚠️ High Consumption Alert — Node {alert.nodeId}
                  ({alert.applianceLabel})
                </div>
                <div style={{ fontSize: '12px', color: '#f87171', lineHeight: 1.5 }}>
                  Drawing <strong style={{ color: '#fff' }}>
                    {alert.actualWattage.toFixed(1)}W
                  </strong> — {alert.variancePercent.toFixed(0)}% above the
                  standard <strong style={{ color: '#fff' }}>
                    {alert.standardWattage.toFixed(1)}W
                  </strong> rating.
                  This costs an extra <strong style={{ color: '#fca5a5' }}>
                    ₱{(
                      ((alert.actualWattage - alert.standardWattage) / 1000)
                      * 8 * phpRate
                    ).toFixed(2)}
                  </strong> per day vs rated wattage.
                  Check the appliance or consider unplugging it.
                </div>
              </div>
              <button
                onClick={() => setDismissedAlerts(prev =>
                  new Set([...prev, alert.nodeId])
                )}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#6b7080', fontSize: '16px', padding: '0',
                  flexShrink: 0, lineHeight: 1
                }}
                title="Dismiss alert"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {showApplianceModal && pendingNodeId !== null && (
        <div className="overlay open" style={{ alignItems: 'center' }}>
          <div className="modal" style={{ maxWidth: '440px', borderRadius: '16px', background: '#161820', border: '1px solid #2a2d3a' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#fff' }}>New Connection Detected</h3>
            <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: '#6b7080' }}>
              Node {pendingNodeId} is now drawing power. Select the appliance type to enable standard-wattage comparison.
            </p>
            <select
              value={selectedApplianceKey}
              onChange={(e) => setSelectedApplianceKey(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #2a2d3a', background: '#0f1117', color: '#fff', marginBottom: '12px' }}
            >
              {Object.entries(APPLIANCE_WATTAGE_STANDARDS).map(([key, appliance]) => (
                <option key={key} value={key}>
                  {appliance.label} ({appliance.watts}W)
                </option>
              ))}
            </select>
            <button
              onClick={saveApplianceSelection}
              style={{ width: '100%', borderRadius: '10px', padding: '10px 14px', background: '#3b82f6', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
            >
              Save Appliance Type
            </button>
          </div>
        </div>
      )}

      <section style={{ transition: 'all .3s', opacity: mounted ? 1 : 0, marginBottom: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0,1fr))', gap: '12px' }}>
          <div className="sum-card" style={{ background: '#161820', border: '1px solid #2a2d3a', borderRadius: '12px', boxShadow: 'none', padding: '16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 500, color: '#6b7080', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Current Session</div>
            <div style={{ fontSize: '26px', fontWeight: 600, color: '#fff', letterSpacing: '-0.02em' }}>₱{currentCost.toFixed(2)}</div>
            <p style={{ fontSize: '12px', color: '#6b7080', margin: '4px 0 0' }}>Since device boot</p>
          </div>
          <div className="sum-card" style={{ background: '#161820', border: '1px solid #2a2d3a', borderRadius: '12px', boxShadow: 'none', padding: '16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 500, color: '#6b7080', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Est. Daily Cost</div>
            <div style={{ fontSize: '26px', fontWeight: 600, color: '#fff', letterSpacing: '-0.02em' }}>₱{estimatedDaily.toFixed(2)}</div>
            <p style={{ fontSize: '12px', color: '#6b7080', margin: '4px 0 0' }}>Based on active load</p>
          </div>
          <div className="sum-card" style={{ background: '#161e2e', border: '1px solid #3b82f6', borderRadius: '12px', boxShadow: 'none', padding: '16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 500, color: '#6b7080', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Est. Monthly Cost</div>
            <div style={{ fontSize: '26px', fontWeight: 600, color: '#fff', letterSpacing: '-0.02em' }}>₱{estimatedMonthly.toFixed(2)}</div>
            <p style={{ fontSize: '12px', color: '#6b7080', margin: '4px 0 0' }}>Projected at current rate</p>
          </div>
        </div>
      </section>

      <section style={{
        background: '#161820', border: '1px solid #2a2d3a',
        borderRadius: '12px', padding: '16px', marginBottom: '14px',
        opacity: mounted ? 1 : 0, transition: 'all .3s'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '10px', fontWeight: 500,
                       color: '#6b7080', textTransform: 'uppercase',
                       letterSpacing: '1px' }}>
            Savings Tracker
          </h3>
          <span style={{ fontSize: '11px', color: '#6b7080' }}>
            Based on {savingsData.sessionCount} completed sessions
          </span>
        </div>

        <div style={{ display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr',
                      gap: '10px', marginBottom: '14px' }}>
          <div style={{ background: '#0f1117', border: '1px solid #2a2d3a',
                        borderRadius: '10px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: '#6b7080',
                          textTransform: 'uppercase', letterSpacing: '1px',
                          marginBottom: '6px' }}>
              Total Saved
            </div>
            <div style={{
              fontSize: '22px', fontWeight: 600, letterSpacing: '-0.5px',
              color: savingsData.saved >= 0 ? '#4ade80' : '#f87171'
            }}>
              {savingsData.saved >= 0 ? '' : '-'}
              ₱{Math.abs(savingsData.saved).toFixed(2)}
            </div>
            <div style={{ fontSize: '11px', color: '#6b7080', marginTop: '4px' }}>
              {savingsData.saved >= 0
                ? 'vs standard rated wattage'
                : 'above standard wattage cost'}
            </div>
          </div>

          <div style={{ background: '#0f1117', border: '1px solid #2a2d3a',
                        borderRadius: '10px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: '#6b7080',
                          textTransform: 'uppercase', letterSpacing: '1px',
                          marginBottom: '6px' }}>
              Actual Spent
            </div>
            <div style={{ fontSize: '22px', fontWeight: 600,
                          letterSpacing: '-0.5px', color: '#fff' }}>
              ₱{savingsData.totalActualCost.toFixed(2)}
            </div>
            <div style={{ fontSize: '11px', color: '#6b7080', marginTop: '4px' }}>
              across all sessions
            </div>
          </div>

          <div style={{ background: '#0f1117', border: '1px solid #2a2d3a',
                        borderRadius: '10px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: '#6b7080',
                          textTransform: 'uppercase', letterSpacing: '1px',
                          marginBottom: '6px' }}>
              Energy Consumed
            </div>
            <div style={{ fontSize: '22px', fontWeight: 600,
                          letterSpacing: '-0.5px', color: '#fff' }}>
              {savingsData.totalEnergyKwh.toFixed(3)}
              <span style={{ fontSize: '13px', fontWeight: 400,
                             color: '#6b7080' }}> kWh</span>
            </div>
            <div style={{ fontSize: '11px', color: '#6b7080', marginTop: '4px' }}>
              total measured
            </div>
          </div>
        </div>

        {savingsData.totalStandardCost > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
                          fontSize: '11px', color: '#6b7080', marginBottom: '6px' }}>
              <span>Actual cost</span>
              <span>Standard cost</span>
            </div>
            <div style={{ position: 'relative', height: '8px',
                          background: '#0f1117', borderRadius: '4px',
                          overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0,
                            background: '#2a2d3a', borderRadius: '4px' }} />
              <div style={{
                position: 'absolute', top: 0, left: 0, bottom: 0,
                borderRadius: '4px',
                background: savingsData.saved >= 0 ? '#4ade80' : '#f87171',
                width: `${Math.min(
                  (savingsData.totalActualCost /
                   Math.max(savingsData.totalStandardCost, 0.001)) * 100,
                  100
                ).toFixed(1)}%`,
                transition: 'width 0.6s ease'
              }} />
            </div>
          </div>
        )}

        <div style={{
          background: '#0f1117', borderRadius: '10px', padding: '12px',
          borderLeft: `2px solid ${savingsData.saved >= 0 ? '#4ade80' : '#f87171'}`
        }}>
          <div style={{ fontSize: '12px', color: '#6b7080', lineHeight: 1.6 }}>
            {savingsData.sessionCount === 0
              ? '💤 No completed sessions yet. Plug in an appliance to start tracking savings.'
              : savingsData.saved >= 0
                ? `✅ You used less energy than standard-rated appliances would in ${savingsData.sessionCount} session${savingsData.sessionCount !== 1 ? 's' : ''}. That's ₱${savingsData.saved.toFixed(2)} saved. Keep it up!`
                : `⚠️ Your appliances drew more power than their rated wattage across ${savingsData.sessionCount} session${savingsData.sessionCount !== 1 ? 's' : ''}. Check the Real-Time Comparison above to find which device is over-consuming.`
            }
          </div>
        </div>

        {sessionsLoading && (
          <div style={{ fontSize: '11px', color: '#6b7080',
                        marginTop: '8px', textAlign: 'center' }}>
            Loading session data…
          </div>
        )}
      </section>

      <section className="chart-card" style={{ background: '#161820', border: '1px solid #2a2d3a', borderRadius: '12px', boxShadow: 'none', padding: '16px', marginBottom: '14px', transition: 'all .3s', opacity: mounted ? 1 : 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '10px', fontWeight: 500, color: '#6b7080', textTransform: 'uppercase', letterSpacing: '1px' }}>Appliance Comparison</h3>
          <span style={{ fontSize: '12px', color: '#6b7080' }}>
            {selectedComparison ? `${selectedComparison.nodeName} (Node ${selectedComparison.nodeId})` : 'No active configured appliance'}
          </span>
        </div>
        {comparableActiveNodes.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0,1fr))', gap: '8px', marginBottom: '10px' }}>
            {comparableActiveNodes.map((entry) => (
              <button
                key={entry.nodeId}
                onClick={() => setSelectedComparisonNodeId(entry.nodeId)}
                style={{
                  borderRadius: '10px',
                  padding: '10px',
                  fontSize: '12px',
                  textAlign: 'left',
                  transition: 'all .2s',
                  cursor: 'pointer',
                  border: `1px solid ${selectedComparisonNodeId === entry.nodeId ? '#3b82f6' : '#2a2d3a'}`,
                  background: selectedComparisonNodeId === entry.nodeId ? '#161e2e' : '#0f1117',
                  color: selectedComparisonNodeId === entry.nodeId ? '#3b82f6' : '#6b7080'
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600 }}>{entry.nodeName}</div>
                <div style={{ fontSize: '11px', marginTop: '2px' }}>
                  Node {entry.nodeId} • {APPLIANCE_DATA[entry.typeKey].label}
                </div>
              </button>
            ))}
          </div>
        )}
        {selectedAppliance && (
          <div style={{ transition: 'all .3s', opacity: showAppliancePanel ? 1 : 0, transform: showAppliancePanel ? 'translateY(0)' : 'translateY(8px)', marginTop: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#6b7080' }}>
              Current reading:
              <span style={{ background: '#0f1117', border: '1px solid #2a2d3a', borderRadius: '10px', color: '#fff', fontSize: '22px', fontWeight: 600, padding: '8px 10px', minWidth: '112px', textAlign: 'right' }}>
                {actual.toFixed(1)}
              </span>
              W live draw
            </div>
            <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #2a2d3a' }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                <div style={{ background: '#0f1117', border: '1px solid #2a2d3a', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: '#6b7080' }}>Standard rating</div>
                  <div style={{ fontSize: '26px', fontWeight: 600, color: '#fff' }}>{std.toFixed(1)}W</div>
                  <div style={{ fontSize: '12px', color: '#6b7080' }}>{APPLIANCE_DATA[selectedAppliance].desc}</div>
                </div>
                <div style={{ background: '#0f1117', border: '1px solid #2a2d3a', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: '#6b7080' }}>Your actual draw</div>
                  <div style={{ fontSize: '26px', fontWeight: 600, color: isOver ? '#f87171' : '#3b82f6' }}>{actual.toFixed(1)}W</div>
                  <div style={{ fontSize: '12px', color: isOver ? '#f87171' : isUnder ? '#4ade80' : '#fbbf24' }}>
                    {(actual - std) >= 0 ? '+' : ''}{(actual - std).toFixed(1)}W ({std > 0 ? (((actual - std) / std) * 100).toFixed(1) : '0.0'}%)
                  </div>
                </div>
              </div>
              <div style={{ marginTop: '14px' }}>
                <div style={{ fontSize: '11px', color: '#6b7080', marginBottom: '4px' }}>Standard {std.toFixed(1)}W</div>
                <div style={{ background: '#0f1117', height: '6px', borderRadius: '999px', width: '100%', overflow: 'hidden' }}>
                  <div style={{ width: stdWidth, background: '#3a3d4a', height: '100%', transition: 'all .5s' }} />
                </div>
                <div style={{ fontSize: '11px', color: '#6b7080', margin: '8px 0 4px' }}>Actual {actual.toFixed(1)}W</div>
                <div style={{ background: '#0f1117', height: '6px', borderRadius: '999px', width: '100%', overflow: 'hidden' }}>
                  <div style={{ width: actWidth, background: isOver ? '#f87171' : '#3b82f6', height: '100%', transition: 'all .5s' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '14px' }}>
                <div style={{ background: '#0f1117', borderRadius: '10px', padding: '10px', border: '1px solid #2a2d3a' }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: '#6b7080' }}>Daily Std</div>
                  <div style={{ fontSize: '14px', color: '#fff' }}>₱{dailyStd.toFixed(2)}</div>
                </div>
                <div style={{ background: '#0f1117', borderRadius: '10px', padding: '10px', border: '1px solid #2a2d3a' }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: '#6b7080' }}>Daily Act</div>
                  <div style={{ fontSize: '14px', color: '#fff' }}>₱{dailyAct.toFixed(2)}</div>
                </div>
                <div style={{ background: '#0f1117', borderRadius: '10px', padding: '10px', border: '1px solid #2a2d3a' }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: '#6b7080' }}>Mon. Std</div>
                  <div style={{ fontSize: '14px', color: '#fff' }}>₱{monStd.toFixed(2)}</div>
                </div>
                <div style={{ background: '#0f1117', borderRadius: '10px', padding: '10px', border: '1px solid #2a2d3a' }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: '#6b7080' }}>Mon. Act</div>
                  <div style={{ fontSize: '14px', color: isOver ? '#f87171' : monthlySaving > 0 ? '#4ade80' : '#fff' }}>₱{monAct.toFixed(2)}</div>
                </div>
              </div>
              <div style={{ background: '#0f1117', borderRadius: '10px', padding: '10px', marginTop: '14px', borderLeft: `2px solid ${isOver ? '#f87171' : isUnder ? '#4ade80' : '#fbbf24'}` }}>
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#fff', marginBottom: '4px' }}>
                  {isOver ? 'Over Rating' : isUnder ? 'Under Rating' : 'Matched Rating'} — {APPLIANCE_DATA[selectedAppliance].label}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7080' }}>{APPLIANCE_INSIGHTS[selectedAppliance][adviceKey]}</div>
              </div>
            </div>
          </div>
        )}
        {comparableActiveNodes.length === 0 && (
          <div style={{ background: '#0f1117', border: '1px solid #2a2d3a', borderRadius: '10px', padding: '12px', fontSize: '12px', color: '#6b7080' }}>
            Plug in and assign an appliance type in your dashboard first to enable appliance-based comparison.
          </div>
        )}
      </section>

      <section className="chart-card" style={{ background: '#161820', border: '1px solid #2a2d3a', borderRadius: '12px', boxShadow: 'none', padding: '16px', marginBottom: '14px', transition: 'all .3s', opacity: mounted ? 1 : 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '10px', fontWeight: 500, color: '#6b7080', textTransform: 'uppercase', letterSpacing: '1px' }}>Consumption Comparison</h3>
          <div style={{ background: '#0f1117', borderRadius: '10px', padding: '4px', display: 'flex', gap: '4px' }}>
            {['today', 'week', 'month'].map(period => (
              <button
                key={period}
                onClick={() => setComparisonPeriod(period as 'today' | 'week' | 'month')}
                style={{
                  fontSize: '12px',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  background: comparisonPeriod === period ? '#2a2d3a' : 'transparent',
                  color: comparisonPeriod === period ? '#e0e0e0' : '#6b7080',
                  fontWeight: comparisonPeriod === period ? 600 : 400
                }}
              >
                {period === 'today' ? 'Today vs Yesterday' : period === 'week' ? 'This Week' : 'This Month'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6b7080' }}>
            <span style={{ width: '10px', height: '2px', borderRadius: '999px', background: '#3b82f6', display: 'inline-block' }} />
            Current
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6b7080' }}>
            <span style={{ width: '10px', height: '2px', borderRadius: '999px', background: '#4a4d5a', borderTop: '1px dashed #5a5d6a', display: 'inline-block' }} />
            Previous
          </span>
        </div>
        <div style={{ height: '224px' }}>
          <Line data={lineData} options={lineOptions as any} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px', marginTop: '12px' }}>
          {timeComparisons.map((comparison, idx) => (
            <div key={idx} style={{ background: '#0f1117', border: '1px solid #2a2d3a', borderRadius: '10px', padding: '10px' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: '#6b7080', marginBottom: '6px' }}>{comparison.period}</div>
              <div style={{ fontSize: '14px', color: '#fff', marginBottom: '6px' }}>{comparison.totalKwh.toFixed(3)} kWh</div>
              <div style={{ fontSize: '12px', color: '#6b7080' }}>Cost: ₱{comparison.cost.toFixed(2)} | Peak: {comparison.peakPower.toFixed(1)}W</div>
            </div>
          ))}
        </div>
      </section>

      <section className="chart-card" style={{ background: '#161820', border: '1px solid #2a2d3a', borderRadius: '12px', boxShadow: 'none', padding: '16px', marginBottom: '14px', transition: 'all .3s', opacity: mounted ? 1 : 0 }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '10px', fontWeight: 500, color: '#6b7080', textTransform: 'uppercase', letterSpacing: '1px' }}>Real-Time Appliance Comparison</h3>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
          {comparisonRows.length === 0 ? (
            <div style={{ background: '#0f1117', border: '1px solid #2a2d3a', borderRadius: '10px', padding: '12px', fontSize: '12px', color: '#6b7080' }}>No active load detected yet.</div>
          ) : (
            comparisonRows.map((row) => (
              <div key={row.nodeId} style={{ background: '#0f1117', border: '1px solid #2a2d3a', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#fff', marginBottom: '8px' }}>Node {row.nodeId} — {row.applianceLabel}</div>
                <div style={{ fontSize: '12px', color: '#6b7080', lineHeight: 1.45 }}>
                  <div>Actual: <span style={{ color: '#fff' }}>{row.actualWattage.toFixed(1)}W</span></div>
                  <div>Standard: <span style={{ color: '#fff' }}>{row.standardWattage.toFixed(1)}W</span></div>
                  <div>Difference: <span style={{ color: row.variancePercent > 20 ? '#f87171' : '#fff' }}>{row.variancePercent.toFixed(1)}%</span></div>
                  <div>Cost / Hour: <span style={{ color: '#fff' }}>₱{row.estimatedHourlyCost.toFixed(2)}</span></div>
                </div>
                <div style={{ marginTop: '10px', background: '#0f1117', borderRadius: '8px', padding: '10px', borderLeft: `2px solid ${row.variancePercent > 20 ? '#f87171' : '#3b82f6'}` }}>
                  <p style={{ margin: 0, fontSize: '12px', color: '#6b7080' }}>{row.advice}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section style={{ transition: 'all .3s', opacity: mounted ? 1 : 0, marginBottom: '14px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr', gap: '12px' }}>
        <div className="chart-card" style={{ background: '#161820', border: '1px solid #2a2d3a', borderRadius: '12px', boxShadow: 'none', padding: '16px' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '10px', fontWeight: 500, color: '#6b7080', textTransform: 'uppercase', letterSpacing: '1px' }}>Total Consumption Share</h3>
          <div style={{ height: '224px', position: 'relative' }}>
            <Doughnut data={distributionData} options={doughnutOptions as any} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: '24px', fontWeight: 600, color: '#fff' }}>{totalKwh.toFixed(3)}</div>
              <div style={{ fontSize: '12px', color: '#6b7080' }}>kWh</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
          <div className="chart-card" style={{ background: '#161820', border: '1px solid #2a2d3a', borderRadius: '12px', boxShadow: 'none', padding: '16px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '10px', fontWeight: 500, color: '#6b7080', textTransform: 'uppercase', letterSpacing: '1px' }}>Efficiency Rankings</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {efficiencyRankings.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#6b7080' }}>No active appliances to rank</div>
              ) : (
                efficiencyRankings.map((ranking, idx) => (
                  <div key={idx} style={{ background: '#0f1117', border: '1px solid #2a2d3a', borderRadius: '10px', padding: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', color: '#fff' }}>{ranking.name}</span>
                      <span style={{ fontSize: '12px', color: ranking.efficiency >= 90 ? '#4ade80' : ranking.efficiency >= 70 ? '#fbbf24' : '#f87171' }}>{ranking.efficiency}%</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '11px', color: '#6b7080' }}>
                      <span>{ranking.currentPower.toFixed(0)}W</span>
                      <span>{ranking.expectedPower}W</span>
                      <span>₱{ranking.dailyCost.toFixed(2)}</span>
                      <span>₱{ranking.monthlyProjection.toFixed(2)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="chart-card" style={{ background: '#161820', border: '1px solid #2a2d3a', borderRadius: '12px', boxShadow: 'none', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '10px', fontWeight: 500, color: '#6b7080', textTransform: 'uppercase', letterSpacing: '1px' }}>Load Stacking Analysis</h3>
              <span style={{ background: '#2a2d3a', color: '#6b7080', fontSize: '10px', padding: '4px 8px', borderRadius: '999px' }}>Live Stacked Draw</span>
            </div>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6b7080' }}>
                <span style={{ width: '10px', height: '2px', borderRadius: '999px', background: '#3b82f6', display: 'inline-block' }} />
                Sensor Node 1
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6b7080' }}>
                <span style={{ width: '10px', height: '2px', borderRadius: '999px', background: '#4ade80', display: 'inline-block' }} />
                Sensor Node 2
              </span>
            </div>
            <div style={{ height: '224px' }}>
              <Bar data={barData} options={barOptions as any} />
            </div>
          </div>
        </div>
      </section>

      <section className="chart-card" style={{ background: '#161820', border: '1px solid #2a2d3a', borderRadius: '12px', boxShadow: 'none', padding: '16px', transition: 'all .3s', opacity: mounted ? 1 : 0 }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '10px', fontWeight: 500, color: '#6b7080', textTransform: 'uppercase', letterSpacing: '1px' }}>Smart Insights</h3>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
          {insights.map((insight, idx) => (
            <div
              key={idx}
              style={{
                background: '#0f1117',
                borderRadius: '10px',
                padding: '10px',
                borderLeft: `2px solid ${insight.type === 'success' ? '#4ade80' : insight.type === 'warning' ? '#fbbf24' : insight.type === 'info' ? '#3b82f6' : '#f87171'}`
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 500, color: '#fff' }}>{insight.icon} {insight.title}</div>
              <div style={{ fontSize: '12px', color: '#6b7080', marginTop: '4px' }}>{insight.text}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AnalyticsPage;