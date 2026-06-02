const socket = io();

let currentRoomCode = null;
let myPlayerId = null;
let currentHand = [];

const lobby = document.getElementById("lobby");
const game = document.getElementById("game");
const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");
const roomCodeEl = document.getElementById("roomCode");
const statusEl = document.getElementById("status");
const playersEl = document.getElementById("players");
const handEl = document.getElementById("hand");
const deckCountEl = document.getElementById("deckCount");
const discardCardEl = document.getElementById("discardCard");

document.getElementById("createBtn").addEventListener("click", () => {
  socket.emit("createRoom", { name: nameInput.value.trim() || "Player" });
});

document.getElementById("joinBtn").addEventListener("click", () => {
  socket.emit("joinRoom", {
    roomCode: roomInput.value.trim(),
    name: nameInput.value.trim() || "Player"
  });
});

document.getElementById("startBtn").addEventListener("click", () => {
  socket.emit("startGame", { roomCode: currentRoomCode });
});

document.getElementById("drawBtn").addEventListener("click", () => {
  socket.emit("drawCard", { roomCode: currentRoomCode });
});

document.getElementById("takeDiscardBtn").addEventListener("click", () => {
  socket.emit("takeDiscard", { roomCode: currentRoomCode });
});

socket.on("joinedRoom", ({ roomCode, playerId }) => {
  currentRoomCode = roomCode;
  myPlayerId = playerId;
  roomCodeEl.textContent = roomCode;
  lobby.classList.add("hidden");
  game.classList.remove("hidden");
});

socket.on("roomState", (state) => {
  if (!state) return;

  roomCodeEl.textContent = state.roomCode;
  deckCountEl.textContent = state.deckCount;

  const me = state.players.find((p) => p.id === myPlayerId);
  const current = state.players[state.currentPlayerIndex];

  if (!state.started) {
    statusEl.textContent = "Waiting for players. Share the room code.";
  } else if (current && current.id === myPlayerId) {
    statusEl.textContent = "Your turn.";
  } else {
    statusEl.textContent = current ? `${current.name}'s turn.` : "";
  }

  discardCardEl.textContent = state.topDiscard ? `${state.topDiscard.rank}${state.topDiscard.suit}` : "-";
  discardCardEl.className = "card large " + (state.topDiscard && ["♥", "♦"].includes(state.topDiscard.suit) ? "red" : "");

  playersEl.innerHTML = "";
  state.players.forEach((player, index) => {
    const li = document.createElement("li");
    const marker = index === state.currentPlayerIndex && state.started ? "👉 " : "";
    const self = player.id === myPlayerId ? " (you)" : "";
    li.textContent = `${marker}${player.name}${self} — ${player.cardCount} cards`;
    playersEl.appendChild(li);
  });
});

socket.on("yourHand", (hand) => {
  currentHand = hand;
  renderHand();
});

socket.on("errorMessage", (message) => {
  alert(message);
});

socket.on("gameOver", (message) => {
  alert(message);
  window.location.reload();
});

function renderHand() {
  handEl.innerHTML = "";

  currentHand.forEach((card) => {
    const div = document.createElement("button");
    div.className = "card " + (["♥", "♦"].includes(card.suit) ? "red" : "");
    div.textContent = `${card.rank}${card.suit}`;
    div.addEventListener("click", () => {
      socket.emit("discardCard", {
        roomCode: currentRoomCode,
        cardId: card.id
      });
    });
    handEl.appendChild(div);
  });
}
