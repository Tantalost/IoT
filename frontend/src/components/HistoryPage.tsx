import React, { useEffect, useMemo, useState } from 'react';

interface EnergyNode {
  id: number;
  voltage: number;
  current: number;
  power: number;
  energy: number;
}

interface HistorySnapshot {
  nodes: EnergyNode[];
  timestamp?: string;
}

interface ApplianceRecord {
  id: string;
  outlet_id: number | null;
  appliance_name: string;
  appliance_type: string;
  created_at?: string;
}

interface HistoryPageProps {
  history: HistorySnapshot[];
  phpRate: number;
  apiBaseUrl: string;
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

const HistoryPage: React.FC<HistoryPageProps> = ({ history, phpRate, apiBaseUrl }) => {
  const [applianceMap, setApplianceMap] = useState<Record<number, string>>({});
  const [sessions, setSessions] = useState<ApplianceSession[]>([]);

  useEffect(() => {
    const loadAppliances = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/appliances`);
        if (!response.ok) return;
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
          if (currentTime > existingTime) {
            latestByOutlet[item.outlet_id] = item;
          }
        });

        const mapped: Record<number, string> = {};
        Object.entries(latestByOutlet).forEach(([outlet, item]) => {
          mapped[Number(outlet)] = item.appliance_name || item.appliance_type || `Outlet ${outlet}`;
        });
        setApplianceMap(mapped);
      } catch (_error) {
        // Keep page usable even if appliance metadata fails to load.
      }
    };

    loadAppliances();
  }, [apiBaseUrl]);

  useEffect(() => {
    const loadSessions = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/appliance-sessions?limit=100`);
        if (!response.ok) return;
        const data: ApplianceSession[] = await response.json();
        setSessions(data);
      } catch (_error) {
        // keep page usable even when sessions endpoint is unavailable
      }
    };

    loadSessions();
  }, [apiBaseUrl]);

  const rows = useMemo(() => {
    const grouped: Record<number, { count: number; powerSum: number; peakPower: number; latestSeen: string; energySum: number }> = {};

    history.forEach((snapshot) => {
      const snapshotTime = snapshot.timestamp || new Date().toISOString();
      (snapshot.nodes || []).forEach((node) => {
        if (!grouped[node.id]) {
          grouped[node.id] = {
            count: 0,
            powerSum: 0,
            peakPower: 0,
            latestSeen: snapshotTime,
            energySum: 0
          };
        }

        grouped[node.id].count += 1;
        grouped[node.id].powerSum += node.power || 0;
        grouped[node.id].peakPower = Math.max(grouped[node.id].peakPower, node.power || 0);
        grouped[node.id].energySum += node.energy || 0;
        if (new Date(snapshotTime).getTime() > new Date(grouped[node.id].latestSeen).getTime()) {
          grouped[node.id].latestSeen = snapshotTime;
        }
      });
    });

    return Object.entries(grouped)
      .map(([nodeId, stats]) => {
        const avgPower = stats.count > 0 ? stats.powerSum / stats.count : 0;
        const costPerHour = (avgPower / 1000) * phpRate;
        const estimatedDailyCost = costPerHour * 24;
        return {
          nodeId: Number(nodeId),
          appliance: applianceMap[Number(nodeId)] || `Outlet ${nodeId}`,
          avgPower,
          peakPower: stats.peakPower,
          energySampleTotal: stats.energySum,
          costPerHour,
          estimatedDailyCost,
          latestSeen: stats.latestSeen
        };
      })
      .sort((a, b) => b.avgPower - a.avgPower);
  }, [history, phpRate, applianceMap]);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '40px 20px', fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '1200px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                <th style={{ textAlign: 'left', padding: '14px', color: 'var(--text2)', fontSize: '13px' }}>Outlet</th>
                <th style={{ textAlign: 'left', padding: '14px', color: 'var(--text2)', fontSize: '13px' }}>Appliance</th>
                <th style={{ textAlign: 'left', padding: '14px', color: 'var(--text2)', fontSize: '13px' }}>Avg Power</th>
                <th style={{ textAlign: 'left', padding: '14px', color: 'var(--text2)', fontSize: '13px' }}>Peak Draw</th>
                <th style={{ textAlign: 'left', padding: '14px', color: 'var(--text2)', fontSize: '13px' }}>Cost / Hour</th>
                <th style={{ textAlign: 'left', padding: '14px', color: 'var(--text2)', fontSize: '13px' }}>Est. Daily Cost</th>
                <th style={{ textAlign: 'left', padding: '14px', color: 'var(--text2)', fontSize: '13px' }}>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)' }}>
                    No appliance history yet. Plug in a load and let readings stream.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.nodeId} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '14px', color: 'var(--text1)', fontWeight: 600 }}>Node {row.nodeId}</td>
                    <td style={{ padding: '14px', color: 'var(--text1)' }}>{row.appliance}</td>
                    <td style={{ padding: '14px', color: 'var(--text1)' }}>{row.avgPower.toFixed(1)} W</td>
                    <td style={{ padding: '14px', color: 'var(--text1)' }}>{row.peakPower.toFixed(1)} W</td>
                    <td style={{ padding: '14px', color: 'var(--text1)' }}>₱{row.costPerHour.toFixed(3)}</td>
                    <td style={{ padding: '14px', color: 'var(--text1)' }}>₱{row.estimatedDailyCost.toFixed(2)}</td>
                    <td style={{ padding: '14px', color: 'var(--text2)' }}>{new Date(row.latestSeen).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: '28px', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '20px', margin: 0, color: 'var(--text1)' }}>Plug/Unplug Session Timeline</h2>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                <th style={{ textAlign: 'left', padding: '14px', color: 'var(--text2)', fontSize: '13px' }}>Outlet</th>
                <th style={{ textAlign: 'left', padding: '14px', color: 'var(--text2)', fontSize: '13px' }}>Appliance</th>
                <th style={{ textAlign: 'left', padding: '14px', color: 'var(--text2)', fontSize: '13px' }}>Started</th>
                <th style={{ textAlign: 'left', padding: '14px', color: 'var(--text2)', fontSize: '13px' }}>Ended</th>
                <th style={{ textAlign: 'left', padding: '14px', color: 'var(--text2)', fontSize: '13px' }}>Duration</th>
                <th style={{ textAlign: 'left', padding: '14px', color: 'var(--text2)', fontSize: '13px' }}>Avg W</th>
                <th style={{ textAlign: 'left', padding: '14px', color: 'var(--text2)', fontSize: '13px' }}>Peak W</th>
                <th style={{ textAlign: 'left', padding: '14px', color: 'var(--text2)', fontSize: '13px' }}>Energy Used</th>
                <th style={{ textAlign: 'left', padding: '14px', color: 'var(--text2)', fontSize: '13px' }}>Rate</th>
                <th style={{ textAlign: 'left', padding: '14px', color: 'var(--text2)', fontSize: '13px' }}>Session Cost</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)' }}>
                    No plug/unplug sessions logged yet.
                  </td>
                </tr>
              ) : (
                sessions.map((session) => (
                  <tr key={session.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '14px', color: 'var(--text1)', fontWeight: 600 }}>Node {session.outlet_id}</td>
                    <td style={{ padding: '14px', color: 'var(--text1)' }}>
                      {session.appliance_name || applianceMap[session.outlet_id] || `Outlet ${session.outlet_id}`}
                    </td>
                    <td style={{ padding: '14px', color: 'var(--text2)' }}>{new Date(session.started_at).toLocaleString()}</td>
                    <td style={{ padding: '14px', color: 'var(--text2)' }}>
                      {session.ended_at ? new Date(session.ended_at).toLocaleString() : 'In progress'}
                    </td>
                    <td style={{ padding: '14px', color: 'var(--text1)' }}>{Math.round(session.duration_seconds / 60)} min</td>
                    <td style={{ padding: '14px', color: 'var(--text1)' }}>{Number(session.avg_power || 0).toFixed(1)} W</td>
                    <td style={{ padding: '14px', color: 'var(--text1)' }}>{Number(session.peak_power || 0).toFixed(1)} W</td>
                    <td style={{ padding: '14px', color: 'var(--text1)' }}>{Number(session.energy_used || 0).toFixed(3)} kWh</td>
                    <td style={{ padding: '14px', color: 'var(--text1)' }}>₱{Number(session.rate_per_kwh ?? phpRate).toFixed(2)}/kWh</td>
                    <td style={{ padding: '14px', color: 'var(--text1)' }}>
                      ₱{(session.estimated_cost ? Number(session.estimated_cost) : Number(session.energy_used || 0) * phpRate).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default HistoryPage;
