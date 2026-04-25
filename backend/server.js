import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Serve static files from frontend build in production
app.use(express.static(path.join(__dirname, '../frontend/dist')));

const players = new Map();
const projectiles = new Map();
let projectileId = 0;

const WORLD_SIZE = 200;

function getRandomColor() {
  const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffa500, 0x800080];
  return colors[Math.floor(Math.random() * colors.length)];
}

function getRandomPosition() {
  return {
    x: (Math.random() - 0.5) * WORLD_SIZE * 0.8,
    z: (Math.random() - 0.5) * WORLD_SIZE * 0.8
  };
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  const pos = getRandomPosition();
  const player = {
    id: socket.id,
    x: pos.x,
    y: 0,
    z: pos.z,
    rotation: 0,
    turretRotation: 0,
    color: getRandomColor(),
    health: 100,
    nickname: `Tank ${socket.id.substr(0, 4)}`,
    lastShot: 0
  };
  players.set(socket.id, player);

  // Send current players to new player
  socket.emit('init', {
    id: socket.id,
    players: Array.from(players.values()),
    worldSize: WORLD_SIZE
  });

  // Notify others about new player
  socket.broadcast.emit('playerJoined', player);

  // Handle player movement
  socket.on('move', (data) => {
    const p = players.get(socket.id);
    if (!p) return;
    p.x = data.x;
    p.y = data.y;
    p.z = data.z;
    p.rotation = data.rotation;
    p.turretRotation = data.turretRotation;
    socket.broadcast.emit('playerMoved', {
      id: socket.id,
      x: p.x,
      y: p.y,
      z: p.z,
      rotation: p.rotation,
      turretRotation: p.turretRotation
    });
  });

  // Handle shooting
  socket.on('shoot', (data) => {
    const p = players.get(socket.id);
    if (!p) return;
    const now = Date.now();
    if (now - p.lastShot < 500) return; // fire rate limit
    p.lastShot = now;

    const id = ++projectileId;
    const projectile = {
      id,
      ownerId: socket.id,
      x: data.x,
      y: data.y,
      z: data.z,
      vx: data.vx,
      vy: data.vy,
      vz: data.vz,
      createdAt: now
    };
    projectiles.set(id, projectile);
    io.emit('projectileSpawned', projectile);
  });

  // Handle player hit
  socket.on('hit', (data) => {
    const target = players.get(data.targetId);
    if (!target) return;
    target.health -= data.damage || 20;
    if (target.health <= 0) {
      target.health = 100;
      const newPos = getRandomPosition();
      target.x = newPos.x;
      target.z = newPos.z;
      io.emit('playerRespawned', {
        id: target.id,
        x: target.x,
        z: target.z,
        health: target.health
      });
      // Award kill to shooter
      const shooter = players.get(socket.id);
      if (shooter) {
        io.to(socket.id).emit('kill', { targetId: target.id });
      }
    } else {
      io.emit('playerDamaged', {
        id: target.id,
        health: target.health,
        damage: data.damage || 20
      });
    }
  });

  // Handle nickname update
  socket.on('setNickname', (nickname) => {
    const p = players.get(socket.id);
    if (p) {
      p.nickname = nickname.substring(0, 16);
      io.emit('playerUpdated', { id: socket.id, nickname: p.nickname });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    players.delete(socket.id);
    io.emit('playerLeft', socket.id);
  });
});

// Projectile cleanup loop
setInterval(() => {
  const now = Date.now();
  for (const [id, proj] of projectiles) {
    if (now - proj.createdAt > 5000) {
      projectiles.delete(id);
      io.emit('projectileDestroyed', id);
    }
  }
}, 1000);

const PORT = process.env.PORT || 3002;
const HOST = '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
  console.log(`Tank game server running on http://${HOST}:${PORT}`);
  console.log(`Local access: http://localhost:${PORT}`);
  console.log(`Network access: http://<your-ip>:${PORT}`);
});
