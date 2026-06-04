
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
        event.stopPropagation();

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
        event.stopPropagation();

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
    event.stopPropagation();
    window.socket.emit("seatAction", { roomCode, seatKey, action: mini.dataset.action });
    return;
  }

  if(!occupant || occupant.isBot || occupant.id === localStorage.getItem("beanersPlayerId")){
    event.preventDefault();
    event.stopPropagation();
    window.socket.emit("seatAction", { roomCode, seatKey, action:"sit" });
  }
}, true);
