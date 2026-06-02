const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));

const rooms = {};
const suits = ["♠", "♥", "♦", "♣"];
const ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const scoreValues = {"A":15,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":10,"Q":10,"K":10};

function beanerForRound(round){ return ranks[round - 1]; }
function isBeaner(card, round){ return card.rank === beanerForRound(round); }
function cardLabel(card){ return card ? `${card.rank}${card.suit}` : ""; }
function cardScore(card, round){ let v = isBeaner(card, round) ? 50 : scoreValues[card.rank]; return round === 13 ? v * 2 : v; }
function scoreHand(hand, round){ return hand.reduce((a,c)=>a+cardScore(c, round), 0); }
function cleanName(name){ return String(name || "Player").trim().slice(0,20) || "Player"; }
function shuffle(deck){ for(let i=deck.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; } return deck; }
function createDeck(){ const deck=[]; for(const suit of suits){ for(const rank of ranks){ deck.push({rank,suit,id:`${rank}${suit}-${Math.random().toString(36).slice(2,9)}`}); } } return shuffle(deck); }
function createRoomCode(){ let code; do code = Math.floor(1000 + Math.random()*9000).toString(); while(rooms[code]); return code; }
function rankFromValue(v){ if(v===1 || v===14) return "A"; if(v===11) return "J"; if(v===12) return "Q"; if(v===13) return "K"; return String(v); }

function runSequencesForLength(length){
  const seqs=[];
  for(let start=1; start<=13; start++){
    const seq=[];
    for(let i=0;i<length;i++){
      let v=start+i;
      if(v>13) v-=13;
      seq.push(rankFromValue(v));
    }
    seqs.push(seq);
  }
  return seqs;
}

function validateSet(cards, round){
  if(cards.length < 3) return null;
  const nonBeaners = cards.filter(c => !isBeaner(c, round));
  const targetRank = nonBeaners[0]?.rank || null;
  if(!targetRank) return {type:"set", rank:"Any", display:cards.map(cardLabel).join(" "), beanerPositions:[]};

  for(const card of nonBeaners) if(card.rank !== targetRank) return null;

  const seen = new Set();
  for(const card of nonBeaners){
    if(seen.has(card.suit)) return null;
    seen.add(card.suit);
  }

  return {
    type:"set",
    rank: targetRank,
    display: cards.map(cardLabel).join(" "),
    beanerPositions: cards.map((c,i)=>isBeaner(c,round) ? {index:i, represents:{rank:targetRank, suit:null}} : null).filter(Boolean)
  };
}

function validateRun(cards, round){
  if(cards.length < 3) return null;
  const nonBeaners = cards.filter(c => !isBeaner(c, round));
  const suit = nonBeaners[0]?.suit || null;
  if(!suit) return {type:"run", suit:"Any", display:cards.map(cardLabel).join(" "), ranks:null, beanerPositions:[]};
  for(const card of nonBeaners) if(card.suit !== suit) return null;

  const seqs = runSequencesForLength(cards.length);
  for(const seq of seqs){
    const used = new Set();
    let ok = true;
    for(const card of nonBeaners){
      let matched = false;
      for(let i=0;i<seq.length;i++){
        if(!used.has(i) && seq[i] === card.rank){
          used.add(i); matched = true; break;
        }
      }
      if(!matched){ ok = false; break; }
    }
    if(ok){
      return {
        type:"run",
        suit,
        ranks: seq,
        display: seq.map(r => `${r}${suit}`).join(" "),
        beanerPositions: cards.map((c,i)=>isBeaner(c,round) ? {index:i, represents:{rank:seq[i], suit}} : null).filter(Boolean)
      };
    }
  }
  return null;
}

function validateMeld(cards, round){ return validateSet(cards, round) || validateRun(cards, round); }

function refreshMeld(meld, round){
  const val = validateMeld(meld.cards, round);
  if(val){
    meld.type = val.type;
    meld.display = val.display;
    meld.rank = val.rank;
    meld.suit = val.suit;
    meld.ranks = val.ranks;
    meld.beanerPositions = val.beanerPositions || [];
  }
  return val;
}

function addCardToMeldWouldBeValid(meld, card, round){
  const val = validateMeld([...meld.cards, card], round);
  if(!val) return false;
  if(meld.type && val.type !== meld.type) return false;
  if(val.type === "set" && [...meld.cards, card].filter(c => !isBeaner(c, round)).length > 4) return false;
  return true;
}

function findSwapCandidate(meld, playedCard, round){
  const beaner = beanerForRound(round);
  const positions = meld.cards
    .map((c,i)=>c.rank === beaner ? {card:c,index:i} : null)
    .filter(Boolean);

  if(!positions.length) return null;

  const current = validateMeld(meld.cards, round);
  if(!current) return null;

  if(current.type === "set"){
    const targetRank = current.rank;
    if(playedCard.rank !== targetRank) return null;

    const naturalCount = meld.cards.filter(c => !isBeaner(c, round)).length;
    const wouldExceedFour = naturalCount + 1 > 4;

    // If the set would exceed four natural cards, swap is mandatory.
    // Otherwise, we still allow the player to choose the swap.
    return { index: positions[0].index, mandatory: wouldExceedFour };
  }

  if(current.type === "run"){
    for(const pos of current.beanerPositions || []){
      if(pos.represents.rank === playedCard.rank && pos.represents.suit === playedCard.suit){
        return { index: pos.index, mandatory: false };
      }
    }
  }

  return null;
}

function publicRoomState(roomCode){
  const room = rooms[roomCode];
  if(!room) return null;
  return {
    roomCode,
    phase: room.phase,
    round: room.round,
    beaner: beanerForRound(room.round),
    currentPlayerIndex: room.currentPlayerIndex,
    starterIndex: room.starterIndex,
    deckCount: room.deck.length,
    discardCount: room.discardPile.length,
    topDiscard: room.discardPile[room.discardPile.length - 1] || null,
    winnerMessage: room.winnerMessage || "",
    players: room.players.map((p,i)=>({
      id:p.id, name:p.name, cardCount:p.hand.length, totalScore:p.totalScore,
      lastRoundScore:p.lastRoundScore, isDown:p.isDown, isBot:!!p.isBot, index:i
    })),
    tableMelds: room.tableMelds.map(m=>({
      id:m.id, ownerId:m.ownerId, ownerName:room.players.find(p=>p.id===m.ownerId)?.name || "Player",
      type:m.type, cards:m.cards, display:m.display, beanerPositions:m.beanerPositions || []
    }))
  };
}

function emitRoom(roomCode){
  const room = rooms[roomCode]; if(!room) return;
  io.to(roomCode).emit("roomState", publicRoomState(roomCode));
  for(const p of room.players) if(!p.isBot) io.to(p.id).emit("yourHand", p.hand);
}

function resetRound(room){
  room.deck=createDeck(); room.discardPile=[]; room.tableMelds=[]; room.phase="playing"; room.winnerMessage="";
  room.currentPlayerIndex = room.starterIndex;
  for(const p of room.players){
    p.hand=[]; p.isDown=false; p.lastRoundScore=null;
    for(let i=0;i<7;i++) p.hand.push(room.deck.pop());
  }
  room.discardPile.push(room.deck.pop());
}

function endRound(roomCode, winnerId){
  const room = rooms[roomCode]; if(!room) return;
  const winner = room.players.find(p=>p.id===winnerId);
  for(const p of room.players){
    const points = p.id === winnerId ? 0 : scoreHand(p.hand, room.round);
    p.totalScore += points; p.lastRoundScore = points;
  }
  room.phase = room.round >= 13 ? "gameOver" : "roundOver";
  if(room.phase === "gameOver"){
    const winnerGame = [...room.players].sort((a,b)=>a.totalScore-b.totalScore)[0];
    room.winnerMessage = `${winnerGame.name} wins Beaners with ${winnerGame.totalScore} points!`;
  } else {
    room.winnerMessage = `${winner?.name || "Someone"} yelled BEANERS!`;
  }
}

function getPlayer(room, id){ return room.players.find(p=>p.id===id); }

function findFirstValidMeld(hand, round){
  for(let a=0;a<hand.length;a++) for(let b=a+1;b<hand.length;b++) for(let c=b+1;c<hand.length;c++){
    const cards=[hand[a],hand[b],hand[c]];
    const val=validateMeld(cards, round);
    if(val) return {cards, val};
  }
  return null;
}

function botTryLay(room, bot){
  const found = findFirstValidMeld(bot.hand, room.round);
  if(!found) return false;
  const ids = found.cards.map(c=>c.id);
  bot.hand = bot.hand.filter(c=>!ids.includes(c.id));
  bot.isDown = true;
  const meld = {id:Math.random().toString(36).slice(2,10), ownerId:bot.id, type:found.val.type, cards:found.cards};
  refreshMeld(meld, room.round);
  room.tableMelds.push(meld);
  return true;
}

function botTryAdd(room, bot){
  if(!bot.isDown) return false;
  for(const card of [...bot.hand]){
    for(const meld of room.tableMelds){
      const swap = findSwapCandidate(meld, card, room.round);
      if(swap){
        const oldBeaner = meld.cards[swap.index];
        meld.cards[swap.index] = card;
        bot.hand = bot.hand.filter(c=>c.id!==card.id);
        bot.hand.push(oldBeaner);
        refreshMeld(meld, room.round);
        return true;
      }
      if(addCardToMeldWouldBeValid(meld, card, room.round)){
        bot.hand = bot.hand.filter(c=>c.id!==card.id);
        meld.cards.push(card);
        refreshMeld(meld, room.round);
        return true;
      }
    }
  }
  return false;
}

function botDiscardIndex(bot, round){
  let best=0, bestScore=-1;
  bot.hand.forEach((c,i)=>{ const s=cardScore(c,round); if(s>bestScore){bestScore=s; best=i;} });
  return best;
}

function maybeRunBotTurn(roomCode){
  const room = rooms[roomCode]; if(!room || room.phase !== "playing") return;
  const current = room.players[room.currentPlayerIndex];
  if(!current?.isBot) return;
  setTimeout(()=>runBotTurn(roomCode), 700);
}

function runBotTurn(roomCode){
  const room = rooms[roomCode]; if(!room || room.phase !== "playing") return;
  const bot = room.players[room.currentPlayerIndex]; if(!bot?.isBot) return;

  const top = room.discardPile[room.discardPile.length-1];
  if(top && isBeaner(top, room.round)) bot.hand.push(room.discardPile.pop());
  else if(room.deck.length) bot.hand.push(room.deck.pop());
  else if(room.discardPile.length) bot.hand.push(room.discardPile.pop());

  let changed=true, safety=0;
  while(changed && safety<8){ changed=false; safety++; if(botTryLay(room,bot)) changed=true; if(botTryAdd(room,bot)) changed=true; }

  if(bot.hand.length === 0){
    if(room.deck.length) bot.hand.push(room.deck.pop());
    else if(room.discardPile.length) bot.hand.push(room.discardPile.pop());
  }
  if(bot.hand.length){
    const idx = botDiscardIndex(bot, room.round);
    room.discardPile.push(bot.hand.splice(idx,1)[0]);
  }
  if(bot.hand.length === 0){ endRound(roomCode, bot.id); emitRoom(roomCode); return; }

  room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
  emitRoom(roomCode);
  maybeRunBotTurn(roomCode);
}

function addBot(room){
  const names=["Bot Barry","Bot Brenda","Bot Bill","Bot Bella"];
  const used=new Set(room.players.map(p=>p.name));
  const name=names.find(n=>!used.has(n)) || `Bot ${room.players.length+1}`;
  room.players.push({id:`bot-${Math.random().toString(36).slice(2,10)}`, name, hand:[], isDown:false, totalScore:0, lastRoundScore:null, isBot:true});
}

io.on("connection", socket => {
  socket.on("createRoom", ({name}) => {
    const roomCode=createRoomCode();
    rooms[roomCode]={players:[{id:socket.id,name:cleanName(name),hand:[],isDown:false,totalScore:0,lastRoundScore:null,isBot:false}],deck:[],discardPile:[],tableMelds:[],phase:"lobby",round:1,starterIndex:0,currentPlayerIndex:0,winnerMessage:""};
    socket.join(roomCode); socket.emit("joinedRoom",{roomCode,playerId:socket.id}); emitRoom(roomCode);
  });

  socket.on("joinRoom", ({roomCode,name}) => {
    roomCode=String(roomCode||"").trim(); const room=rooms[roomCode];
    if(!room) return socket.emit("errorMessage","Room not found.");
    if(room.phase!=="lobby") return socket.emit("errorMessage","Game already started.");
    if(room.players.length>=4) return socket.emit("errorMessage","Room is full.");
    room.players.push({id:socket.id,name:cleanName(name),hand:[],isDown:false,totalScore:0,lastRoundScore:null,isBot:false});
    socket.join(roomCode); socket.emit("joinedRoom",{roomCode,playerId:socket.id}); emitRoom(roomCode);
  });

  socket.on("addBot", ({roomCode})=>{ const room=rooms[roomCode]; if(!room || room.phase!=="lobby") return; if(room.players.length>=4) return; addBot(room); emitRoom(roomCode); });
  socket.on("fillBots", ({roomCode})=>{ const room=rooms[roomCode]; if(!room || room.phase!=="lobby") return; while(room.players.length<4) addBot(room); emitRoom(roomCode); });

  socket.on("spinStarter", ({roomCode}) => {
    const room=rooms[roomCode]; if(!room || room.phase!=="lobby") return;
    if(room.players.length!==4) return socket.emit("errorMessage","Need exactly 4 players.");
    room.starterIndex=Math.floor(Math.random()*room.players.length);
    room.currentPlayerIndex=room.starterIndex;
    io.to(roomCode).emit("starterSpun",{starterName:room.players[room.starterIndex].name});
    emitRoom(roomCode);
  });

  socket.on("startGame", ({roomCode}) => {
    const room=rooms[roomCode]; if(!room || room.phase!=="lobby") return;
    if(room.players.length!==4) return socket.emit("errorMessage","Need exactly 4 players.");
    room.round=1; for(const p of room.players){p.totalScore=0; p.lastRoundScore=null;}
    resetRound(room); emitRoom(roomCode); maybeRunBotTurn(roomCode);
  });

  socket.on("nextRound", ({roomCode}) => {
    const room=rooms[roomCode]; if(!room || room.phase!=="roundOver") return;
    room.round += 1; room.starterIndex = (room.starterIndex + 1) % room.players.length;
    resetRound(room); emitRoom(roomCode); maybeRunBotTurn(roomCode);
  });

  socket.on("drawFromDeck", ({roomCode}) => {
    const room=rooms[roomCode]; if(!room || room.phase!=="playing") return;
    const current=room.players[room.currentPlayerIndex];
    if(!current || current.id!==socket.id) return socket.emit("errorMessage","Not your turn.");
    if(!room.deck.length) return socket.emit("errorMessage","Deck is empty.");
    current.hand.push(room.deck.pop()); emitRoom(roomCode);
  });

  socket.on("takeTopDiscard", ({roomCode}) => {
    const room=rooms[roomCode]; if(!room || room.phase!=="playing") return;
    const current=room.players[room.currentPlayerIndex];
    if(!current || current.id!==socket.id) return socket.emit("errorMessage","Not your turn.");
    if(!room.discardPile.length) return socket.emit("errorMessage","Discard pile is empty.");
    current.hand.push(room.discardPile.pop()); emitRoom(roomCode);
  });

  socket.on("takeAllDiscard", ({roomCode}) => {
    const room=rooms[roomCode]; if(!room || room.phase!=="playing") return;
    const current=room.players[room.currentPlayerIndex];
    if(!current || current.id!==socket.id) return socket.emit("errorMessage","Not your turn.");
    if(!room.discardPile.length) return socket.emit("errorMessage","Discard pile is empty.");
    current.hand.push(...room.discardPile.splice(0)); emitRoom(roomCode);
  });

  socket.on("layMeld", ({roomCode, cardIds}) => {
    const room=rooms[roomCode]; if(!room || room.phase!=="playing") return;
    const player=getPlayer(room,socket.id); if(!player) return;
    if(!Array.isArray(cardIds) || cardIds.length<3) return socket.emit("errorMessage","A meld needs at least 3 cards.");
    const cards=[];
    for(const id of cardIds){ const card=player.hand.find(c=>c.id===id); if(!card) return socket.emit("errorMessage","Card not found."); cards.push(card); }
    const val=validateMeld(cards, room.round); if(!val) return socket.emit("errorMessage","That is not a valid meld.");
    player.hand=player.hand.filter(c=>!cardIds.includes(c.id)); player.isDown=true;
    const meld={id:Math.random().toString(36).slice(2,10), ownerId:player.id, type:val.type, cards};
    refreshMeld(meld, room.round); room.tableMelds.push(meld); emitRoom(roomCode);
  });

  socket.on("playOnMeld", ({roomCode, meldId, cardId, swapBeaner}) => {
    const room=rooms[roomCode]; if(!room || room.phase!=="playing") return;
    const player=getPlayer(room,socket.id); if(!player) return;
    if(!player.isDown) return socket.emit("errorMessage","You need to be down before adding to melds.");
    const meld=room.tableMelds.find(m=>m.id===meldId);
    const card=player.hand.find(c=>c.id===cardId);
    if(!meld || !card) return socket.emit("errorMessage","Meld/card not found.");

    const swap = findSwapCandidate(meld, card, room.round);
    if(swap && (swapBeaner || swap.mandatory)){
      const oldBeaner = meld.cards[swap.index];
      meld.cards[swap.index] = card;
      player.hand = player.hand.filter(c=>c.id!==cardId);
      player.hand.push(oldBeaner);
      refreshMeld(meld, room.round);
      emitRoom(roomCode);
      return;
    }

    if(!addCardToMeldWouldBeValid(meld, card, room.round)) return socket.emit("errorMessage","That card does not fit that meld.");
    player.hand = player.hand.filter(c=>c.id!==cardId);
    meld.cards.push(card);
    refreshMeld(meld, room.round);
    emitRoom(roomCode);
  });

  socket.on("autoPlayCard", ({roomCode, cardId}) => {
    const room=rooms[roomCode]; if(!room || room.phase!=="playing") return;
    const player=getPlayer(room,socket.id); if(!player || !player.isDown) return socket.emit("errorMessage","You need to be down before autoplaying.");
    const card=player.hand.find(c=>c.id===cardId); if(!card) return;
    const valid = [];
    for(const meld of room.tableMelds){
      if(findSwapCandidate(meld, card, room.round) || addCardToMeldWouldBeValid(meld, card, room.round)) valid.push(meld.id);
    }
    if(valid.length === 0) return socket.emit("errorMessage","No valid meld found for that card.");
    if(valid.length > 1) return socket.emit("chooseMeldForCard", {cardId, meldIds:valid});
    socket.emit("autoPlayResolved", {cardId, meldId:valid[0]});
  });

  socket.on("discardCard", ({roomCode,cardId}) => {
    const room=rooms[roomCode]; if(!room || room.phase!=="playing") return;
    const current=room.players[room.currentPlayerIndex];
    if(!current || current.id!==socket.id) return socket.emit("errorMessage","Not your turn.");
    const idx=current.hand.findIndex(c=>c.id===cardId); if(idx<0) return socket.emit("errorMessage","Card not found.");
    room.discardPile.push(current.hand.splice(idx,1)[0]);
    if(current.hand.length===0){ endRound(roomCode,current.id); emitRoom(roomCode); return; }
    room.currentPlayerIndex=(room.currentPlayerIndex+1)%room.players.length;
    emitRoom(roomCode); maybeRunBotTurn(roomCode);
  });

  socket.on("disconnect", () => {
    for(const [roomCode,room] of Object.entries(rooms)){
      const idx=room.players.findIndex(p=>p.id===socket.id);
      if(idx>=0){ room.players.splice(idx,1); if(!room.players.length) delete rooms[roomCode]; else { if(room.currentPlayerIndex>=room.players.length) room.currentPlayerIndex=0; emitRoom(roomCode); maybeRunBotTurn(roomCode); } break; }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Beaners v4 running on port ${PORT}`));
