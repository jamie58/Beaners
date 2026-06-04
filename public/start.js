
(() => {
  const GAME_VERSION = window.BEANERS_VERSION || "v51";
  const $ = id => document.getElementById(id);

  let latestState = null;
  let myRoom = localStorage.getItem("beanersRoomCode") || localStorage.getItem("beanersRoom") || null;
  let myPlayerId = localStorage.getItem("beanersPlayerId") || null;
  let myToken = localStorage.getItem("beanersPlayerToken") || localStorage.getItem("beanersToken") || null;

  const wheelColours = ["#e8c600", "#19a0b5", "#37a51f", "#c92a0a"];

  function socket(){
    if(window.socket) return window.socket;
    if(window.io){
      window.socket = window.io();
      return window.socket;
    }
    return null;
  }

  function debug(message){
    const el = $("startDebug");
    if(el) el.textContent = `${GAME_VERSION} • ${message}`;
    console.log("Beaners", GAME_VERSION, message);
  }

  function saveSession(data){
    if(!data) return;

    if(data.roomCode){
      myRoom = data.roomCode;
      localStorage.setItem("beanersRoom", myRoom);
      localStorage.setItem("beanersRoomCode", myRoom);
    }

    if(data.playerId){
      myPlayerId = data.playerId;
      localStorage.setItem("beanersPlayerId", myPlayerId);
    }

    if(data.playerToken){
      myToken = data.playerToken;
      localStorage.setItem("beanersPlayerToken", myToken);
      localStorage.setItem("beanersToken", myToken);
    }
  }

  function safeName(){
    return ($("nameInput")?.value || "").trim() || "Player";
  }

  function cleanRoom(){
    return ($("roomInput")?.value || "").replace(/\D/g, "").slice(0,4);
  }

  function enterRoom(data){
    saveSession(data);

    $("lobby")?.classList.add("hidden");
    $("game")?.classList.remove("hidden");
    $("lobbyControls")?.classList.remove("hidden");
    $("playingControls")?.classList.add("hidden");
    document.body.classList.add("inLobbyMode");

    if($("copyRoomBtn")) $("copyRoomBtn").textContent = myRoom || "----";
    if($("roomCode")) $("roomCode").textContent = myRoom || "----";

    socket()?.emit("v51RequestState", { roomCode:myRoom, playerToken:myToken });
    debug(`Room ${myRoom}`);
  }

  function escapeHtml(text){
    return String(text ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function seatedPlayers(){
    if(!latestState) return [];
    const order = ["top","left","bottom","right"];
    return order.map(seat => latestState.players.find(p => p.seatKey === seat)).filter(Boolean);
  }

  function drawWheel(rotation=0){
    const canvas = $("starterWheel");
    if(!canvas || !latestState) return;

    const ctx = canvas.getContext("2d");
    const players = seatedPlayers();
    const w = canvas.width, h = canvas.height;
    const cx = w/2, cy = h/2, r = Math.min(w,h)/2 - 8;

    ctx.clearRect(0,0,w,h);

    if(!players.length){
      ctx.fillStyle = "#2b145c";
      ctx.beginPath();
      ctx.arc(cx,cy,r,0,Math.PI*2);
      ctx.fill();
      return;
    }

    const slice = Math.PI * 2 / players.length;

    ctx.save();
    ctx.translate(cx,cy);
    ctx.rotate(rotation);

    players.forEach((p,i)=>{
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
      ctx.fillText(String(p.name || "").replace(" Bot",""),0,0);
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

  function animateWheel(winnerToken, winnerName){
    const players = seatedPlayers();
    const index = players.findIndex(p => p.token === winnerToken || p.id === winnerToken);
    const slice = players.length ? Math.PI * 2 / players.length : Math.PI * 2;
    const target = index >= 0 ? (Math.PI*1.5 - (index*slice + slice/2)) : 0;
    const spins = Math.PI * 2 * 4;
    const started = performance.now();
    const duration = 1800;

    function frame(now){
      const t = Math.min(1,(now-started)/duration);
      const ease = 1 - Math.pow(1-t,3);
      const rotation = spins*ease + target*ease;
      drawWheel(rotation);

      if(t < 1) requestAnimationFrame(frame);
      else {
        drawWheel(target);
        if($("wheelResult")) $("wheelResult").textContent = `${winnerName} Starts!`;
      }
    }

    requestAnimationFrame(frame);
  }

  function renderLobby(){
    if(!latestState || latestState.phase !== "lobby") return;

    document.body.classList.add("inLobbyMode");
    $("lobbyControls")?.classList.remove("hidden");
    $("playingControls")?.classList.add("hidden");

    const humans = latestState.players.filter(p => !p.isBot);
    const list = $("lobbyUnseatedNames");

    if(list){
      list.innerHTML = humans.length
        ? humans.map(p => `${p.isOwner ? "👑 " : ""}${escapeHtml(p.name)}${p.seatKey ? "" : " <small>(not seated)</small>"}`).join("<br>")
        : "Waiting...";
    }

    const labels = {top:"Top", left:"Left", right:"Right", bottom:"Bottom"};

    document.querySelectorAll(".lobbySeat").forEach(seat=>{
      const key = seat.dataset.seat;
      const occupant = latestState.players.find(p => p.seatKey === key);

      let name = seat.querySelector(".seatName");
      let action = seat.querySelector(".seatAction");

      if(!name){
        name = document.createElement("span");
        name.className = "seatName";
        seat.appendChild(name);
      }

      if(!action){
        action = document.createElement("span");
        action.className = "seatAction";
        seat.appendChild(action);
      }

      seat.classList.remove("emptySeat","botSeat","mySeat","humanSeat");

      if(!occupant){
        seat.classList.add("emptySeat");
        name.textContent = "Sit Here";
        action.innerHTML = `<button type="button" class="seatMiniAction addBotBtn" data-action="addBot">Add Bot</button>`;
      } else if(occupant.isBot){
        seat.classList.add("botSeat");
        name.textContent = `${occupant.name} (Bot)`;
        action.innerHTML = `<button type="button" class="seatMiniAction removeBotBtn" data-action="removeBot">Remove Bot</button>`;
      } else {
        seat.classList.add("humanSeat");
        if(occupant.id === myPlayerId || occupant.token === myToken) seat.classList.add("mySeat");
        name.textContent = occupant.name;
        action.innerHTML = "";
      }

      const tableLabel = $(`seat${key.charAt(0).toUpperCase()+key.slice(1)}Label`);
      if(tableLabel) tableLabel.textContent = occupant ? String(occupant.name).replace(" Bot","") : labels[key];
    });

    drawWheel();
  }

  function renderState(){
    if(!latestState) return;

    if(latestState.phase === "lobby"){
      renderLobby();
    } else {
      document.body.classList.remove("inLobbyMode");
      $("lobbyControls")?.classList.add("hidden");
      $("playingControls")?.classList.remove("hidden");
    }
  }

  function bind(){
    const s = socket();

    if(!s || s.__beanersV51Bound) return;
    s.__beanersV51Bound = true;

    debug(s.connected ? "Connected" : "Connecting");

    s.on("connect", ()=>{
      debug("Connected");
      if(myRoom && myToken){
        s.emit("rejoinRoom", { roomCode:myRoom, playerToken:myToken });
        s.emit("v51RequestState", { roomCode:myRoom, playerToken:myToken });
      }
    });

    s.on("connect_error", err => debug(`Connect error: ${err.message}`));

    s.on("joinedRoom", enterRoom);
    s.on("roomReady", enterRoom);

    s.on("roomState", state=>{
      latestState = state;
      renderState();
    });

    s.on("starterChosen", ({token,name})=>{
      animateWheel(token,name);
    });

    s.on("errorMessage", msg=>{
      const quiet = ["That seat is already taken","Only the room owner","No bot in that seat","No empty seats","Room is already full"];
      if(quiet.some(q => String(msg).includes(q))){
        console.warn("Quiet Beaners message:", msg);
        return;
      }
      alert(msg);
    });

    s.on("exitedGame", ()=>{
      ["beanersRoom","beanersRoomCode","beanersPlayerId","beanersPlayerToken","beanersToken"].forEach(k=>localStorage.removeItem(k));
      location.reload();
    });

    const create = $("createBtn");
    if(create && !create.dataset.v51Bound){
      create.dataset.v51Bound = "1";
      create.addEventListener("click", e=>{
        e.preventDefault();
        e.stopImmediatePropagation();

        create.disabled = true;
        create.textContent = "Creating...";
        s.emit("createRoom", { name:safeName() });

        setTimeout(()=>{
          if($("game")?.classList.contains("hidden")){
            create.disabled = false;
            create.textContent = "Create Room";
          }
        },3500);
      }, true);
    }

    const join = $("joinBtn");
    if(join && !join.dataset.v51Bound){
      join.dataset.v51Bound = "1";
      join.addEventListener("click", e=>{
        e.preventDefault();
        e.stopImmediatePropagation();

        const code = cleanRoom();
        if(!code) return alert("Enter the 4-digit room code.");

        join.disabled = true;
        join.textContent = "Joining...";
        s.emit("joinRoom", { roomCode:code, name:safeName(), playerToken:myToken });

        setTimeout(()=>{
          if($("game")?.classList.contains("hidden")){
            join.disabled = false;
            join.textContent = "Join Room";
          }
        },3500);
      }, true);
    }

    const roomInput = $("roomInput");
    if(roomInput && !roomInput.dataset.v51Bound){
      roomInput.dataset.v51Bound = "1";
      roomInput.addEventListener("input", ()=>roomInput.value = cleanRoom());
    }

    document.addEventListener("click", e=>{
      const seat = e.target.closest(".lobbySeat");
      if(!seat || !latestState || latestState.phase !== "lobby") return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const key = seat.dataset.seat;
      const mini = e.target.closest(".seatMiniAction");
      const occupant = latestState.players.find(p => p.seatKey === key);

      let action = "sit";
      if(mini) action = mini.dataset.action;
      else if(occupant && !occupant.isBot && occupant.id !== myPlayerId && occupant.token !== myToken) return;

      s.emit("v51SeatAction", { roomCode:myRoom, seatKey:key, action, playerToken:myToken });
    }, true);

    const spin = $("spinBtn");
    if(spin && !spin.dataset.v51Bound){
      spin.dataset.v51Bound = "1";
      spin.addEventListener("click", e=>{
        e.preventDefault();
        e.stopImmediatePropagation();
        s.emit("v51SpinStarter", { roomCode:myRoom, playerToken:myToken });
      }, true);
    }

    const start = $("startBtn");
    if(start && !start.dataset.v51Bound){
      start.dataset.v51Bound = "1";
      start.addEventListener("click", e=>{
        e.preventDefault();
        e.stopImmediatePropagation();
        s.emit("v51StartGame", { roomCode:myRoom, playerToken:myToken });
      }, true);
    }

    const exit = $("exitXBtn");
    if(exit && !exit.dataset.v51Bound){
      exit.dataset.v51Bound = "1";
      exit.addEventListener("click", e=>{
        e.preventDefault();
        e.stopImmediatePropagation();

        if(confirm("Exit game?")){
          s.emit("v51ExitGame", { roomCode:myRoom, playerToken:myToken });
        }
      }, true);
    }

    const refresh = $("reconnectBtn");
    if(refresh && !refresh.dataset.v51Bound){
      refresh.dataset.v51Bound = "1";
      refresh.addEventListener("click", e=>{
        e.preventDefault();
        e.stopImmediatePropagation();
        s.emit("v51RequestState", { roomCode:myRoom, playerToken:myToken });
        debug("Refreshing state");
      }, true);
    }
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();

  setTimeout(bind,500);
})();
