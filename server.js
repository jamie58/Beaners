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

function nowMs(){ return Date.now(); }
function startTurnTimer(room){ room.turnStartedAt = nowMs(); }
function finishTurnTimer(room, player){
  if(!room.turnStartedAt || !player) return;
  const elapsed = Math.max(0, nowMs() - room.turnStartedAt);
  player.turnTimeTotalMs = (player.turnTimeTotalMs || 0) + elapsed;
  player.turnCount = (player.turnCount || 0) + 1;
}
function averageTurnSeconds(player){
  if(!player.turnCount) return null;
  return Math.round((player.turnTimeTotalMs / player.turnCount) / 100) / 10;
}
function cleanName(name){ return String(name || "Player").trim().slice(0,20) || "Player"; }
function shuffle(deck){ for(let i=deck.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; } return deck; }
function createDeck(){ const deck=[]; for(const suit of suits){ for(const rank of ranks){ deck.push({rank,suit,id:`${rank}${suit}-${Math.random().toString(36).slice(2,9)}`}); } } return shuffle(deck); }

function recycleDiscardIntoDeck(room){
  if(room.deck.length > 0) return true;

  // Keep the top discard card face-up, shuffle the rest, flip it over as the new draw deck.
  if(room.discardPile.length <= 1) return false;

  const topDiscard = room.discardPile.pop();
  room.deck = shuffle(room.discardPile.splice(0));
  room.discardPile = [topDiscard];

  return room.deck.length > 0;
}

function createRoomCode(){ let code; do code = Math.floor(1000 + Math.random()*9000).toString(); while(rooms[code]); return code; }
function createPlayerToken(){ return "pt-" + Math.random().toString(36).slice(2) + Date.now().toString(36); }
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

  // All Beaners can form a generic run, but their exact represented cards are ambiguous.
  if(!suit){
    return {
      type:"run",
      suit:"Any",
      display:cards.map(cardLabel).join(" "),
      beanerPositions:cards.map((c,i)=>({index:i, represents:{rank:"Any", suit:"Any"}}))
    };
  }

  // Every non-Beaner in the run must be the same suit.
  for(const card of nonBeaners){
    if(card.suit !== suit) return null;
  }

  // Runs must be laid in actual left-to-right order.
  // Example valid: 8♠ Beaner 10♠ where Beaner = 9♠.
  // Example invalid: 8♠ 10♠ Beaner A♦ Beaner 6♠.
  for(const sequence of runSequencesForLength(cards.length)){
    let ok = true;
    const beanerPositions = [];

    for(let i = 0; i < cards.length; i++){
      const card = cards[i];
      const expectedRank = sequence[i];

      if(isBeaner(card, round)){
        beanerPositions.push({
          index:i,
          represents:{rank:expectedRank, suit}
        });
        continue;
      }

      if(card.suit !== suit || card.rank !== expectedRank){
        ok = false;
        break;
      }
    }

    if(ok){
      return {
        type:"run",
        suit,
        ranks:sequence,
        display:sequence.map(r => `${r}${suit}`).join(" "),
        beanerPositions
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


function rankValue(rank){
  if(rank === "A") return 1;
  if(rank === "J") return 11;
  if(rank === "Q") return 12;
  if(rank === "K") return 13;
  return Number(rank);
}
function nextRank(rank){
  let v = rankValue(rank) + 1;
  if(v > 13) v = 1;
  return rankFromValue(v);
}
function prevRank(rank){
  let v = rankValue(rank) - 1;
  if(v < 1) v = 13;
  return rankFromValue(v);
}
function applyValidationToMeld(meld, validation){
  meld.type = validation.type;
  meld.display = validation.display;
  meld.rank = validation.rank;
  meld.suit = validation.suit;
  meld.ranks = validation.ranks;
  meld.beanerPositions = validation.beanerPositions || [];
}
function trySmartAddToRun(meld, card, round){
  if(meld.type !== "run") return null;
  const current = validateMeld(meld.cards, round);
  if(!current || current.type !== "run" || !current.ranks || !current.suit) return null;
  if(!isBeaner(card, round) && card.suit !== current.suit) return null;

  const frontRank = prevRank(current.ranks[0]);
  const backRank = nextRank(current.ranks[current.ranks.length - 1]);

  if(!isBeaner(card, round)){
    if(card.rank === frontRank){
      const newCards = [card, ...meld.cards];
      const val = validateMeld(newCards, round);
      if(val && val.type === "run") return { cards:newCards, validation:val };
    }
    if(card.rank === backRank){
      const newCards = [...meld.cards, card];
      const val = validateMeld(newCards, round);
      if(val && val.type === "run") return { cards:newCards, validation:val };
    }
    return null;
  }

  let newCards = [...meld.cards, card];
  let val = validateMeld(newCards, round);
  if(val && val.type === "run") return { cards:newCards, validation:val };

  newCards = [card, ...meld.cards];
  val = validateMeld(newCards, round);
  if(val && val.type === "run") return { cards:newCards, validation:val };

  return null;
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
    discardPreview: room.discardPile.slice(-9).reverse(),
    winnerMessage: room.winnerMessage || "",
    turnStartedAt: room.turnStartedAt || null,
    roundScores: room.roundScores || [],
    players: room.players.map((p,i)=>({
      id:p.id, name:p.name, cardCount:p.hand.length, totalScore:p.totalScore,
      lastRoundScore:p.lastRoundScore, isDown:p.isDown, isBot:!!p.isBot, disconnected:!!p.disconnected, hasPickedUp:!!p.hasPickedUp, seatKey:p.seatKey || null, avgTurnSeconds: averageTurnSeconds(p), turnCount:p.turnCount || 0, index:i
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
    p.hand=[]; p.isDown=false; p.lastRoundScore=null; p.hasPickedUp=false; p.turnTimeTotalMs = 0; p.turnCount = 0;
    for(let i=0;i<7;i++) p.hand.push(room.deck.pop());
  }
  room.discardPile.push(room.deck.pop());
  startTurnTimer(room);
}

function endRound(roomCode, winnerId){
  const room = rooms[roomCode]; if(!room) return;
  const winner = room.players.find(p=>p.id===winnerId);
  const scoreRow = { round: room.round, beaner: beanerForRound(room.round), scores: {} };
  for(const p of room.players){
    const points = p.id === winnerId ? 0 : scoreHand(p.hand, room.round);
    p.totalScore += points; p.lastRoundScore = points; scoreRow.scores[p.id] = points;
  }
  room.roundScores = room.roundScores || [];
  room.roundScores.push(scoreRow);
  room.phase = room.round >= 13 ? "gameOver" : "roundOver";
  if(room.phase === "gameOver"){
    const winnerGame = [...room.players].sort((a,b)=>a.totalScore-b.totalScore)[0];
    room.winnerMessage = `${winnerGame.name} wins Beaners with ${winnerGame.totalScore} points!`;
  } else {
    room.winnerMessage = `${winner?.name || "Someone"} yelled BEANERS!`;
    scheduleAutoNextRound(roomCode);
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
      if(meld.type === "run"){
        const smart = trySmartAddToRun(meld, card, room.round);
        if(smart){
          bot.hand = bot.hand.filter(c=>c.id!==card.id);
          meld.cards = smart.cards;
          applyValidationToMeld(meld, smart.validation);
          return true;
        }
      } else if(addCardToMeldWouldBeValid(meld, card, room.round)){
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
  else if(recycleDiscardIntoDeck(room)) bot.hand.push(room.deck.pop());
  else if(room.discardPile.length) bot.hand.push(room.discardPile.pop());
  bot.hasPickedUp = true;

  let changed=true, safety=0;
  while(changed && safety<8){ changed=false; safety++; if(botTryLay(room,bot)) changed=true; if(botTryAdd(room,bot)) changed=true; }

  if(bot.hand.length === 0){
    if(room.deck.length) bot.hand.push(room.deck.pop());
    else if(room.discardPile.length) bot.hand.push(room.discardPile.pop());
  }
  if(bot.hand.length){
    finishTurnTimer(room, bot);
    const idx = botDiscardIndex(bot, room.round);
    room.discardPile.push(bot.hand.splice(idx,1)[0]);
  }
  if(bot.hand.length === 0){ endRound(roomCode, bot.id); emitRoom(roomCode); return; }

  bot.hasPickedUp = false;
  room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
  room.players[room.currentPlayerIndex].hasPickedUp = false;
  startTurnTimer(room);
  emitRoom(roomCode);
  maybeRunBotTurn(roomCode);
}

function addBot(room){
  const names=["Bot Barry","Bot Brenda","Bot Bill","Bot Bella"];
  const used=new Set(room.players.map(p=>p.name));
  const name=names.find(n=>!used.has(n)) || `Bot ${room.players.length+1}`;

  const seats = ["top","left","right","bottom"];
  const usedSeats = new Set(room.players.map(p => p.seatKey).filter(Boolean));
  const seatKey = seats.find(s => !usedSeats.has(s)) || null;

  if(!seatKey) return false;

  room.players.push({
    id:`bot-${Math.random().toString(36).slice(2,10)}`,
    token:createPlayerToken(),
    name,
    hand:[],
    isDown:false,
    totalScore:0,
    lastRoundScore:null,
    isBot:true,
    disconnected:false,
    hasPickedUp:false,
    seatKey
  });

  return true;
}



function scheduleAutoNextRound(roomCode){
  const room = rooms[roomCode];
  if(!room || room.phase !== "roundOver") return;

  if(room.autoNextRoundTimer) clearTimeout(room.autoNextRoundTimer);

  room.autoNextRoundTimer = setTimeout(() => {
    const currentRoom = rooms[roomCode];
    if(!currentRoom || currentRoom.phase !== "roundOver") return;

    currentRoom.round += 1;
    currentRoom.starterIndex = (currentRoom.starterIndex + 1) % currentRoom.players.length;
    resetRound(currentRoom);
    emitRoom(roomCode);
    maybeRunBotTurn(roomCode);
  }, 15000);
}

io.on("connection", socket => {
  socket.on("createRoom", ({name, playerToken}) => {
    const roomCode=createRoomCode();
    const token = playerToken || createPlayerToken();
    rooms[roomCode]={players:[{id:socket.id,token,name:cleanName(name),hand:[],isDown:false,totalScore:0,lastRoundScore:null,isBot:false,disconnected:false,hasPickedUp:false,hasPickedUp:false,seatKey:null}],deck:[],discardPile:[],tableMelds:[],phase:"lobby",round:1,starterIndex:0,currentPlayerIndex:0,winnerMessage:"",roundScores:[]};
    socket.join(roomCode); socket.emit("joinedRoom",{roomCode,playerId:socket.id,playerToken:token}); emitRoom(roomCode);
  });

  socket.on("joinRoom", ({roomCode,name,playerToken}) => {
    roomCode=String(roomCode||"").replace(/\D/g, "").trim(); const room=rooms[roomCode];
    if(!room) return socket.emit("errorMessage","Room not found.");

    const token = playerToken || createPlayerToken();
    const existing = room.players.find(p => p.token === token && !p.isBot);
    if(existing){
      const oldId = existing.id;
      existing.id = socket.id;
      existing.disconnected = false;
      if(name) existing.name = cleanName(name);
      for(const meld of room.tableMelds){ if(meld.ownerId === oldId) meld.ownerId = socket.id; }
      socket.join(roomCode);
      socket.emit("joinedRoom",{roomCode,playerId:socket.id,playerToken:token});
      emitRoom(roomCode);
      return;
    }

    if(room.phase!=="lobby") return socket.emit("errorMessage","Game already started.");
    if(room.players.length>=4) return socket.emit("errorMessage","Room is full.");
    room.players.push({id:socket.id,token,name:cleanName(name),hand:[],isDown:false,totalScore:0,lastRoundScore:null,isBot:false,disconnected:false,hasPickedUp:false,hasPickedUp:false,seatKey:null});
    socket.join(roomCode); socket.emit("joinedRoom",{roomCode,playerId:socket.id,playerToken:token}); emitRoom(roomCode);
  });

  socket.on("addBot", ({roomCode})=>{
    const room=rooms[roomCode];
    if(!room || room.phase!=="lobby") return;
    if(room.players.length>=4) return socket.emit("errorMessage","Room is already full.");
    if(!addBot(room)) return socket.emit("errorMessage","No empty seats available.");
    emitRoom(roomCode);
  });
  socket.on("fillBots", ({roomCode})=>{
    const room=rooms[roomCode];
    if(!room || room.phase!=="lobby") return;
    while(room.players.length<4){
      if(!addBot(room)) break;
    }
    emitRoom(roomCode);
  });


  socket.on("chooseSeat", ({ roomCode, seatKey }) => {
    roomCode = String(roomCode || "").replace(/\D/g, "").trim();
    const room = rooms[roomCode];
    if(!room || room.phase !== "lobby") return;
    const allowed = ["top","left","right","bottom"];
    if(!allowed.includes(seatKey)) return socket.emit("errorMessage","Invalid seat.");

    const player = room.players.find(p => p.id === socket.id && !p.isBot);
    if(!player) return;

    const taken = room.players.find(p => p.seatKey === seatKey && p.id !== player.id);

    // If a bot is sitting there, let the real player claim the seat and remove the bot.
    if(taken && taken.isBot){
      const botIndex = room.players.findIndex(p => p.id === taken.id);
      if(botIndex !== -1) room.players.splice(botIndex, 1);
    } else if(taken) {
      return socket.emit("errorMessage","That seat is already taken by another player.");
    }

    player.seatKey = seatKey;
    emitRoom(roomCode);
  });

  socket.on("spinStarter", ({roomCode}) => {
    const room=rooms[roomCode]; if(!room || room.phase!=="lobby") return;
    if(room.players.length < 2) return socket.emit("errorMessage","Need at least 2 players.");
    room.starterIndex=Math.floor(Math.random()*room.players.length);
    room.currentPlayerIndex=room.starterIndex;
    io.to(roomCode).emit("starterSpun",{starterName:room.players[room.starterIndex].name});
    emitRoom(roomCode);
  });

  socket.on("startGame", ({roomCode}) => {
    const room=rooms[roomCode]; if(!room || room.phase!=="lobby") return;
    if(room.players.length < 2) return socket.emit("errorMessage","Need at least 2 players.");
    if(room.players.length > 4) return socket.emit("errorMessage","Maximum 4 players.");
    if(room.players.some(p => !p.seatKey)) return socket.emit("errorMessage","Everyone must choose a seat first.");
    const seatOrder = ["bottom","left","top","right"];
    room.players.sort((a,b) => seatOrder.indexOf(a.seatKey) - seatOrder.indexOf(b.seatKey));
    room.round=1; room.roundScores=[]; for(const p of room.players){p.totalScore=0; p.lastRoundScore=null;}
    resetRound(room); emitRoom(roomCode); maybeRunBotTurn(roomCode);
  });

  socket.on("nextRound", ({roomCode}) => {
    const room=rooms[roomCode]; if(!room || room.phase!=="roundOver") return;
    if(room.autoNextRoundTimer) clearTimeout(room.autoNextRoundTimer);
    room.round += 1; room.starterIndex = (room.starterIndex + 1) % room.players.length;
    resetRound(room); emitRoom(roomCode); maybeRunBotTurn(roomCode);
  });

  socket.on("drawFromDeck", ({roomCode}) => {
    const room=rooms[roomCode]; if(!room || room.phase!=="playing") return;
    const current=room.players[room.currentPlayerIndex];
    if(!current || current.id!==socket.id) return socket.emit("errorMessage","Not your turn.");
    if(current.hasPickedUp) return socket.emit("errorMessage","You have already picked up this turn. Play cards, then discard.");
    if(!recycleDiscardIntoDeck(room)) return socket.emit("errorMessage","Deck and discard pile are empty.");
    current.hand.push(room.deck.pop());
    current.hasPickedUp = true;
    emitRoom(roomCode);
  });

  socket.on("takeTopDiscard", ({roomCode}) => {
    const room=rooms[roomCode]; if(!room || room.phase!=="playing") return;
    const current=room.players[room.currentPlayerIndex];
    if(!current || current.id!==socket.id) return socket.emit("errorMessage","Not your turn.");
    if(current.hasPickedUp) return socket.emit("errorMessage","You have already picked up this turn. Play cards, then discard.");
    if(!room.discardPile.length) return socket.emit("errorMessage","Discard pile is empty.");
    current.hand.push(room.discardPile.pop());
    current.hasPickedUp = true;
    emitRoom(roomCode);
  });

  socket.on("takeAllDiscard", ({roomCode}) => {
    const room=rooms[roomCode]; if(!room || room.phase!=="playing") return;
    const current=room.players[room.currentPlayerIndex];
    if(!current || current.id!==socket.id) return socket.emit("errorMessage","Not your turn.");
    if(current.hasPickedUp) return socket.emit("errorMessage","You have already picked up this turn. Play cards, then discard.");
    if(!room.discardPile.length) return socket.emit("errorMessage","Discard pile is empty.");
    current.hand.push(...room.discardPile.splice(0));
    current.hasPickedUp = true;
    emitRoom(roomCode);
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

    if(meld.type === "run"){
      const smart = trySmartAddToRun(meld, card, room.round);
      if(!smart) return socket.emit("errorMessage","That card does not fit at either end of that run.");
      player.hand = player.hand.filter(c=>c.id!==cardId);
      meld.cards = smart.cards;
      applyValidationToMeld(meld, smart.validation);
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
    if(!current.hasPickedUp) return socket.emit("errorMessage","You must pick up before discarding.");
    const idx=current.hand.findIndex(c=>c.id===cardId); if(idx<0) return socket.emit("errorMessage","Card not found.");
    finishTurnTimer(room, current);
    room.discardPile.push(current.hand.splice(idx,1)[0]);
    if(current.hand.length===0){ endRound(roomCode,current.id); emitRoom(roomCode); return; }
    current.hasPickedUp = false;
    room.currentPlayerIndex=(room.currentPlayerIndex+1)%room.players.length;
    room.players[room.currentPlayerIndex].hasPickedUp = false;
    startTurnTimer(room);
    emitRoom(roomCode); maybeRunBotTurn(roomCode);
  });


  socket.on("checkRoom", ({ roomCode }) => {
    const code = String(roomCode || "").replace(/\D/g, "").trim();
    socket.emit("roomCheckResult", { roomCode: code, exists: !!rooms[code] });
  });

  socket.on("rejoinRoom", ({ roomCode, playerToken }) => {
    roomCode = String(roomCode || "").replace(/\D/g, "").trim();
    const room = rooms[roomCode];
    if (!room || !playerToken) {
      socket.emit("rejoinFailed");
      return;
    }

    const player = room.players.find(p => p.token === playerToken && !p.isBot);
    if (!player) {
      socket.emit("rejoinFailed");
      return;
    }

    const oldId = player.id;
    player.id = socket.id;
    player.disconnected = false;

    for (const meld of room.tableMelds) {
      if (meld.ownerId === oldId) meld.ownerId = socket.id;
    }

    socket.join(roomCode);
    socket.emit("joinedRoom", { roomCode, playerId: socket.id, playerToken });
    emitRoom(roomCode);
  });



  socket.on("exitGame", ({ roomCode }) => {
    const room = rooms[String(roomCode || "").trim()];
    if(!room) return;

    const idx = room.players.findIndex(p => p.id === socket.id && !p.isBot);
    if(idx < 0) return;

    const old = room.players[idx];
    const botName = `${old.name} Bot`;

    room.players[idx] = {
      ...old,
      id: `bot-${Math.random().toString(36).slice(2,10)}`,
      token: createPlayerToken(),
      name: botName,
      isBot: true,
      disconnected: false,
      hasPickedUp: old.hasPickedUp || false
    };

    for(const meld of room.tableMelds){
      if(meld.ownerId === old.id) meld.ownerId = room.players[idx].id;
    }

    socket.leave(roomCode);
    socket.emit("exitedGame");
    emitRoom(roomCode);
    maybeRunBotTurn(roomCode);
  });

  socket.on("disconnect", () => {
    for(const [roomCode,room] of Object.entries(rooms)){
      const idx=room.players.findIndex(p=>p.id===socket.id);
      if(idx>=0){
        if(room.phase === "lobby"){
          room.players.splice(idx,1);
          if(!room.players.length) delete rooms[roomCode];
          else emitRoom(roomCode);
        } else {
          room.players[idx].disconnected = true;
          emitRoom(roomCode);
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Beaners v4 running on port ${PORT}`));
