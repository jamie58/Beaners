
(() => {
  const VERSION = window.BEANERS_VERSION || "v56";
  const $ = id => document.getElementById(id);

  const socket = io();
  let roomCode = localStorage.getItem("beanersRoomCode") || "";
  let playerToken = localStorage.getItem("beanersPlayerToken") || "";
  let playerId = localStorage.getItem("beanersPlayerId") || "";
  let state = null;
  let hand = [];
  let selected = new Set();

  const wheelColours = ["#e8c600", "#19a0b5", "#37a51f", "#c92a0a"];

  function saveSession(data) {
    if (!data) return;
    if (data.roomCode) {
      roomCode = data.roomCode;
      localStorage.setItem("beanersRoomCode", roomCode);
    }
    if (data.playerToken) {
      playerToken = data.playerToken;
      localStorage.setItem("beanersPlayerToken", playerToken);
    }
    if (data.playerId) {
      playerId = data.playerId;
      localStorage.setItem("beanersPlayerId", playerId);
    }
  }

  function showGame() {
    $("startScreen").classList.add("hidden");
    $("game").classList.remove("hidden");
    $("roomCode").textContent = roomCode || "----";
  }

  function cardText(c) {
    return c ? `${c.rank}${c.suit}` : "";
  }

  function suitClass(c) {
    if (!c) return "";
    return c.suit === "♥" || c.suit === "♦" ? "red" : "black";
  }

  function createCard(c, small=false) {
    const el = document.createElement("button");
    el.className = `card ${suitClass(c)} ${small ? "smallCard" : ""}`;
    el.dataset.id = c.id;
    el.innerHTML = `<strong>${c.rank}</strong><span>${c.suit}</span>`;
    return el;
  }

  function currentPlayer() {
    return state?.players.find(p => p.token === playerToken);
  }

  function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function renderLobby() {
    $("lobby").classList.remove("hidden");
    $("table").classList.add("hidden");
    $("scoreOverlay").classList.add("hidden");
    $("beanerBadge").textContent = state.beaner || "A";

    const humans = state.players.filter(p => !p.isBot);
    $("lobbyPlayers").innerHTML = humans.map(p => `${escapeHtml(p.name)}${p.seat ? "" : " <small>(not seated)</small>"}`).join("<br>") || "Waiting...";

    const labels = { top: "Top", left: "Left", right: "Right", bottom: "Bottom" };

    document.querySelectorAll(".seat").forEach(seat => {
      const key = seat.dataset.seat;
      const occupant = state.players.find(p => p.seat === key);
      const name = seat.querySelector(".seatName");
      const action = seat.querySelector(".seatAction");

      seat.classList.remove("empty","bot","human","me");

      if (!occupant) {
        seat.classList.add("empty");
        name.textContent = "Sit Here";
        action.innerHTML = `<button class="mini addBot" data-action="addBot">Add Bot</button>`;
      } else if (occupant.isBot) {
        seat.classList.add("bot");
        name.textContent = `${occupant.name} (Bot)`;
        action.innerHTML = `<button class="mini removeBot" data-action="removeBot">Remove Bot</button>`;
      } else {
        seat.classList.add("human");
        if (occupant.token === playerToken) seat.classList.add("me");
        name.textContent = occupant.name;
        action.innerHTML = "";
      }

      const label = $(`label${key[0].toUpperCase()}${key.slice(1)}`);
      if (label) label.textContent = occupant ? occupant.name.replace(" Bot","") : labels[key];
    });

    drawWheel();
  }

  function seatedPlayers() {
    const order = ["top","left","bottom","right"];
    return order.map(seat => state.players.find(p => p.seat === seat)).filter(Boolean);
  }

  function drawWheel(rotation=0) {
    const canvas = $("starterWheel");
    const ctx = canvas.getContext("2d");
    const players = seatedPlayers();
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2, r = Math.min(w,h)/2 - 8;
    ctx.clearRect(0,0,w,h);

    if (!players.length) {
      ctx.fillStyle = "#2b145c";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const slice = Math.PI * 2 / players.length;
    ctx.save();
    ctx.translate(cx,cy);
    ctx.rotate(rotation);

    players.forEach((p,i) => {
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.arc(0,0,r,i*slice,(i+1)*slice);
      ctx.closePath();
      ctx.fillStyle = wheelColours[i % wheelColours.length];
      ctx.fill();

      ctx.save();
      ctx.rotate(i*slice + slice/2);
      ctx.textAlign = "center";
      ctx.fillStyle = "white";
      ctx.font = "bold 22px system-ui, sans-serif";
      ctx.translate(r*.55,0);
      ctx.rotate(Math.PI/2);
      ctx.fillText(p.name.replace(" Bot",""),0,0);
      ctx.restore();
    });

    ctx.restore();

    ctx.fillStyle = "#fff7ed";
    ctx.beginPath();
    ctx.moveTo(cx, cy-r-4);
    ctx.lineTo(cx-18, cy-r-44);
    ctx.lineTo(cx+18, cy-r-44);
    ctx.closePath();
    ctx.fill();
  }

  function animateWheel(winnerToken, winnerName) {
    const players = seatedPlayers();
    const idx = players.findIndex(p => p.token === winnerToken || p.id === winnerToken);
    const slice = players.length ? Math.PI * 2 / players.length : Math.PI * 2;
    const target = idx >= 0 ? (Math.PI * 1.5 - (idx * slice + slice/2)) : 0;
    const spins = Math.PI * 2 * 4;
    const start = performance.now();

    function frame(now) {
      const t = Math.min(1, (now - start) / 1800);
      const ease = 1 - Math.pow(1 - t, 3);
      const rot = spins * ease + target * ease;
      drawWheel(rot);
      if (t < 1) requestAnimationFrame(frame);
      else {
        drawWheel(target);
        $("wheelResult").textContent = `${winnerName} Starts!`;
      }
    }
    requestAnimationFrame(frame);
  }


  function seatOrderForMe() {
    const me = currentPlayer();
    const actual = me?.seat || "bottom";
    const clockwise = ["bottom","left","top","right"];
    const idx = clockwise.indexOf(actual);
    const rotated = idx >= 0 ? clockwise.slice(idx).concat(clockwise.slice(0, idx)) : clockwise;
    return {
      bottom: rotated[0],
      left: rotated[1],
      top: rotated[2],
      right: rotated[3]
    };
  }

  function playerByVisualSeat(visualSeat) {
    if (!state) return null;
    const map = seatOrderForMe();
    const actualSeat = map[visualSeat];
    return state.players.find(p => p.seat === actualSeat) || null;
  }

  function meldsForPlayerToken(token) {
    if (!state || !token) return [];
    return state.tableMelds.filter(m => m.ownerToken === token);
  }

  function renderMeldCard(c) {
    return createCard(c, true).outerHTML;
  }

  function renderZone(visualSeat) {
    const p = playerByVisualSeat(visualSeat);
    const nameEl = $(`${visualSeat}Name`);
    const metaEl = $(`${visualSeat}Meta`);
    const meldEl = $(`${visualSeat}Melds`);
    const zoneEl = document.querySelector(`.zone${visualSeat[0].toUpperCase()}${visualSeat.slice(1)}`);

    if (!nameEl || !metaEl || !meldEl || !zoneEl) return;

    zoneEl.classList.remove("emptyZone","meZone","turnGreen","turnOrange","turnRed");

    if (!p) {
      zoneEl.classList.add("emptyZone");
      nameEl.textContent = visualSeat === "bottom" ? "You" : visualSeat;
      metaEl.textContent = "No player";
      meldEl.innerHTML = `<div class="noMelds">No melds yet</div>`;
      return;
    }

    if (p.token === playerToken) zoneEl.classList.add("meZone");

    if (p.isTurn) {
      const elapsed = state.turnStartedAt ? Math.floor((Date.now() - state.turnStartedAt) / 1000) : 0;
      if (elapsed >= 40) zoneEl.classList.add("turnRed");
      else if (elapsed >= 25) zoneEl.classList.add("turnOrange");
      else zoneEl.classList.add("turnGreen");
    }

    nameEl.textContent = p.token === playerToken ? `${p.name} (you)` : p.name;
    metaEl.textContent = `${p.cardCount} cards • ${p.isDown ? "Down" : "Not down"} • ${p.totalScore} pts`;

    const melds = meldsForPlayerToken(p.token);
    if (!melds.length) {
      meldEl.innerHTML = `<div class="noMelds">No melds yet</div>`;
      return;
    }

    meldEl.innerHTML = "";
    melds.forEach(m => {
      const box = document.createElement("button");
      box.type = "button";
      box.className = "restoredMeld";
      box.dataset.id = m.id;
      box.innerHTML = `
        <div class="meldLabel">${m.type.toUpperCase()}</div>
        <div class="restoredMeldCards">${m.cards.map(renderMeldCard).join("")}</div>
      `;
      box.addEventListener("click", () => {
        const ids = [...selected];
        if (ids.length !== 1) return;
        socket.emit("playOnMeld", { roomCode, playerToken, meldId: m.id, cardId: ids[0] });
        selected.clear();
      });
      meldEl.appendChild(box);
    });
  }

  function updateTurnHighlightsLoop() {
    if (!state || state.phase !== "playing") return;
    ["top","left","right","bottom"].forEach(renderZone);
  }

  function renderTable() {
    $("lobby").classList.add("hidden");
    $("table").classList.remove("hidden");
    $("scoreOverlay").classList.add("hidden");
    $("beanerBadge").textContent = state.beaner || "A";

    $("deckCount").textContent = state.deckCount;

    const top = state.discard[0];
    const topDiscard = $("topDiscard");
    if (top) {
      topDiscard.innerHTML = `<strong>${top.rank}</strong><span>${top.suit}</span>`;
      topDiscard.className = `discardTop restoredDiscardTop ${suitClass(top)}`;
    } else {
      topDiscard.textContent = "Discard";
      topDiscard.className = "discardTop restoredDiscardTop";
    }

    const preview = $("discardPreview");
    preview.innerHTML = "";
    state.discard.slice(1, 9).forEach(c => preview.appendChild(createCard(c, true)));

    ["top","left","right","bottom"].forEach(renderZone);

    renderHand();
  }

  function requestMyHand() {
    if (!roomCode || !playerToken) return;
    socket.emit('getHand', { roomCode, playerToken });
    socket.emit('forceHand', { roomCode, playerToken });
  }

  function renderHand() {
    const el = $('hand');
    if (!el) return;
    el.innerHTML = '';

    const panel = document.querySelector('.handPanel');
    if (panel) {
      panel.classList.remove('hidden');
      panel.style.display = 'block';
      panel.style.visibility = 'visible';
      panel.style.opacity = '1';
    }

    if (!hand || !hand.length) {
      const me = currentPlayer();
      el.innerHTML = `<div class="emptyHandNotice">${me && me.cardCount ? `Loading ${me.cardCount} cards...` : 'No cards in hand'}</div>`;
      if (me && me.cardCount > 0) setTimeout(requestMyHand, 250);
      return;
    }

    hand.forEach(c => {
      const card = createCard(c);
      if (selected.has(c.id)) card.classList.add('selected');
      card.addEventListener('click', () => {
        selected.has(c.id) ? selected.delete(c.id) : selected.add(c.id);
        renderHand();
      });
      el.appendChild(card);
    });
  }

  function renderScore() {
    $("lobby").classList.add("hidden");
    $("table").classList.add("hidden");
    $("scoreOverlay").classList.remove("hidden");
    $("scoreTitle").textContent = state.winnerMessage || "Round Over";
    const latest = state.roundScores[state.roundScores.length - 1];
    $("scoreRows").innerHTML = latest ? latest.scores.map(s => `
      <div class="scoreRow"><span>${escapeHtml(s.name)}</span><span>+${s.score}</span><strong>${s.total}</strong></div>
    `).join("") : "";
  }

  function render() {
    if (!state) return;
    $("roomCode").textContent = state.roomCode;
    if (state.phase === "lobby") renderLobby();
    else if (state.phase === "roundOver" || state.phase === "gameOver") renderScore();
    else renderTable();
  }

  socket.on("connect", () => {
    if (roomCode && playerToken) socket.emit("rejoinRoom", { roomCode, playerToken });
  });

  socket.on("joinedRoom", data => {
    saveSession(data);
    showGame();
  });

  socket.on("roomReady", data => {
    saveSession(data);
    showGame();
    socket.emit("requestRoomState", { roomCode, playerToken });
    requestMyHand();
  });

  socket.on("roomState", s => {
    state = s;
    render();
    if (state && state.phase === 'playing') requestMyHand();
  });

  socket.on("yourHand", h => {
    hand = Array.isArray(h) ? h : [];
    const valid = new Set(hand.map(c => c.id));
    selected = new Set([...selected].filter(id => valid.has(id)));
    renderHand();
  });

  socket.on("starterChosen", ({ token, name }) => animateWheel(token, name));

  socket.on("errorMessage", msg => alert(msg));

  socket.on("exitedGame", () => {
    localStorage.removeItem("beanersRoomCode");
    localStorage.removeItem("beanersPlayerToken");
    localStorage.removeItem("beanersPlayerId");
    location.reload();
  });

  window.addEventListener("load", () => setTimeout(() => $("splash").classList.add("hidden"), 600));

  $("createBtn").addEventListener("click", () => {
    $("createBtn").disabled = true;
    $("createBtn").textContent = "Creating...";
    socket.emit("createRoom", { name: $("nameInput").value });
  });

  $("joinBtn").addEventListener("click", () => {
    const code = $("roomInput").value.replace(/\D/g,"").slice(0,4);
    if (!code) return alert("Enter the 4-digit room code.");
    socket.emit("joinRoom", { roomCode: code, name: $("nameInput").value, playerToken });
  });

  document.addEventListener("click", e => {
    const seat = e.target.closest(".seat");
    if (!seat || !state || state.phase !== "lobby") return;
    const key = seat.dataset.seat;
    const mini = e.target.closest(".mini");
    const occupant = state.players.find(p => p.seat === key);
    const action = mini ? mini.dataset.action : "sit";
    if (!mini && occupant && !occupant.isBot && occupant.token !== playerToken) return;
    socket.emit("seatAction", { roomCode, playerToken, seat: key, action });
  });

  $("spinBtn").addEventListener("click", () => socket.emit("spinStarter", { roomCode }));
  $("startBtn").addEventListener("click", () => socket.emit("startGame", { roomCode }));
  $("refreshBtn").addEventListener("click", () => {
    socket.emit("requestRoomState", { roomCode, playerToken });
    requestMyHand();
  });
  $("exitBtn").addEventListener("click", () => {
    if (confirm("Exit game?")) socket.emit("exitGame", { roomCode, playerToken });
  });

  $("drawDeck").addEventListener("click", () => socket.emit("drawDeck", { roomCode, playerToken }));
  $("topDiscard").addEventListener("click", () => socket.emit("takeTopDiscard", { roomCode, playerToken }));
  $("takePile").addEventListener("click", () => socket.emit("takeDiscardPile", { roomCode, playerToken }));

  $("layMeld").addEventListener("click", () => {
    const ids = [...selected];
    if (ids.length < 3) return alert("Select at least 3 cards.");
    socket.emit("layMeld", { roomCode, playerToken, cardIds: ids });
    selected.clear();
  });

  $("discardBtn").addEventListener("click", () => {
    let ids = [...selected];
    if (ids.length !== 1 && hand.length === 1) ids = [hand[0].id];
    if (ids.length !== 1) return alert("Select exactly 1 card to discard.");
    socket.emit("discard", { roomCode, playerToken, cardId: ids[0] });
    selected.clear();
  });

  $("sortRank").addEventListener("click", () => {
    const order = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
    hand.sort((a,b) => order.indexOf(a.rank) - order.indexOf(b.rank));
    renderHand();
  });

  $("sortSuit").addEventListener("click", () => {
    const order = ["♠","♥","♦","♣"];
    hand.sort((a,b) => order.indexOf(a.suit) - order.indexOf(b.suit));
    renderHand();
  });

  $("nextRoundBtn").addEventListener("click", () => {
    if (state && state.phase === 'roundOver') socket.emit("nextRound", { roomCode });
    else socket.emit("restartRound", { roomCode });
  });

  setInterval(updateTurnHighlightsLoop, 1000);
  setInterval(() => {
    if (state && state.phase === 'playing') {
      const me = currentPlayer();
      if (me && me.cardCount > 0 && (!hand || hand.length === 0)) requestMyHand();
    }
  }, 1500);
})();
