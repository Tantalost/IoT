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

const mongoURI = 'mongodb+srv://formeverifying_db_user:zbRC3dLk85A7stB7@energymonitor.uugcrm0.mongodb.net/?appName=EnergyMonitor';
mongoose.connect(mongoURI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB Error:', err));

const energySchema = new mongoose.Schema({
  voltage: Number,
  current: Number,
  power: Number,
  energy: Number,
  timestamp: { type: Date, default: Date.now }
});
const EnergyData = mongoose.model('EnergyData', energySchema);

io.on('connection', (socket) => {
  console.log(`🔌 New client connected to live feed: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

app.post('/api/energy', async (req, res) => {
  const { voltage, current, power, energy } = req.body;

  try {
    io.emit('live_power_reading', { voltage, current, power, energy });
    const newReading = new EnergyData({ voltage, current, power, energy });
    await newReading.save();

    console.log(`⚡ Broadcasted & Saved -> ${voltage}V | ${power}W`);
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