
(() => {
  const VERSION = window.BEANERS_VERSION || "v69";
  const $ = id => document.getElementById(id);

  const socket = io();
  let roomCode = localStorage.getItem("beanersRoomCode") || "";
  let playerToken = localStorage.getItem("beanersPlayerToken") || "";
  let playerId = localStorage.getItem("beanersPlayerId") || "";
  let state = null;
  let hand = [];
  let selected = new Set();

  let v69LastSeatActionAt = 0;
  let v69LastPickupAt = 0;
  let handSortMode = localStorage.getItem("beanersHandSortMode") || "";

  function applyHandSort() {
    if (!handSortMode || !Array.isArray(hand)) return;
    const rankOrder = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
    const suitOrder = ["♠","♥","♦","♣"];

    if (handSortMode === "rank") {
      hand.sort((a,b) => {
        const byRank = rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank);
        return byRank || suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
      });
    }

    if (handSortMode === "suit") {
      hand.sort((a,b) => {
        const bySuit = suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
        return bySuit || rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank);
      });
    }
  }

  function setHandSortMode(mode) {
    handSortMode = mode;
    localStorage.setItem("beanersHandSortMode", mode);
    applyHandSort();
    renderHand();
  }

  
  
  
  let v68LastRealDragAt = 0;
  function v68IsRecentDrag(){ return Date.now() - v68LastRealDragAt < 350; }

let v63Drag = null;

  function v63CardFromElement(el) {
    const cardEl = el.closest(".card");
    if (!cardEl) return null;
    const id = cardEl.dataset.id;
    if (!id) return null;
    const card = hand.find(c => c.id === id);
    return card ? { id, card, el: cardEl } : null;
  }

  function v63StartPointerDrag(ev, cardEl, cardId) {
    if (!cardId || !cardEl) return;
    if (ev.pointerType === "mouse" && ev.button !== 0) return;

    const rect = cardEl.getBoundingClientRect();
    const ghost = cardEl.cloneNode(true);
    ghost.classList.add("dragGhost");
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    document.body.appendChild(ghost);

    v63Drag = {
      cardId,
      ghost,
      startX: ev.clientX,
      startY: ev.clientY,
      offsetX: ev.clientX - rect.left,
      offsetY: ev.clientY - rect.top,
      moved: false,
      source: cardEl
    };

    cardEl.classList.add("dragSource");
    try { cardEl.setPointerCapture(ev.pointerId); } catch(e) {}
  }

  function v63MovePointerDrag(ev) {
    if (!v63Drag) return;

    const dx = Math.abs(ev.clientX - v63Drag.startX);
    const dy = Math.abs(ev.clientY - v63Drag.startY);
    if (dx > 10 || dy > 10) v63Drag.moved = true;

    v63Drag.ghost.style.left = `${ev.clientX - v63Drag.offsetX}px`;
    v63Drag.ghost.style.top = `${ev.clientY - v63Drag.offsetY}px`;

    document.querySelectorAll(".dragOver").forEach(el => el.classList.remove("dragOver"));

    v63Drag.ghost.style.pointerEvents = "none";
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    const meld = under?.closest?.(".restoredMeld");
    const discard = under?.closest?.("#topDiscard");

    if (meld) meld.classList.add("dragOver");
    if (discard) discard.classList.add("dragOver");

    ev.preventDefault();
  }

  function v63EndPointerDrag(ev) {
    if (!v63Drag) return;

    const drag = v63Drag;
    v63Drag = null;

    document.querySelectorAll(".dragOver").forEach(el => el.classList.remove("dragOver"));
    if (drag.source) drag.source.classList.remove("dragSource");

    drag.ghost.style.pointerEvents = "none";
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    const meld = under?.closest?.(".restoredMeld");
    const discard = under?.closest?.("#topDiscard");

    if (drag.ghost?.parentNode) drag.ghost.parentNode.removeChild(drag.ghost);

    // If it was basically a tap, keep the normal select-card behaviour.
    if (!drag.moved) return;
    v68LastRealDragAt = Date.now();

    if (meld?.dataset?.id) {
      socket.emit("meldAdd", { roomCode, playerToken, meldId: meld.dataset.id, cardId: drag.cardId });
      selected.clear();
      v62RefreshMeldHints?.();
      renderHand();
      ev.preventDefault();
      return;
    }

    if (discard) {
      socket.emit("discard", { roomCode, playerToken, cardId: drag.cardId });
      selected.clear();
      v62RefreshMeldHints?.();
      renderHand();
      ev.preventDefault();
      return;
    }
  }

  function v63CancelPointerDrag() {
    if (!v63Drag) return;
    if (v63Drag.ghost?.parentNode) v63Drag.ghost.parentNode.removeChild(v63Drag.ghost);
    if (v63Drag.source) v63Drag.source.classList.remove("dragSource");
    v63Drag = null;
    document.querySelectorAll(".dragOver").forEach(el => el.classList.remove("dragOver"));
  }

function v62SelectedCardId() {
    const ids = Array.from(selected || []);
    return ids.length === 1 ? ids[0] : null;
  }

  function v62RefreshMeldHints() {
    const ready = !!v62SelectedCardId();
    document.querySelectorAll(".restoredMeld").forEach(m => {
      m.classList.toggle("tapDropReady", ready);
      m.title = ready ? "Tap to add selected card" : "Select one card, then tap this meld";
    });
  }

  function v62AddSelectedToMeld(meldEl) {
    if (!meldEl) return false;
    const cardId = v62SelectedCardId();
    const meldId = meldEl.dataset.id;
    if (!cardId || !meldId) return false;

    socket.emit("meldAdd", { roomCode, playerToken, meldId, cardId });
    selected.clear();
    v62RefreshMeldHints();
    renderHand();
    return true;
  }

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
    el.className = `card ${suitClass(c)} ${small ? "smallCard" : ""} ${state && c.rank === state.beaner ? "beanerCard" : ""}`;
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
    });

    drawWheel();
  }

  function seatedPlayers() {
    const order = ["bottom","left","top","right"];
    return order.map(seat => state.players.find(p => p.seat === seat)).filter(Boolean);
  }

  
  function wheelWinnerByPointer(rotation=0) {
    const players = seatedPlayers();
    if (!players.length) return null;

    // Pointer is at 12 o'clock. Canvas arcs start at 3 o'clock, so pointer angle is -90deg.
    const pointerAngle = Math.PI * 1.5;
    const twoPi = Math.PI * 2;
    const normalized = ((pointerAngle - rotation) % twoPi + twoPi) % twoPi;
    const slice = twoPi / players.length;
    const index = Math.floor(normalized / slice) % players.length;
    return players[index] || null;
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

    // Rotate so the selected winner lands under the fixed pointer at 12 o'clock.
    const target = idx >= 0 ? (Math.PI * 1.5 - (idx * slice + slice/2)) : 0;
    const spins = Math.PI * 2 * (4 + Math.floor(Math.random() * 4));
    const start = performance.now();

    function frame(now) {
      const t = Math.min(1, (now - start) / 2200);
      const ease = 1 - Math.pow(1 - t, 3);
      drawWheel(spins * ease + target * ease);

      if (t < 1) requestAnimationFrame(frame);
      else {
        drawWheel(target);
        const landed = wheelWinnerByPointer(target) || players[idx];
        const finalName = landed?.name || winnerName;
        $("wheelResult").textContent = `🎯 ${finalName} Starts!`;
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

  function meldsForPlayerToken(token, playerName="") {
    if (!state) return [];
    return state.tableMelds.filter(m =>
      (token && m.ownerToken === token) ||
      (playerName && m.ownerName === playerName)
    );
  }

  
  function rankIndex(rank) {
    return ["A","2","3","4","5","6","7","8","9","10","J","Q","K"].indexOf(rank);
  }

  function sortedRunCardsForDisplay(cards) {
    if (!state || !cards || !cards.length) return cards || [];
    const beaner = state.beaner;
    const real = cards.filter(c => c.rank !== beaner).sort((a,b) => rankIndex(a.rank) - rankIndex(b.rank));
    const beans = cards.filter(c => c.rank === beaner);
    if (!real.length) return cards;

    const result = [];
    let beanIndex = 0;

    for (let i = 0; i < real.length; i++) {
      result.push(real[i]);
      if (i < real.length - 1) {
        const gap = rankIndex(real[i + 1].rank) - rankIndex(real[i].rank) - 1;
        for (let g = 0; g < gap && beanIndex < beans.length; g++) {
          result.push(beans[beanIndex++]);
        }
      }
    }

    while (beanIndex < beans.length) {
      const firstVal = rankIndex(real[0].rank);
      if (firstVal > 0) result.unshift(beans[beanIndex++]);
      else result.push(beans[beanIndex++]);
    }

    return result;
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

    const melds = meldsForPlayerToken(p.token, p.name);
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
        <div class="restoredMeldCards">${(m.type === "run" ? sortedRunCardsForDisplay(m.cards) : m.cards).map(renderMeldCard).join("")}</div>
      `;
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

    $("deckCount").textContent = "";

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
    enableDragDropTargets();

    renderHand();
  }

  function requestMyHand() {
    if (!roomCode || !playerToken) return;
    socket.emit('getHand', { roomCode, playerToken });
    socket.emit('forceHand', { roomCode, playerToken });
  }

  
  function v68FastSelectCard(ev, cardId) {
    if (v68IsRecentDrag()) return;
    if (typeof v63Drag !== 'undefined' && v63Drag && v63Drag.moved) return;
    if (ev.pointerType === "mouse") return;
    selected.has(cardId) ? selected.delete(cardId) : selected.add(cardId);
    if (typeof v62RefreshMeldHints === "function") v62RefreshMeldHints();
    renderHand();
    ev.preventDefault();
    ev.stopPropagation();
  }

function renderHand() {
    applyHandSort();
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
      card.draggable = true;
      card.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/plain', c.id); });
      card.addEventListener('pointerdown', ev => v63StartPointerDrag(ev, card, c.id));
      card.addEventListener('pointermove', v63MovePointerDrag);
      card.addEventListener('pointerup', v63EndPointerDrag);
      card.addEventListener('pointercancel', v63CancelPointerDrag);
      card.addEventListener('pointerup', ev => v68FastSelectCard(ev, c.id));
      if (selected.has(c.id)) card.classList.add('selected');
      card.addEventListener('click', () => { if (v68IsRecentDrag()) return;
        selected.has(c.id) ? selected.delete(c.id) : selected.add(c.id);
        v62RefreshMeldHints();
        renderHand();
      });
      el.appendChild(card);
    });
    enableDragDropTargets();
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
    applyHandSort();
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
    if (Date.now() - v69LastSeatActionAt < 350) return;
    const key = seat.dataset.seat;
    const mini = e.target.closest(".mini");
    const occupant = state.players.find(p => p.seat === key);
    const action = mini ? mini.dataset.action : "sit";
    if (!mini && occupant && !occupant.isBot && occupant.token !== playerToken) return;
    socket.emit("seatAction", { roomCode, playerToken, seat: key, action });
  });

  $("spinBtn").addEventListener("click", () => {
    $("wheelResult").textContent = "Spinning...";
    socket.emit("spinStarter", { roomCode });
  });
  $("startBtn").addEventListener("click", () => socket.emit("startGame", { roomCode }));
  if ($("refreshBtn")) $("refreshBtn").addEventListener("click", () => {
    socket.emit("requestRoomState", { roomCode, playerToken });
    requestMyHand();
  });
  if ($("restartGameBtn")) $("restartGameBtn").addEventListener("click", () => {
    if (confirm("Restart the whole game and return to lobby?")) socket.emit("restartGame", { roomCode, playerToken });
  });

  $("exitBtn").addEventListener("click", () => {
    if (confirm("Exit game?")) socket.emit("exitGame", { roomCode, playerToken });
  });

  $("drawDeck").addEventListener("click", () => { if (Date.now() - v69LastPickupAt < 350) return; socket.emit("drawDeck", { roomCode, playerToken }); });
  $("topDiscard").addEventListener("click", () => { if (Date.now() - v69LastPickupAt < 350) return; v69LastPickupAt = Date.now();
      socket.emit("takeTopDiscard", { roomCode, playerToken }); });
  $("takePile").addEventListener("click", () => { if (Date.now() - v69LastPickupAt < 350) return; v69LastPickupAt = Date.now();
      socket.emit("takeDiscardPile", { roomCode, playerToken }); });

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

  $("sortRank").addEventListener("click", () => setHandSortMode("rank"));

  $("sortSuit").addEventListener("click", () => setHandSortMode("suit"));

  $("nextRoundBtn").addEventListener("click", () => {
    if (state && state.phase === 'roundOver') socket.emit("nextRound", { roomCode });
    else socket.emit("restartRound", { roomCode });
  });


  
  function selectedCardIdForMeldDrop() {
    const ids = [...selected];
    return ids.length === 1 ? ids[0] : null;
  }


  function oneSelectedCardId() {
    const ids = [...selected];
    return ids.length === 1 ? ids[0] : null;
  }

  function clearSelectedCards() {
    selected.clear();
    refreshMeldDropHints();
    renderHand();
  }

  function refreshMeldDropHints() {
    const ready = !!oneSelectedCardId();
    document.querySelectorAll(".restoredMeld").forEach(m => m.classList.toggle("tapDropReady", ready));
  }

  function addCardToMeld(cardId, meldId) {
    if (!cardId || !meldId) return false;
    socket.emit("addToMeld", { roomCode, playerToken, meldId, cardId });
    socket.emit("playOnMeld", { roomCode, playerToken, meldId, cardId }); // harmless fallback if server ignores duplicate after first succeeds
    selected.clear();
    refreshMeldDropHints();
    renderHand();
    return true;
  }

function enableDragDropTargets() {
    const discardTarget = $("topDiscard");

    if (discardTarget && !discardTarget.dataset.v61DropBound) {
      discardTarget.dataset.v61DropBound = "1";

      discardTarget.addEventListener("dragover", e => {
        e.preventDefault();
        discardTarget.classList.add("dragOver");
      });

      discardTarget.addEventListener("dragleave", () => discardTarget.classList.remove("dragOver"));

      discardTarget.addEventListener("drop", e => {
        e.preventDefault();
        e.stopPropagation();
        discardTarget.classList.remove("dragOver");
        const cardId = e.dataTransfer.getData("text/plain");
        if (cardId) socket.emit("discard", { roomCode, playerToken, cardId });
      });
    }

    document.querySelectorAll(".restoredMeld").forEach(meld => {
      if (!meld.dataset.v61DropBound) {
        meld.dataset.v61DropBound = "1";

        meld.addEventListener("dragover", e => {
          e.preventDefault();
          meld.classList.add("dragOver");
        });

        meld.addEventListener("dragleave", () => meld.classList.remove("dragOver"));

        meld.addEventListener("drop", e => {
          e.preventDefault();
          e.stopPropagation();
          meld.classList.remove("dragOver");
          const cardId = e.dataTransfer.getData("text/plain");
          addCardToMeld(cardId, meld.dataset.id);
        });

        // Mobile/iPhone fallback: select one card, then tap any meld.
        meld.addEventListener("click", e => {
          const cardId = oneSelectedCardId();
          if (!cardId) return;
          e.preventDefault();
          e.stopPropagation();
          addCardToMeld(cardId, meld.dataset.id);
        }, true);

        meld.addEventListener("pointerup", e => {
          const cardId = oneSelectedCardId();
          if (!cardId) return;
          e.preventDefault();
          e.stopPropagation();
          addCardToMeld(cardId, meld.dataset.id);
        }, true);
      }
    });

    refreshMeldDropHints();
  }


  setInterval(updateTurnHighlightsLoop, 1000);
  
  function v62MeldTapHandler(e) {
    const meld = e.target.closest(".restoredMeld");
    if (!meld) return;

    if (v62SelectedCardId()) {
      e.preventDefault();
      e.stopPropagation();
      v62AddSelectedToMeld(meld);
    }
  }

  document.addEventListener('click', v62MeldTapHandler, true);
  document.addEventListener('pointerup', v62MeldTapHandler, true);

  document.addEventListener('dragover', e => {
    const meld = e.target.closest(".restoredMeld");
    const discard = e.target.closest("#topDiscard");
    if (meld || discard) {
      e.preventDefault();
      (meld || discard).classList.add("dragOver");
    }
  }, true);

  document.addEventListener('dragleave', e => {
    const meld = e.target.closest(".restoredMeld");
    const discard = e.target.closest("#topDiscard");
    if (meld || discard) (meld || discard).classList.remove("dragOver");
  }, true);

  document.addEventListener('drop', e => {
    const meld = e.target.closest(".restoredMeld");
    const discard = e.target.closest("#topDiscard");
    if (!meld && !discard) return;

    e.preventDefault();
    e.stopPropagation();

    const cardId = e.dataTransfer.getData("text/plain");
    if (!cardId) return;

    if (meld) {
      meld.classList.remove("dragOver");
      socket.emit("meldAdd", { roomCode, playerToken, meldId: meld.dataset.id, cardId });
      selected.clear();
      v62RefreshMeldHints();
      renderHand();
      return;
    }

    if (discard) {
      discard.classList.remove("dragOver");
      socket.emit("discard", { roomCode, playerToken, cardId });
    }
  }, true);

  socket.on("meldAddOk", data => {
    selected.clear();
    v62RefreshMeldHints?.();
    if (data?.swapped) {
      const el = $("wheelResult");
      // lightweight visual feedback without adding a new popup layer
      console.log("Beaner swapped into hand");
    }
    requestMyHand();
  });


  document.addEventListener('pointermove', v63MovePointerDrag, { passive:false });
  document.addEventListener('pointerup', v63EndPointerDrag, { passive:false });
  document.addEventListener('pointercancel', v63CancelPointerDrag, { passive:false });


  let v68LastAction = { name:"", at:0 };
  function v68ActionOnce(name, fn) {
    const now = Date.now();
    if (v68LastAction.name === name && now - v68LastAction.at < 350) return;
    v68LastAction = { name, at: now };
    fn();
  }
  function v68BindFastButton(id, name, fn) {
    const btn = $(id);
    if (!btn || btn.dataset.v68FastBound) return;
    btn.dataset.v68FastBound = "1";
    btn.addEventListener("pointerup", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      v68ActionOnce(name, fn);
    }, true);
  }
  v68BindFastButton("layMeld", "layMeld", () => {
    const ids = [...selected];
    if (ids.length < 3) return alert("Select at least 3 cards.");
    socket.emit("layMeld", { roomCode, playerToken, cardIds: ids });
    selected.clear();
    if (typeof v62RefreshMeldHints === "function") v62RefreshMeldHints();
    renderHand();
  });
  v68BindFastButton("discardBtn", "discard", () => {
    let ids = [...selected];
    if (ids.length !== 1 && hand.length === 1) ids = [hand[0].id];
    if (ids.length !== 1) return alert("Select exactly 1 card to discard.");
    socket.emit("discard", { roomCode, playerToken, cardId: ids[0] });
    selected.clear();
    if (typeof v62RefreshMeldHints === "function") v62RefreshMeldHints();
    renderHand();
  });
  v68BindFastButton("sortRank", "sortRank", () => setHandSortMode("rank"));
  v68BindFastButton("sortSuit", "sortSuit", () => setHandSortMode("suit"));


  function bindImmediateAction(el, name, fn) {
    if (!el || el.dataset.immediateBound) return;
    el.dataset.immediateBound = "1";
    let lastAt = 0;

    function run(ev) {
      const now = Date.now();
      if (now - lastAt < 280) return;
      lastAt = now;
      ev.preventDefault();
      ev.stopPropagation();
      fn(ev);
    }

    el.addEventListener("pointerup", run, true);
    el.addEventListener("touchend", run, true);
  }

  function bindFastGameplayButtons() {
    bindImmediateAction($("drawDeck"), "drawDeck", () => {
      v69LastPickupAt = Date.now();
      socket.emit("drawDeck", { roomCode, playerToken });
    });

    bindImmediateAction($("topDiscard"), "topDiscard", () => {
      socket.emit("takeTopDiscard", { roomCode, playerToken });
    });

    bindImmediateAction($("takePile"), "takePile", () => {
      socket.emit("takeDiscardPile", { roomCode, playerToken });
    });
  }


  function v69LobbyFastSeatHandler(e) {
    const seat = e.target.closest(".seat");
    if (!seat || !state || state.phase !== "lobby") return;

    const key = seat.dataset.seat;
    const mini = e.target.closest(".mini");
    const occupant = state.players.find(p => p.seat === key);
    const action = mini ? mini.dataset.action : "sit";

    if (!mini && occupant && !occupant.isBot && occupant.token !== playerToken) return;

    e.preventDefault();
    e.stopPropagation();
    v69LastSeatActionAt = Date.now();
    socket.emit("seatAction", { roomCode, playerToken, seat: key, action });
  }

  document.addEventListener('pointerup', v69LobbyFastSeatHandler, true);

setInterval(() => {
    if (state && state.phase === 'playing') {
      const me = currentPlayer();
      if (me && me.cardCount > 0 && (!hand || hand.length === 0)) requestMyHand();
    }
  }, 1500);
})();
