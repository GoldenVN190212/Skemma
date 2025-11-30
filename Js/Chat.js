// ✅ ĐÃ SỬA LỖI: Hợp nhất tất cả imports từ Firebase_config.js vào một dòng duy nhất
// và giữ lại tất cả các imports còn lại từ các CDN của Firebase
import { db, auth, storage, rtdb } from "./Firebase_config.js"; // Import db (Firestore), auth, storage, và rtdb (Realtime DB)
import { 
    collection, // Import Firestore functions
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { 
  ref as dbRef, push, onChildAdded, onChildChanged, onChildRemoved, onValue, set, remove, update 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";


// --- Socket.IO Client Setup ---
const SERVER_URL = "http://192.168.100.42:8000";
let socket = null; // Khai báo socket

// DOM (Đã cập nhật theo DOM trong code của bạn)
const messagesDiv = document.getElementById("messages");
const msgInput = document.getElementById("msg");
const sendBtn = document.getElementById("sendBtn");
const chatHeader = document.getElementById("chatHeader");

// ✅ ĐÃ SỬA: Thêm biến DOM cho SPAN chứa tên bạn bè
const friendNameDisplay = document.getElementById("friendNameDisplay"); 

const emojiBtn = document.getElementById("emojiBtn");
const attachBtn = document.getElementById("attachBtn");
const fileInput = document.getElementById("fileInput");
const themeToggle = document.getElementById("themeToggle");
const sendStatusWrapper = document.getElementById("chatNotification"); // Dùng làm notification
const chatInputArea = document.getElementById("chatInputArea");
const typingIndicator = document.getElementById("typingIndicator");

// Reply preview
let replyMessageObj = null;

// Current chat
let currentUserUid = null;
// ⚠️ CẦN HOÀN THIỆN: Thêm biến để lưu trữ TÊN CỦA NGƯỜI DÙNG HIỆN TẠI
let currentUserName = "User Name"; 
let selectedFriendUid = null;
let selectedFriendName = null;
let convId = null;
let messagesRef = null; 

let isCurrentUserBlockedByFriend = false; 

// --- CALL DOM & WebRTC Variables (MỚI) ---
const callArea = document.getElementById("callArea");
const callStatus = document.getElementById("callStatus");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const answerCallBtn = document.getElementById("answerCallBtn");
const rejectCallBtn = document.getElementById("rejectCallBtn");
const endCallBtn = document.getElementById("endCallBtn");
const voiceCallBtn = document.getElementById("voiceCallBtn");
const videoCallBtn = document.getElementById("videoCallBtn");

let peerConnection = null;
let localStream = null;
let currentCallType = null;
let isCaller = false;
let currentReceiver = null;
let isCallInProgress = false;
let incomingOfferSDP = null; // ✅ MỚI: Biến lưu trữ Offer SDP khi có cuộc gọi đến

// Cấu hình ICE Servers (dùng Google STUN mặc định)
const peerConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ]
};

// --- Auth ---
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  currentUserUid = user.uid;
  
  // ⚠️ CẦN HOÀN THIỆN: Lấy tên người dùng hiện tại từ Firestore
  const userDoc = await getDoc(doc(db, "users", user.uid));
  if (userDoc.exists()) {
    currentUserName = userDoc.data().username || "User Name"; 
  }

  connectSocket();
});

function connectSocket() {
    if (socket && socket.connected) return;
    
    // Kết nối Socket.IO, truyền UID qua auth payload
    socket = io(SERVER_URL, {
        auth: {
            uid: currentUserUid
        }
    });

    socket.on('connected', (data) => {
        console.log(`[Socket.IO] Connected. Server message: ${data.message}`);
        if (selectedFriendUid) {
            requestHistory();
        }
    });

    socket.on('receive_message', (msg) => {
        console.log("[Socket.IO] New Message Received:", msg);
        renderMessage(msg, msg.key); 
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });

    socket.on('message_history', (data) => {
        console.log(`[Socket.IO] Received history for ${data.convId}: ${data.messages.length} messages.`);
        messagesDiv.innerHTML = ""; 
        data.messages.forEach(msg => {
            renderMessage(msg, msg.key);
        });
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });

    socket.on('typing', (data) => {
        const isTyping = data.isTyping;
        typingIndicator.textContent = isTyping ? `${selectedFriendName} đang trả lời...` : "";
    });

    socket.on('disconnect', () => {
        console.warn("[Socket.IO] Disconnected. Attempting to reconnect...");
    });

    // --- CALL LISTENERS (MỚI) ---

    // 6. Xử lý cuộc gọi đến ('incoming_call')
    socket.on('incoming_call', async (data) => {
        if (isCallInProgress) {
            socket.emit('call_response', {
                receiver: currentUserUid, 
                sender: data.sender, 
                accepted: false,
                callType: data.callType,
                reason: "Busy" 
            });
            return;
        }

        currentCallType = data.callType;
        currentReceiver = data.sender; 

        if (!await getMedia(currentCallType)) return;
        
        isCallInProgress = true;
        isCaller = false;
        
        callStatus.textContent = `${data.senderName} đang gọi ${data.callType === 'video' ? 'Video' : 'Thoại'}...`;
        answerCallBtn.style.display = 'block';
        rejectCallBtn.style.display = 'block';
        endCallBtn.style.display = 'none'; 
    });

    // 7. Phản hồi cuộc gọi ('call_response')
    socket.on('call_response', (data) => {
        if (data.accepted) {
            callStatus.textContent = `Cuộc gọi ${data.callType} đã được chấp nhận. Đang kết nối...`;
            answerCallBtn.style.display = 'none';
            rejectCallBtn.style.display = 'none';
            endCallBtn.style.display = 'block'; 
        } else {
            resetCallState();
            displayNotification(data.reason || "Người dùng đã từ chối cuộc gọi.", 'error');
        }
    });
    
    // 8. Lỗi gọi
    socket.on('call_failed', (data) => {
        resetCallState();
        displayNotification(data.reason, 'error');
    });

    // 9. Xử lý ICE Candidate
    socket.on('webrtc_ice_candidate', async (data) => {
        if (data.candidate && peerConnection) {
            try {
                await peerConnection.addIceCandidate(data.candidate);
            } catch (e) {
                console.error('Error adding received ice candidate', e);
            }
        }
    });

    // 10. Xử lý SDP (Offer/Answer)
    socket.on('webrtc_sdp', async (data) => {
        
        if (data.sdp.type === 'offer') {
            // ✅ ĐÃ SỬA: Lưu trữ Offer SDP, đợi người dùng bấm Answer
            incomingOfferSDP = data.sdp;
            // Nếu người nhận (không phải người gọi)
            if (!isCaller && !peerConnection) {
                // Đã nhận được Offer, nhưng đợi người dùng chấp nhận (answerCall) để tạo PeerConnection
                // Đã có logic xử lý trong incoming_call, không cần làm gì thêm ở đây.
                console.log("Offer received and stored. Waiting for user to click Answer.");
                return;
            }
        }
        
        if (peerConnection) {
            if (isCaller && data.sdp.type === 'answer') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
            } else if (!isCaller && data.sdp.type === 'offer' && !incomingOfferSDP) {
                // Trường hợp nếu Offer đến sau khi đã tạo PC (thường không xảy ra nếu logic chuẩn)
                await handleOffer(data.sdp);
            }
        }
    });

    // 11. Kết thúc cuộc gọi
    socket.on('call_ended', (data) => {
        // Chỉ reset nếu cuộc gọi đến từ friend đang chọn
        if(data.sender === selectedFriendUid || data.sender === currentReceiver) {
            displayNotification(`${selectedFriendName} đã kết thúc cuộc gọi.`, 'info');
            resetCallState();
        }
    });
}

function requestHistory() {
    if (socket && selectedFriendUid && currentUserUid) {
        socket.emit('request_history', { sender: currentUserUid, receiver: selectedFriendUid });
    }
}

// --- format time ---
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

// ---------- emoji picker ----------
// (Giữ nguyên logic Emoji)

// ---------- select friend (CẬP NHẬT LOGIC CHẶN) ----------
window.addEventListener("friendSelected", async (e) => {
  selectedFriendUid = e.detail.uid;
  selectedFriendName = e.detail.name;
  
  // ✅ ĐÃ SỬA: Chỉ cập nhật nội dung của SPAN chứa tên
  if (friendNameDisplay) {
    friendNameDisplay.innerText = `${selectedFriendName}`;
  } else {
    // Dòng dự phòng nếu HTML chưa sửa
    chatHeader.innerText = `${selectedFriendName}`;
}

  messagesDiv.innerHTML = "";
    
    await checkBlockStatusByRecipient(selectedFriendUid);

    if (isCurrentUserBlockedByFriend) {
        msgInput.disabled = true;
        sendBtn.disabled = true;
        voiceCallBtn.disabled = true; // Tắt nút gọi
        videoCallBtn.disabled = true; // Tắt nút gọi
        displayNotification("Người dùng này đã chặn bạn. Bạn không thể gửi tin nhắn.", 'warning');
    } else {
        msgInput.disabled = false;
        sendBtn.disabled = false;
        voiceCallBtn.disabled = false; // Bật nút gọi
        videoCallBtn.disabled = false; // Bật nút gọi
        if (sendStatusWrapper) sendStatusWrapper.innerHTML = ''; 

        convId = [currentUserUid, selectedFriendUid].sort().join("_");
        messagesRef = dbRef(rtdb, `conversations/${convId}/messages`);

        onChildChanged(messagesRef, (snapshot) => {
            const msg = snapshot.val(); msg.key = snapshot.key;
            renderMessageUpdate(msg, msg.key);
        });

        onChildRemoved(messagesRef, (snapshot) => {
            const key = snapshot.key;
            const box = document.querySelector(`[data-key='${key}']`);
            if (box) {
                const prevScroll = messagesDiv.scrollTop;
                box.remove();
                messagesDiv.scrollTop = prevScroll;
            }
        });
        
        requestHistory(); 
        listenTyping(); 
    }
});

// --- Logic kiểm tra trạng thái chặn (Dùng Firestore) ---
async function checkBlockStatusByRecipient(recipientUid) {
    isCurrentUserBlockedByFriend = false; 
    if (sendStatusWrapper) sendStatusWrapper.innerHTML = '';

    if (!recipientUid) return;

    try {
        const recipientRef = doc(db, "users", recipientUid);
        const recipientSnap = await getDoc(recipientRef);
        const recipientData = recipientSnap.data();

        if (recipientData && recipientData.blockedUsers?.includes(currentUserUid)) {
            isCurrentUserBlockedByFriend = true;
        }

    } catch (error) {
        console.warn("Lỗi khi kiểm tra trạng thái chặn từ Firestore:", error);
        isCurrentUserBlockedByFriend = false;
    }
}


// ---------- render message (Giữ nguyên) ----------
function renderMessage(msg, key) {
  if (document.querySelector(`[data-key='${key}']`)) return;

  const box = document.createElement("div");
  box.className = "msg-box " + (msg.sender === currentUserUid ? "me-box" : "other-box");
  box.dataset.key = key;
  
  const contentWrapper = document.createElement("div");
  contentWrapper.className = "msg-content-wrapper";

  const avatar = document.createElement("div"); avatar.className = "avatar";
  const bubble = document.createElement("div"); bubble.className = "msg " + (msg.sender === currentUserUid ? "me" : "other");

  if (msg.reply) {
    const replyDiv = document.createElement("div");
    replyDiv.className = "replyPreviewMsg";
    replyDiv.textContent = msg.reply.text || (msg.reply.type === "image" ? "[Image]" : "[Video]");
    replyDiv.style.fontSize = "0.85em"; replyDiv.style.opacity = "0.8"; replyDiv.style.marginBottom = "4px";
    bubble.appendChild(replyDiv);
  }

  if (msg.type === "image") {
    const img = document.createElement("img"); img.src = msg.mediaURL; img.className = "msg-media";
    img.onclick = () => window.open(msg.mediaURL, "_blank"); bubble.appendChild(img);
  } else if (msg.type === "video") {
    const vid = document.createElement("video"); vid.src = msg.mediaURL; vid.controls = true; vid.className = "msg-media"; bubble.appendChild(vid);
  } else {
    const txt = document.createElement("div"); txt.className = "text"; txt.textContent = msg.text || ""; bubble.appendChild(txt);
  }

  const t = document.createElement("div"); t.className = "time"; t.textContent = formatTime(msg.timestamp || Date.now());
  bubble.appendChild(t);

  if (msg.sender === currentUserUid) { 
    contentWrapper.appendChild(bubble); 
    contentWrapper.appendChild(avatar); 
} 
  else { 
    contentWrapper.appendChild(avatar); 
    contentWrapper.appendChild(bubble); 
}
  
  box.appendChild(contentWrapper);

  if (msg.sender === currentUserUid) {
      const statusDiv = document.createElement("div");
      statusDiv.className = "status-message " + (msg.seen ? "seen" : "sent");
      statusDiv.textContent = msg.seen ? "Đã xem" : "Đã gửi";
      statusDiv.dataset.status = "status_" + key;
      box.appendChild(statusDiv);
  }

  messagesDiv.appendChild(box);
  attachContextMenuToMessage(bubble, key, msg, msg.sender === currentUserUid);
}


// ---------- render update (Giữ nguyên) ----------
function renderMessageUpdate(msg, key) {
  const box = document.querySelector(`[data-key='${key}']`);
  if (!box) return;
  
  const bubble = box.querySelector(".msg");
  bubble.innerHTML = "";

  if (msg.reply) {
    const replyDiv = document.createElement("div");
    replyDiv.className = "replyPreviewMsg";
    replyDiv.textContent = msg.reply.text || (msg.reply.type === "image" ? "[Image]" : "[Video]");
    replyDiv.style.fontSize = "0.85em"; replyDiv.style.opacity = "0.8"; replyDiv.style.marginBottom = "4px";
    bubble.appendChild(replyDiv);
  }

  if (msg.type === "image") {
    const img = document.createElement("img"); img.src = msg.mediaURL; img.className = "msg-media"; img.onclick = () => window.open(msg.mediaURL, "_blank"); bubble.appendChild(img);
  } else if (msg.type === "video") {
    const vid = document.createElement("video"); vid.src = msg.mediaURL; vid.controls = true; vid.className = "msg-media"; bubble.appendChild(vid);
  } else {
    const txt = document.createElement("div"); txt.className = "text"; txt.textContent = msg.text || ""; bubble.appendChild(txt);
  }

  const t = document.createElement("div"); t.className = "time"; t.textContent = formatTime(msg.timestamp || Date.now());
  bubble.appendChild(t);

  if (msg.sender === currentUserUid) {
      const statusDiv = box.querySelector(".status-message");
      if(statusDiv) {
          statusDiv.textContent = msg.seen ? "Đã xem" : "Đã gửi";
          statusDiv.classList.remove("sent", "seen");
          statusDiv.classList.add(msg.seen ? "seen" : "sent");
      }
  }
}

// ---------- context menu (Giữ nguyên) ----------
function attachContextMenuToMessage(bubble, key, msg, isMe) {
  bubble.oncontextmenu = (e) => {
    e.preventDefault();
    const existingMenu = document.getElementById("msgContextMenu");
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement("div");
    menu.id = "msgContextMenu"; menu.style.position = "absolute"; menu.style.background = "#333"; menu.style.color = "#fff";
    menu.style.padding = "8px"; menu.style.borderRadius = "6px"; menu.style.zIndex = 9999; menu.style.minWidth = "120px";

    if (isMe) {
      const editBtn = document.createElement("div"); editBtn.textContent = "Edit"; editBtn.style.cursor = "pointer";
      editBtn.onclick = () => { editMessage(key, msg); menu.remove(); }; menu.appendChild(editBtn);

      const deleteBtn = document.createElement("div"); deleteBtn.textContent = "Delete"; deleteBtn.style.cursor = "pointer";
      deleteBtn.onclick = async () => { await deleteMessage(key); menu.remove(); }; menu.appendChild(deleteBtn);
    }

    const replyBtn = document.createElement("div"); replyBtn.textContent = "Reply"; replyBtn.style.cursor = "pointer";
    replyBtn.onclick = () => { replyMessage(msg); menu.remove(); }; menu.appendChild(replyBtn);

    document.body.appendChild(menu);
    menu.style.left = `${e.pageX}px`; menu.style.top = `${e.pageY}px`;
    document.addEventListener("click", () => menu.remove(), { once: true });
  };
}

// ---------- edit/delete/reply (Giữ nguyên) ----------
async function editMessage(key, msg) {
  // Logic edit (cần hoàn thiện)
}
async function deleteMessage(key) {
  // Logic delete (cần hoàn thiện)
  await remove(dbRef(rtdb, `conversations/${convId}/messages/${key}`));
}
function replyMessage(msg) {
  replyMessageObj = msg;
  let replyPreview = document.getElementById("replyPreview");
  if (replyPreview) replyPreview.style.display = "flex";
  document.getElementById("replyText").textContent = msg.text || (msg.type === "image" ? "[Image]" : "[Video]");
  msgInput.focus();
}
document.getElementById("cancelReplyBtn")?.addEventListener("click", () => {
    replyMessageObj = null;
    document.getElementById("replyPreview").style.display = "none";
});


// ---------- send message (Dùng Socket.IO) ----------
sendBtn.addEventListener("click", async () => { await sendTextMessage(); });
msgInput.addEventListener("keydown", async (e) => { if (e.key === "Enter") { e.preventDefault(); await sendTextMessage(); } });
async function sendTextMessage() {
  const text = msgInput.value.trim();
  if (!selectedFriendUid || !text || !socket || !socket.connected) return;

    if (isCurrentUserBlockedByFriend) {
        displayNotification("Người dùng này đã chặn bạn. Không thể gửi tin nhắn.", 'error');
        msgInput.value = "";
        return;
    }

  const payload = {
    sender: currentUserUid,
    receiver: selectedFriendUid, 
    text: text || "",
    timestamp: Date.now(),
    seen: false,
    type: "text",
    reply: replyMessageObj ? {
      key: replyMessageObj.key || null,
      text: replyMessageObj.text || "",
      type: replyMessageObj.type || "text"
    } : null
  };
    
  socket.emit('send_message', payload);

  msgInput.value = "";
  replyMessageObj = null;
  const replyPreview = document.getElementById("replyPreview");
  if (replyPreview) replyPreview.style.display = "none";
  
  sendTypingStatus(false);
}

// ---------- typing indicator (Dùng Socket.IO) ----------
let typingTimeout = null;
msgInput.addEventListener("input", () => {
  if (!convId || !currentUserUid) return;
    
    if (isCurrentUserBlockedByFriend) return; 

    sendTypingStatus(true);
    
  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => { sendTypingStatus(false); }, 1500);
});

function sendTypingStatus(isTyping) {
    if (socket && selectedFriendUid && currentUserUid) {
        socket.emit('typing', {
            sender: currentUserUid,
            receiver: selectedFriendUid,
            isTyping: isTyping
        });
    }
}

function listenTyping() {
  // Đã chuyển logic nhận trạng thái gõ phím sang socket.on('typing')
  console.log("[Chat.js] Typing listener moved to Socket.IO.");
}


// --- Hàm hiển thị thông báo (notification) ---
function displayNotification(message, type) {
    if (!sendStatusWrapper) return;
    
    sendStatusWrapper.innerHTML = `<div class="p-2 text-center text-sm font-medium rounded-lg">${message}</div>`;
    const notificationDiv = sendStatusWrapper.querySelector('div');

    if (type === 'warning') {
        notificationDiv.classList.add('bg-yellow-100', 'text-yellow-800', 'border', 'border-yellow-300');
    } else if (type === 'error') {
        notificationDiv.classList.add('bg-red-500', 'text-white');
    } else if (type === 'info') {
        notificationDiv.classList.add('bg-blue-500', 'text-white');
    } else {
        notificationDiv.classList.add('bg-gray-700', 'text-white');
    }
    
    if (type !== 'warning' && type !== 'error') {
        setTimeout(() => sendStatusWrapper.innerHTML = "", 5000);
    }
}


// ---------- theme toggle (Giữ nguyên) ----------
const root = document.documentElement;
themeToggle?.addEventListener("click", () => {
  const isDark = root.dataset.theme === "dark"; 
  root.dataset.theme = isDark ? "light" : "dark";
  localStorage.setItem("chat_theme", root.dataset.theme);
});
(function initTheme() { root.dataset.theme = localStorage.getItem("chat_theme") || "dark"; })();


// --- CALL LOGIC (MỚI) ---

voiceCallBtn.addEventListener('click', () => startCall('voice'));
videoCallBtn.addEventListener('click', () => startCall('video'));
endCallBtn.addEventListener('click', () => endCall());
answerCallBtn.addEventListener('click', () => answerCall(true));
rejectCallBtn.addEventListener('click', () => answerCall(false));

async function getMedia(callType) {
    currentCallType = callType;
    try {
        const constraints = {
            video: callType === 'video', 
            audio: true 
        };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
        // Hiển thị local video
        localVideo.style.display = callType === 'video' ? 'block' : 'none'; 
        // Ẩn remote video cho đến khi có track
        remoteVideo.style.display = 'none'; 
        callArea.style.display = 'flex';
        return true;
    } catch (error) {
        console.error("Lỗi truy cập media:", error);
        displayNotification("Lỗi: Không thể truy cập camera/micro.", 'error');
        resetCallState();
        return false;
    }
}

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(peerConfiguration);

    // Track đã được thêm trong startCall và answerCall(true)

    peerConnection.ontrack = (event) => {
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            // ✅ ĐÃ SỬA: Luôn hiển thị remote video khi có track
            remoteVideo.style.display = 'block'; 
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('webrtc_ice_candidate', {
                sender: currentUserUid,
                receiver: currentReceiver || selectedFriendUid, // Dùng currentReceiver khi đang gọi
                candidate: event.candidate
            });
        }
    };
    
    peerConnection.oniceconnectionstatechange = () => {
        console.log(`ICE Connection State: ${peerConnection.iceConnectionState}`);
        if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'disconnected') {
             if(isCallInProgress) {
                // Tự động kết thúc nếu kết nối thất bại
                endCall(true); // Gửi cờ 'isLocal' để không gửi lại tín hiệu endCall
                displayNotification("Kết nối bị mất hoặc thất bại. Cuộc gọi kết thúc.", 'error');
             }
        }
        if (peerConnection.iceConnectionState === 'connected') {
             callStatus.textContent = `Đang trò chuyện (${currentCallType === 'video' ? 'Video' : 'Thoại'})`;
        }
    }
}

async function startCall(callType) {
    if (isCallInProgress) return;
    if (!selectedFriendUid) return; // Không gọi khi chưa chọn bạn

    if (!await getMedia(callType)) return;

    isCaller = true;
    isCallInProgress = true;
    currentCallType = callType;
    currentReceiver = selectedFriendUid;
    
    createPeerConnection();
    // Thêm tracks vào PeerConnection
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // 1. Tạo Offer SDP
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // 2. Gửi Yêu cầu gọi qua Socket.IO
    socket.emit('call_request', { 
        sender: currentUserUid, 
        receiver: selectedFriendUid, 
        callType: callType,
        // ✅ ĐÃ SỬA: Gửi tên người dùng hiện tại
        senderName: currentUserName 
    });
    
    // Gửi Offer SDP 
    socket.emit('webrtc_sdp', {
        sender: currentUserUid,
        receiver: selectedFriendUid,
        sdp: peerConnection.localDescription
    });

    callStatus.textContent = `Đang gọi ${selectedFriendName} (${callType === 'video' ? 'Video' : 'Thoại'})...`;
    endCallBtn.style.display = 'block';
    answerCallBtn.style.display = 'none';
    rejectCallBtn.style.display = 'none';
    voiceCallBtn.disabled = true; 
    videoCallBtn.disabled = true;
}

async function handleOffer(sdp) {
    // Thiết lập remote description từ Offer của người gọi
    await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));

    // Tạo Answer SDP
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // Gửi Answer SDP qua Socket.IO
    socket.emit('webrtc_sdp', {
        sender: currentUserUid,
        receiver: currentReceiver, // Gửi lại cho người đã gọi mình
        sdp: peerConnection.localDescription
    });
    
    incomingOfferSDP = null; // Xóa Offer đã xử lý
}

function endCall(isLocal = false) {
    if (!isCallInProgress) return;

    // Gửi tín hiệu kết thúc cuộc gọi đến người kia
    if (socket && currentReceiver && !isLocal) { // Chỉ gửi nếu không phải kết thúc cục bộ do lỗi
         socket.emit('call_end', { 
            sender: currentUserUid, 
            receiver: currentReceiver 
        });
    }

    resetCallState();
}

async function answerCall(accept) {
    // Gửi phản hồi đến người gọi qua Socket.IO
    socket.emit('call_response', {
        receiver: currentUserUid,
        sender: currentReceiver,
        accepted: accept,
        callType: currentCallType
    });
    
    if (accept) {
        // ✅ ĐÃ SỬA: Nếu là người nhận và chấp nhận, tạo PeerConnection và xử lý Offer
        if (!peerConnection) { 
            createPeerConnection(); 
            
            // Thêm tracks vào PeerConnection
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });

            // Xử lý Offer SDP đã lưu trữ
            if (incomingOfferSDP) {
                await handleOffer(incomingOfferSDP);
            }
        }

        callStatus.textContent = "Cuộc gọi đã được chấp nhận. Đang chờ kết nối...";
        answerCallBtn.style.display = 'none';
        rejectCallBtn.style.display = 'none';
        endCallBtn.style.display = 'block'; 
    } else {
        resetCallState();
    }
}

function resetCallState() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
        peerConnection.close();
    }
    
    peerConnection = null;
    localStream = null;
    isCallInProgress = false;
    isCaller = false;
    currentCallType = null;
    currentReceiver = null;
    incomingOfferSDP = null; // Xóa SDP đã lưu trữ

    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    localVideo.style.display = 'none';
    remoteVideo.style.display = 'none'; // Ẩn remote video

    callArea.style.display = 'none';
    endCallBtn.style.display = 'none';
    answerCallBtn.style.display = 'none';
    rejectCallBtn.style.display = 'none';
    callStatus.textContent = "";

	// Đảm bảo nút gọi được bật lại (trừ khi người dùng bị chặn)
	if (!isCurrentUserBlockedByFriend) {
		voiceCallBtn.disabled = false;
		videoCallBtn.disabled = false;
	}
}