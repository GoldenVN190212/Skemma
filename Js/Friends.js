// Friends.js
import { db, auth } from "./Firebase_config.js";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// DOM
const searchInput = document.getElementById("friendSearchInput");
const addFriendBtn = document.getElementById("addFriendBtn");
const searchResults = document.getElementById("searchResults");
const friendsList = document.getElementById("friendsList");

let selectedUserToInvite = null;
let currentUserUid = null;
let currentChatFriendUid = null;

// --- Load current user ---
auth.onAuthStateChanged(async (user) => {
  if (!user) return;
  currentUserUid = user.uid;
  loadFriends();
  loadFriendRequests();
});

// --- Search users ---
searchInput.addEventListener("input", async () => {
  const keyword = searchInput.value.trim().toLowerCase();
  searchResults.innerHTML = "";
  if (!keyword) return;

  const usersRef = collection(db, "users");
  const q1 = query(usersRef, where("username", "==", keyword));
  const q2 = query(usersRef, where("email", "==", keyword));

  const results = [];
  for (const q of [q1, q2]) {
    const snap = await getDocs(q);
    snap.forEach(docSnap => {
      if (docSnap.id !== currentUserUid) results.push({ uid: docSnap.id, ...docSnap.data() });
    });
  }

  results.forEach(user => {
    const li = document.createElement("li");
    li.textContent = user.username;
    li.dataset.uid = user.uid;
    li.style.cursor = "pointer";
    li.onclick = () => {
      Array.from(searchResults.children).forEach(c => c.style.background = "");
      li.style.background = "#ffcc00";
      selectedUserToInvite = user;
    };
    searchResults.appendChild(li);
  });

  if (results.length === 0) searchResults.innerHTML = "<li>No user found</li>";
});

// --- Send friend request ---
addFriendBtn.addEventListener("click", async () => {
  if (!selectedUserToInvite) return;

  const reqId = `${currentUserUid}_${selectedUserToInvite.uid}`;
  const reqRef = doc(db, "friendRequests", reqId);

  const reqSnap = await getDoc(reqRef);
  if (reqSnap.exists()) {
    alert("Bạn đã gửi lời mời trước đó!");
    return;
  }

  await setDoc(reqRef, {
    from: currentUserUid,
    to: selectedUserToInvite.uid,
    timestamp: Date.now(),
    accepted: false
  });

  alert(`Đã gửi lời mời tới ${selectedUserToInvite.username}`);
  searchInput.value = "";
  selectedUserToInvite = null;
  searchResults.innerHTML = "";
});

// --- Load friends list ---
async function loadFriends() {
  friendsList.innerHTML = "";
  const userRef = doc(db, "users", currentUserUid);

  onSnapshot(userRef, async (snap) => {
    const data = snap.data() || {};
    const friends = data.friends || [];
    friendsList.innerHTML = "";

    for (const uid of friends) {
      const friendRef = doc(db, "users", uid);
      const friendSnap = await getDoc(friendRef);
      const friendData = friendSnap.data();
      const li = document.createElement("li");
      li.textContent = friendData?.username || uid;
      li.style.cursor = "pointer";

      // Chọn người chat
      li.onclick = () => {
        Array.from(friendsList.children).forEach(c => c.style.background = "");
        li.style.background = "#88f";
        currentChatFriendUid = uid;
        const event = new CustomEvent("friendSelected", { detail: { uid, name: li.textContent } });
        window.dispatchEvent(event);
      };

      attachFriendContextMenu(li, uid, li.textContent);

      friendsList.appendChild(li);
    }
  });
}

// --- Load incoming friend requests ---
async function loadFriendRequests() {
  const q = query(collection(db, "friendRequests"), where("to", "==", currentUserUid), where("accepted", "==", false));

  onSnapshot(q, async (snap) => {
    snap.docChanges().forEach(async (change) => {
      if (change.type === "added") {
        const req = change.doc.data();

        const fromRef = doc(db, "users", req.from);
        const fromSnap = await getDoc(fromRef);
        const fromData = fromSnap.data();
        const senderName = fromData?.username || req.from;

        const li = document.createElement("li");
        li.textContent = `Friend request from ${senderName}`;
        const acceptBtn = document.createElement("button");
        acceptBtn.textContent = "Accept";
        acceptBtn.onclick = async () => {
          await updateDoc(doc(db, "friendRequests", change.doc.id), { accepted: true });
          await updateDoc(doc(db, "users", currentUserUid), { friends: arrayUnion(req.from) });
          await updateDoc(doc(db, "users", req.from), { friends: arrayUnion(currentUserUid) });
          li.remove();
          alert("Bạn đã chấp nhận lời mời!");
        };
        li.appendChild(acceptBtn);
        friendsList.appendChild(li);
      }
    });
  });
}

// ---------- Context menu cho friends ----------
function attachFriendContextMenu(li, friendUid, friendName) {
  li.oncontextmenu = (e) => {
    e.preventDefault();

    const existingMenu = document.getElementById("friendContextMenu");
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement("div");
    menu.id = "friendContextMenu";
    menu.style.position = "absolute";
    menu.style.background = "#333";
    menu.style.color = "#fff";
    menu.style.padding = "8px";
    menu.style.borderRadius = "6px";
    menu.style.zIndex = 9999;
    menu.style.minWidth = "160px";
    menu.style.fontSize = "0.95em";

    // --- Xóa bạn bè ---
    const removeBtn = document.createElement("div");
    removeBtn.textContent = "Xóa bạn bè";
    removeBtn.style.padding = "4px 8px";
    removeBtn.style.cursor = "pointer";
    removeBtn.onmouseenter = () => removeBtn.style.background = "#555";
    removeBtn.onmouseleave = () => removeBtn.style.background = "";
    removeBtn.onclick = async () => {
      if (confirm(`Bạn có chắc muốn xóa ${friendName}?`)) {
        await updateDoc(doc(db, "users", currentUserUid), { friends: arrayRemove(friendUid) });
        await updateDoc(doc(db, "users", friendUid), { friends: arrayRemove(currentUserUid) });
        li.remove();
      }
      menu.remove();
    };
    menu.appendChild(removeBtn);

    document.body.appendChild(menu);
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;

    document.addEventListener("click", () => menu.remove(), { once: true });
  };
}

import { db, auth } from "./Firebase_config.js";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  setDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// DOM
const searchInput = document.getElementById("friendSearchInput");
const addFriendBtn = document.getElementById("addFriendBtn");
const searchResults = document.getElementById("searchResults");
const friendsList = document.getElementById("friendsList");

let selectedUserToInvite = null;
let currentUserUid = null;
let currentChatFriendUid = null;
let currentUserData = {}; 
let userListenerUnsubscribe = null; // Biến để lưu hàm hủy đăng ký listener

// --- Load current user ---
auth.onAuthStateChanged(async (user) => {
  if (!user) return;
  currentUserUid = user.uid;
  
  // 1. Hủy đăng ký listener cũ (nếu có)
  if (userListenerUnsubscribe) userListenerUnsubscribe();

  const userRef = doc(db, "users", currentUserUid);

  // 2. Chỉ đặt MỘT listener duy nhất cho dữ liệu người dùng hiện tại
  userListenerUnsubscribe = onSnapshot(userRef, (snap) => {
    currentUserData = snap.data() || {};
    // Sau khi có data (bao gồm friends và blockedUsers), vẽ lại danh sách bạn bè
    renderFriendsList(currentUserData); 
  });
  
  loadFriendRequests();
});

// --- Search users ---
searchInput.addEventListener("input", async () => {
  const keyword = searchInput.value.trim().toLowerCase();
  searchResults.innerHTML = "";
  if (!keyword) return;

  const usersRef = collection(db, "users");
  const q1 = query(usersRef, where("username", "==", keyword));
  const q2 = query(usersRef, where("email", "==", keyword));

  const results = [];
  for (const q of [q1, q2]) {
    const snap = await getDocs(q);
    snap.forEach(docSnap => {
      if (docSnap.id !== currentUserUid) results.push({ uid: docSnap.id, ...docSnap.data() });
    });
  }

  results.forEach(user => {
    const li = document.createElement("li");
    li.textContent = user.username;
    li.dataset.uid = user.uid;
    li.style.cursor = "pointer";
    li.onclick = () => {
      Array.from(searchResults.children).forEach(c => c.style.background = "");
      li.style.background = "#ffcc00";
      selectedUserToInvite = user;
    };
    searchResults.appendChild(li);
  });

  if (results.length === 0) searchResults.innerHTML = "<li>No user found</li>";
});

// --- Send friend request ---
addFriendBtn.addEventListener("click", async () => {
  if (!selectedUserToInvite) return;

  // Dùng prompt thay cho alert
  const reqId = `${currentUserUid}_${selectedUserToInvite.uid}`;
  const reqRef = doc(db, "friendRequests", reqId);

  const reqSnap = await getDoc(reqRef);
  if (reqSnap.exists()) {
    console.warn("Bạn đã gửi lời mời trước đó!");
    return;
  }

  await setDoc(reqRef, {
    from: currentUserUid,
    to: selectedUserToInvite.uid,
    timestamp: Date.now(),
    accepted: false
  });

  console.log(`Đã gửi lời mời tới ${selectedUserToInvite.username}`);
  searchInput.value = "";
  selectedUserToInvite = null;
  searchResults.innerHTML = "";
});

// --- Function TÁI TẠO (Render) danh sách bạn bè ---
async function renderFriendsList(data) {
  friendsList.innerHTML = "";
  const friends = data.friends || [];

  for (const uid of friends) {
    // Dùng getDoc thay vì onSnapshot để tránh tạo thêm listener
    const friendRef = doc(db, "users", uid);
    const friendSnap = await getDoc(friendRef);
    const friendData = friendSnap.data();
    const li = document.createElement("li");
    li.dataset.uid = uid; // Thêm data-uid để dễ tìm kiếm

    // Thêm class nếu người này bị chặn
    const isBlocked = currentUserData.blockedUsers?.includes(uid);
    li.textContent = friendData?.username || uid;
    if (isBlocked) {
      li.classList.add("blocked-friend");
      li.textContent += " (Đã chặn)";
      li.style.opacity = 0.7; 
    } else {
      li.classList.remove("blocked-friend");
      li.style.opacity = 1;
    }

    li.style.cursor = "pointer";

    // Chọn người chat
    li.onclick = () => {
      Array.from(friendsList.children).forEach(c => c.style.background = "");
      li.style.background = "#88f";
      currentChatFriendUid = uid;
      const event = new CustomEvent("friendSelected", { 
        detail: { 
          uid, 
          name: friendData?.username || uid,
          // Truyền trạng thái chặn
          isBlocked: isBlocked 
        } 
      });
      window.dispatchEvent(event);
    };

    attachFriendContextMenu(li, uid, li.textContent, isBlocked);

    friendsList.appendChild(li);
  }
}


// --- Load incoming friend requests ---
async function loadFriendRequests() {
  // Listener này vẫn giữ nguyên vì nó lắng nghe một Collection khác
  const q = query(collection(db, "friendRequests"), where("to", "==", currentUserUid), where("accepted", "==", false));

  onSnapshot(q, async (snap) => {
    snap.docChanges().forEach(async (change) => {
      if (change.type === "added") {
        const req = change.doc.data();

        const fromRef = doc(db, "users", req.from);
        const fromSnap = await getDoc(fromRef);
        const fromData = fromSnap.data();
        const senderName = fromData?.username || req.from;

        const li = document.createElement("li");
        li.textContent = `Friend request from ${senderName}`;
        const acceptBtn = document.createElement("button");
        acceptBtn.textContent = "Accept";
        acceptBtn.onclick = async () => {
          await updateDoc(doc(db, "friendRequests", change.doc.id), { accepted: true });
          await updateDoc(doc(db, "users", currentUserUid), { friends: arrayUnion(req.from) });
          await updateDoc(doc(db, "users", req.from), { friends: arrayUnion(currentUserUid) });
          li.remove();
          console.log("Bạn đã chấp nhận lời mời!");
        };
        li.appendChild(acceptBtn);
        friendsList.appendChild(li);
      }
    });
  });
}

// --- Logic Chặn/Bỏ chặn ---
async function toggleBlockUser(friendUid, isCurrentlyBlocked) {
  const userRef = doc(db, "users", currentUserUid);
  
  if (isCurrentlyBlocked) {
    // Bỏ chặn
    await updateDoc(userRef, { blockedUsers: arrayRemove(friendUid) });
    console.log(`Đã bỏ chặn người dùng ${friendUid}`);
  } else {
    // Chặn
    await updateDoc(userRef, { blockedUsers: arrayUnion(friendUid) });
    console.log(`Đã chặn người dùng ${friendUid}`);
  }
  // Kích hoạt lại sự kiện friendSelected để cập nhật giao diện chat ngay lập tức
  if (currentChatFriendUid === friendUid) {
    const event = new CustomEvent("friendSelected", { 
      detail: { 
        uid: friendUid, 
        name: document.querySelector(`li[data-uid='${friendUid}']`)?.textContent.replace(' (Đã chặn)', '') || friendUid,
        isBlocked: !isCurrentlyBlocked // Trạng thái mới
      } 
    });
    window.dispatchEvent(event);
  }
}


// ---------- Context menu cho friends (Giữ nguyên) ----------
function attachFriendContextMenu(li, friendUid, friendName, isBlocked) {
  li.oncontextmenu = (e) => {
    e.preventDefault();

    const existingMenu = document.getElementById("friendContextMenu");
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement("div");
    menu.id = "friendContextMenu";
    menu.style.position = "absolute";
    menu.style.background = "#333";
    menu.style.color = "#fff";
    menu.style.padding = "8px";
    menu.style.borderRadius = "6px";
    menu.style.zIndex = 9999;
    menu.style.minWidth = "160px";
    menu.style.fontSize = "0.95em";

    // --- Chặn/Bỏ chặn ---
    const blockBtn = document.createElement("div");
    blockBtn.textContent = isBlocked ? "✅ Bỏ chặn" : "🚫 Chặn tin nhắn";
    blockBtn.style.padding = "4px 8px";
    blockBtn.style.cursor = "pointer";
    blockBtn.onmouseenter = () => blockBtn.style.background = "#555";
    blockBtn.onmouseleave = () => blockBtn.style.background = "";
    blockBtn.onclick = async () => {
      await toggleBlockUser(friendUid, isBlocked);
      menu.remove();
    };
    menu.appendChild(blockBtn);

    // --- Xóa bạn bè ---
    const removeBtn = document.createElement("div");
    removeBtn.textContent = "Xóa bạn bè";
    removeBtn.style.padding = "4px 8px";
    removeBtn.style.cursor = "pointer";
    removeBtn.onmouseenter = () => removeBtn.style.background = "#555";
    removeBtn.onmouseleave = () => removeBtn.style.background = "";
    removeBtn.onclick = async () => {
      if (window.confirm(`Bạn có chắc muốn xóa ${friendName.replace(' (Đã chặn)', '')}?`)) {
        await updateDoc(doc(db, "users", currentUserUid), { friends: arrayRemove(friendUid) });
        await updateDoc(doc(db, "users", friendUid), { friends: arrayRemove(currentUserUid) });
        li.remove();
      }
      menu.remove();
    };
    menu.appendChild(removeBtn);

    document.body.appendChild(menu);
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;

    document.addEventListener("click", () => menu.remove(), { once: true });
  };
}