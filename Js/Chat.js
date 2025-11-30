// FILE: Chat.js

import { db, auth, storage, rtdb } from "./Firebase_config.js"; 
import { 
    collection, 
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { 
    ref as dbRef, push, onChildAdded, onChildChanged, onChildRemoved, onValue, set, remove, update 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";


// --- Socket.IO Client Setup ---
const SERVER_URL = "https://192.168.100.42:8000";
let socket = null; 

// DOM
const messagesDiv = document.getElementById("messages");
const msgInput = document.getElementById("msg");
const sendBtn = document.getElementById("sendBtn");
const chatHeader = document.getElementById("chatHeader");

const friendNameDisplay = document.getElementById("friendNameDisplay"); 

const emojiBtn = document.getElementById("emojiBtn");
const attachBtn = document.getElementById("attachBtn");
const fileInput = document.getElementById("fileInput");
const themeToggle = document.getElementById("themeToggle");
const sendStatusWrapper = document.getElementById("chatNotification"); 
const chatInputArea = document.getElementById("chatInputArea");
const typingIndicator = document.getElementById("typingIndicator");

// Reply preview
let replyMessageObj = null;

// Current chat
let currentUserUid = null;
let currentUserName = "User Name"; 
let selectedFriendUid = null;
let selectedFriendName = null;
let convId = null;
let messagesRef = null; 

let isCurrentUserBlockedByFriend = false; 

// --- CALL DOM & WebRTC Variables ---
const callArea = document.getElementById("callArea");
const callStatus = document.getElementById("callStatus");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const answerCallBtn = document.getElementById("answerCallBtn");
const rejectCallBtn = document.getElementById("rejectCallBtn");
const endCallBtn = document.getElementById("endCallBtn");
const voiceCallBtn = document.getElementById("voiceCallBtn");
const videoCallBtn = document.getElementById("videoCallBtn");

// ✅ THÊM: Biến DOM cho Call Animation
const callAnimationContainer = document.getElementById("callAnimationContainer"); 

let peerConnection = null;
let localStream = null;
let currentCallType = null;
let isCaller = false;
let currentReceiver = null;
let isCallInProgress = false;
let incomingOfferSDP = null; 
let callTimeout = null; 
let ringtoneAudio = null; 

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
    
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
        currentUserName = userDoc.data().username || "User Name"; 
    }

    connectSocket();
});

function connectSocket() {
    if (socket && socket.connected) return;
    
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

    // --- CALL LISTENERS ---
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

        if (!await getMedia(currentCallType)) {
             socket.emit('call_response', {
                receiver: currentUserUid, 
                sender: data.sender, 
                accepted: false,
                callType: data.callType,
                reason: "Receiver media access denied." 
            });
            return;
        }
        
        isCallInProgress = true;
        isCaller = false;
        
        callArea.style.display = 'flex'; // Hiển thị khung gọi
        callStatus.textContent = `${data.senderName} đang gọi ${data.callType === 'video' ? 'Video' : 'Thoại'}...`;
        answerCallBtn.style.display = 'block';
        rejectCallBtn.style.display = 'block';
        endCallBtn.style.display = 'none'; 

        // ✅ HIỂN THỊ ANIMATION GỌI ĐẾN
        if (callAnimationContainer) {
            callAnimationContainer.style.display = 'flex'; 
        }
    });

    socket.on('call_response', (data) => {
        // ✅ ẨN ANIMATION KHI CÓ PHẢN HỒI (CHẤP NHẬN HOẶC TỪ CHỐI)
        if (callAnimationContainer) {
            callAnimationContainer.style.display = 'none'; 
        }

        if (data.accepted) {
            if (callTimeout) clearTimeout(callTimeout); 
            callTimeout = null;
            
            callStatus.textContent = `Cuộc gọi ${data.callType} đã được chấp nhận. Đang kết nối...`;
            answerCallBtn.style.display = 'none';
            rejectCallBtn.style.display = 'none';
            endCallBtn.style.display = 'block'; 
        } else {
            if (callTimeout) clearTimeout(callTimeout); 
            callTimeout = null;
            
            callStatus.textContent = data.reason?.includes("Busy") 
                ? `${selectedFriendName} đang bận.` 
                : `${selectedFriendName} đã từ chối cuộc gọi.`;
            
            // ✅ SỬA: Gọi clearCallNotification để ẩn khung sau 5s
            setTimeout(clearCallNotification, 5000); 
        }
    });
    
    socket.on('ringing', (data) => {
        if (data.sender === currentUserUid && data.receiver === selectedFriendUid && isCaller) {
            // ✅ HIỆU ỨNG ĐỔ CHUÔNG RÕ RÀNG
            callStatus.textContent = `Đang đổ chuông tới ${selectedFriendName}... 📞`;
        }
    });

    // ✅ SỬA: LISTENER NOT_REACHABLE (Bắt sự kiện từ Server khi đối phương offline sau 10s)
    socket.on('not_reachable', (data) => {
        if (data.sender === currentUserUid && data.receiver === selectedFriendUid && isCaller) {
            if (callTimeout) clearTimeout(callTimeout); 
            callTimeout = null;
            
            callStatus.textContent = `${selectedFriendName} không trực tuyến.`; 
            
            // ✅ ẨN ANIMATION VÀ THÔNG BÁO OFFLINE
            if (callAnimationContainer) {
                callAnimationContainer.style.display = 'none'; 
            }

            // ✅ SỬA: Gọi clearCallNotification để ẩn khung sau 5s
            setTimeout(clearCallNotification, 5000); 
        }
    });

    socket.on('webrtc_ice_candidate', async (data) => {
        if (data.candidate && peerConnection) {
            try {
                await peerConnection.addIceCandidate(data.candidate);
            } catch (e) {
                console.error('Error adding received ice candidate', e);
            }
        }
    });

    // ✅ SỬA: Logic SDP
    socket.on('webrtc_sdp', async (data) => {
        
        if (data.sdp.type === 'offer') {
            incomingOfferSDP = data.sdp;
            if (!isCaller && !peerConnection) {
                console.log("Offer received and stored. Waiting for user to click Answer.");
                return; // QUAN TRỌNG: Dừng lại, đợi người dùng nhấn nút Trả lời
            }
        }
        
        if (peerConnection) {
            // Người gọi nhận Answer
            if (isCaller && data.sdp.type === 'answer') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
            } 
            // Người nhận xử lý Offer trong hàm answerCall, không cần logic khác ở đây.
        }
    });

// TRONG FILE Chat.js (hoặc nơi bạn xử lý sự kiện Socket.IO)

// Nghe sự kiện khi người dùng khác ngắt cuộc gọi (từ Server)
socket.on('call_ended', (data) => {
    // 1. Dọn dẹp WebRTC và giao diện
    cleanupCall(); 
    
    // 2. Hiển thị thông báo
    const callerId = data.sender;
    displayNotification(`Cuộc gọi đã kết thúc bởi ${callerId}.`);
    
    // 3. Đảm bảo ẩn giao diện gọi sau khi hiện thông báo
    hideCallScreen(); 
    
    console.log(`[CALL ENDED] Received signal from Server. Call ended by ${callerId}.`);
});

// Xử lý khi bạn tự mình ngắt cuộc gọi
function endCall(remoteUserId) {
    // 1. Gửi tín hiệu ngắt cuộc gọi tới Server
    socket.emit('call_end', { 
        sender: myUserId, 
        receiver: remoteUserId 
    });
    
    // 2. Dọn dẹp WebRTC và giao diện (ở phía mình)
    cleanupCall(); 
    
    // 3. Hiện thông báo cho chính mình (nếu cần)
    displayNotification("Bạn đã kết thúc cuộc gọi.");
    
    // 4. Ẩn giao diện gọi
    hideCallScreen(); 
}

// Hàm dọn dẹp WebRTC (ví dụ)
function cleanupCall() {
    if (myPeerConnection) {
        myPeerConnection.close();
        myPeerConnection = null;
    }
    // Tắt stream camera/mic nếu có
    if (myStream) {
        myStream.getTracks().forEach(track => track.stop());
        myStream = null;
    }
    // Reset các biến trạng thái cuộc gọi
    isCalling = false; 
    isRinging = false;
}
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

// ---------- select friend ----------
window.addEventListener("friendSelected", async (e) => {
    selectedFriendUid = e.detail.uid;
    selectedFriendName = e.detail.name;
    
    if (friendNameDisplay) {
        friendNameDisplay.innerText = `${selectedFriendName}`;
    } else {
        chatHeader.innerText = `${selectedFriendName}`;
    }

    messagesDiv.innerHTML = "";
    
    await checkBlockStatusByRecipient(selectedFriendUid);

    if (isCurrentUserBlockedByFriend) {
        msgInput.disabled = true;
        sendBtn.disabled = true;
        voiceCallBtn.disabled = true; 
        videoCallBtn.disabled = true; 
        console.warn("Người dùng này đã chặn bạn. Bạn không thể gửi tin nhắn."); 
    } else {
        msgInput.disabled = false;
        sendBtn.disabled = false;
        voiceCallBtn.disabled = false; 
        videoCallBtn.disabled = false; 

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

// --- Logic kiểm tra trạng thái chặn ---
async function checkBlockStatusByRecipient(recipientUid) {
    isCurrentUserBlockedByFriend = false; 

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

// ---------- render message ----------
function renderMessage(msg, key) {
    if (document.querySelector(`[data-key='${key}']`)) return;

    const isMe = msg.sender === currentUserUid;
    const box = document.createElement("div");
    box.className = "msg-box " + (isMe ? "me-box" : "other-box");
    box.dataset.key = key;

    const contentWrapper = document.createElement("div");
    contentWrapper.className = "msg-content-wrapper";
    
    const messageInteractionWrapper = document.createElement("div");
    messageInteractionWrapper.style.display = 'flex';
    messageInteractionWrapper.style.alignItems = 'flex-end';
    messageInteractionWrapper.style.gap = '5px';

    const avatar = document.createElement("div"); avatar.className = "avatar";
    const bubble = document.createElement("div"); bubble.className = "msg " + (isMe ? "me" : "other");
    
    // Nội dung tin nhắn
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

    // NÚT BA CHẤM MENU
    const menuBtn = document.createElement("button");
    menuBtn.textContent = "⋮"; 
    menuBtn.className = "msg-menu-btn";
    menuBtn.style.background = "none";
    menuBtn.style.border = "none";
    menuBtn.style.color = "inherit";
    menuBtn.style.cursor = "pointer";
    menuBtn.style.opacity = "0.5";
    menuBtn.style.fontSize = "1.2em";

    menuBtn.onclick = (e) => {
        e.stopPropagation(); 
        showMessageContextMenu(e, key, msg, isMe);
    };
    
    // Xây dựng messageInteractionWrapper
    if (isMe) {
        messageInteractionWrapper.appendChild(menuBtn);
        messageInteractionWrapper.appendChild(bubble);
    } else {
        messageInteractionWrapper.appendChild(bubble);
        messageInteractionWrapper.appendChild(menuBtn);
    }

    // Xây dựng contentWrapper cuối cùng
    if (isMe) { 
        contentWrapper.appendChild(messageInteractionWrapper); 
        contentWrapper.appendChild(avatar); 
    } 
    else { 
        contentWrapper.appendChild(avatar); 
        contentWrapper.appendChild(messageInteractionWrapper); 
    }

    box.appendChild(contentWrapper);

    if (isMe) {
        const statusDiv = document.createElement("div");
        statusDiv.className = "status-message " + (msg.seen ? "seen" : "sent");
        statusDiv.textContent = msg.seen ? "Đã xem" : "Đã gửi";
        statusDiv.dataset.status = "status_" + key;
        box.appendChild(statusDiv);
    }

    messagesDiv.appendChild(box);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}


// ---------- render update ----------
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

// =======================================================
// LOGIC CONTEXT MENU
// =======================================================

function showMessageContextMenu(e, key, msg, isMe) {
    const existingMenu = document.getElementById("msgContextMenu");
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement("div");
    menu.id = "msgContextMenu"; 
    menu.style.position = "absolute"; 
    menu.style.background = "#333"; 
    menu.style.color = "#fff";
    menu.style.padding = "8px 0";
    menu.style.borderRadius = "6px"; 
    menu.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.4)";
    menu.style.zIndex = 9999; 
    menu.style.minWidth = "120px";
    menu.style.fontSize = "0.9em";

    const createMenuItem = (text, icon, onClickHandler) => {
        const item = document.createElement("div");
        item.innerHTML = `<i class="fa-solid fa-${icon}"></i> <span>${text}</span>`;
        item.style.cssText = "padding: 4px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px;";
        item.onmouseenter = () => (item.style.background = "#555");
        item.onmouseleave = () => (item.style.background = "transparent");
        item.onclick = () => { onClickHandler(); menu.remove(); };
        return item;
    };


    if (isMe) {
        menu.appendChild(createMenuItem("Edit", "pencil", () => editMessage(key, msg)));
        menu.appendChild(createMenuItem("Delete", "trash-can", async () => await deleteMessage(key)));
    }

    menu.appendChild(createMenuItem("Reply", "reply", () => replyMessage(msg)));

    document.body.appendChild(menu);
    
    const rect = e.target.getBoundingClientRect();
    menu.style.left = isMe ? `${rect.left - menu.offsetWidth - 5}px` : `${rect.right + 5}px`; 
    menu.style.top = `${rect.top - 10}px`;
    
    document.addEventListener("click", () => menu.remove(), { once: true });
}


// ---------- edit/delete/reply ----------
async function editMessage(key, msg) {
    // Logic edit (cần hoàn thiện)
}
async function deleteMessage(key) {
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


// ---------- send message ----------
sendBtn.addEventListener("click", async () => { await sendTextMessage(); });
msgInput.addEventListener("keydown", async (e) => { if (e.key === "Enter") { e.preventDefault(); await sendTextMessage(); } });
async function sendTextMessage() {
    const text = msgInput.value.trim();
    if (!selectedFriendUid || !text || !socket || !socket.connected) return;

    if (isCurrentUserBlockedByFriend) {
        console.warn("Người dùng này đã chặn bạn. Không thể gửi tin nhắn.");
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

// ---------- typing indicator ----------
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
    console.log("[Chat.js] Typing listener moved to Socket.IO.");
}


// --- Hàm hiển thị thông báo (ĐÃ VÔ HIỆU HÓA ALERT) ---
function displayNotification(message, type) { 
    console.log(`[Notification ${type.toUpperCase()}]: ${message}`);
    // ĐÃ XÓA ALERT
}

// ✅ HÀM MỚI: Dọn dẹp UI sau khi hiển thị thông báo lỗi/kết thúc (Khắc phục lỗi timeout)
function clearCallNotification() {
    callStatus.textContent = ""; 
    callArea.style.display = 'none'; 
    
    if (callAnimationContainer) {
        callAnimationContainer.style.display = 'none'; // Tắt animation
    }
    
    // Đảm bảo nút gọi được bật lại
    if (!isCurrentUserBlockedByFriend) {
        voiceCallBtn.disabled = false;
        videoCallBtn.disabled = false;
    }
    console.log("[Call] Call UI cleared successfully.");
}


// ---------- theme toggle ----------
const root = document.documentElement;
themeToggle?.addEventListener("click", () => {
    const isDark = root.dataset.theme === "dark"; 
    root.dataset.theme = isDark ? "light" : "dark";
    localStorage.setItem("chat_theme", root.dataset.theme);
});
(function initTheme() { root.dataset.theme = localStorage.getItem("chat_theme") || "dark"; })();


// --- CALL LOGIC ---

voiceCallBtn.addEventListener('click', () => startCall('voice'));
videoCallBtn.addEventListener('click', () => startCall('video'));
endCallBtn.addEventListener('click', () => endCall());
answerCallBtn.addEventListener('click', () => answerCall(true));
rejectCallBtn.addEventListener('click', () => answerCall(false));

// HÀM GET MEDIA (Đã sửa để hiển thị Video/UI ngay sau khi lấy luồng thành công)
async function getMedia(callType) {
    currentCallType = callType;
    try {
        const constraints = {
            video: callType === 'video' ? true : false, 
            audio: true 
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        localVideo.srcObject = localStream;
        
        // ✅ Cập nhật: Chỉ hiển thị localVideo nếu là video call
        localVideo.style.display = callType === 'video' ? 'block' : 'none'; 
        
        remoteVideo.style.display = 'none'; 
        
        callStatus.textContent = `Đang tải luồng ${callType} của bạn...`;
        return true;
        
    } catch (error) {
        console.error("Lỗi truy cập media:", error);
        
        let errorMessage = "LỖI: Không thể truy cập camera/micro.";
        
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            errorMessage = "QUYỀN TRUY CẬP BỊ TỪ CHỐI: Vui lòng cho phép trình duyệt truy cập camera và microphone.";
        } else if (window.location.protocol === 'http:' && !window.location.hostname.match(/localhost|127\.0\.0\.1/)) {
            errorMessage = "LỖI KẾT NỐI: WebRTC (camera/mic) **yêu cầu kết nối HTTPS**.";
        } else if (error.name === 'NotFoundError') {
            errorMessage = "KHÔNG TÌM THẤY THIẾT BỊ: Vui lòng kiểm tra camera hoặc microphone có sẵn.";
        }
        
        callStatus.textContent = "Lỗi thiết bị: " + errorMessage; 
        
        // ✅ Dùng clearCallNotification để ẩn khung sau 5s
        setTimeout(clearCallNotification, 5000); 
        return false;
    }
}

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(peerConfiguration);

    peerConnection.ontrack = (event) => {
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            
            // ✅ HIỂN THỊ VIDEO LỚN KHI CÓ TRACK
            remoteVideo.style.display = 'block'; 
            
            // Đảm bảo video cục bộ (nhỏ) cũng được hiển thị nếu là video call
            if (currentCallType === 'video') {
                localVideo.style.display = 'block'; 
            }
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('webrtc_ice_candidate', {
                sender: currentUserUid,
                receiver: currentReceiver || selectedFriendUid, 
                candidate: event.candidate
            });
        }
    };
    
    peerConnection.oniceconnectionstatechange = () => {
        console.log(`ICE Connection State: ${peerConnection.iceConnectionState}`);
        if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'disconnected') {
             if(isCallInProgress) {
                 endCall(true); 
                 callStatus.textContent = "Kết nối bị mất. Cuộc gọi kết thúc."; 
                 // ✅ Dùng clearCallNotification để ẩn khung sau 5s
                 setTimeout(clearCallNotification, 5000); 
              }
        }
        if (peerConnection.iceConnectionState === 'connected') {
            callStatus.textContent = `Đang trò chuyện (${currentCallType === 'video' ? 'Video' : 'Thoại'})`;
            
            // Ẩn animation khi kết nối thành công
            if (callAnimationContainer) {
                callAnimationContainer.style.display = 'none'; 
            }
        }
    }
}

// HÀM START CALL (Đã sửa để tích hợp hiệu ứng và timeout)
async function startCall(callType) {
    if (isCallInProgress) return;
    if (!selectedFriendUid) return; 

    // BƯỚC 1: HIỂN THỊ UI KHUNG GỌI NGAY LẬP TỨC
    callArea.style.display = 'flex';
    callStatus.textContent = `Đang chuẩn bị cuộc gọi ${callType} đến ${selectedFriendName}...`;
    endCallBtn.style.display = 'block'; 

    // ✅ HIỂN THỊ ANIMATION GỌI CHỜ
    if (callAnimationContainer) {
        callAnimationContainer.style.display = 'flex'; 
    }
    
    // BƯỚC 2: LẤY MEDIA VÀ THOÁT NẾU LỖI 
    if (!await getMedia(callType)) {
        // Tắt animation nếu lỗi media
        if (callAnimationContainer) {
            callAnimationContainer.style.display = 'none'; 
        }
        return;
    }

    isCaller = true;
    isCallInProgress = true;
    currentCallType = callType;
    currentReceiver = selectedFriendUid;
    
    createPeerConnection();
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit('call_request', { 
        sender: currentUserUid, 
        receiver: selectedFriendUid, 
        callType: callType,
        senderName: currentUserName 
    });
    
    socket.emit('webrtc_sdp', {
        sender: currentUserUid,
        receiver: selectedFriendUid,
        sdp: peerConnection.localDescription
    });

    // BƯỚC 3: CẬP NHẬT TRẠNG THÁI CHỜ PHẢN HỒI
    callStatus.textContent = `Đang chờ phản hồi từ ${selectedFriendName}...`;
    answerCallBtn.style.display = 'none';
    rejectCallBtn.style.display = 'none';
    voiceCallBtn.disabled = true; 
    videoCallBtn.disabled = true;

    // THIẾT LẬP TIMEOUT KHÔNG TRẢ LỜI (20 giây)
    if (callTimeout) clearTimeout(callTimeout);
    callTimeout = setTimeout(() => {
        if (isCallInProgress) {
            endCall(true); 
            callStatus.textContent = `${selectedFriendName} không bắt máy.`; 
            
            // ✅ ẨN ANIMATION KHI TIMEOUT
            if (callAnimationContainer) {
                callAnimationContainer.style.display = 'none'; 
            }

            // ✅ SỬA: Gọi clearCallNotification để ẩn khung sau 5s
            setTimeout(clearCallNotification, 5000); 
        }
    }, 20000); 
}

async function handleOffer(sdp) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('webrtc_sdp', {
        sender: currentUserUid,
        receiver: currentReceiver, 
        sdp: peerConnection.localDescription
    });
    
    incomingOfferSDP = null; 
}

function endCall(isLocal = false) {
    if (!isCallInProgress) return;

    if (socket && currentReceiver && !isLocal) { 
        socket.emit('call_end', { 
            sender: currentUserUid, 
            receiver: currentReceiver 
        });
    }

    resetCallState();
}

// ✅ SỬA: Hàm answerCall (Bây giờ xử lý incomingOfferSDP đã lưu)
async function answerCall(accept) {
    socket.emit('call_response', {
        receiver: currentUserUid,
        sender: currentReceiver,
        accepted: accept,
        callType: currentCallType
    });
    
    if (accept) {
        // Ẩn animation ngay khi chấp nhận
        if (callAnimationContainer) {
            callAnimationContainer.style.display = 'none'; 
        }

        if (!peerConnection) { 
            createPeerConnection(); 
            
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });

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

// ✅ SỬA: HÀM RESET CALL STATE (Chỉ dọn dẹp kết nối, để clearCallNotification ẩn UI nếu có thông báo lỗi)
function resetCallState() {
    
    if (callTimeout) clearTimeout(callTimeout); 
    callTimeout = null;
    
    // DỌN DẸP STREAM VÀ PEER CONNECTION
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
        peerConnection.close();
    }
    
    // RESET BIẾN TRẠNG THÁI
    peerConnection = null;
    localStream = null;
    isCallInProgress = false;
    isCaller = false;
    currentCallType = null;
    currentReceiver = null;
    incomingOfferSDP = null; 

    // ẨN VIDEO
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    localVideo.style.display = 'none';
    remoteVideo.style.display = 'none'; 

    // ẨN NÚT
    endCallBtn.style.display = 'none';
    answerCallBtn.style.display = 'none';
    rejectCallBtn.style.display = 'none';
    
    // CHỈ ẨN callArea/xóa callStatus nếu cuộc gọi thành công và kết thúc
    if (callStatus.textContent.includes('Đang trò chuyện') || callStatus.textContent === "") {
        callArea.style.display = 'none';
        callStatus.textContent = "";
    }
    
    // Ẩn animation
    if (callAnimationContainer) {
        callAnimationContainer.style.display = 'none'; 
    }

    // BẬT LẠI NÚT GỌI
    if (!isCurrentUserBlockedByFriend) {
        voiceCallBtn.disabled = false;
        videoCallBtn.disabled = false;
    }
    console.log("[Call] Call state reset.");
}