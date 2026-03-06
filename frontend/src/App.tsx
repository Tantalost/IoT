import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import WattWatchDashboard from './components/WattWatchDashboard';

// Export this interface so our other files can use the exact same data structure
export interface EnergyData {
  voltage: number;
  current: number;
  power: number;
  energy: number;
  timestamp?: string;
}

// Connect to the server ONCE at the app level
const socket = io('http://localhost:3000'); 

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isDark, setIsDark] = useState<boolean>(() => localStorage.getItem('theme') === 'dark');
  const [phpRate, setPhpRate] = useState<number>(12); // Lifted the rate so Settings can change it later!

  // --- THE GLOBAL DATA STATE ---
  const [liveData, setLiveData] = useState<EnergyData>({ voltage: 0, current: 0, power: 0, energy: 0 });
  const [history, setHistory] = useState<EnergyData[]>([]);

  useEffect(() => {
    // 1. Theme handler
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    // 2. Initial History Fetch
    const fetchHistory = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/energy/history');
        const data = await response.json();
        setHistory(data);
      } catch (error) {
        console.error("Failed to fetch history:", error);
      }
    };
    fetchHistory();

    // 3. Global WebSocket Listener
    socket.on('live_power_reading', (data: EnergyData) => {
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
  }, [isDark]); // Re-run theme logic if isDark changes

  return (
    <div className="app">
      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="sidebar">
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div>
            <div className="logo">
              <div className="logo-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg></div>
              <div><div className="logo-name">WattWatch</div><div className="logo-tag">Energy Monitor</div></div>
            </div>
            
            <div className="nav-sect">
              <div className="nav-sect-label">Monitor</div>
              <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> Dashboard
              </div>
              <div className={`nav-item ${activeTab === 'devices' ? 'active' : ''}`} onClick={() => setActiveTab('devices')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg> Appliances
              </div>
              <div className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> Analytics
              </div>
            </div>
            <div className="nav-sect">
              <div className="nav-sect-label">System</div>
              <div className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 19.07l-1.41-1.41M20.49 12H22M2 12h1.51M19.07 19.07l-1.41-1.41M4.93 4.93L3.52 6.34M12 20.49V22M12 2v1.51"/></svg> Settings
              </div>
            </div>
          </div>

          <div style={{ marginTop: 'auto' }}>
            <div className="nav-item" onClick={() => setIsDark(!isDark)} style={{ marginBottom: '15px', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                {isDark ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>}
                <span>{isDark ? 'Dark Mode' : 'Light Mode'}</span>
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

      {activeTab === 'dashboard' ? (
        <WattWatchDashboard liveData={liveData} history={history} phpRate={phpRate} />
      ) : (
        <div className="content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text3)' }}>
          <h2>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Module Under Construction 🚧</h2>
        </div>
      )}

      {/*MOBILE NAV*/}
      <nav className="mob-nav">
        <button className={`mob-nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg><span>Home</span></button>
        <button className={`mob-nav-btn ${activeTab === 'devices' ? 'active' : ''}`} onClick={() => setActiveTab('devices')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg><span>Devices</span></button>
        <button className={`mob-nav-btn ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><span>Analytics</span></button>
        <button className={`mob-nav-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 19.07l-1.41-1.41M20.49 12H22M2 12h1.51M19.07 19.07l-1.41-1.41M4.93 4.93L3.52 6.34M12 20.49V22M12 2v1.51"/></svg><span>Settings</span></button>
      </nav>
    </div>
  );
};

export default App;