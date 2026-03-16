// ---------------- Canvas Setup ----------------
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

// ---------------- Camera ----------------
const camera = { x: 0, y: 0 };

// ---------------- Input ----------------
const keys = {};
document.addEventListener("keydown", e => keys[e.key] = true);
document.addEventListener("keyup", e => keys[e.key] = false);

// ---------------- UI Elements ----------------
const menuOverlay = document.getElementById("menuOverlay");
const joinBtn = document.getElementById("joinBtn");
const resetBtn = document.getElementById("resetBtn");
const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const joinMessage = document.getElementById("joinMessage");
const roundTimer = document.getElementById("roundTimer");

//Icons
const icons = {
  1: new Image(),
  2: new Image(),
  3: new Image(),
  4: new Image(),
  5: new Image(),
  6: new Image(),
  7: new Image(),
  8: new Image()
};

icons[1].src = "/icons/chuddy.png";
icons[2].src = "/icons/chudder.png";
icons[3].src = "/icons/chuddis.png";
icons[4].src = "/icons/chuddmen.png";
icons[5].src = "/icons/chadlite.png";
icons[6].src = "/icons/chad.png";
icons[7].src = "/icons/adamlite.png";
icons[8].src = "/icons/adam.png";



// Correct onload logging
// Log when each image has loaded successfully
Object.keys(icons).forEach(key => {
  icons[key].onload = () => console.log(`Icon ${key} loaded`);
  icons[key].onerror = () => console.error(`Failed to load icon ${key}: ${icons[key].src}`);
});


// ---------------- Death Overlay ----------------
let deathOverlay = document.getElementById("deathOverlay");
if (!deathOverlay) {
  deathOverlay = document.createElement("div");
  deathOverlay.id = "deathOverlay";
  deathOverlay.innerText = "YOU DIED";
  Object.assign(deathOverlay.style, {
    display: "none", // hidden by default
    
    position: "fixed", // relative to document, not fixed
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    backgroundColor: "rgba(0,0,0,0.7)",
    color: "red",
    fontSize: "64px",
    
    alignItems: "center",
    justifyContent: "center",
    zIndex: "50" // below menuOverlay
  });
  document.body.appendChild(deathOverlay);
}

// ---------------- Level Up Effect ----------------
let levelUpEffect = document.getElementById("levelUpEffect");
if (!levelUpEffect) {
  levelUpEffect = document.createElement("div");
  levelUpEffect.id = "levelUpEffect";
  levelUpEffect.innerText = "LEVEL UP!";
  Object.assign(levelUpEffect.style, {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: "48px",
    color: "gold",
    display: "none",
    zIndex: "50"
  });
  document.body.appendChild(levelUpEffect);
}

// ---------------- Round Overlay ----------------
let roundOverlay = document.getElementById("roundOverlay");
if (!roundOverlay) {
  roundOverlay = document.createElement("div");
  roundOverlay.id = "roundOverlay";
  roundOverlay.innerText = "NEW ROUND!";
  Object.assign(roundOverlay.style, {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: "64px",
    color: "gold",
    textShadow: "2px 2px 10px #000",
    display: "none",
    opacity: "0",
    zIndex: "1000",
    transition: "opacity 1s"
  });
  document.body.appendChild(roundOverlay);
}




// ---------------- Leaderboard ----------------
const leaderboardContainer = document.createElement("div");
leaderboardContainer.id = "leaderboard";
leaderboardContainer.innerHTML = "<h3>Leaderboard</h3><ol id='leaderboardList'></ol>";
Object.assign(leaderboardContainer.style, {
  position: "fixed",
  top: "10px",
  right: "10px",
  backgroundColor: "rgba(0,0,0,0.5)",
  color: "white",
  padding: "10px",
  borderRadius: "10px",
  zIndex: "100"
});
document.body.appendChild(leaderboardContainer);

// ---------------- Sounds ----------------
const sounds = {
  eatFood: new Audio("/assets/eat-food.mp3"),
  eatPlayer: new Audio("/assets/eat-player.mp3"),
  boost: new Audio("/assets/Boost.mp3"),
  levelUp: new Audio("/assets/level-up.mp3"),
  ambient: new Audio("/assets/ambient.mp3"),
  death: new Audio("/assets/death.mp3")
};
sounds.ambient.loop = true;
sounds.ambient.volume = 0.5;

// ---------------- Socket ----------------
let socket = null;

// ---------------- Join Button ----------------
joinBtn.onclick = () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  if (!username || !password) { joinMessage.innerText = "Username & password required"; return; }

  if (!socket) {
    socket = io();

    socket.on("connect_error", err => { joinMessage.innerText = "Cannot connect to server"; console.error(err); });

    socket.on("joinSuccess", data => {
      joinMessage.innerText = "Welcome " + data.username;
      menuOverlay.style.display = "none";
      sounds.ambient.play();
    });

    socket.on("joinError", data => joinMessage.innerText = data.message);

    socket.on("dead", () => {
    const me = window.gameState?.players?.[socket.id];
    if (!me) return;          // safety check
     {           // only show if truly dead
     deathOverlay.style.display = "flex";
     sounds.death.play();
    }
    });
    socket.on("respawn", () => {

    deathOverlay.style.display = "none";

    const me = window.gameState?.players?.[socket.id];
    if (me) {
      me.renderX = me.x;
      me.renderY = me.y;
    }

    });
    socket.on("levelUp", () => {
      levelUpEffect.style.display = "block";
      sounds.levelUp.play();
      setTimeout(() => levelUpEffect.style.display = "none", 1500);
    });
    socket.on("playerEaten", () => { sounds.eatPlayer.play(); });
    socket.on("questUpdate", data => { /* optional HUD update */ });

    socket.on("state", data => {

    window.gameState = data;

    updateLeaderboard(data.leaderboard);

    // -------- Update Round Timer --------
    // Update timer UI
    const timerEl = document.getElementById("roundTimer");
    if (timerEl && data.roundTimeLeft !== undefined) {
    const seconds = Math.max(0, Math.floor(data.roundTimeLeft));
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    timerEl.textContent = `Time Left: ${minutes}:${secs.toString().padStart(2, "0")}`;
  }
});
  }

  socket.emit("join", { username, password });


  socket.on("newRound", () => {
  roundOverlay.style.display = "block";
  setTimeout(() => {
    roundOverlay.style.opacity = "1"; // fade in
  }, 50);

  // Fade out after 2 seconds
  setTimeout(() => {
    roundOverlay.style.opacity = "0";
    setTimeout(() => { roundOverlay.style.display = "none"; }, 1000); // hide after fade
  }, 2000);
  });

};

// ---------------- Reset Button ----------------
resetBtn.onclick = async () => {
  const username = usernameInput.value.trim();
  if (!username) return joinMessage.innerText = "Enter username first";
  try {
    const res = await fetch("/resetUser", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });
    const json = await res.json();
    joinMessage.innerText = json.success ? "Account reset successfully" : json.error;
  } catch (err) { joinMessage.innerText = "Server error"; }
};

// ---------------- Update Leaderboard ----------------
function updateLeaderboard(data) {
  if (!data) return;
  const list = document.getElementById("leaderboardList");
  list.innerHTML = "";
  data.forEach((p, i) => {
    const li = document.createElement("li");
    li.textContent = `${i + 1}. ${p.name} (${p.radius})`;
    list.appendChild(li);
  });
}

// ---------------- Movement ----------------
function sendMovement() {
  if (!socket) return;
  let dx = 0, dy = 0;
  if (keys.w || keys.ArrowUp) dy = -5;
  if (keys.s || keys.ArrowDown) dy = 5;
  if (keys.a || keys.ArrowLeft) dx = -5;
  if (keys.d || keys.ArrowRight) dx = 5;
  socket.emit("movement", { x: dx, y: dy, boost: keys.Shift });
}
setInterval(sendMovement, 1000 / 30);

// ---------------- Draw Loop ----------------
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!window.gameState || !socket) { requestAnimationFrame(draw); return; }

  const { players, foods } = window.gameState;
  const me = players[socket.id];
  if (!me) { requestAnimationFrame(draw); return; }

  // Camera follows player
  camera.x = me.x - canvas.width / 2;
  camera.y = me.y - canvas.height / 2;

  // Draw foods
  foods.forEach(f => {
    ctx.fillStyle = "yellow";
    ctx.beginPath();
    ctx.arc(f.x - camera.x, f.y - camera.y, f.radius, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw players with icons
  Object.values(players).forEach(p => {
    if (!p.alive || p.dead) return;

    // Initialize render positions if undefined (for smooth interpolation)
    if (p.renderX === undefined) p.renderX = p.x;
    if (p.renderY === undefined) p.renderY = p.y;

    // Interpolate towards server position
    p.renderX += (p.x - p.renderX) * 0.2;
    p.renderY += (p.y - p.renderY) * 0.2;

    // Pick icon based on level (max 8)
    const iconIndex = p.icon || 1;  // use the icon the server sends
    const icon = icons[iconIndex];

    // Draw image centered at player, scaled to radius
    if (icon && icon.complete && icon.naturalWidth !== 0) { // only draw if image loaded
      ctx.save();
      ctx.translate(p.renderX - camera.x, p.renderY - camera.y);
      // Optional rotation effect
      ctx.rotate(Date.now() / 500);
      ctx.drawImage(icon, -p.radius, -p.radius, p.radius * 2, p.radius * 2);
      ctx.restore();
    } else {
      // Fallback: draw colored circle if image not loaded
      ctx.fillStyle = (p.id === socket.id) ? "cyan" : "#0f0";
      ctx.beginPath();
      ctx.arc(p.renderX - camera.x, p.renderY - camera.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  requestAnimationFrame(draw);
}

draw()