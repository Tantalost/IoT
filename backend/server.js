const express = require('express');
const cors = require('cors');
const http = require('http');
const { randomUUID } = require('crypto');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] 🔎 Incoming ${req.method} request to ${req.url}`);
  next();
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase client initialized');
const SESSION_ACTIVE_WATTS = 1.5;
const DEFAULT_RATE_PER_KWH = parseNumber(process.env.DEFAULT_RATE_PER_KWH) || 12;
let currentRatePerKwh = DEFAULT_RATE_PER_KWH;
const activeSessions = new Map();

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchLatestApplianceName(outletId) {
  const { data, error } = await supabase
    .from('user_appliances')
    .select('appliance_name, appliance_type')
    .eq('outlet_id', outletId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return `Outlet ${outletId}`;
  return data.appliance_name || data.appliance_type || `Outlet ${outletId}`;
}

async function startApplianceSession(node, timestampMs) {
  const outletId = parseNumber(node.id);
  if (outletId === null) return;

  const applianceName = await fetchLatestApplianceName(outletId);
  const startedAtIso = new Date(timestampMs).toISOString();
  const startPower = Math.max(parseNumber(node.power) || 0, 0);
  const startEnergy = Math.max(parseNumber(node.energy) || 0, 0);

  const payload = {
    outlet_id: outletId,
    appliance_name: applianceName,
    rate_per_kwh: currentRatePerKwh,
    started_at: startedAtIso,
    ended_at: null,
    duration_seconds: 0,
    sample_count: 1,
    avg_power: startPower,
    peak_power: startPower,
    energy_used: 0,
    estimated_cost: 0
  };

  const { data, error } = await supabase
    .from('appliance_sessions')
    .insert(payload)
    .select('id')
    .single();

  if (error) throw error;

  activeSessions.set(outletId, {
    id: data.id,
    startedAtMs: timestampMs,
    lastSeenMs: timestampMs,
    sampleCount: 1,
    powerSum: startPower,
    peakPower: startPower,
    startEnergy,
    lastEnergy: startEnergy,
    applianceName
  });
}

async function updateApplianceSession(node, timestampMs) {
  const outletId = parseNumber(node.id);
  if (outletId === null) return;

  const session = activeSessions.get(outletId);
  if (!session) return;

  const power = Math.max(parseNumber(node.power) || 0, 0);
  const energy = Math.max(parseNumber(node.energy) || 0, 0);

  session.lastSeenMs = timestampMs;
  session.sampleCount += 1;
  session.powerSum += power;
  session.peakPower = Math.max(session.peakPower, power);
  session.lastEnergy = energy;

  const durationSeconds = Math.max(0, Math.round((session.lastSeenMs - session.startedAtMs) / 1000));
  const avgPower = session.sampleCount > 0 ? session.powerSum / session.sampleCount : 0;
  const energyUsed = Math.max(session.lastEnergy - session.startEnergy, 0);

  const { error } = await supabase
    .from('appliance_sessions')
    .update({
      ended_at: null,
      duration_seconds: durationSeconds,
      sample_count: session.sampleCount,
      avg_power: avgPower,
      peak_power: session.peakPower,
      energy_used: energyUsed,
      estimated_cost: energyUsed * currentRatePerKwh,
      rate_per_kwh: currentRatePerKwh
    })
    .eq('id', session.id);

  if (error) throw error;
}

async function endApplianceSession(node, timestampMs) {
  const outletId = parseNumber(node.id);
  if (outletId === null) return;
  const session = activeSessions.get(outletId);
  if (!session) return;

  const finalPower = Math.max(parseNumber(node.power) || 0, 0);
  const finalEnergy = Math.max(parseNumber(node.energy) || session.lastEnergy || 0, 0);

  const durationSeconds = Math.max(0, Math.round((timestampMs - session.startedAtMs) / 1000));
  const sampleCount = session.sampleCount + 1;
  const powerSum = session.powerSum + finalPower;
  const avgPower = sampleCount > 0 ? powerSum / sampleCount : 0;
  const peakPower = Math.max(session.peakPower, finalPower);
  const energyUsed = Math.max(finalEnergy - session.startEnergy, 0);
  const estimatedCost = energyUsed * currentRatePerKwh;

  const { error } = await supabase
    .from('appliance_sessions')
    .update({
      ended_at: new Date(timestampMs).toISOString(),
      duration_seconds: durationSeconds,
      sample_count: sampleCount,
      avg_power: avgPower,
      peak_power: peakPower,
      energy_used: energyUsed,
      estimated_cost: estimatedCost,
      rate_per_kwh: currentRatePerKwh
    })
    .eq('id', session.id);

  if (error) throw error;
  activeSessions.delete(outletId);
}

async function syncApplianceSessions(nodes, timestampMs) {
  for (const node of nodes) {
    const outletId = parseNumber(node.id);
    if (outletId === null) continue;
    const power = Math.max(parseNumber(node.power) || 0, 0);
    const hasActiveSession = activeSessions.has(outletId);

    if (power >= SESSION_ACTIVE_WATTS) {
      if (!hasActiveSession) await startApplianceSession(node, timestampMs);
      else await updateApplianceSession(node, timestampMs);
    } else if (hasActiveSession) {
      await endApplianceSession(node, timestampMs);
    }
  }
}

io.on('connection', (socket) => {
  console.log(`🔌 Frontend connected: ${socket.id}`);
  socket.on('disconnect', () => console.log(`❌ Frontend disconnected: ${socket.id}`));
});

app.post('/api/energy', async (req, res) => {
  const { nodes } = req.body;

  if (!nodes || !Array.isArray(nodes)) {
    return res.status(400).send({ error: "Invalid data format" });
  }

  try {
    io.emit('live_power_reading', { nodes });

    const requestId = randomUUID();
    const rows = nodes.map((node) => ({
      request_id: requestId,
      outlet_id: parseNumber(node.id),
      voltage: parseNumber(node.voltage),
      current: parseNumber(node.current),
      power: parseNumber(node.power),
      energy: parseNumber(node.energy)
    }));

    const { error } = await supabase.from('sensor_readings').insert(rows);
    if (error) {
      throw error;
    }

    try {
      await syncApplianceSessions(nodes, Date.now());
    } catch (sessionError) {
      console.error('Session tracking error:', sessionError);
    }

    console.log(`⚡ Broadcasted & Saved ${nodes.length} Nodes!`);
    res.status(200).send({ message: "Data processed!", request_id: requestId });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send({ error: "Failed to process data" });
  }
});

app.get('/api/energy/latest', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
    const { data, error } = await supabase
      .from('sensor_readings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.status(200).send(data);
  } catch (error) {
    console.error('Error fetching sensor readings:', error);
    res.status(500).send({ error: 'Failed to fetch sensor readings' });
  }
});

app.get('/api/energy/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);
    const { data, error } = await supabase
      .from('sensor_readings')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;

    const grouped = new Map();
    data.forEach((row) => {
      if (!grouped.has(row.request_id)) {
        grouped.set(row.request_id, {
          request_id: row.request_id,
          timestamp: row.created_at,
          nodes: []
        });
      }
      grouped.get(row.request_id).nodes.push({
        id: row.outlet_id ?? 0,
        voltage: Number(row.voltage ?? 0),
        current: Number(row.current ?? 0),
        power: Number(row.power ?? 0),
        energy: Number(row.energy ?? 0)
      });
    });

    res.status(200).send(Array.from(grouped.values()));
  } catch (error) {
    console.error('Error fetching energy history:', error);
    res.status(500).send({ error: 'Failed to fetch energy history' });
  }
});

app.get('/api/appliances', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_appliances')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.status(200).send(data);
  } catch (error) {
    console.error('Error fetching appliances:', error);
    res.status(500).send({ error: 'Failed to fetch appliances' });
  }
});

app.post('/api/settings/rate', (req, res) => {
  const nextRate = parseNumber(req.body?.phpRate);
  if (nextRate === null || nextRate <= 0) {
    return res.status(400).send({ error: 'phpRate must be a positive number' });
  }
  currentRatePerKwh = nextRate;
  return res.status(200).send({ phpRate: currentRatePerKwh });
});

app.post('/api/appliances', async (req, res) => {
  try {
    const payload = {
      user_id: req.body.user_id || null,
      outlet_id: parseNumber(req.body.outlet_id),
      appliance_name: req.body.appliance_name || null,
      appliance_type: req.body.appliance_type || null,
      standard_wattage: parseNumber(req.body.standard_wattage),
      notes: req.body.notes || null
    };

    const { data, error } = await supabase
      .from('user_appliances')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).send(data);
  } catch (error) {
    console.error('Error creating appliance:', error);
    res.status(500).send({ error: 'Failed to create appliance' });
  }
});

app.put('/api/appliances/:id', async (req, res) => {
  try {
    const payload = {
      outlet_id: req.body.outlet_id !== undefined ? parseNumber(req.body.outlet_id) : undefined,
      appliance_name: req.body.appliance_name,
      appliance_type: req.body.appliance_type,
      standard_wattage: req.body.standard_wattage !== undefined ? parseNumber(req.body.standard_wattage) : undefined,
      notes: req.body.notes
    };

    Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);

    const { data, error } = await supabase
      .from('user_appliances')
      .update(payload)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.status(200).send(data);
  } catch (error) {
    console.error('Error updating appliance:', error);
    res.status(500).send({ error: 'Failed to update appliance' });
  }
});

app.delete('/api/appliances/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('user_appliances')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting appliance:', error);
    res.status(500).send({ error: 'Failed to delete appliance' });
  }
});

app.get('/api/diagnostics', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const { data, error } = await supabase
      .from('diagnostic_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.status(200).send(data);
  } catch (error) {
    console.error('Error fetching diagnostics:', error);
    res.status(500).send({ error: 'Failed to fetch diagnostics' });
  }
});

app.get('/api/appliance-sessions', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 1000);
    const { data, error } = await supabase
      .from('appliance_sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.status(200).send(data);
  } catch (error) {
    console.error('Error fetching appliance sessions:', error);
    res.status(500).send({ error: 'Failed to fetch appliance sessions' });
  }
});

app.post('/api/diagnostics', async (req, res) => {
  try {
    const payload = {
      outlet_id: parseNumber(req.body.outlet_id),
      log_level: req.body.log_level || 'info',
      log_code: req.body.log_code || null,
      message: req.body.message || null,
      metadata: req.body.metadata || {}
    };

    const { data, error } = await supabase
      .from('diagnostic_logs')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).send(data);
  } catch (error) {
    console.error('Error creating diagnostic log:', error);
    res.status(500).send({ error: 'Failed to create diagnostic log' });
  }
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Real-Time Server actively listening on port ${PORT}...`);
});