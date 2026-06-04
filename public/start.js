
(() => {
  const $ = (id) => document.getElementById(id);

  function safeName(){
    return ($("nameInput")?.value || "").trim() || "Player";
  }

  function cleanRoom(){
    return ($("roomInput")?.value || "").replace(/\D/g, "").slice(0, 4);
  }

  function getTokenKey(){
    return "beanersPlayerToken";
  }

  function getRoomKey(){
    return "beanersRoomCode";
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
    if(!data || !data.roomCode) return;

    localStorage.setItem(getRoomKey(), data.roomCode);
    localStorage.setItem("beanersRoom", data.roomCode);
    localStorage.setItem("beanersPlayerId", data.playerId);
    if(data.playerToken) localStorage.setItem(getTokenKey(), data.playerToken);

    const lobby = $("lobby");
    const game = $("game");
    const lobbyControls = $("lobbyControls");
    const playingControls = $("playingControls");
    const roomCodeEl = $("roomCode");
    const copyRoomBtn = $("copyRoomBtn");

    lobby?.classList.add("hidden");
    game?.classList.remove("hidden");
    lobbyControls?.classList.remove("hidden");
    playingControls?.classList.add("hidden");
    document.body.classList.add("inLobbyMode");

    if(roomCodeEl) roomCodeEl.textContent = data.roomCode;
    if(copyRoomBtn) copyRoomBtn.textContent = data.roomCode;

    if(window.beanersEnterRoom) {
      try { window.beanersEnterRoom(data); } catch(e) { console.error("beanersEnterRoom failed", e); }
    }

    const socket = getSocket();
    socket?.emit("requestRoomState", { roomCode:data.roomCode });

    showStartDebug("Room " + data.roomCode + " ready");
  }

  function bind(){
    const socket = getSocket();
    if(!socket) return;

    if(!socket.__beanersV44Bound){
      socket.__beanersV44Bound = true;

      socket.on("connect", () => showStartDebug("Connected v44"));
      socket.on("connect_error", err => showStartDebug("Connect error: " + err.message));

      socket.on("roomReady", enterRoom);
      socket.on("joinedRoom", enterRoom);

      socket.on("errorMessage", message => {
        showStartDebug("Error: " + message);
      });
    }

    const createBtn = $("createBtn");
    const joinBtn = $("joinBtn");
    const roomInput = $("roomInput");

    if(roomInput && !roomInput.dataset.v44Bound){
      roomInput.dataset.v44Bound = "1";
      roomInput.addEventListener("input", () => {
        roomInput.value = cleanRoom();
      });
    }

    if(createBtn && !createBtn.dataset.v44Bound){
      createBtn.dataset.v44Bound = "1";
      createBtn.addEventListener("click", event => {
        event.preventDefault();
        event.stopImmediatePropagation();

        createBtn.disabled = true;
        createBtn.textContent = "Creating...";
        showStartDebug("Creating room...");

        socket.emit("createRoom", { name:safeName() });

        setTimeout(() => {
          if(!$("game") || $("game").classList.contains("hidden")){
            createBtn.disabled = false;
            createBtn.textContent = "Create Room";
            showStartDebug("No room response yet — check Render log");
          }
        }, 3500);
      }, true);
    }

    if(joinBtn && !joinBtn.dataset.v44Bound){
      joinBtn.dataset.v44Bound = "1";
      joinBtn.addEventListener("click", event => {
        event.preventDefault();
        event.stopImmediatePropagation();

        const roomCode = cleanRoom();
        if(!roomCode) return alert("Enter the 4-digit room code.");

        joinBtn.disabled = true;
        joinBtn.textContent = "Joining...";
        showStartDebug("Joining " + roomCode + "...");

        socket.emit("joinRoom", {
          roomCode,
          name:safeName(),
          playerToken:localStorage.getItem(getTokenKey())
        });

        setTimeout(() => {
          if(!$("game") || $("game").classList.contains("hidden")){
            joinBtn.disabled = false;
            joinBtn.textContent = "Join Room";
            showStartDebug("No join response yet — check code/log");
          }
        }, 3500);
      }, true);
    }

    showStartDebug(socket.connected ? "Connected v44" : "Connecting v44...");
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();

  setTimeout(bind, 500);
})();


// v45 mini bot buttons + seat sitting
document.addEventListener("click", event => {
  const seat = event.target.closest(".lobbySeat");
  if(!seat || !window.socket) return;

  const state = typeof latestLobbyState !== "undefined" ? latestLobbyState : null;
  if(!state) return;

  const mini = event.target.closest(".seatMiniAction");
  const seatKey = seat.dataset.seat;
  const roomCode = state.roomCode || localStorage.getItem("beanersRoom") || localStorage.getItem("beanersRoomCode");
  const occupant = state.players.find(p => p.seatKey === seatKey);

  if(mini){
    event.preventDefault();
    event.stopImmediatePropagation();
    window.socket.emit("seatAction", { roomCode, seatKey, action: mini.dataset.action });
    return;
  }

  if(!occupant || occupant.isBot || occupant.id === localStorage.getItem("beanersPlayerId")){
    event.preventDefault();
    event.stopImmediatePropagation();
    window.socket.emit("seatAction", { roomCode, seatKey, action:"sit" });
  }
}, true);


// v46 explicit lobby bot buttons + exit fix
(() => {
  let v46State = null;

  function getRoomCode(){
    return v46State?.roomCode ||
      localStorage.getItem("beanersRoom") ||
      localStorage.getItem("beanersRoomCode") ||
      localStorage.getItem("beanersRoomCodeKey");
  }

  function injectSeatButtons(){
    if(!v46State || v46State.phase !== "lobby") return;

    document.body.classList.add("inLobbyMode");

    document.querySelectorAll(".lobbySeat").forEach(seat => {
      const seatKey = seat.dataset.seat;
      if(!seatKey) return;

      let action = seat.querySelector(".seatAction");
      if(!action){
        action = document.createElement("span");
        action.className = "seatAction";
        seat.appendChild(action);
      }

      action.innerHTML = `
        <button type="button" class="seatMiniAction addBotBtn" data-action="addBot">Add Bot</button>
        <button type="button" class="seatMiniAction removeBotBtn" data-action="removeBot">Remove Bot</button>
      `;
    });
  }

  function bindV46(){
    const socket = window.socket;
    if(!socket || socket.__v46Bound) return;
    socket.__v46Bound = true;

    socket.on("roomState", state => {
      v46State = state;
      setTimeout(injectSeatButtons, 0);
    });

    document.addEventListener("click", event => {
      const mini = event.target.closest(".seatMiniAction");
      const seat = event.target.closest(".lobbySeat");

      if(!seat || !v46State || v46State.phase !== "lobby") return;

      const socket = window.socket;
      if(!socket) return;

      const seatKey = seat.dataset.seat;
      const roomCode = getRoomCode();
      const occupant = v46State.players.find(p => p.seatKey === seatKey);

      event.preventDefault();
      event.stopImmediatePropagation();

      if(mini){
        socket.emit("seatAction", { roomCode, seatKey, action: mini.dataset.action });
        return;
      }

      if(!occupant || occupant.isBot || occupant.id === localStorage.getItem("beanersPlayerId")){
        socket.emit("seatAction", { roomCode, seatKey, action:"sit" });
      }
    }, true);

    const exitBtn = document.getElementById("exitXBtn");
    if(exitBtn && !exitBtn.dataset.v46Bound){
      exitBtn.dataset.v46Bound = "1";
      exitBtn.addEventListener("click", event => {
        event.preventDefault();
        event.stopImmediatePropagation();

        const roomCode = getRoomCode();
        if(!roomCode){
          alert("No active room found to exit.");
          return;
        }

        if(confirm("Exit game?")){
          socket.emit("exitGame", { roomCode });
        }
      }, true);
    }

    socket.on("exitedGame", () => {
      localStorage.removeItem("beanersRoom");
      localStorage.removeItem("beanersRoomCode");
      localStorage.removeItem("beanersPlayerId");
      location.reload();
    });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", () => setTimeout(bindV46, 300));
  } else {
    setTimeout(bindV46, 300);
  }

  setTimeout(bindV46, 900);
})();


// v47 clean lobby seat renderer + click handling
(() => {
  let v47State = null;

  function getRoomCode(){
    return v47State?.roomCode ||
      localStorage.getItem("beanersRoom") ||
      localStorage.getItem("beanersRoomCode") ||
      localStorage.getItem("beanersRoomCodeKey");
  }

  function renderV47Seats(){
    if(!v47State || v47State.phase !== "lobby") return;

    document.body.classList.add("inLobbyMode");

    const labels = { top:"Top", left:"Left", right:"Right", bottom:"Bottom" };

    document.querySelectorAll(".lobbySeat").forEach(seat => {
      const seatKey = seat.dataset.seat;
      const occupant = v47State.players.find(p => p.seatKey === seatKey);

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
        name.textContent = occupant.name + " (Bot)";
        action.innerHTML = `<button type="button" class="seatMiniAction removeBotBtn" data-action="removeBot">Remove Bot</button>`;
      } else {
        seat.classList.add("humanSeat");
        if(occupant.id === localStorage.getItem("beanersPlayerId")) seat.classList.add("mySeat");
        name.textContent = occupant.name;
        action.innerHTML = "";
      }

      const tableLabel = document.getElementById(`seat${seatKey.charAt(0).toUpperCase()+seatKey.slice(1)}Label`);
      if(tableLabel) tableLabel.textContent = occupant ? occupant.name.replace(" Bot","") : labels[seatKey];
    });
  }

  function bindV47(){
    const socket = window.socket;
    if(!socket || socket.__v47Bound) return;
    socket.__v47Bound = true;

    socket.on("roomState", state => {
      v47State = state;
      setTimeout(renderV47Seats, 0);
    });

    document.addEventListener("click", event => {
      const seat = event.target.closest(".lobbySeat");
      if(!seat || !v47State || v47State.phase !== "lobby") return;

      const mini = event.target.closest(".seatMiniAction");
      const seatKey = seat.dataset.seat;
      const occupant = v47State.players.find(p => p.seatKey === seatKey);
      const roomCode = getRoomCode();

      event.preventDefault();
      event.stopImmediatePropagation();

      if(mini){
        socket.emit("seatAction", { roomCode, seatKey, action: mini.dataset.action });
        return;
      }

      if(!occupant || occupant.isBot || occupant.id === localStorage.getItem("beanersPlayerId")){
        socket.emit("seatAction", { roomCode, seatKey, action:"sit" });
      }
    }, true);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", () => setTimeout(bindV47, 350));
  } else {
    setTimeout(bindV47, 350);
  }

  setTimeout(bindV47, 900);
})();


// v48 spin/start + quiet duplicate Add Bot warnings
(() => {
  let v48State = null;
  let lastBotActionAt = 0;

  function getRoomCode(){
    return v48State?.roomCode ||
      localStorage.getItem("beanersRoom") ||
      localStorage.getItem("beanersRoomCode") ||
      localStorage.getItem("beanersRoomCodeKey");
  }

  function bindV48(){
    const socket = window.socket;
    if(!socket || socket.__v48Bound) return;
    socket.__v48Bound = true;

    socket.on("roomState", state => {
      v48State = state;
    });

    document.addEventListener("click", event => {
      const botBtn = event.target.closest(".seatMiniAction");
      if(botBtn && (botBtn.dataset.action === "addBot" || botBtn.dataset.action === "removeBot")){
        lastBotActionAt = Date.now();
      }
    }, true);

    socket.on("errorMessage", message => {
      const quiet = [
        "That seat is already taken.",
        "That seat is already taken",
        "Room is already full.",
        "No empty seats available."
      ];
      if(Date.now() - lastBotActionAt < 1500 && quiet.includes(String(message))) return;
    });

    const spinBtn = document.getElementById("spinBtn");
    if(spinBtn && !spinBtn.dataset.v48Bound){
      spinBtn.dataset.v48Bound = "1";
      spinBtn.addEventListener("click", event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        socket.emit("lobbySpinStarter", { roomCode:getRoomCode() });
      }, true);
    }

    const startBtn = document.getElementById("startBtn");
    if(startBtn && !startBtn.dataset.v48Bound){
      startBtn.dataset.v48Bound = "1";
      startBtn.addEventListener("click", event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        socket.emit("lobbyStartGame", { roomCode:getRoomCode() });
      }, true);
    }

    socket.on("starterChosen", ({token, name}) => {
      if(typeof animateStarterWheel === "function"){
        animateStarterWheel(token, name);
      } else {
        const result = document.getElementById("wheelResult");
        if(result) result.textContent = `${name} Starts!`;
      }
    });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", () => setTimeout(bindV48, 400));
  } else {
    setTimeout(bindV48, 400);
  }

  setTimeout(bindV48, 1000);
})();


// v49 stability layer: token-backed lobby actions, exit, reconnect state
(() => {
  let v49State = null;

  function token(){
    return localStorage.getItem("beanersPlayerToken") ||
      localStorage.getItem("beanersToken") ||
      localStorage.getItem("beanersSessionToken") ||
      localStorage.getItem("SESSION_TOKEN_KEY");
  }

  function roomCode(){
    return v49State?.roomCode ||
      localStorage.getItem("beanersRoom") ||
      localStorage.getItem("beanersRoomCode") ||
      localStorage.getItem("beanersRoomCodeKey");
  }

  function saveSession(data){
    if(!data) return;
    if(data.roomCode){
      localStorage.setItem("beanersRoom", data.roomCode);
      localStorage.setItem("beanersRoomCode", data.roomCode);
    }
    if(data.playerId) localStorage.setItem("beanersPlayerId", data.playerId);
    if(data.playerToken){
      localStorage.setItem("beanersPlayerToken", data.playerToken);
      localStorage.setItem("beanersToken", data.playerToken);
    }
  }

  function bindV49(){
    const socket = window.socket;
    if(!socket || socket.__v49Bound) return;
    socket.__v49Bound = true;

    socket.on("roomReady", saveSession);
    socket.on("joinedRoom", saveSession);

    socket.on("roomState", state => {
      v49State = state;
      if(state?.phase === "lobby") document.body.classList.add("inLobbyMode");
      else document.body.classList.remove("inLobbyMode");
    });

    document.addEventListener("click", event => {
      const seat = event.target.closest(".lobbySeat");
      if(!seat || !v49State || v49State.phase !== "lobby") return;

      const mini = event.target.closest(".seatMiniAction");
      const seatKey = seat.dataset.seat;
      const occupant = v49State.players.find(p => p.seatKey === seatKey);

      event.preventDefault();
      event.stopImmediatePropagation();

      let action = "sit";
      if(mini) action = mini.dataset.action;
      else if(occupant?.isBot) action = "sit";
      else if(occupant && occupant.id !== localStorage.getItem("beanersPlayerId")) return;

      socket.emit("seatAction", {
        roomCode: roomCode(),
        seatKey,
        action,
        playerToken: token()
      });
    }, true);

    const exitBtn = document.getElementById("exitXBtn");
    if(exitBtn && !exitBtn.dataset.v49Bound){
      exitBtn.dataset.v49Bound = "1";
      exitBtn.addEventListener("click", event => {
        event.preventDefault();
        event.stopImmediatePropagation();

        if(confirm("Exit game?")){
          socket.emit("exitGame", {
            roomCode: roomCode(),
            playerToken: token()
          });
        }
      }, true);
    }

    const refreshBtn = document.getElementById("reconnectBtn");
    if(refreshBtn && !refreshBtn.dataset.v49Bound){
      refreshBtn.dataset.v49Bound = "1";
      refreshBtn.addEventListener("click", event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        socket.emit("requestRoomState", {
          roomCode: roomCode(),
          playerToken: token()
        });
      }, true);
    }

    socket.on("exitedGame", () => {
      localStorage.removeItem("beanersRoom");
      localStorage.removeItem("beanersRoomCode");
      localStorage.removeItem("beanersPlayerId");
      localStorage.removeItem("beanersPlayerToken");
      localStorage.removeItem("beanersToken");
      location.reload();
    });

    socket.io?.on?.("reconnect", () => {
      socket.emit("requestRoomState", {
        roomCode: roomCode(),
        playerToken: token()
      });
    });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", () => setTimeout(bindV49, 250));
  } else {
    setTimeout(bindV49, 250);
  }

  setTimeout(bindV49, 800);
})();
