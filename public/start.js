
(() => {
  const $ = (id) => document.getElementById(id);
  let latestLobbyState = null;

  function safeName(){
    return ($("nameInput")?.value || "").trim() || "Player";
  }

  function cleanRoom(){
    return ($("roomInput")?.value || "").replace(/\D/g, "").slice(0, 4);
  }

  function getSocket(){
    if(window.socket) return window.socket;
    if(window.io){
      window.socket = window.io();
      return window.socket;
    }
    alert("Connection script did not load. Try refreshing.");
    return null;
  }

  function showStartDebug(message){
    const box = $("startDebug");
    if(box) box.textContent = message;
    console.log("Beaners start:", message);
  }

  function enterRoom(data){
    if(window.beanersEnterRoom) window.beanersEnterRoom(data);
    localStorage.setItem("beanersRoom", data.roomCode);
    localStorage.setItem("beanersPlayerId", data.playerId);
    if(data.playerToken) localStorage.setItem("beanersPlayerToken", data.playerToken);

    $("lobby")?.classList.add("hidden");
    $("game")?.classList.remove("hidden");
    $("lobbyControls")?.classList.remove("hidden");
    $("playingControls")?.classList.add("hidden");

    const socket = getSocket();
    socket?.emit("requestRoomState", { roomCode:data.roomCode });
  }

  function renderLobby(state){
    latestLobbyState = state;
    if(!state || state.phase !== "lobby") return;

    $("lobbyControls")?.classList.remove("hidden");
    $("playingControls")?.classList.add("hidden");

    const labels = {top:"Top", left:"Left", right:"Right", bottom:"Bottom"};
    const humans = state.players.filter(p => !p.isBot);
    const unseatedBox = $("lobbyUnseatedNames");

    if(unseatedBox){
      unseatedBox.innerHTML = humans.length
        ? humans.map(p => `${p.isOwner ? "👑 " : ""}${escapeHtmlLocal(p.name)}${p.seatKey ? "" : " <small>(not seated)</small>"}`).join("<br>")
        : "Waiting...";
    }

    document.querySelectorAll(".lobbySeat").forEach(btn => {
      const seat = btn.dataset.seat;
      const occupant = state.players.find(p => p.seatKey === seat);
      const nameEl = btn.querySelector(".seatName");
      const actionEl = btn.querySelector(".seatAction");

      btn.classList.remove("occupied","botSeat","mySeat","emptySeat");
      btn.disabled = false;

      if(!occupant){
        btn.classList.add("emptySeat");
        if(nameEl) nameEl.textContent = "Sit Here";
        if(actionEl) actionEl.textContent = "Tap to sit / add bot";
      } else {
        btn.classList.add("occupied");
        if(occupant.isBot) btn.classList.add("botSeat");
        if(occupant.id === state.youId || occupant.id === localStorage.getItem("beanersPlayerId")) btn.classList.add("mySeat");

        if(nameEl) nameEl.textContent = occupant.name + (occupant.isBot ? " (Bot)" : "");
        if(actionEl){
          if(occupant.id === localStorage.getItem("beanersPlayerId")) actionEl.textContent = "You";
          else if(occupant.isBot) actionEl.textContent = "Tap to remove bot";
          else actionEl.textContent = "Taken";
        }
      }

      const tableLabel = $(`seat${seat.charAt(0).toUpperCase()+seat.slice(1)}Label`);
      if(tableLabel) tableLabel.textContent = occupant ? occupant.name.replace(" Bot","") : labels[seat];
    });

    drawWheelLocal(state);
  }

  function escapeHtmlLocal(text){
    return String(text ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  const wheelColours = ["#e8c600", "#19a0b5", "#37a51f", "#c92a0a"];

  function seatedPlayers(state){
    const order = ["top","left","bottom","right"];
    return order.map(seat => state.players.find(p => p.seatKey === seat)).filter(Boolean);
  }

  function drawWheelLocal(state, rotation=0){
    const canvas = $("starterWheel");
    if(!canvas || !state) return;
    const ctx = canvas.getContext("2d");
    const players = seatedPlayers(state);
    const w = canvas.width, h = canvas.height;
    const cx = w/2, cy = h/2, r = Math.min(w,h)/2 - 8;
    ctx.clearRect(0,0,w,h);

    if(!players.length){
      ctx.fillStyle = "#2b145c";
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
      return;
    }

    const slice = Math.PI*2/players.length;
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
      ctx.textAlign="center";
      ctx.fillStyle="white";
      ctx.font="bold 22px system-ui, sans-serif";
      ctx.translate(r*.55,0);
      ctx.rotate(Math.PI/2);
      ctx.fillText(p.name.replace(" Bot",""),0,0);
      ctx.restore();
    });

    ctx.restore();
    ctx.fillStyle="#fff7ed";
    ctx.beginPath();
    ctx.moveTo(cx, cy-r-4);
    ctx.lineTo(cx-18, cy-r-44);
    ctx.lineTo(cx+18, cy-r-44);
    ctx.closePath();
    ctx.fill();
  }

  function bind(){
    const socket = getSocket();
    if(!socket) return;

    if(!socket.__beanersV41Bound){
      socket.__beanersV41Bound = true;

      socket.on("connect", () => showStartDebug("Connected"));
      socket.on("connect_error", err => showStartDebug("Connect error: " + err.message));

      socket.on("roomReady", data => {
        showStartDebug("Room " + data.roomCode + " ready");
        enterRoom(data);
      });

      socket.on("joinedRoom", data => {
        showStartDebug("Joined room " + data.roomCode);
        enterRoom(data);
      });

      socket.on("roomState", state => {
        renderLobby(state);
      });

      socket.on("errorMessage", message => {
        showStartDebug("Error: " + message);
      });
    }

    const createBtn = $("createBtn");
    const joinBtn = $("joinBtn");
    const roomInput = $("roomInput");

    if(roomInput){
      roomInput.addEventListener("input", () => {
        roomInput.value = cleanRoom();
      });
    }

    if(createBtn && !createBtn.dataset.v41Bound){
      createBtn.dataset.v41Bound = "1";
      createBtn.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        createBtn.disabled = true;
        createBtn.textContent = "Creating...";
        showStartDebug("Creating room...");
        socket.emit("createRoom", { name:safeName() });
        setTimeout(() => { createBtn.disabled = false; createBtn.textContent = "Create Room"; }, 3000);
      }, true);
    }

    if(joinBtn && !joinBtn.dataset.v41Bound){
      joinBtn.dataset.v41Bound = "1";
      joinBtn.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const roomCode = cleanRoom();
        if(!roomCode) return alert("Enter the 4-digit room code.");
        joinBtn.disabled = true;
        joinBtn.textContent = "Joining...";
        showStartDebug("Joining room " + roomCode + "...");
        socket.emit("joinRoom", { roomCode, name:safeName(), playerToken:localStorage.getItem("beanersPlayerToken") });
        setTimeout(() => { joinBtn.disabled = false; joinBtn.textContent = "Join Room"; }, 3000);
      }, true);
    }

    document.querySelectorAll(".lobbySeat").forEach(btn => {
      if(btn.dataset.v41Bound) return;
      btn.dataset.v41Bound = "1";
      btn.addEventListener("click", () => {
        const state = latestLobbyState;
        if(!state) return;
        const seatKey = btn.dataset.seat;
        const occupant = state.players.find(p => p.seatKey === seatKey);
        const roomCode = state.roomCode || localStorage.getItem("beanersRoom");

        if(occupant?.isBot){
          socket.emit("removeSeatBot", { roomCode, seatKey });
          return;
        }

        if(!occupant){
          const sitHere = confirm("Press OK to sit here, or Cancel to add a bot.");
          if(sitHere) socket.emit("chooseSeat", { roomCode, seatKey });
          else socket.emit("addBot", { roomCode, seatKey });
          return;
        }

        if(occupant.id === localStorage.getItem("beanersPlayerId")){
          socket.emit("chooseSeat", { roomCode, seatKey });
        }
      });
    });

    showStartDebug(socket.connected ? "Connected" : "Connecting...");
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();

  setTimeout(bind, 500);
})();
