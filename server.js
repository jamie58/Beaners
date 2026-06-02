const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {};

const suits = ["♠", "♥", "♦", "♣"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function createDeck() {
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank, id: `${rank}${suit}` });
    }
  }
  return shuffle(deck);
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function createRoomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function publicRoomState(roomCode) {
  const room = rooms[roomCode];
  if (!room) return null;

  return {
    roomCode,
    started: room.started,
    currentPlayerIndex: room.currentPlayerIndex,
    topDiscard: room.discardPile[room.discardPile.length - 1] || null,
    deckCount: room.deck.length,
    players: room.players.map((p, index) => ({
      id: p.id,
      name: p.name,
      cardCount: p.hand.length,
      index
    }))
  };
}

function emitRoom(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  io.to(roomCode).emit("roomState", publicRoomState(roomCode));

  for (const player of room.players) {
    io.to(player.id).emit("yourHand", player.hand);
  }
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name }) => {
    const roomCode = createRoomCode();

    rooms[roomCode] = {
      players: [{ id: socket.id, name: name || "Player", hand: [] }],
      deck: [],
      discardPile: [],
      started: false,
      currentPlayerIndex: 0
    };

    socket.join(roomCode);
    socket.emit("joinedRoom", { roomCode, playerId: socket.id });
    emitRoom(roomCode);
  });

  socket.on("joinRoom", ({ roomCode, name }) => {
    roomCode = String(roomCode || "").trim();

    if (!rooms[roomCode]) {
      socket.emit("errorMessage", "Room not found.");
      return;
    }

    if (rooms[roomCode].started) {
      socket.emit("errorMessage", "Game already started.");
      return;
    }

    if (rooms[roomCode].players.length >= 4) {
      socket.emit("errorMessage", "Room is full.");
      return;
    }

    rooms[roomCode].players.push({ id: socket.id, name: name || "Player", hand: [] });
    socket.join(roomCode);
    socket.emit("joinedRoom", { roomCode, playerId: socket.id });
    emitRoom(roomCode);
  });

  socket.on("startGame", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;

    if (room.players.length < 2) {
      socket.emit("errorMessage", "Need at least 2 players.");
      return;
    }

    room.deck = createDeck();
    room.discardPile = [];
    room.started = true;
    room.currentPlayerIndex = 0;

    for (const player of room.players) {
      player.hand = [];
      for (let i = 0; i < 7; i++) {
        player.hand.push(room.deck.pop());
      }
    }

    room.discardPile.push(room.deck.pop());
    emitRoom(roomCode);
  });

  socket.on("drawCard", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || !room.started) return;

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit("errorMessage", "Not your turn.");
      return;
    }

    if (room.deck.length === 0) {
      socket.emit("errorMessage", "Deck is empty.");
      return;
    }

    currentPlayer.hand.push(room.deck.pop());
    emitRoom(roomCode);
  });

  socket.on("takeDiscard", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || !room.started) return;

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit("errorMessage", "Not your turn.");
      return;
    }

    const card = room.discardPile.pop();
    if (card) currentPlayer.hand.push(card);
    emitRoom(roomCode);
  });

  socket.on("discardCard", ({ roomCode, cardId }) => {
    const room = rooms[roomCode];
    if (!room || !room.started) return;

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit("errorMessage", "Not your turn.");
      return;
    }

    const cardIndex = currentPlayer.hand.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) return;

    const [discarded] = currentPlayer.hand.splice(cardIndex, 1);
    room.discardPile.push(discarded);

    if (currentPlayer.hand.length === 0) {
      io.to(roomCode).emit("gameOver", `${currentPlayer.name} wins!`);
      delete rooms[roomCode];
      return;
    }

    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
    emitRoom(roomCode);
  });

  socket.on("disconnect", () => {
    for (const [roomCode, room] of Object.entries(rooms)) {
      const playerIndex = room.players.findIndex((p) => p.id === socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);

        if (room.players.length === 0) {
          delete rooms[roomCode];
        } else {
          if (room.currentPlayerIndex >= room.players.length) {
            room.currentPlayerIndex = 0;
          }
          emitRoom(roomCode);
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Card game running on port ${PORT}`);
});
