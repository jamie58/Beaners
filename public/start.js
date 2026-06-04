
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

  function bind(){
    const createBtn = $("createBtn");
    const joinBtn = $("joinBtn");
    const roomInput = $("roomInput");

    if(roomInput){
      roomInput.addEventListener("input", () => {
        roomInput.value = cleanRoom();
      });
    }

    if(createBtn && !createBtn.dataset.v39Bound){
      createBtn.dataset.v39Bound = "1";
      createBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const socket = getSocket();
        if(!socket) return;

        const done = setBusy(createBtn, "Creating...");
        setTimeout(done, 2500);

        socket.emit("createRoom", { name: safeName() });
      }, true);
    }

    if(joinBtn && !joinBtn.dataset.v39Bound){
      joinBtn.dataset.v39Bound = "1";
      joinBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const socket = getSocket();
        if(!socket) return;

        const roomCode = cleanRoom();
        if(!roomCode){
          alert("Enter the 4-digit room code.");
          return;
        }

        const done = setBusy(joinBtn, "Joining...");
        setTimeout(done, 2500);

        socket.emit("joinRoom", {
          roomCode,
          name: safeName(),
          playerToken: localStorage.getItem("beanersPlayerToken") || localStorage.getItem("beanersPlayerToken")
        });
      }, true);
    }

    console.log("Beaners v39 start buttons bound", {
      createFound: !!createBtn,
      joinFound: !!joinBtn
    });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  // Run again after a short delay in case splash/app rendering shifts DOM.
  setTimeout(bind, 500);
})();
