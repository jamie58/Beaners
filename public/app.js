const socket = io();
const SESSION_ROOM_KEY = "beanersRoomCode";
const SESSION_PLAYER_KEY = "beanersPlayerId";
const SESSION_TOKEN_KEY = "beanersPlayerToken";

socket.on("connect", () => {
  const savedRoom = localStorage.getItem(SESSION_ROOM_KEY);
  const savedToken = localStorage.getItem(SESSION_TOKEN_KEY);
  if (savedRoom && savedToken && !currentRoomCode) {
    socket.emit("rejoinRoom", { roomCode: savedRoom, playerToken: savedToken });
  }
});

socket.on("rejoinFailed", () => {
  localStorage.removeItem(SESSION_ROOM_KEY);
  localStorage.removeItem(SESSION_PLAYER_KEY);
  localStorage.removeItem(SESSION_TOKEN_KEY);
});


let currentRoomCode = null;
let myPlayerId = null;
let currentHand = [];
let selectedCardIds = new Set();
let latestState = null;
let pendingChoiceCardId = null;
let previousPhase = null;
let previousRound = null;
let lastShownScoreRound = null;
let scorecardTimer = null;
let audioContext = null;
let lastHandCount = 0;
let handSortMode = localStorage.getItem('beanersSortMode') || 'none';

const $ = id => document.getElementById(id);

$("createBtn").onclick = () => socket.emit("createRoom", { 
  name: $("nameInput").value.trim() || "Player",
  playerToken: localStorage.getItem(SESSION_TOKEN_KEY)
});
$("joinBtn").onclick = () => socket.emit("joinRoom", { 
  roomCode: $("roomInput").value.trim(), 
  name: $("nameInput").value.trim() || "Player",
  playerToken: localStorage.getItem(SESSION_TOKEN_KEY)
});
$("addBotBtn").onclick = () => socket.emit("addBot", { roomCode: currentRoomCode });
$("fillBotsBtn").onclick = () => socket.emit("fillBots", { roomCode: currentRoomCode });
$("spinBtn").onclick = () => socket.emit("spinStarter", { roomCode: currentRoomCode });
$("startBtn").onclick = () => socket.emit("startGame", { roomCode: currentRoomCode });
$("drawDeckBtn").onclick = () => socket.emit("drawFromDeck", { roomCode: currentRoomCode });
$("takeTopDiscardBtn").onclick = () => socket.emit("takeTopDiscard", { roomCode: currentRoomCode });
$("takeAllDiscardBtn").onclick = () => { if(confirm("Pick up the entire discard pile?")) socket.emit("takeAllDiscard", { roomCode: currentRoomCode }); };
$("nextRoundBtn").onclick = () => socket.emit("nextRound", { roomCode: currentRoomCode });

$("sortNumberBtn").onclick = () => {
  handSortMode = "number";
  localStorage.setItem("beanersSortMode", handSortMode);
  renderHand();
};

$("sortSuitBtn").onclick = () => {
  handSortMode = "suit";
  localStorage.setItem("beanersSortMode", handSortMode);
  renderHand();
};

function doExitGame(){
  if(confirm("Exit game? A bot will take over your seat.")){
    socket.emit("exitGame", { roomCode: currentRoomCode });
  }
}

if ($("exitGameBtn")) $("exitGameBtn").onclick = doExitGame;
if ($("exitGameBtn2")) $("exitGameBtn2").onclick = doExitGame;


document.querySelectorAll(".seatPick").forEach(btn => {
  btn.addEventListener("click", () => {
    socket.emit("chooseSeat", { roomCode: currentRoomCode, seatKey: btn.dataset.seat });
  });
});

socket.on("exitedGame", () => {
  localStorage.removeItem(SESSION_ROOM_KEY);
  localStorage.removeItem(SESSION_PLAYER_KEY);
  localStorage.removeItem(SESSION_TOKEN_KEY);
  location.reload();
});

$("layMeldBtn").onclick = () => {
  const ids = [...selectedCardIds];
  if(ids.length < 3) return alert("Select at least 3 cards for a meld.");
  socket.emit("layMeld", { roomCode: currentRoomCode, cardIds: ids });
  selectedCardIds.clear();
};

$("discardBtn").onclick = () => {
  const ids = [...selectedCardIds];
  if(ids.length !== 1) return alert("Select exactly 1 card to discard.");
  socket.emit("discardCard", { roomCode: currentRoomCode, cardId: ids[0] });
  selectedCardIds.clear();
};

$("cancelChoice").onclick = () => {
  pendingChoiceCardId = null;
  $("meldChoice").classList.add("hidden");
};

$("closeScorecard").onclick = () => hideScorecard();

socket.on("joinedRoom", ({roomCode, playerId, playerToken}) => {
  currentRoomCode = roomCode;
  myPlayerId = playerId;
  localStorage.setItem(SESSION_ROOM_KEY, roomCode);
  localStorage.setItem(SESSION_PLAYER_KEY, playerId);
  if (playerToken) localStorage.setItem(SESSION_TOKEN_KEY, playerToken);
  $("roomCode").textContent = roomCode;
  $("lobby").classList.add("hidden");
  $("game").classList.remove("hidden");
  setupDiscardDrop();
});

socket.on("starterSpun", ({starterName}) => {
  const box = $("wheelResult");
  const names = latestState?.players?.map(p=>p.name) || [];
  let i = 0;
  box.textContent = "Spinning...";
  const interval = setInterval(() => {
    if(names.length) box.textContent = names[i++ % names.length];
  }, 80);
  setTimeout(() => { clearInterval(interval); box.textContent = `${starterName} starts Round 1`; }, 1500);
});

socket.on("roomState", state => {
  const shouldAnimate = state.phase === "playing" && (previousPhase !== "playing" || previousRound !== state.round);
  latestState = state;
  renderState();
  if (shouldAnimate) { showDealAnimation(); playShuffleSound(); }

  if ((state.phase === "roundOver" || state.phase === "gameOver") && lastShownScoreRound !== state.round) {
    showScorecard(state);
    lastShownScoreRound = state.round;
  }

  previousPhase = state.phase;
  previousRound = state.round;
});

socket.on("yourHand", hand => {
  currentHand = hand;
  selectedCardIds = new Set([...selectedCardIds].filter(id => hand.some(c => c.id === id)));
  renderHand();
  if (lastHandCount && hand.length < lastHandCount) animateCardMove();
  lastHandCount = hand.length;
});

socket.on("chooseMeldForCard", ({cardId, meldIds}) => {
  pendingChoiceCardId = cardId;
  const wrap = $("meldChoiceButtons");
  wrap.innerHTML = "";
  meldIds.forEach(id => {
    const meld = latestState.tableMelds.find(m => m.id === id);
    const btn = document.createElement("button");
    btn.textContent = `${meld.ownerName} - ${meld.type.toUpperCase()} - ${meld.cards.map(cardText).join(" ")}`;
    btn.onclick = () => {
      playOnMeld(id, cardId);
      $("meldChoice").classList.add("hidden");
      pendingChoiceCardId = null;
    };
    wrap.appendChild(btn);
  });
  $("meldChoice").classList.remove("hidden");
});

socket.on("autoPlayResolved", ({cardId, meldId}) => playOnMeld(meldId, cardId));
socket.on("errorMessage", message => alert(message));

function renderState(){
  const state = latestState;
  if(!state) return;

  if ($("compactRoom")) $("compactRoom").textContent = `Room ${state.roomCode}`;
  if ($("compactBeaner")) $("compactBeaner").textContent = `R${state.round} Beaner: ${state.beaner}`;
  $("roundNo").textContent = state.round;
  $("beanerRank").textContent = state.beaner;
  $("deckCount").textContent = state.deckCount;
  $("discardCount").textContent = state.discardCount;

  $("lobbyControls").classList.toggle("hidden", state.phase !== "lobby");
  $("playingControls").classList.toggle("hidden", state.phase !== "playing");
  $("roundOverControls").classList.toggle("hidden", state.phase !== "roundOver");
  $("winnerMessage").classList.toggle("hidden", !state.winnerMessage);
  $("winnerMessage").textContent = state.winnerMessage || "";

  const current = state.players[state.currentPlayerIndex];
  if(state.phase === "lobby") $("status").textContent = "Waiting for players. Start with 2–4 players; bots are optional.";
  else if(state.phase === "playing") $("status").textContent = current?.id === myPlayerId ? "Your turn. Pick up, play, then discard." : `${current?.name}'s turn. You can still live-play if you're down.`;
  else if(state.phase === "roundOver") $("status").textContent = "Round over. Scores added.";
  else $("status").textContent = "Game over.";

  const top = state.topDiscard;
  $("takeTopDiscardBtn").textContent = top ? cardText(top) : "-";
  $("takeTopDiscardBtn").className = "card large discardButton " + cardClasses(top);

  const me = state.players.find(p => p.id === myPlayerId);
  const isMyTurn = current?.id === myPlayerId;
  const disablePickup = !isMyTurn || !!me?.hasPickedUp;
  ["drawDeckBtn","takeTopDiscardBtn","takeAllDiscardBtn"].forEach(id => {
    if($(id)) $(id).disabled = disablePickup;
  });

  renderSeatStatus();
  renderPlayers();
  renderMelds();
  renderHand();
}


function renderSeatStatus(){
  const box = $("seatStatus");
  if(!box || !latestState) return;

  const labels = {top:"Top", left:"Left", right:"Right", bottom:"Bottom"};
  const occupied = {};
  latestState.players.forEach(p => {
    if(p.seatKey) occupied[p.seatKey] = p.name + (p.id === myPlayerId ? " (you)" : "") + (p.isBot ? " Bot" : "");
  });

  box.innerHTML = ["top","left","right","bottom"].map(seat => {
    return `<div><strong>${labels[seat]}:</strong> ${occupied[seat] || "Empty"}</div>`;
  }).join("");

  document.querySelectorAll(".seatPick").forEach(btn => {
    const seat = btn.dataset.seat;
    const takenByOther = latestState.players.some(p => p.seatKey === seat && p.id !== myPlayerId);
    const takenByMe = latestState.players.some(p => p.seatKey === seat && p.id === myPlayerId);
    btn.disabled = takenByOther;
    btn.textContent = takenByMe ? `${labels[seat]} ✓` : `${labels[seat]} Seat`;
  });
}

function renderPlayers(){
  const wrap = $("players");
  const state = latestState;
  wrap.innerHTML = "";
  state.players.forEach((p,i) => {
    const div = document.createElement("div");
    div.className = "playerRow " + (i === state.currentPlayerIndex && state.phase === "playing" ? "current" : "");
    div.innerHTML = `
      <strong>${i === state.currentPlayerIndex && state.phase === "playing" ? "👉 " : ""}${escapeHtml(p.name)}${p.id === myPlayerId ? " (you)" : ""}</strong>
      ${p.isBot ? '<span class="botTag">BOT</span>' : ""}${p.disconnected ? '<span class="botTag">OFFLINE</span>' : ""}
      <br>Cards: ${p.cardCount}
      <br>${p.isDown ? "Down" : "Not down"}
      <br>Total: ${p.totalScore}${p.lastRoundScore == null ? "" : `<br>Last: ${p.lastRoundScore}`}
    `;
    wrap.appendChild(div);
  });
}


function getSortedHand(){
  const rankOrder = {"A":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13};
  const suitOrder = {"♠":1,"♥":2,"♦":3,"♣":4};

  const cards = [...currentHand];

  if(handSortMode === "number"){
    cards.sort((a,b) => (rankOrder[a.rank] - rankOrder[b.rank]) || (suitOrder[a.suit] - suitOrder[b.suit]));
  }

  if(handSortMode === "suit"){
    cards.sort((a,b) => (suitOrder[a.suit] - suitOrder[b.suit]) || (rankOrder[a.rank] - rankOrder[b.rank]));
  }

  return cards;
}

function renderHand(){
  const wrap = $("hand");
  if(!wrap) return;
  wrap.innerHTML = "";
  getSortedHand().forEach(card => {
    const el = document.createElement("div");
    el.className = "card " + cardClasses(card) + (selectedCardIds.has(card.id) ? " selected" : "");
    el.textContent = cardText(card);
    el.draggable = true;
    el.dataset.cardId = card.id;
    el.onclick = () => {
      if(selectedCardIds.has(card.id)) selectedCardIds.delete(card.id);
      else selectedCardIds.add(card.id);
      renderHand();
    };
    el.ondblclick = () => socket.emit("autoPlayCard", { roomCode: currentRoomCode, cardId: card.id });
    el.ondragstart = e => {
      e.dataTransfer.setData("text/plain", card.id);
      e.dataTransfer.effectAllowed = "move";
    };
    setupTouchDrag(el, card.id);
    wrap.appendChild(el);
  });
}


function renderMelds(){
  renderSeats();
}

function renderSeats(){
  const state = latestState;
  const seats = ["seatTop", "seatLeft", "seatRight", "seatBottom"];
  seats.forEach(id => { if($(id)) $(id).innerHTML = ""; });
  if(!state || !state.players) return;

  const seatOrder = ["bottom", "left", "top", "right"];
  const me = state.players.find(p => p.id === myPlayerId) || state.players[0];
  const mySeat = me?.seatKey || "bottom";
  const mySeatIndex = seatOrder.indexOf(mySeat);

  function relativeSeatFor(player){
    if(!player?.seatKey || mySeatIndex < 0) return null;
    const diff = (seatOrder.indexOf(player.seatKey) - mySeatIndex + 4) % 4;
    if(diff === 0) return "seatBottom";
    if(diff === 1) return "seatLeft";
    if(diff === 2) return "seatTop";
    if(diff === 3) return "seatRight";
    return null;
  }

  const placement = state.players.map(player => ({
    player,
    seat: relativeSeatFor(player)
  })).filter(x => x.seat);

  // Fallback for older rooms without seats.
  if(!placement.length){
    const meIndex = Math.max(0, state.players.findIndex(p => p.id === myPlayerId));
    const ordered = [
      state.players[meIndex],
      state.players[(meIndex + 1) % state.players.length],
      state.players[(meIndex + 2) % state.players.length],
      state.players[(meIndex + 3) % state.players.length],
    ].filter(Boolean);
    placement.push(
      { player: ordered[2], seat: "seatTop" },
      { player: ordered[1], seat: "seatLeft" },
      { player: ordered[3], seat: "seatRight" },
      { player: ordered[0], seat: "seatBottom" },
    );
  }

  placement.forEach(({player, seat}) => {
    if(!player || !$(seat)) return;
    const box = $(seat);
    box.className = box.className.replace(/\s?current|\s?you/g, "");
    if(player.index === state.currentPlayerIndex && state.phase === "playing") box.classList.add("current");
    if(player.id === myPlayerId) box.classList.add("you");

    const melds = state.tableMelds.filter(m => m.ownerId === player.id);
    box.innerHTML = `
      <div class="seatHeader">
        <div>
          <div class="seatName">${player.index === state.currentPlayerIndex && state.phase === "playing" ? "👉 " : ""}${escapeHtml(player.name)}${player.id === myPlayerId ? " (you)" : ""} ${player.isBot ? '<span class="botTag">BOT</span>' : ""}</div>
          <div class="seatMeta">${player.cardCount} cards | ${player.isDown ? "Down" : "Not down"} | ${player.totalScore} pts</div>
        </div>
      </div>
      <div class="seatMelds"></div>
    `;

    const meldWrap = box.querySelector(".seatMelds");
    if(!melds.length){
      meldWrap.innerHTML = `<p class="hint">No melds yet</p>`;
      return;
    }
    melds.forEach(meld => meldWrap.appendChild(createMeldElement(meld)));
  });
}

function createMeldElement(meld){
  const box = document.createElement("div");
  box.className = "meld";
  box.dataset.meldId = meld.id;
  const beaners = (meld.beanerPositions || []).map(b => `${b.represents.rank}${b.represents.suit || ""}`).join(", ");

  box.innerHTML = `
    <div class="meldMeta">${meld.type.toUpperCase()}${beaners ? ` | Beaner = ${beaners}` : ""}</div>
    <div class="meldCards"></div>
  `;

  box.ondragover = e => { e.preventDefault(); box.classList.add("dragOver"); };
  box.ondragleave = () => box.classList.remove("dragOver");
  box.ondrop = e => {
    e.preventDefault();
    box.classList.remove("dragOver");
    const cardId = e.dataTransfer.getData("text/plain");
    playOnMeld(meld.id, cardId);
  };

  box.onclick = () => {
    const ids = [...selectedCardIds];
    if(ids.length === 1){
      playOnMeld(meld.id, ids[0]);
      selectedCardIds.clear();
      renderHand();
    }
  };

  const cardWrap = box.querySelector(".meldCards");
  meld.cards.forEach(card => {
    const c = document.createElement("span");
    c.className = "card " + cardClasses(card);
    c.textContent = cardText(card);
    cardWrap.appendChild(c);
  });

  return box;
}


function setupTouchDrag(el, cardId){
  let ghost = null;
  let dragging = false;
  let startX = 0;
  let startY = 0;

  el.addEventListener("touchstart", e => {
    if(!e.touches || e.touches.length !== 1) return;
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    dragging = false;
  }, {passive:true});

  el.addEventListener("touchmove", e => {
    if(!e.touches || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - startX);
    const dy = Math.abs(t.clientY - startY);

    if(!dragging && (dx > 8 || dy > 8)){
      dragging = true;
      ghost = el.cloneNode(true);
      ghost.classList.add("touchGhost");
      document.body.appendChild(ghost);
    }

    if(dragging && ghost){
      e.preventDefault();
      ghost.style.left = `${t.clientX}px`;
      ghost.style.top = `${t.clientY}px`;

      document.querySelectorAll(".meld,.discardDrop").forEach(x => x.classList.remove("dragOver"));
      const target = document.elementFromPoint(t.clientX, t.clientY)?.closest(".meld,.discardDrop");
      if(target) target.classList.add("dragOver");
    }
  }, {passive:false});

  el.addEventListener("touchend", e => {
    if(!dragging){
      if(selectedCardIds.has(cardId)) selectedCardIds.delete(cardId);
      else selectedCardIds.add(cardId);
      renderHand();
      return;
    }

    const touch = e.changedTouches && e.changedTouches[0];
    if(touch){
      const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest(".meld,.discardDrop");
      if(target?.classList.contains("discardDrop")){
        socket.emit("discardCard", { roomCode: currentRoomCode, cardId });
      } else if(target?.classList.contains("meld")){
        playOnMeld(target.dataset.meldId, cardId);
      }
    }

    document.querySelectorAll(".meld,.discardDrop").forEach(x => x.classList.remove("dragOver"));
    if(ghost) ghost.remove();
    ghost = null;
    dragging = false;
  }, {passive:false});
}

function setupDiscardDrop(){
  const dz = $("discardDropZone");
  if(!dz) return;
  dz.ondragover = e => { e.preventDefault(); dz.classList.add("dragOver"); };
  dz.ondragleave = () => dz.classList.remove("dragOver");
  dz.ondrop = e => {
    e.preventDefault();
    dz.classList.remove("dragOver");
    const cardId = e.dataTransfer.getData("text/plain");
    socket.emit("discardCard", { roomCode: currentRoomCode, cardId });
  };
}

function showDealAnimation(){
  const el = $("dealAnimation");
  if(!el) return;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 900);
}

function playOnMeld(meldId, cardId){
  const swapBeaner = confirm("Swap for Beaner if possible?\n\nOK = swap if legal\nCancel = just add if legal");
  socket.emit("playOnMeld", { roomCode: currentRoomCode, meldId, cardId, swapBeaner });
}

function cardText(card){ return `${card.rank}${card.suit}`; }

function cardClasses(card){
  if(!card || !latestState) return "";
  const classes = [];
  if(["♥","♦"].includes(card.suit)) classes.push("red");
  if(card.rank === latestState.beaner) classes.push("beaner");
  return classes.join(" ");
}



function animateCardMove(){
  const layer = $("fxLayer");
  if(!layer) return;
  const el = document.createElement("div");
  el.className = "movingCardFx";
  el.textContent = "🂠";
  layer.appendChild(el);
  setTimeout(() => el.remove(), 650);
}

function playShuffleSound(){
  try{
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    for(let i=0;i<5;i++){
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(180 + i*35, now + i*0.045);
      gain.gain.setValueAtTime(0.025, now + i*0.045);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i*0.045 + 0.04);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(now + i*0.045);
      osc.stop(now + i*0.045 + 0.05);
    }
  } catch(e){}
}

function showScorecard(state){
  const modal = $("scorecardModal");
  const content = $("scorecardContent");
  if(!modal || !content) return;

  const latestRound = state.roundScores?.[state.roundScores.length - 1];
  const roundScores = latestRound?.scores || {};

  let html = `<h3>Round ${state.round} - Beaner: ${state.beaner}</h3>`;
  html += `<table class="scoreTable">
    <thead>
      <tr>
        <th>Player</th>
        <th>Round Score</th>
        <th>Running Total</th>
      </tr>
    </thead>
    <tbody>`;

  state.players.forEach(player => {
    const roundScore = roundScores[player.id] ?? player.lastRoundScore ?? 0;
    html += `<tr>
      <td>${escapeHtml(player.name)}${player.id === myPlayerId ? " (you)" : ""}</td>
      <td>${roundScore}</td>
      <td>${player.totalScore}</td>
    </tr>`;
  });

  html += `</tbody>
    <tfoot>
      <tr>
        <td colspan="3">Lowest score after 13 rounds wins</td>
      </tr>
    </tfoot>
  </table>`;

  content.innerHTML = html;
  modal.classList.remove("hidden");

  if(scorecardTimer) clearTimeout(scorecardTimer);
  scorecardTimer = setTimeout(() => hideScorecard(), 10000);
}

function hideScorecard(){
  const modal = $("scorecardModal");
  if(modal) modal.classList.add("hidden");
  if(scorecardTimer) clearTimeout(scorecardTimer);
  scorecardTimer = null;
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}
