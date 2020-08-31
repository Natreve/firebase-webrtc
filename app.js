/*jshint esversion: 8 */
(async () => {
  /**
   * Firebase setup, replace all ###### in the firebaseConfig to your own project
   * settings value
   */
  var firebaseConfig = {
    apiKey: "######",
    authDomain: "######",
    databaseURL: "######",
    projectId: "######",
    storageBucket: "######",
    messagingSenderId: "######",
    appId: "######",
  };

  if (isDevelopment()) {
    firebaseConfig = {
      apiKey: "######",
      authDomain: "######",
      databaseURL: "http://localhost:9000/?ns=######",
      projectId: "######",
      storageBucket: "######",
      messagingSenderId: "######",
      appId: "######",
    };
  }
  firebase.initializeApp(firebaseConfig);
  const firestore = firebase.firestore();
  if (isDevelopment()) {
    firestore.settings({ host: "localhost:8080", ssl: false });
  }

  function isDevelopment() {
    if (
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1" ||
      !location.hostname
    ) {
      return true;
    } else return false;
  }
  //END FIREBASE SETTUP
  const rtcconfig = { iceServers: [{ urls: "stun:stun.1.google.com:19302" }] };
  let pc = null;
  let dc = null;
  let roomID = document.querySelector("#roomID");
  let offerID = document.querySelector("#offerID");
  const RTCcomm = document.getElementById("RTCcomm");
  const chat = document.getElementById("chat");

  const createRoomBtn = document.querySelector("#createRoom");
  const joinRoomBtn = document.querySelector("#joinRoom");

  const log = (msg) => (RTCcomm.innerHTML += `<br>${msg}`);

  /**
   *Initialises the button events that handle, joining, creating and leaving 
   a peer connection room, this function also initialises the peer connection
   with the provided rtc configurations. Note, you can use this function for any 
   additioanl events you need to have started before interacting with the app.
   */
  function init() {
    createRoomBtn.addEventListener("click", createRoom);
    joinRoomBtn.addEventListener("click", joinRoom);
    pc = new RTCPeerConnection(rtcconfig);

    initDataChannel();
  }
  /**
   * This function initialises the data channel on the peer connection in order to
   * exchange messages
   */
  function initDataChannel() {
    dc = pc.createDataChannel("chat", { negotiated: true, id: 0 });

    pc.oniceconnectionstatechange = (e) => {
      log(pc.iceConnectionState);
      if (pc.iceConnectionState === "disconnected") attemptReconnection();
    };
    dc.onopen = () => {
      console.log("chat open");
      chat.select();
      chat.disabled = false;
    };
    dc.onclose = () => {
      console.log("chat closed");
    };
    dc.onmessage = (e) => log(`> ${e.data}`);

    chat.onkeypress = function (e) {
      localStorage.setItem("T1", "on");
      if (e.keyCode != 13) return;
      dc.send(this.value);
      log(this.value);
      saveMessage(this.value); //Purely optional and can be removed if not needed
      this.value = "";
    };
  }
  async function createRoom() {
    try {
      console.log("Creating room");
      createRoomBtn.disabled = true;
      joinRoomBtn.disabled = true;

      const db = firebase.firestore();
      const rooms = db.collection("rooms");
      const room = await rooms.add({}); //adds a new(empty) room to the rooms collection, this will be used to get the room ID for later use

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      pc.onicecandidate = async ({ candidate }) => {
        if (candidate) return;

        const offerCollection = await rooms.doc(room.id).collection("offer");
        const offerDocument = await offerCollection.add({
          offer: { type: offer.type, sdp: offer.sdp },
        });
        const answerCollection = await rooms.doc(room.id).collection("answer");
        const answerDocument = await answerCollection.add({});

        //Adds a refernce in the offer and answer document that link them to each other
        await offerDocument.set({ answer: answerDocument.id }, { merge: true });
        await answerDocument.set({ offer: offerDocument.id }, { merge: true });

        //sets the textarea values to the room and offer ID
        roomID.value = room.id;
        offerID.value = offerDocument.id;

        /**
         * Real-time event listener that checks to see if a change  occurs in the answer document.
         * if a change accures it sets the peer connections remote discription to the new sdp
         * this allows for reconnection
         */

        answerDocument.onSnapshot(async (snapshot) => {
          const data = snapshot.data().answer;

          if (data && data.sdp)
            pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
        });
        console.log("Room created");
      };
    } catch (error) {
      console.log(`There was an error creating the room ${error}`);
      createRoomBtn.disabled = false;
      joinRoomBtn.disabled = false;
    }
  }

  async function joinRoom() {
    console.log("Joining room");
    try {
      if (pc.signalingState != "stable") {
        console.log(`The connection is not stable, try again`);
        createRoomBtn.disabled = false;
        joinRoomBtn.disabled = false;
        return;
      }
      createRoomBtn.disabled = true;
      joinRoomBtn.disabled = true;

      const db = firebase.firestore();
      const roomDocument = db.collection("rooms").doc(roomID.value);
      const roomSnapshot = await roomDocument.get();
      const offerDocument = roomDocument.collection("offer").doc(offerID.value);
      const offerSnapshot = await offerDocument.get();

      const answerDocument = roomDocument
        .collection("answer")
        .doc(offerSnapshot.data().answer);
      const answerSnapshot = await answerDocument.get();

      if (
        !roomSnapshot.exists ||
        !offerSnapshot.exists ||
        !answerSnapshot.exists
      ) {
        console.log(`The room or room data isn't available`);
        createRoomBtn.disabled = false;
        joinRoomBtn.disabled = false;
        return;
      }

      const offer = offerSnapshot.data().offer;
      await pc.setRemoteDescription({ type: "offer", sdp: offer.sdp });

      const answer = await pc.createAnswer();
      pc.setLocalDescription(answer);
      pc.onicecandidate = async ({ candidate }) => {
        if (candidate) return;
        await answerDocument.update({
          answer: { type: answer.type, sdp: pc.localDescription.sdp },
        });
        /**
         * NOTE: this event listener is for a case where the host disconnected, forcing the user who
         * joined to become a new host.
         *
         * Real-time event listener that checks to see if a change  occurs in the answer document.
         * if a change accures it sets the peer connections remote discription to the new sdp
         * this allows for reconnection
         */
        answerDocument.onSnapshot(async (snapshot) => {
          const data = snapshot.data().answer;

          if (!pc.currentRemoteDescription && data && data.sdp) {
            pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
          }
        });
      };
    } catch (error) {
      console.log(`There was an error creating the room ${error}`);
      createRoomBtn.disabled = false;
      joinRoomBtn.disabled = false;
    }
  }
  /**
   * This simply save the chat messages to the current room each time a message is sent from the user
   */
  async function saveMessage(msg) {
    const db = firebase.firestore();
    const roomDocument = db.collection("rooms").doc(roomID.value);
    await roomDocument.update({
      messages: firebase.firestore.FieldValue.arrayUnion(msg),
    });
  }
  /**
   * This function is triggered whenever the remote peer is disconnected.
   * If the remote peer was disconnected, it will attempt to re-establish
   * a peer connection, if successful the four way handshake is restarted
   * and the peer that is still connected becomes the host awaiting a answer.
   *
   */
  async function attemptReconnection() {
    try {
      console.log("Attempting to reconnect");
      const db = firebase.firestore();
      const rooms = db.collection("rooms");

      pc = new RTCPeerConnection(rtcconfig);
      initDataChannel();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      pc.onicecandidate = async ({ candidate }) => {
        if (candidate) return;
        await rooms
          .doc(roomID.value)
          .collection("offer")
          .doc(offerID.value)
          .update({ offer: { type: offer.type, sdp: offer.sdp } });
      };
    } catch (error) {
      console.log(`There was an error in an attempt to reconnect: ${error}`);
      createRoomBtn.disabled = false;
      joinRoomBtn.disabled = false;
    }
  }

  init();
})();
