// Chat.js (FULL - no online/offline, with "đang trả lời" typing)
import { rtdb, auth, storage } from "./Firebase_config.js";
import { 
  ref as dbRef, push, onChildAdded, onChildChanged, onChildRemoved, onValue, set, remove, update 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

// DOM
const messagesDiv = document.getElementById("messages");
const msgInput = document.getElementById("msg");
const sendBtn = document.getElementById("sendBtn");
const chatHeader = document.getElementById("chatHeader");
const emojiBtn = document.getElementById("emojiBtn");
const attachBtn = document.getElementById("attachBtn");
const fileInput = document.getElementById("fileInput");
const themeToggle = document.getElementById("themeToggle");
const sendStatusWrapper = document.getElementById("sendStatusWrapper"); // Giữ lại DOM nhưng không dùng
const chatInputArea = document.getElementById("chatInputArea");
const typingIndicator = document.getElementById("typingIndicator");

// Reply preview
let replyMessageObj = null;

// Current chat
let currentUserUid = null;
let selectedFriendUid = null;
let selectedFriendName = null;
let convId = null;
let messagesRef = null;

// --- Auth ---
onAuthStateChanged(auth, (user) => {
  if (!user) return;
  currentUserUid = user.uid;
});

// --- format time ---
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

// ---------- emoji picker ----------
const EMOJIS = ["😀","😁","😂","😊","😍","😘","😎","🤔","😅","👍","👏","🎉","💖","🔥","😢","😡"];
let emojiPopup = null;
function createEmojiPopup() {
  if (emojiPopup) return;
  emojiPopup = document.createElement("div");
  emojiPopup.id = "emojiPopup";
  emojiPopup.style.position = "absolute";
  emojiPopup.style.padding = "8px";
  emojiPopup.style.background = "rgba(0,0,0,0.8)";
  emojiPopup.style.borderRadius = "8px";
  emojiPopup.style.display = "grid";
  emojiPopup.style.gridTemplateColumns = "repeat(8, 28px)";
  emojiPopup.style.gap = "6px";
  emojiPopup.style.zIndex = 9999;
  EMOJIS.forEach(e => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "emojiItem";
    b.textContent = e;
    b.onclick = () => { msgInput.value += e; msgInput.focus(); };
    emojiPopup.appendChild(b);
  });
  document.body.appendChild(emojiPopup);
}
emojiBtn.addEventListener("click", (ev) => {
  createEmojiPopup();
  const rect = emojiBtn.getBoundingClientRect();
  emojiPopup.style.left = `${rect.left}px`;
  emojiPopup.style.top = `${rect.bottom + 8}px`;
  emojiPopup.style.display = emojiPopup.style.display === "grid" ? "none" : "grid";
});
document.addEventListener("click", (e) => {
  if (emojiPopup && !emojiPopup.contains(e.target) && e.target !== emojiBtn) emojiPopup.style.display = "none";
});

// ---------- select friend ----------
window.addEventListener("friendSelected", async (e) => {
  selectedFriendUid = e.detail.uid;
  selectedFriendName = e.detail.name;
  chatHeader.innerText = `${selectedFriendName}`;
  messagesDiv.innerHTML = "";

  convId = [currentUserUid, selectedFriendUid].sort().join("_");
  messagesRef = dbRef(rtdb, `conversations/${convId}/messages`);

  onChildAdded(messagesRef, async (snapshot) => {
    const msg = snapshot.val(); msg.key = snapshot.key;
    renderMessage(msg, msg.key);
    if (msg.sender !== currentUserUid && msg.seen !== true) {
      await update(dbRef(rtdb, `conversations/${convId}/messages/${msg.key}`), { seen: true });
      renderMessageUpdate(msg, msg.key); // Cập nhật lại trạng thái Đã xem cho tin nhắn vừa đọc
    }
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });

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

  listenTyping();
});

// ---------- render message ----------
// Chat.js (Phần hàm renderMessage)

// ---------- render message ----------
function renderMessage(msg, key) {
  if (document.querySelector(`[data-key='${key}']`)) return;

  const box = document.createElement("div");
  box.className = "msg-box " + (msg.sender === currentUserUid ? "me-box" : "other-box");
  box.dataset.key = key;
  
  // *** QUAN TRỌNG: Wrapper chứa bong bóng và avatar (để chúng nằm ngang) ***
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

  // Đưa avatar và bubble vào wrapper
  if (msg.sender === currentUserUid) { 
    contentWrapper.appendChild(bubble); 
    contentWrapper.appendChild(avatar); 
} 
  else { 
    contentWrapper.appendChild(avatar); 
    contentWrapper.appendChild(bubble); 
}
  
  // *** QUAN TRỌNG: Đưa wrapper vào box thay vì avatar và bubble riêng lẻ ***
  box.appendChild(contentWrapper);

  // Thêm trạng thái gửi/xem
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


// ---------- render update ----------
function renderMessageUpdate(msg, key) {
  const box = document.querySelector(`[data-key='${key}']`);
  if (!box) return;
  
  // Cập nhật nội dung bong bóng
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

  // *** Cập nhật trạng thái Đã xem/Đã gửi ***
  if (msg.sender === currentUserUid) {
      const statusDiv = box.querySelector(".status-message");
      if(statusDiv) {
          statusDiv.textContent = msg.seen ? "Đã xem" : "Đã gửi";
          statusDiv.classList.remove("sent", "seen");
          statusDiv.classList.add(msg.seen ? "seen" : "sent");
      }
  }
}

// ---------- context menu ----------
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

// ---------- edit/delete/reply ----------
async function editMessage(key, msg) {
  const newText = prompt("Chỉnh sửa tin nhắn:", msg.text || "");
  if (newText !== null) await update(dbRef(rtdb, `conversations/${convId}/messages/${key}`), { text: newText });
}
async function deleteMessage(key) {
  if (confirm("Bạn có chắc muốn xoá tin nhắn này?")) await remove(dbRef(rtdb, `conversations/${convId}/messages/${key}`));
}
function replyMessage(msg) {
  replyMessageObj = msg;
  let replyPreview = document.getElementById("replyPreview");
  if (replyPreview) replyPreview.style.display = "flex";
  document.getElementById("replyText").textContent = msg.text || (msg.type === "image" ? "[Image]" : "[Video]");
  msgInput.focus();
}

// ---------- send message ----------
sendBtn.addEventListener("click", async () => { await sendTextMessage(); });
msgInput.addEventListener("keydown", async (e) => { if (e.key === "Enter") { e.preventDefault(); await sendTextMessage(); } });
async function sendTextMessage() {
  const text = msgInput.value.trim();
  if (!selectedFriendUid || !text) return;

  const payload = {
    sender: currentUserUid,
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

  await push(dbRef(rtdb, `conversations/${convId}/messages`), payload);
  msgInput.value = "";
  replyMessageObj = null;
  const replyPreview = document.getElementById("replyPreview");
  if (replyPreview) replyPreview.style.display = "none";
  // showSendStatus(false); <--- ĐÃ BỊ XÓA VÌ KHÔNG CẦN THIẾT NỮA
}

// ---------- typing indicator ----------
let typingTimeout = null;
msgInput.addEventListener("input", () => {
  if (!convId || !currentUserUid) return;
  set(dbRef(rtdb, `typing/${convId}/${currentUserUid}`), true);
  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => { set(dbRef(rtdb, `typing/${convId}/${currentUserUid}`), false); }, 1500);
});
function listenTyping() {
  if (!convId || !selectedFriendUid) return;
  const otherTypingRef = dbRef(rtdb, `typing/${convId}/${selectedFriendUid}`);
  onValue(otherTypingRef, snap => {
    const v = snap.val();
    typingIndicator.textContent = v ? `${selectedFriendName} đang trả lời...` : "";
  });
}

// ---------- send status ----------
function showSendStatus(seen) {
  // Hàm này không còn được sử dụng để hiển thị trạng thái gửi trong input area
  // Nếu bạn muốn hiển thị thông báo lỗi, hãy dùng nó
}

// ---------- theme toggle ----------
const root = document.documentElement;
themeToggle?.addEventListener("click", () => {
  const isDark = root.dataset.theme === "dark"; 
  root.dataset.theme = isDark ? "light" : "dark";
  localStorage.setItem("chat_theme", root.dataset.theme);
});
(function initTheme() { root.dataset.theme = localStorage.getItem("chat_theme") || "dark"; })();