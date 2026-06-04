
(() => {
  const $ = (id) => document.getElementById(id);

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

    console.error("Socket.IO client not available.");
    alert("Connection script did not load. Try refreshing.");
    return null;
  }

  function showStartDebug(message){
    const box = $("startDebug");
    if(box) box.textContent = message;
    console.log("Beaners start:", message);
  }

  function setBusy(button, busyText){
    if(!button) return () => {};
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = busyText;
    return () => {
      button.disabled = false;
      button.textContent = oldText;
    };
  }

  function enterRoom(data){
    if(window.beanersEnterRoom){
      window.beanersEnterRoom(data);
      return;
    }

    // Absolute fallback if app.js failed before defining the helper.
    localStorage.setItem("beanersRoom", data.roomCode);
    localStorage.setItem("beanersPlayerId", data.playerId);
    if(data.playerToken) localStorage.setItem("beanersPlayerToken", data.playerToken);

    $("lobby")?.classList.add("hidden");
    $("game")?.classList.remove("hidden");
    $("lobbyControls")?.classList.remove("hidden");
  }

  function bind(){
    const socket = getSocket();
    const createBtn = $("createBtn");
    const joinBtn = $("joinBtn");
    const roomInput = $("roomInput");

    if(!socket) return;

    if(!socket.__beanersV40RoomReadyBound){
      socket.__beanersV40RoomReadyBound = true;

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

      socket.on("errorMessage", message => {
        showStartDebug("Error: " + message);
      });
    }

    if(roomInput){
      roomInput.addEventListener("input", () => {
        roomInput.value = cleanRoom();
      });
    }

    if(createBtn && !createBtn.dataset.v40Bound){
      createBtn.dataset.v40Bound = "1";
      createBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const done = setBusy(createBtn, "Creating...");
        showStartDebug("Creating room...");

        socket.emit("createRoom", { name: safeName() });

        setTimeout(() => {
          done();
          if(!$("lobby")?.classList.contains("hidden")){
            showStartDebug("No server response yet — check Render logs");
          }
        }, 3500);
      }, true);
    }

    if(joinBtn && !joinBtn.dataset.v40Bound){
      joinBtn.dataset.v40Bound = "1";
      joinBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const roomCode = cleanRoom();
        if(!roomCode){
          alert("Enter the 4-digit room code.");
          return;
        }

        const done = setBusy(joinBtn, "Joining...");
        showStartDebug("Joining room " + roomCode + "...");

        socket.emit("joinRoom", {
          roomCode,
          name: safeName(),
          playerToken: localStorage.getItem("beanersPlayerToken")
        });

        setTimeout(() => {
          done();
          if(!$("lobby")?.classList.contains("hidden")){
            showStartDebug("No server response yet — check room code/logs");
          }
        }, 3500);
      }, true);
    }

    showStartDebug(socket.connected ? "Connected" : "Connecting...");
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  setTimeout(bind, 500);
})();
