const socket = io();

let currentRoomCode = null;
let myPlayerId = null;
let currentHand = [];
let selectedCardIds = new Set();
let latestState = null;
let pendingChoiceCardId = null;

const $ = id => document.getElementById(id);

$("createBtn").onclick = () => socket.emit("createRoom", { name: $("nameInput").value.trim() || "Player" });
$("joinBtn").onclick = () => socket.emit("joinRoom", { roomCode: $("roomInput").value.trim(), name: $("nameInput").value.trim() || "Player" });
$("addBotBtn").onclick = () => socket.emit("addBot", { roomCode: currentRoomCode });
$("fillBotsBtn").onclick = () => socket.emit("fillBots", { roomCode: currentRoomCode });
$("spinBtn").onclick = () => socket.emit("spinStarter", { roomCode: currentRoomCode });
$("startBtn").onclick = () => socket.emit("startGame", { roomCode: currentRoomCode });
$("drawDeckBtn").onclick = () => socket.emit("drawFromDeck", { roomCode: currentRoomCode });
$("takeTopDiscardBtn").onclick = () => socket.emit("takeTopDiscard", { roomCode: currentRoomCode });
$("takeAllDiscardBtn").onclick = () => { if(confirm("Pick up the entire discard pile?")) socket.emit("takeAllDiscard", { roomCode: currentRoomCode }); };
$("nextRoundBtn").onclick = () => socket.emit("nextRound", { roomCode: currentRoomCode });

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

socket.on("joinedRoom", ({roomCode, playerId}) => {
  currentRoomCode = roomCode;
  myPlayerId = playerId;
  $("roomCode").textContent = roomCode;
  $("lobby").classList.add("hidden");
  $("game").classList.remove("hidden");
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
  latestState = state;
  renderState();
});

socket.on("yourHand", hand => {
  currentHand = hand;
  selectedCardIds = new Set([...selectedCardIds].filter(id => hand.some(c => c.id === id)));
  renderHand();
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
  if(state.phase === "lobby") $("status").textContent = "Waiting for 4 players. Add bots if testing solo.";
  else if(state.phase === "playing") $("status").textContent = current?.id === myPlayerId ? "Your turn. Pick up, play, then discard." : `${current?.name}'s turn. You can still live-play if you're down.`;
  else if(state.phase === "roundOver") $("status").textContent = "Round over. Scores added.";
  else $("status").textContent = "Game over.";

  const top = state.topDiscard;
  $("discardCard").textContent = top ? cardText(top) : "-";
  $("discardCard").className = "card large " + cardClasses(top);

  renderPlayers();
  renderMelds();
  renderHand();
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
      ${p.isBot ? '<span class="botTag">BOT</span>' : ""}
      <br>Cards: ${p.cardCount}
      <br>${p.isDown ? "Down" : "Not down"}
      <br>Total: ${p.totalScore}${p.lastRoundScore == null ? "" : `<br>Last: ${p.lastRoundScore}`}
    `;
    wrap.appendChild(div);
  });
}

function renderHand(){
  const wrap = $("hand");
  if(!wrap) return;
  wrap.innerHTML = "";
  currentHand.forEach(card => {
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
    wrap.appendChild(el);
  });
}

function renderMelds(){
  const wrap = $("melds");
  const state = latestState;
  wrap.innerHTML = "";
  if(!state.tableMelds.length){
    wrap.innerHTML = `<p class="hint">No melds on the table yet.</p>`;
    return;
  }

  state.tableMelds.forEach(meld => {
    const box = document.createElement("div");
    box.className = "meld";
    box.dataset.meldId = meld.id;

    const beaners = (meld.beanerPositions || []).map(b => `${b.represents.rank}${b.represents.suit || ""}`).join(", ");

    box.innerHTML = `
      <div class="meldHeader">
        <div>
          <div class="meldTitle">${escapeHtml(meld.ownerName)}</div>
          <div class="meldMeta">${meld.type.toUpperCase()}${beaners ? ` | Beaner = ${beaners}` : ""}</div>
        </div>
        <button type="button">Add selected</button>
      </div>
      <div class="meldCards"></div>
    `;

    box.querySelector("button").onclick = () => {
      const ids = [...selectedCardIds];
      if(ids.length !== 1) return alert("Select exactly 1 card.");
      playOnMeld(meld.id, ids[0]);
      selectedCardIds.clear();
    };

    box.ondragover = e => { e.preventDefault(); box.classList.add("dragOver"); };
    box.ondragleave = () => box.classList.remove("dragOver");
    box.ondrop = e => {
      e.preventDefault();
      box.classList.remove("dragOver");
      const cardId = e.dataTransfer.getData("text/plain");
      playOnMeld(meld.id, cardId);
    };

    const cardWrap = box.querySelector(".meldCards");
    meld.cards.forEach(card => {
      const c = document.createElement("span");
      c.className = "card " + cardClasses(card);
      c.textContent = cardText(card);
      cardWrap.appendChild(c);
    });

    wrap.appendChild(box);
  });
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

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}
