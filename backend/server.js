const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');

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

const mongoURI = 'mongodb+srv://formeverifying_db_user:zbRC3dLk85A7stB7@energymonitor.uugcrm0.mongodb.net/?appName=EnergyMonitor';
mongoose.connect(mongoURI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// --- 1. NEW ARRAY SCHEMA ---
const energySchema = new mongoose.Schema({
  nodes: [{
    id: Number,
    voltage: Number,
    current: Number,
    power: Number,
    energy: Number
  }],
  timestamp: { type: Date, default: Date.now }
});
const EnergyData = mongoose.model('EnergyData', energySchema);

// ... (keep the io.on('connection') block the same) ...

// --- 2. NEW POST ROUTE ---
app.post('/api/energy', async (req, res) => {
  const { nodes } = req.body; // Catch the array!

  if (!nodes || !Array.isArray(nodes)) {
    return res.status(400).send({ error: "Invalid data format" });
  }

  try {
    // Broadcast the array to the React frontend
    io.emit('live_power_reading', { nodes });
    
    // Save the array to MongoDB
    const newReading = new EnergyData({ nodes });
    await newReading.save();

    console.log(`⚡ Broadcasted & Saved ${nodes.length} Nodes!`);
    res.status(200).send({ message: "Data processed!" });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).send({ error: "Failed to process data" });
  }
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Real-Time Server actively listening on port ${PORT}...`);
});