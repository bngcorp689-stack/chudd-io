const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

// ---------------- Serve client ----------------
app.use(express.static(path.join(__dirname, "client")));
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "client/index.html")));
app.use(express.json());

// ---------------- MongoDB ----------------
const MONGO_URL = "mongodb://BngBusiness:BigFatCheese!123@ac-cynf0tz-shard-00-00.fh8y0tq.mongodb.net:27017,ac-cynf0tz-shard-00-01.fh8y0tq.mongodb.net:27017,ac-cynf0tz-shard-00-02.fh8y0tq.mongodb.net:27017/?ssl=true&replicaSet=atlas-hoeyw7-shard-0&authSource=admin&appName=ChuddIO";
let mongoConnected = false;

mongoose.connect(MONGO_URL)
  .then(() => { console.log("MongoDB connected"); mongoConnected = true; })
  .catch(err => { console.error("MongoDB connection failed:", err); });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  stats: { highScore: { type: Number, default: 0 }, totalGames: { type: Number, default: 0 } }
});
const User = mongoose.model("User", userSchema);

// ---------------- Reset account ----------------
app.post("/resetUser", async (req, res) => {
  const { username } = req.body;
  if (!mongoConnected) return res.status(500).json({ error: "MongoDB offline" });
  try {
    const result = await User.deleteOne({ username });
    if (result.deletedCount) return res.json({ success: true });
    else return res.status(404).json({ error: "User not found" });
  } catch (err) { return res.status(500).json({ error: "Server error" }); }
});

// ---------------- Game state ----------------
let players = {};
let foods = [];
const WORLD_WIDTH = 1200;
const WORLD_HEIGHT = 800;
const FOOD_COUNT = 80;

let roundActive = true;
let roundTimeLeft = 180; // 3 min round

function spawnFood() { return { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT, radius: 5 }; }
for (let i = 0; i < FOOD_COUNT; i++) foods.push(spawnFood());

// ---------------- Socket.io ----------------
io.on("connection", socket => {
  console.log("Player connected:", socket.id);

  // ---------------- Join/Login ----------------
  socket.on("join", async (data) => {
    try {
      const username = data.username?.trim();
      const password = data.password;
      if (!username || !password) return socket.emit("joinError", { message: "Username/password required" });

      let user = null;
      if (mongoConnected) {
        user = await User.findOne({ username });
        if (!user) {
          const hashed = await bcrypt.hash(password, 10);
          user = new User({ username, password: hashed });
          await user.save();
        } else {
          const match = await bcrypt.compare(password, user.password);
          if (!match) return socket.emit("joinError", { message: "Invalid password" });
        }
      }

      if (Object.values(players).some(p => p.name === username && p.alive))
        return socket.emit("joinError", { message: "Player already in game" });

      // Add player
      players[socket.id] = {
        id: socket.id,
        name: username,
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * WORLD_HEIGHT,
        radius: 15,
        alive: true,
        level: 1,
        xp: 0,
        quests: { eatFoods: 0, killPlayers: 0, surviveRounds: 0 },
        inputX: 0, inputY: 0,
        boosting: false, velocityX: 0, velocityY: 0,
        icon: 1 // default icon index
      };

      socket.emit("joinSuccess", { username, stats: user?.stats || {} });

    } catch (err) {
      console.error(err);
      socket.emit("joinError", { message: "Server error during join" });
    }
  });

  // ---------------- Movement ----------------
  socket.on("movement", data => {
    const p = players[socket.id];
    if (!p || !p.alive) return;
    p.inputX = data.x;
    p.inputY = data.y;
    p.boosting = data.boost || false;
  });

  // ---------------- Disconnect ----------------
  socket.on("disconnect", () => delete players[socket.id]);
});

// ---------------- Kill/Respawn ----------------
function killPlayer(p, killerId = null) {
  if (!p.alive) return;
  p.alive = false;
  io.to(p.id).emit("dead");

  // Only the killed player hears the "playerEaten" sound
  if (killerId) io.to(p.id).emit("playerEaten");
  io.emit("playerDied", {
    victim: p.id,
    killer: killerId
  });
  setTimeout(() => respawnPlayer(p), 3000);
}

function respawnPlayer(p) {
  if (!players[p.id]) return;

  // Spawn position
  p.x = Math.random() * WORLD_WIDTH;
  p.y = Math.random() * WORLD_HEIGHT;

  // Reset size
  p.radius = 15;

  // Reset progression
  p.level = 1;
  p.xp = 0;
  p.icon = 1;

  // Reset movement
  p.inputX = 0;
  p.inputY = 0;
  p.velocityX = 0;
  p.velocityY = 0;

  p.boosting = false;
  p.alive = true;

  io.to(p.id).emit("respawn");
}

function resetRound() {
  // Reset all players
  for (let id in players) {
    const p = players[id];
    p.x = Math.random() * WORLD_WIDTH;
    p.y = Math.random() * WORLD_HEIGHT;
    p.radius = 15;
    p.level = 1;
    p.xp = 0;
    p.icon = 1;          // reset to first icon
    p.inputX = 0;
    p.inputY = 0;
    p.velocityX = 0;
    p.velocityY = 0;
    p.boosting = false;
    p.alive = true;

    // Notify client to reset UI
    io.to(p.id).emit("respawn");
  }

  // Reset foods
  foods = [];
  for (let i = 0; i < FOOD_COUNT; i++) foods.push(spawnFood());

  // Reset timer
  roundTimeLeft = 180;
  console.log("Round is reset!");
  io.emit("newRound");
}

// ---------------- Game Loop ----------------
setInterval(() => {
  if (!roundActive) return;

  // ---------------- Update Players ----------------
  for (let id in players) {
    const p = players[id];
    if (!p.alive) continue;

    const speed = 0.8 / Math.sqrt(p.radius);
    if (p.boosting && p.radius > 12) {
      p.velocityX += p.inputX * speed * 2;
      p.velocityY += p.inputY * speed * 2;
      p.radius -= 0.02;
    } else {
      p.velocityX += p.inputX * speed;
      p.velocityY += p.inputY * speed;
    }

    p.velocityX *= 0.9;
    p.velocityY *= 0.9;
    p.x += p.velocityX;
    p.y += p.velocityY;
    p.x = Math.max(p.radius, Math.min(WORLD_WIDTH - p.radius, p.x));
    p.y = Math.max(p.radius, Math.min(WORLD_HEIGHT - p.radius, p.y));

    // ---------------- Food Collisions ----------------
    for (let i = foods.length - 1; i >= 0; i--) {
  const f = foods[i];
  const dx = p.x - f.x;
  const dy = p.y - f.y;

  if (Math.sqrt(dx * dx + dy * dy) < p.radius) {
    p.radius += 0.5;
    p.xp += 1;

    foods.splice(i, 1);
    foods.push(spawnFood());

    p.quests.eatFoods += 1;
    io.to(p.id).emit("questUpdate", {
      type: "eatFoods",
      amount: p.quests.eatFoods
    });
  }
}

    // ---------------- Level Up ----------------
    if (p.xp >= p.level * 10) {
  p.level += 1;
  p.xp = 0;

  // update icon (max 8)
  p.icon = Math.min(p.level, 8);

  io.to(p.id).emit("levelUp", p.level);
  }
 }

  // ---------------- Player Collisions ----------------
  const ids = Object.keys(players);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const p1 = players[ids[i]];
      const p2 = players[ids[j]];
      if (!p1.alive || !p2.alive) continue;

      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < p1.radius + p2.radius) {
        if (p1.radius > p2.radius * 1.1) {
          p1.radius += p2.radius * 0.5;
          killPlayer(p2, p1.id);
        } else if (p2.radius > p1.radius * 1.1) {
          p2.radius += p1.radius * 0.5;
          killPlayer(p1, p2.id);
        }
      }
    }
  }

  // ---------------- Leaderboard ----------------
  const leaderboard = Object.values(players)
    .filter(p => p.alive)
    .sort((a, b) => b.radius - a.radius)
    .slice(0, 5)
    .map(p => ({ name: p.name, radius: Math.round(p.radius) }));

  // ---------------- Round Timer ----------------
  // ---------------- Round Timer ----------------
  roundTimeLeft -= 1 / 60; // assuming 60 ticks/sec
  if (roundTimeLeft <= 0) {
    resetRound(); // reset everything when timer hits 0
  }

  // ---------------- Emit Game State ----------------
  io.emit("state", { players, foods, leaderboard, roundTimeLeft });
}, 1000 / 60);

server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));