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
const scoreValues = {"A":15,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":10,"Q":10,"K":10};

function beanerForRound(round){ return ranks[round - 1]; }
function cleanName(name){ return String(name || "Player").trim().slice(0,20) || "Player"; }
function cardLabel(card){ return card ? `${card.rank}${card.suit}` : ""; }
function isBeaner(card, round){ return card.rank === beanerForRound(round); }
function rankFromValue(value){ if(value===1||value===14)return "A"; if(value===11)return "J"; if(value===12)return "Q"; if(value===13)return "K"; return String(value); }

function createDeck(){
  const deck = [];
  for(const suit of suits){
    for(const rank of ranks){ deck.push({suit, rank, id:`${rank}${suit}-${Math.random().toString(36).slice(2,9)}`}); }
  }
  return shuffle(deck);
}
function shuffle(deck){
  for(let i=deck.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [deck[i], deck[j]]=[deck[j], deck[i]]; }
  return deck;
}
function createRoomCode(){ let code; do { code = Math.floor(1000 + Math.random()*9000).toString(); } while(rooms[code]); return code; }
function findPlayer(room, socketId){ return room.players.find(p => p.id === socketId); }
function cardScore(card, round){ let value = isBeaner(card, round) ? 50 : scoreValues[card.rank]; if(round === 13) value *= 2; return value; }
function scoreHand(hand, round){ return hand.reduce((sum, card) => sum + cardScore(card, round), 0); }

function runSequencesForLength(length){
  const sequences = [];
  for(let start=1; start<=13; start++){
    const seq = [];
    for(let i=0;i<length;i++){ let v=start+i; if(v>13)v-=13; seq.push(rankFromValue(v)); }
    sequences.push(seq);
  }
  return sequences;
}
function validateRun(cards, round){
  if(cards.length < 3) return null;
  const nonBeaners = cards.filter(c => !isBeaner(c, round));
  const suit = nonBeaners[0]?.suit;
  if(!suit) return { type:"run", suit:"Any", display: cards.map(cardLabel).join(" ") };
  if(nonBeaners.some(c => c.suit !== suit)) return null;
  for(const seq of runSequencesForLength(cards.length)){
    const used = new Set(); let ok = true;
    for(const card of nonBeaners){
      let matched = false;
      for(let i=0;i<seq.length;i++){ if(!used.has(i) && seq[i] === card.rank){ used.add(i); matched = true; break; } }
      if(!matched){ ok = false; break; }
    }
    if(ok) return { type:"run", suit, ranks:seq, display: seq.map(r => `${r}${suit}`).join(" ") };
  }
  return null;
}
function validateSet(cards, round){
  if(cards.length < 3) return null;
  const nonBeaners = cards.filter(c => !isBeaner(c, round));
  const rank = nonBeaners[0]?.rank;
  if(!rank) return { type:"set", rank:"Any", display: cards.map(cardLabel).join(" ") };
  if(nonBeaners.some(c => c.rank !== rank)) return null;
  const suitsSeen = new Set();
  for(const card of nonBeaners){ if(suitsSeen.has(card.suit)) return null; suitsSeen.add(card.suit); }
  if(cards.length > 4) return null;
  return { type:"set", rank, display: cards.map(cardLabel).join(" ") };
}
function validateMeld(cards, round){ return validateRun(cards, round) || validateSet(cards, round); }
function addCardToMeldWouldBeValid(meld, card, round){
  const testCards = [...meld.cards, card];
  const validation = validateMeld(testCards, round);
  if(!validation) return false;
  if(meld.type === "set" && validation.type !== "set") return false;
  if(meld.type === "run" && validation.type !== "run") return false;
  return true;
}
function publicRoomState(roomCode){
  const room = rooms[roomCode]; if(!room) return null;
  return {
    roomCode, phase:room.phase, round:room.round, beaner:beanerForRound(room.round), starterIndex:room.starterIndex,
    currentPlayerIndex:room.currentPlayerIndex, topDiscard:room.discardPile[room.discardPile.length-1] || null,
    discardCount:room.discardPile.length, deckCount:room.deck.length, winnerMessage:room.winnerMessage || "", roundScores:room.roundScores,
    tableMelds:room.tableMelds.map(m => ({ id:m.id, ownerId:m.ownerId, ownerName:room.players.find(p => p.id === m.ownerId)?.name || "Player", type:m.type, cards:m.cards, display:m.display })),
    players:room.players.map((p,index) => ({ id:p.id, name:p.name, cardCount:p.hand.length, totalScore:p.totalScore, lastRoundScore:p.lastRoundScore, isDown:p.isDown, index }))
  };
}
function emitRoom(roomCode){ const room=rooms[roomCode]; if(!room)return; io.to(roomCode).emit("roomState", publicRoomState(roomCode)); for(const p of room.players) io.to(p.id).emit("yourHand", p.hand); }
function resetForNewRound(room){
  room.deck = createDeck(); room.discardPile=[]; room.tableMelds=[]; room.phase="playing"; room.winnerMessage=""; room.currentPlayerIndex=room.starterIndex;
  for(const p of room.players){ p.hand=[]; p.isDown=false; p.lastRoundScore=null; for(let i=0;i<7;i++) p.hand.push(room.deck.pop()); }
  room.discardPile.push(room.deck.pop());
}
function endRound(roomCode, winnerId){
  const room = rooms[roomCode]; if(!room)return;
  const winner = room.players.find(p => p.id === winnerId);
  const row = { round:room.round, beaner:beanerForRound(room.round), scores:{} };
  for(const p of room.players){ const points = p.id === winnerId ? 0 : scoreHand(p.hand, room.round); p.totalScore += points; p.lastRoundScore = points; row.scores[p.id] = points; }
  room.roundScores.push(row); room.phase="roundOver"; room.winnerMessage = `${winner?.name || "Someone"} yelled BEANERS!`;
  if(room.round >= 13){ room.phase="gameOver"; const sorted=[...room.players].sort((a,b)=>a.totalScore-b.totalScore); room.winnerMessage = `${sorted[0].name} wins Beaners with ${sorted[0].totalScore} points!`; }
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({name}) => {
    const roomCode = createRoomCode();
    rooms[roomCode] = { players:[{id:socket.id,name:cleanName(name),hand:[],isDown:false,totalScore:0,lastRoundScore:null}], deck:[], discardPile:[], tableMelds:[], phase:"lobby", round:1, roundScores:[], starterIndex:0, currentPlayerIndex:0, winnerMessage:"" };
    socket.join(roomCode); socket.emit("joinedRoom", {roomCode, playerId:socket.id}); emitRoom(roomCode);
  });
  socket.on("joinRoom", ({roomCode,name}) => {
    roomCode = String(roomCode || "").trim();
    if(!rooms[roomCode]) return socket.emit("errorMessage", "Room not found.");
    const room = rooms[roomCode];
    if(room.phase !== "lobby") return socket.emit("errorMessage", "Game already started.");
    if(room.players.length >= 4) return socket.emit("errorMessage", "Room is full.");
    room.players.push({id:socket.id,name:cleanName(name),hand:[],isDown:false,totalScore:0,lastRoundScore:null});
    socket.join(roomCode); socket.emit("joinedRoom", {roomCode, playerId:socket.id}); emitRoom(roomCode);
  });
  socket.on("spinStarter", ({roomCode}) => {
    const room = rooms[roomCode]; if(!room || room.phase !== "lobby") return;
    if(room.players.length !== 4) return socket.emit("errorMessage", "Need exactly 4 players.");
    room.starterIndex = Math.floor(Math.random()*room.players.length); room.currentPlayerIndex = room.starterIndex;
    io.to(roomCode).emit("starterSpun", { starterIndex:room.starterIndex, starterName:room.players[room.starterIndex].name }); emitRoom(roomCode);
  });
  socket.on("startGame", ({roomCode}) => {
    const room = rooms[roomCode]; if(!room || room.phase !== "lobby") return;
    if(room.players.length !== 4) return socket.emit("errorMessage", "Need exactly 4 players.");
    room.round = 1; room.roundScores=[]; for(const p of room.players){ p.totalScore=0; p.lastRoundScore=null; }
    resetForNewRound(room); emitRoom(roomCode);
  });
  socket.on("nextRound", ({roomCode}) => { const room=rooms[roomCode]; if(!room || room.phase !== "roundOver") return; room.round += 1; room.starterIndex=(room.starterIndex+1)%room.players.length; resetForNewRound(room); emitRoom(roomCode); });
  socket.on("drawFromDeck", ({roomCode}) => { const room=rooms[roomCode]; if(!room || room.phase!=="playing") return; const p=room.players[room.currentPlayerIndex]; if(!p || p.id!==socket.id) return socket.emit("errorMessage","Not your turn."); if(!room.deck.length) return socket.emit("errorMessage","Deck is empty."); p.hand.push(room.deck.pop()); emitRoom(roomCode); });
  socket.on("takeTopDiscard", ({roomCode}) => { const room=rooms[roomCode]; if(!room || room.phase!=="playing") return; const p=room.players[room.currentPlayerIndex]; if(!p || p.id!==socket.id) return socket.emit("errorMessage","Not your turn."); const card=room.discardPile.pop(); if(!card) return socket.emit("errorMessage","Discard pile is empty."); p.hand.push(card); emitRoom(roomCode); });
  socket.on("takeAllDiscard", ({roomCode}) => { const room=rooms[roomCode]; if(!room || room.phase!=="playing") return; const p=room.players[room.currentPlayerIndex]; if(!p || p.id!==socket.id) return socket.emit("errorMessage","Not your turn."); if(!room.discardPile.length) return socket.emit("errorMessage","Discard pile is empty."); p.hand.push(...room.discardPile.splice(0)); emitRoom(roomCode); });
  socket.on("layMeld", ({roomCode,cardIds}) => { const room=rooms[roomCode]; if(!room || room.phase!=="playing") return; const p=findPlayer(room,socket.id); if(!p)return; if(!Array.isArray(cardIds)||cardIds.length<3)return socket.emit("errorMessage","A meld needs at least 3 cards."); const cards=[]; for(const id of cardIds){ const card=p.hand.find(c=>c.id===id); if(!card)return socket.emit("errorMessage","Card not found in your hand."); cards.push(card); } const validation=validateMeld(cards,room.round); if(!validation)return socket.emit("errorMessage","That is not a valid meld."); p.hand=p.hand.filter(c=>!cardIds.includes(c.id)); p.isDown=true; room.tableMelds.push({id:Math.random().toString(36).slice(2,10), ownerId:p.id, type:validation.type, cards, display:validation.display}); emitRoom(roomCode); });
  socket.on("addToMeld", ({roomCode,meldId,cardId}) => { const room=rooms[roomCode]; if(!room || room.phase!=="playing") return; const p=findPlayer(room,socket.id); if(!p)return; if(!p.isDown)return socket.emit("errorMessage","You need to be down before adding to melds."); const meld=room.tableMelds.find(m=>m.id===meldId); if(!meld)return socket.emit("errorMessage","Meld not found."); const card=p.hand.find(c=>c.id===cardId); if(!card)return socket.emit("errorMessage","Card not found in your hand."); if(!addCardToMeldWouldBeValid(meld,card,room.round))return socket.emit("errorMessage","That card does not fit that meld."); p.hand=p.hand.filter(c=>c.id!==cardId); meld.cards.push(card); const validation=validateMeld(meld.cards,room.round); meld.display=validation?.display || meld.cards.map(cardLabel).join(" "); emitRoom(roomCode); });
  socket.on("discardCard", ({roomCode,cardId}) => { const room=rooms[roomCode]; if(!room || room.phase!=="playing") return; const p=room.players[room.currentPlayerIndex]; if(!p || p.id!==socket.id)return socket.emit("errorMessage","Not your turn."); const idx=p.hand.findIndex(c=>c.id===cardId); if(idx===-1)return socket.emit("errorMessage","Card not found in your hand."); const [discarded]=p.hand.splice(idx,1); room.discardPile.push(discarded); if(p.hand.length===0){ endRound(roomCode,p.id); emitRoom(roomCode); return; } room.currentPlayerIndex=(room.currentPlayerIndex+1)%room.players.length; emitRoom(roomCode); });
  socket.on("disconnect", () => { for(const [roomCode,room] of Object.entries(rooms)){ const idx=room.players.findIndex(p=>p.id===socket.id); if(idx!==-1){ room.players.splice(idx,1); if(!room.players.length) delete rooms[roomCode]; else { if(room.currentPlayerIndex>=room.players.length)room.currentPlayerIndex=0; io.to(roomCode).emit("errorMessage","A player disconnected. Refresh/recreate the room if needed."); emitRoom(roomCode); } break; } } });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Beaners running on port ${PORT}`));
