
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
    document.body.classList.add("inLobbyMode");

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
      if(btn.dataset.v42Bound) return;
      btn.dataset.v42Bound = "1";
      btn.addEventListener("click", event => {
        const state = latestLobbyState;
        if(!state) return;

        const seatKey = btn.dataset.seat;
        const occupant = state.players.find(p => p.seatKey === seatKey);
        const roomCode = state.roomCode || localStorage.getItem("beanersRoom");
        const actionButton = event.target.closest(".seatMiniAction");
        const action = actionButton?.dataset.action;

        event.preventDefault();
        event.stopPropagation();

        if(action === "addBot"){
          socket.emit("seatAction", { roomCode, seatKey, action:"addBot" });
          return;
        }

        if(action === "removeBot" || occupant?.isBot){
          socket.emit("seatAction", { roomCode, seatKey, action:"removeBot" });
          return;
        }

        if(!occupant || occupant.id === localStorage.getItem("beanersPlayerId")){
          socket.emit("seatAction", { roomCode, seatKey, action:"sit" });
          return;
        }
      }, true);
    });

    showStartDebug(socket.connected ? "Connected" : "Connecting...");
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();

  setTimeout(bind, 500);
})();
