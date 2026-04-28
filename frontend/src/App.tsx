import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import WattWatchDashboard from './components/WattWatchDashboard';
import AppliancesPage from './components/AppliancesPage';
import AnalyticsPage from './components/AnalyticsPage';
import HistoryPage from './components/HistoryPage';
export interface EnergyNode {
  id: number;
  voltage: number;
  current: number;
  power: number;
  energy: number;
}

export interface EnergyData {
  nodes: EnergyNode[];
  timestamp?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

// Connect to the server ONCE at the app level
const socket = io(API_BASE_URL);

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isDark, setIsDark] = useState<boolean>(() => localStorage.getItem('theme') === 'dark');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => localStorage.getItem('sidebar_collapsed') === 'true');
  const [phpRate] = useState<number>(12); // Kept in state for future settings panel
  
  // 🚀 NEW: High consumption alert settings
  const [alertThreshold] = useState<number>(() => {
    const saved = localStorage.getItem('wattwatch_alert_threshold');
    return saved ? parseFloat(saved) : 1000; // Default 1000W
  });
  const [alertsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('wattwatch_alerts_enabled');
    return saved !== null ? saved === 'true' : true; // Default enabled
  });

  // --- THE GLOBAL DATA STATE ---
  const [history, setHistory] = useState<EnergyData[]>([]);
  const [liveData, setLiveData] = useState<EnergyData>({ 
  nodes: [
    { id: 1, voltage: 0, current: 0, power: 0, energy: 0 },
    { id: 2, voltage: 0, current: 0, power: 0, energy: 0 }
  ] 
});

  useEffect(() => {
    // 1. Theme handler
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    // 🚀 NEW: Save alert settings
    localStorage.setItem('wattwatch_alert_threshold', alertThreshold.toString());
    localStorage.setItem('wattwatch_alerts_enabled', alertsEnabled.toString());

    // 2. Initial History Fetch
    const fetchHistory = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/energy/history?limit=500`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        setHistory(data);
      } catch (error) {
        console.error("Failed to fetch history:", error);
      }
    };
    fetchHistory();

    // 3. Global WebSocket Listener
    socket.on('live_power_reading', (data: EnergyData) => {
      console.log("📥 RECEIVED LIVE DATA FROM BACKEND:", data); 
      
      setLiveData(data);
      setHistory((prev) => {
        const updated = [...prev, data];
        if (updated.length > 20) updated.shift();
        return updated;
      });
    });

    return () => {
      socket.off('live_power_reading');
    };
  }, [isDark, alertThreshold, alertsEnabled]); // Re-run when settings change

  useEffect(() => {
    const syncRateToBackend = async () => {
      try {
        await fetch(`${API_BASE_URL}/api/settings/rate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phpRate })
        });
      } catch (error) {
        console.error('Failed to sync rate to backend:', error);
      }
    };

    syncRateToBackend();
  }, [phpRate]);

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', isSidebarCollapsed.toString());
  }, [isSidebarCollapsed]);

  return (
    <div className="app">
      {/* ── DESKTOP SIDEBAR ── */}
      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div>
            <button
              className="sidebar-toggle"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isSidebarCollapsed ? (
                  <polyline points="9 18 15 12 9 6" />
                ) : (
                  <polyline points="15 18 9 12 15 6" />
                )}
              </svg>
            </button>
            <div className="logo">
              <div className="logo-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg></div>
              <div><div className="logo-name">WattWatch</div><div className="logo-tag">Energy Monitor</div></div>
            </div>
            
            <div className="nav-sect">
              <div className="nav-sect-label">Monitor</div>
              <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg><span className="nav-text">Dashboard</span>
              </div>
              <div className={`nav-item ${activeTab === 'devices' ? 'active' : ''}`} onClick={() => setActiveTab('devices')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg><span className="nav-text">Appliances</span>
              </div>
              <div className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><span className="nav-text">Analytics</span>
              </div>
              <div className={`nav-item ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l3 3"/></svg><span className="nav-text">History</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 'auto' }}>
            <div className="nav-item" onClick={() => setIsDark(!isDark)} style={{ marginBottom: '15px', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                {isDark ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>}
                <span className="nav-text">{isDark ? 'Dark Mode' : 'Light Mode'}</span>
              </div>
            </div>
            <div className="sidebar-rate">
              <div className="rate-row"><div className="rate-label">Electricity Rate</div></div>
              <div className="rate-val">₱{phpRate.toFixed(2)} / kWh</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── MOBILE TOP BAR ── */}
      <header className="mob-topbar">
        <div className="mob-logo">
          <div className="mob-logo-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg></div>
          <div className="mob-logo-name">WattWatch</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div onClick={() => setIsDark(!isDark)} style={{ color: 'var(--text3)', cursor: 'pointer', display: 'flex' }}>
             {isDark ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>}
          </div>
          <div className="mob-live"><div className="pulse"></div>Live</div>
        </div>
      </header>

      {activeTab === 'dashboard' && (
        <WattWatchDashboard 
          liveData={liveData} 
          history={history} 
          phpRate={phpRate} 
          alertThreshold={alertThreshold}
          alertsEnabled={alertsEnabled}
          apiBaseUrl={API_BASE_URL}
        />
      )}
      {activeTab === 'devices' && (
        <AppliancesPage liveData={liveData} history={history} phpRate={phpRate} />
      )}
      {activeTab === 'analytics' && (
        <AnalyticsPage liveData={liveData} history={history} phpRate={phpRate} />
      )}
      {activeTab === 'history' && (
        <HistoryPage history={history} phpRate={phpRate} apiBaseUrl={API_BASE_URL} />
      )}
      {(activeTab !== 'dashboard' && activeTab !== 'devices' && activeTab !== 'analytics' && activeTab !== 'history') && (
        <div className="content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text3)' }}>
          <h2>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Module Under Construction 🚧</h2>
        </div>
      )}

      {/*MOBILE NAV*/}
      <nav className="mob-nav">
        <button className={`mob-nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg><span>Home</span></button>
        <button className={`mob-nav-btn ${activeTab === 'devices' ? 'active' : ''}`} onClick={() => setActiveTab('devices')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg><span>Devices</span></button>
        <button className={`mob-nav-btn ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><span>Analytics</span></button>
        <button className={`mob-nav-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l3 3"/></svg><span>History</span></button>
      </nav>
    </div>
  );
};

export default App;