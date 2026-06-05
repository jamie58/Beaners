const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const GAME_VERSION = 'v71';
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingInterval: 10000, pingTimeout: 25000 });
app.use(express.static('public'));
const PORT = process.env.PORT || 3000;
const rooms = {};
const seats = ['bottom','left','top','right'];
const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const suits = ['♠','♥','♦','♣'];
function code(){ let c; do{ c=String(Math.floor(1000+Math.random()*9000)); }while(rooms[c]); return c; }
function tok(){ return crypto.randomBytes(16).toString('hex'); }
function cleanName(n){ return String(n||'Player').trim().slice(0,20)||'Player'; }
function randomIndex(max){ if(max<=0) return 0; try { return crypto.randomInt(0,max); } catch(e) { return Math.floor(Math.random()*max); } }
function cleanCode(c){ return String(c||'').replace(/\D/g,'').slice(0,4); }
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function deck(){ const d=[]; for(const suit of suits) for(const rank of ranks) d.push({id:crypto.randomBytes(6).toString('hex'),rank,suit}); return shuffle(d); }
function beaner(round){ return ranks[round-1] || 'A'; }
function scoreCard(c,b,dbl=false){ let v=c.rank==='A'?15:['J','Q','K'].includes(c.rank)?10:Number(c.rank); if(c.rank===b) v=dbl?100:50; else if(dbl) v*=2; return v; }
function rankVal(r){ return ranks.indexOf(r); }
function rankValue(r){ return rankVal(r); }

function findByToken(token){ if(!token) return null; for(const [roomCode,room] of Object.entries(rooms)){ const p=room.players.find(x=>!x.isBot&&x.token===token); if(p) return {roomCode,room,player:p}; } return null; }
function player(room,socket,token){ if(!room) return null; let p=room.players.find(x=>!x.isBot&&x.id===socket.id); if(!p&&token) p=room.players.find(x=>!x.isBot&&x.token===token); if(p){ p.id=socket.id; p.connected=true; p.lastSeen=Date.now(); socket.data.playerToken=p.token; } return p||null; }
function seated(room){ return seats.map(s=>room.players.find(p=>p.seat===s)).filter(Boolean); }
function current(room){ return room.players[room.currentPlayerIndex]; }
function state(roomCode){ const room=rooms[roomCode]; if(!room) return null; return { appVersion:GAME_VERSION, roomCode, phase:room.phase, round:room.round, beaner:beaner(room.round), players:room.players.map(p=>({id:p.id,token:p.token,name:p.name,seat:p.seat,isBot:p.isBot,connected:p.isBot?true:p.connected,totalScore:p.totalScore,lastRoundScore:p.lastRoundScore,isDown:p.isDown,cardCount:p.hand.length,isTurn:current(room)?.token===p.token,isStarter:room.starterToken===p.token})), deckCount:room.deck.length, discard:room.discard.slice(-9).reverse(), tableMelds:room.tableMelds, currentPlayerToken:current(room)?.token||null, currentPlayerName:current(room)?.name||'', starterToken:room.starterToken||null, starterName:room.players.find(p=>p.token===room.starterToken)?.name||'', winnerMessage:room.winnerMessage||'', roundScores:room.roundScores||[],turnStartedAt:room.turnStartedAt||null }; }
function emitRoom(roomCode){ const room=rooms[roomCode]; if(!room) return; const st=state(roomCode); io.to(roomCode).emit('roomState',st); for(const p of room.players){ if(!p.isBot&&p.id) io.to(p.id).emit('yourHand',p.hand||[]); } }
function makePlayer(socket,name){ const t=tok(); socket.data.playerToken=t; return {id:socket.id,token:t,name:cleanName(name),seat:null,isBot:false,connected:true,hand:[],isDown:false,totalScore:0,lastRoundScore:null,hasPickedUp:false,turnMs:0,turnCount:0}; }
function addBot(room,seat){ if(room.players.length>=4) return false; if(room.players.some(p=>p.seat===seat)) return false; const used=new Set(room.players.map(p=>p.name)); const names=['Bob','Bean Bot','Barry Bot','Bella Bot']; const name=names.find(n=>!used.has(n))||`Bot ${room.players.length+1}`; room.players.push({id:`bot-${tok().slice(0,6)}`,token:`bot-${tok()}`,name,seat,isBot:true,connected:true,hand:[],isDown:false,totalScore:0,lastRoundScore:null,hasPickedUp:false,turnMs:0,turnCount:0}); return true; }
function recycle(room){ if(room.deck.length||room.discard.length<=1) return; const top=room.discard.pop(); room.deck=shuffle(room.discard); room.discard=[top]; }
function isSet(cards,b){ if(cards.length<3) return false; const real=cards.filter(c=>c.rank!==b); if(!real.length) return true; return real.every(c=>c.rank===real[0].rank); }
function isRun(cards,beaner){
  return canCardsFormRun(cards,beaner);
}

function sortedRunWithBeaners(cards, beaner){
  const rankOrder=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const real=cards.filter(c=>c.rank!==beaner).sort((a,b)=>rankValue(a.rank)-rankValue(b.rank));
  const beans=cards.filter(c=>c.rank===beaner);
  if(!real.length) return cards;

  const result=[];
  let beanIndex=0;

  for(let i=0;i<real.length;i++){
    result.push(real[i]);

    if(i<real.length-1){
      const cur=rankValue(real[i].rank);
      const nxt=rankValue(real[i+1].rank);
      const gap=nxt-cur-1;
      for(let g=0;g<gap && beanIndex<beans.length;g++){
        result.push(beans[beanIndex++]);
      }
    }
  }

  while(beanIndex<beans.length){
    // If beaners remain, place them where they extend the run most naturally.
    // Put before the first real card if possible; otherwise after.
    const firstVal=rankValue(real[0].rank);
    if(firstVal>0) result.unshift(beans[beanIndex++]);
    else result.push(beans[beanIndex++]);
  }

  return result;
}

function canCardsFormRun(cards, beaner){
  if(cards.length<3) return false;
  const real=cards.filter(c=>c.rank!==beaner);
  const beans=cards.length-real.length;
  if(!real.length) return true;
  if(!real.every(c=>c.suit===real[0].suit)) return false;

  const vals=real.map(c=>rankValue(c.rank)).sort((a,b)=>a-b);
  for(let i=1;i<vals.length;i++){
    if(vals[i]===vals[i-1]) return false;
  }

  let gaps=0;
  for(let i=1;i<vals.length;i++) gaps += vals[i]-vals[i-1]-1;
  if(gaps>beans) return false;

  const min=vals[0];
  const max=vals[vals.length-1];
  const totalSpan = max-min+1;
  const naturalLength = totalSpan + (beans-gaps);
  return naturalLength <= 13;
}

function meldType(cards,b){ if(isSet(cards,b)) return 'set'; if(isRun(cards,b)) return 'run'; return null; }
function sortRun(cards,beaner){
  return sortedRunWithBeaners(cards,beaner);
}


function findRunBeanerSwapIndex(meld,card,b){
  if(!meld||meld.type!=='run') return -1;
  if(!card||card.rank===b) return -1;

  const beans=meld.cards.filter(c=>c.rank===b);
  if(!beans.length) return -1;

  const real=meld.cards.filter(c=>c.rank!==b).sort((a,b)=>rankVal(a.rank)-rankVal(b.rank));
  if(!real.length) return -1;

  const suit=real[0].suit;
  if(card.suit!==suit) return -1;

  const target=rankVal(card.rank);
  let beanCursor=0;

  // Exact swaps only: the card must fill a missing rank between two real cards.
  for(let i=0;i<real.length-1;i++){
    const cur=rankVal(real[i].rank);
    const nxt=rankVal(real[i+1].rank);

    for(let v=cur+1; v<nxt && beanCursor<beans.length; v++){
      const bean=beans[beanCursor++];
      if(v===target){
        return meld.cards.findIndex(c=>c.id===bean.id);
      }
    }
  }

  return -1;
}

function applyCardToMeldWithBeanerSwap(player, meld, card, b){
  if(!player||!meld||!card) return {ok:false, reason:'Missing card or meld.'};

  const beanIndex=meld.cards.findIndex(c=>c.rank===b);

  // SET SWAP:
  // Sets can never exceed 4 cards.
  // If a set already has 4 cards and contains a Beaner, adding the matching real card
  // must replace a Beaner and return that Beaner to the player's hand.
  if(meld.type==='set' && beanIndex>=0 && card.rank!==b){
    const real=meld.cards.filter(c=>c.rank!==b);
    const targetRank=real[0]?.rank;

    if(targetRank && card.rank===targetRank && meld.cards.length>=4){
      const beanCard=meld.cards[beanIndex];
      player.hand=player.hand.filter(c=>c.id!==card.id);
      meld.cards[beanIndex]=card;
      player.hand.push(beanCard);
      return {ok:true, swapped:true};
    }
  }

  // RUN SWAP:
  // The player can only take the Beaner if their card is the exact suited card
  // represented by the Beaner inside the current run gap.
  if(meld.type==='run'){
    const runBeanIndex=findRunBeanerSwapIndex(meld,card,b);
    if(runBeanIndex>=0){
      const beanCard=meld.cards[runBeanIndex];
      player.hand=player.hand.filter(c=>c.id!==card.id);
      meld.cards[runBeanIndex]=card;
      meld.cards=sortRun(meld.cards,b);
      player.hand.push(beanCard);
      return {ok:true, swapped:true};
    }
  }

  // Normal add if no swap applies.
  if(!canAdd(meld,card,b)){
    return {ok:false, reason:'Card does not fit that meld.'};
  }

  player.hand=player.hand.filter(c=>c.id!==card.id);
  meld.cards.push(card);
  if(meld.type==='run') meld.cards=sortRun(meld.cards,b);
  return {ok:true, swapped:false};
}

function canAdd(meld,card,b){
  if(meld.type==='set'){
    if(meld.cards.length + 1 > 4) return false;
    return isSet([...meld.cards,card],b);
  }
  return isRun([...meld.cards,card],b);
}
function startRound(room){ room.deck=deck(); room.discard=[]; room.tableMelds=[]; room.winnerMessage=''; for(const p of room.players){ p.hand=[]; p.isDown=false; p.hasPickedUp=false; p.lastRoundScore=null; } for(let i=0;i<7;i++) for(const p of room.players){ const c=room.deck.pop(); if(c) p.hand.push(c); } const first=room.deck.pop(); if(first) room.discard.push(first); let idx=room.players.findIndex(p=>p.token===room.starterToken); if(idx<0) idx=0; room.currentPlayerIndex=idx; room.phase='playing'; room.turnStartedAt=Date.now(); }
function nextTurn(room){ const p=current(room); if(p&&room.turnStartedAt){ p.turnMs += Date.now()-room.turnStartedAt; p.turnCount += 1; } if(p) p.hasPickedUp=false; room.currentPlayerIndex=(room.currentPlayerIndex+1)%room.players.length; room.turnStartedAt=Date.now(); }
function endRound(roomCode,winner){ const room=rooms[roomCode]; const b=beaner(room.round); const dbl=room.round===13; const scores=[]; for(const p of room.players){ const s=p===winner?0:p.hand.reduce((sum,c)=>sum+scoreCard(c,b,dbl),0); p.lastRoundScore=s; p.totalScore+=s; scores.push({name:p.name,score:s,total:p.totalScore,avgTurnSeconds:p.turnCount?Math.round((p.turnMs/p.turnCount)/1000):0}); } room.roundScores.push({round:room.round,winner:winner.name,scores}); room.winnerMessage=`${winner.name} BEANERS!`; room.phase=room.round>=13?'gameOver':'roundOver'; if(room.phase==='gameOver'){ const champ=[...room.players].sort((a,b)=>a.totalScore-b.totalScore)[0]; room.winnerMessage=`${champ.name} wins the game!`; } emitRoom(roomCode); }

function combinations(arr, size){
  const out=[];
  function walk(start, combo){
    if(combo.length===size){ out.push(combo.slice()); return; }
    for(let i=start;i<arr.length;i++){
      combo.push(arr[i]);
      walk(i+1,combo);
      combo.pop();
    }
  }
  walk(0,[]);
  return out;
}

function findBestMeld(cards, b){
  // Prefer largest valid meld first, then any valid 3-card meld.
  for(let size=Math.min(cards.length,5); size>=3; size--){
    const combos=combinations(cards,size);
    for(const combo of combos){
      const type=meldType(combo,b);
      if(type) return {cards:combo,type};
    }
  }
  return null;
}

function botLayMelds(room, bot){
  const b=beaner(room.round);
  let changed=false;

  // First meld or later melds: lay any valid meld available.
  while(true){
    const found=findBestMeld(bot.hand,b);
    if(!found) break;

    const ids=new Set(found.cards.map(c=>c.id));
    bot.hand=bot.hand.filter(c=>!ids.has(c.id));
    bot.isDown=true;
    room.tableMelds.push({
      id:crypto.randomBytes(5).toString('hex'),
      ownerToken:bot.token,
      ownerName:bot.name,
      type:found.type,
      cards:found.type==='run'?sortRun(found.cards,b):found.cards
    });
    changed=true;
  }

  return changed;
}

function botAddToExistingMelds(room, bot){
  if(!bot.isDown) return false;
  const b=beaner(room.round);
  let changed=false;

  let keepGoing=true;
  while(keepGoing){
    keepGoing=false;
    for(const card of [...bot.hand]){
      for(const meld of room.tableMelds){
        const result=applyCardToMeldWithBeanerSwap(bot,meld,card,b);
        if(result.ok){
          changed=true;
          keepGoing=true;
          break;
        }
      }
      if(keepGoing) break;
    }
  }

  return changed;
}

function discardScoreForBot(card, hand, b){
  // Higher score means more likely to discard.
  if(card.rank===b) return -9999; // do not throw Beaners unless literally unavoidable.

  let score=0;
  if(card.rank==='A') score+=15;
  else if(['J','Q','K'].includes(card.rank)) score+=10;
  else score+=Number(card.rank)||0;

  // Keep pairs/sets together.
  const sameRank=hand.filter(c=>c.id!==card.id && (c.rank===card.rank || c.rank===b)).length;
  score-=sameRank*8;

  // Keep suited neighbours together for possible runs.
  const v=rankVal(card.rank);
  const neighbours=hand.filter(c=>c.id!==card.id && c.suit===card.suit && Math.abs(rankVal(c.rank)-v)<=2).length;
  score-=neighbours*6;

  return score;
}

function chooseBotDiscard(bot, b){
  if(bot.hand.length===1) return bot.hand[0];

  const nonBeaners=bot.hand.filter(c=>c.rank!==b);
  const candidates=nonBeaners.length?nonBeaners:bot.hand;
  return candidates.sort((a,bb)=>discardScoreForBot(bb,bot.hand,b)-discardScoreForBot(a,bot.hand,b))[0];
}

function botTurn(code){
  const room=rooms[code];
  if(!room||room.phase!=='playing') return;
  const bot=current(room);
  if(!bot||!bot.isBot) return;

  setTimeout(()=>{
    const b=beaner(room.round);

    // 1. Pick up if needed.
    if(!bot.hasPickedUp){
      recycle(room);

      // Simple choice: take discard if it helps immediately, otherwise draw deck.
      let tookDiscard=false;
      const top=room.discard[room.discard.length-1];
      if(top){
        const test=[...bot.hand,top];
        if(findBestMeld(test,b)){
          const c=room.discard.pop();
          if(c){ bot.hand.push(c); tookDiscard=true; }
        }
      }

      if(!tookDiscard){
        const drawn=room.deck.pop()||room.discard.pop();
        if(drawn) bot.hand.push(drawn);
      }

      bot.hasPickedUp=true;
    }

    // 2. Lay first meld ASAP, then keep laying any extra melds.
    botLayMelds(room,bot);

    // 3. If already down, add cards to anyone's melds.
    botAddToExistingMelds(room,bot);

    // 4. If bot can go out, discard final card.
    if(bot.hand.length===1 && bot.hasPickedUp){
      const finalCard=bot.hand[0];
      bot.hand=[];
      room.discard.push(finalCard);
      return endRound(code,bot);
    }

    // 5. Discard intelligently. Never throw Beaners unless unavoidable.
    const discard=chooseBotDiscard(bot,b);
    if(discard){
      bot.hand=bot.hand.filter(c=>c.id!==discard.id);
      room.discard.push(discard);
    }

    if(!bot.hand.length) return endRound(code,bot);

    nextTurn(room);
    emitRoom(code);
    if(current(room)?.isBot) botTurn(code);
  },900);
}


io.on('connection', socket=>{
  socket.on('createRoom',({name})=>{ const roomCode=code(); const p=makePlayer(socket,name); rooms[roomCode]={phase:'lobby',players:[p],round:1,deck:[],discard:[],tableMelds:[],currentPlayerIndex:0,starterToken:null,roundScores:[],winnerMessage:''}; socket.join(roomCode); socket.emit('joinedRoom',{roomCode,playerId:socket.id,playerToken:p.token,appVersion:GAME_VERSION}); socket.emit('roomReady',{roomCode,playerId:socket.id,playerToken:p.token,appVersion:GAME_VERSION}); emitRoom(roomCode); });
  socket.on('joinRoom',({roomCode,name,playerToken})=>{ const rc=cleanCode(roomCode); const room=rooms[rc]; if(!room) return socket.emit('errorMessage','Room not found.'); if(room.phase!=='lobby') return socket.emit('errorMessage','Game already started.'); let p=playerToken?room.players.find(x=>!x.isBot&&x.token===playerToken):null; if(!p){ if(room.players.filter(x=>!x.isBot).length>=4) return socket.emit('errorMessage','Room is full.'); p=makePlayer(socket,name); room.players.push(p); } else { p.id=socket.id; p.connected=true; socket.data.playerToken=p.token; } socket.join(rc); socket.emit('joinedRoom',{roomCode:rc,playerId:socket.id,playerToken:p.token,appVersion:GAME_VERSION}); socket.emit('roomReady',{roomCode:rc,playerId:socket.id,playerToken:p.token,appVersion:GAME_VERSION}); emitRoom(rc); });
  socket.on('rejoinRoom',({roomCode,playerToken})=>{ let rc=cleanCode(roomCode); let room=rooms[rc]; if((!room||!playerToken) && playerToken){ const f=findByToken(playerToken); if(f){ rc=f.roomCode; room=f.room; } } if(!room||!playerToken) return socket.emit('rejoinFailed'); const p=player(room,socket,playerToken); if(!p) return socket.emit('rejoinFailed'); p.connected=true; p.id=socket.id; socket.data.playerToken=p.token; socket.join(rc); socket.emit('joinedRoom',{roomCode:rc,playerId:socket.id,playerToken:p.token,appVersion:GAME_VERSION}); socket.emit('roomReady',{roomCode:rc,playerId:socket.id,playerToken:p.token,appVersion:GAME_VERSION}); socket.emit('yourHand',p.hand||[]); emitRoom(rc); });
  socket.on('requestRoomState',({roomCode,playerToken})=>{ let rc=cleanCode(roomCode); let room=rooms[rc]; if(!room&&playerToken){ const f=findByToken(playerToken); if(f){ rc=f.roomCode; room=f.room; } } if(!room) return socket.emit('errorMessage','Room not found.'); const p=player(room,socket,playerToken); if(p){ p.connected=true; p.id=socket.id; socket.data.playerToken=p.token; socket.join(rc); socket.emit('joinedRoom',{roomCode:rc,playerId:socket.id,playerToken:p.token,appVersion:GAME_VERSION}); socket.emit('roomReady',{roomCode:rc,playerId:socket.id,playerToken:p.token,appVersion:GAME_VERSION}); socket.emit('yourHand',p.hand||[]); } emitRoom(rc); });
  socket.on('seatAction',({roomCode,seat,action,playerToken})=>{ const rc=cleanCode(roomCode); const room=rooms[rc]; if(!room) return socket.emit('errorMessage','Room not found.'); if(room.phase!=='lobby') return socket.emit('errorMessage','Seat changes are only available in the lobby.'); if(!seats.includes(seat)) return; const p=player(room,socket,playerToken); if(action==='addBot'){ addBot(room,seat); return emitRoom(rc); } if(action==='removeBot'){ const idx=room.players.findIndex(x=>x.isBot&&x.seat===seat); if(idx>=0) room.players.splice(idx,1); return emitRoom(rc); } if(action==='sit'){ if(!p) return socket.emit('errorMessage','Could not identify player.'); const occ=room.players.find(x=>x.seat===seat&&x.token!==p.token); if(occ&&!occ.isBot) return socket.emit('errorMessage','Seat already taken.'); if(occ&&occ.isBot) room.players=room.players.filter(x=>x!==occ); p.seat=seat; return emitRoom(rc); } });
  socket.on('spinStarter',({roomCode})=>{ const rc=cleanCode(roomCode); const room=rooms[rc]; if(!room) return socket.emit('errorMessage','Room not found.'); const seatedNow=seated(room); if(seatedNow.length<2) return socket.emit('errorMessage','Need at least 2 seated players or bots.'); const win=seatedNow[randomIndex(seatedNow.length)]; room.starterToken=win.token; emitRoom(rc); io.to(rc).emit('starterChosen',{token:win.token,id:win.id,name:win.name,spinId:Date.now()+Math.random()}); });
  socket.on('startGame',({roomCode})=>{ const rc=cleanCode(roomCode); const room=rooms[rc]; if(!room) return socket.emit('errorMessage','Room not found.'); const seatedNow=seated(room); if(seatedNow.length<2) return socket.emit('errorMessage','Need at least 2 seated players or bots.'); if(room.players.filter(p=>!p.isBot&&!p.seat).length) return socket.emit('errorMessage','All joined players must sit down before starting.'); if(!room.starterToken) room.starterToken=seatedNow[Math.floor(Math.random()*seatedNow.length)].token; room.players=seatedNow; startRound(room); emitRoom(rc); if(current(room)?.isBot) botTurn(rc); });
  socket.on('drawDeck',({roomCode,playerToken})=>{ const rc=cleanCode(roomCode); const room=rooms[rc]; if(!room||room.phase!=='playing') return; const p=player(room,socket,playerToken); if(!p||current(room)?.token!==p.token) return socket.emit('errorMessage','Not your turn.'); if(p.hasPickedUp) return socket.emit('errorMessage','You have already picked up.'); recycle(room); const c=room.deck.pop(); if(c) p.hand.push(c); p.hasPickedUp=true; emitRoom(rc); });
  socket.on('takeTopDiscard',({roomCode,playerToken})=>{ const rc=cleanCode(roomCode); const room=rooms[rc]; if(!room||room.phase!=='playing') return; const p=player(room,socket,playerToken); if(!p||current(room)?.token!==p.token) return socket.emit('errorMessage','Not your turn.'); if(p.hasPickedUp) return socket.emit('errorMessage','You have already picked up.'); const c=room.discard.pop(); if(c) p.hand.push(c); p.hasPickedUp=true; emitRoom(rc); });
  socket.on('takeDiscardPile',({roomCode,playerToken})=>{ const rc=cleanCode(roomCode); const room=rooms[rc]; if(!room||room.phase!=='playing') return; const p=player(room,socket,playerToken); if(!p||current(room)?.token!==p.token) return socket.emit('errorMessage','Not your turn.'); if(p.hasPickedUp) return socket.emit('errorMessage','You have already picked up.'); p.hand.push(...room.discard); room.discard=[]; p.hasPickedUp=true; emitRoom(rc); });
  socket.on('layMeld',({roomCode,playerToken,cardIds})=>{ const rc=cleanCode(roomCode); const room=rooms[rc]; if(!room||room.phase!=='playing') return; const p=player(room,socket,playerToken); if(!p) return; const b=beaner(room.round); const cards=cardIds.map(id=>p.hand.find(c=>c.id===id)).filter(Boolean); const type=meldType(cards,b); if(!type) return socket.emit('errorMessage','That is not a valid meld.'); p.hand=p.hand.filter(c=>!cardIds.includes(c.id)); p.isDown=true; room.tableMelds.push({id:crypto.randomBytes(5).toString('hex'),ownerToken:p.token,ownerName:p.name,type,cards:type==='run'?sortRun(cards,b):cards}); emitRoom(rc); });
  socket.on('addToMeld',({roomCode,playerToken,meldId,cardId})=>{ const rc=cleanCode(roomCode); const room=rooms[rc]; if(!room||room.phase!=='playing') return; const p=player(room,socket,playerToken); if(!p||!p.isDown) return socket.emit('errorMessage','Lay your first meld before adding to any meld.'); const c=p.hand.find(x=>x.id===cardId); const m=room.tableMelds.find(x=>x.id===meldId); if(!c||!m) return; const b=beaner(room.round); if(!canAdd(m,c,b)) return socket.emit('errorMessage','Card does not fit that meld.'); p.hand=p.hand.filter(x=>x.id!==cardId); m.cards.push(c); if(m.type==='run') m.cards=sortRun(m.cards,b); emitRoom(rc); });

  socket.on('meldAdd',({roomCode,playerToken,meldId,cardId})=>{
    const rc=cleanCode(roomCode);
    const room=rooms[rc];
    if(!room||room.phase!=='playing') return;

    const p=player(room,socket,playerToken);
    if(!p) return socket.emit('errorMessage','Could not identify your player.');
    if(!p.isDown) return socket.emit('errorMessage','Lay your first meld before adding to any meld.');

    const c=p.hand.find(x=>x.id===cardId);
    const m=room.tableMelds.find(x=>x.id===meldId);
    if(!c||!m) return;

    const b=beaner(room.round);
    const result=applyCardToMeldWithBeanerSwap(p,m,c,b);
    if(!result.ok) return socket.emit('errorMessage',result.reason||'Card does not fit that meld.');

    socket.emit('meldAddOk',{meldId,cardId,swapped:!!result.swapped});
    emitRoom(rc);
  });

  socket.on('playOnMeld',({roomCode,playerToken,meldId,cardId})=>{
    const rc=cleanCode(roomCode);
    const room=rooms[rc];
    if(!room||room.phase!=='playing') return;

    const p=player(room,socket,playerToken);
    if(!p) return socket.emit('errorMessage','Could not identify your player.');
    if(!p.isDown) return socket.emit('errorMessage','Lay your first meld before adding to any meld.');

    const c=p.hand.find(x=>x.id===cardId);
    const m=room.tableMelds.find(x=>x.id===meldId);
    if(!c||!m) return;

    const b=beaner(room.round);
    const result=applyCardToMeldWithBeanerSwap(p,m,c,b);
    if(!result.ok) return socket.emit('errorMessage',result.reason||'Card does not fit that meld.');

    emitRoom(rc);
  });
  socket.on('discard',({roomCode,playerToken,cardId})=>{ const rc=cleanCode(roomCode); const room=rooms[rc]; if(!room||room.phase!=='playing') return; const p=player(room,socket,playerToken); if(!p||current(room)?.token!==p.token) return socket.emit('errorMessage','Not your turn.'); if(!p.hasPickedUp&&!(p.isDown&&p.hand.length===1)) return socket.emit('errorMessage','Pick up before discarding.'); const idx=p.hand.findIndex(c=>c.id===cardId); if(idx<0) return; const [c]=p.hand.splice(idx,1); room.discard.push(c); if(p.hand.length===0) return endRound(rc,p); nextTurn(room); emitRoom(rc); if(current(room)?.isBot) botTurn(rc); });
  socket.on('nextRound',({roomCode})=>{ const rc=cleanCode(roomCode); const room=rooms[rc]; if(!room||room.phase!=='roundOver') return; room.round+=1; const s=seated(room); room.starterToken=s[(room.round-1)%s.length]?.token||room.players[0].token; startRound(room); emitRoom(rc); if(current(room)?.isBot) botTurn(rc); });
  socket.on('restartGame',({roomCode})=>{ const rc=cleanCode(roomCode); const room=rooms[rc]; if(!room) return; const seatedNow=seated(room); room.players=seatedNow.length ? seatedNow : room.players; room.round=1; room.roundScores=[]; room.winnerMessage=''; room.starterToken=seated(room)[randomIndex(seated(room).length)]?.token||room.players[0]?.token||null; for(const p of room.players){ p.hand=[]; p.isDown=false; p.lastRoundScore=null; p.hasPickedUp=false; p.turnMs=0; p.turnCount=0; } startRound(room); emitRoom(rc); if(current(room)?.isBot) botTurn(rc); });

  socket.on('restartRound',({roomCode})=>{ const rc=cleanCode(roomCode); const room=rooms[rc]; if(!room) return; startRound(room); emitRoom(rc); if(current(room)?.isBot) botTurn(rc); });

  socket.on('exitGame',({roomCode,playerToken})=>{ const rc=cleanCode(roomCode); const room=rooms[rc]; if(!room) return socket.emit('exitedGame'); const p=player(room,socket,playerToken); if(!p) return socket.emit('exitedGame'); const idx=room.players.findIndex(x=>!x.isBot&&x.token===p.token); if(idx>=0){ if(room.phase==='lobby') room.players.splice(idx,1); else room.players[idx]={...p,id:`bot-${tok().slice(0,6)}`,token:`bot-${tok()}`,name:`${p.name} Bot`,isBot:true,connected:true}; } socket.leave(rc); socket.emit('exitedGame'); if(!room.players.length) delete rooms[rc]; else emitRoom(rc); });
  socket.on('getHand',({roomCode,playerToken})=>{ const rc=cleanCode(roomCode); const room=rooms[rc]; if(!room) return; const p=player(room,socket,playerToken); if(p) socket.emit('yourHand',p.hand||[]); });
  socket.on('forceHand',({roomCode,playerToken})=>{ const rc=cleanCode(roomCode); const room=rooms[rc]; if(!room) return; const p=player(room,socket,playerToken); if(p) socket.emit('yourHand',p.hand||[]); });

  socket.on('disconnect',()=>{ const f=findByToken(socket.data.playerToken); if(f){ f.player.connected=false; f.player.lastSeen=Date.now(); emitRoom(f.roomCode); } });
});
server.listen(PORT,()=>console.log(`Beaners ${GAME_VERSION} running on port ${PORT}`));
