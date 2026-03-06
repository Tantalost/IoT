import React from 'react';
import EnergyDashboard from './components/EnergyDashboard';

const App: React.FC = () => {
  return (
    <div>
      <h1 style={{ textAlign: 'center', marginTop: '20px' }}>My IoT Web Dashboard</h1>
      
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <EnergyDashboard />
      </div>
    </div>
  );
};

export default App;