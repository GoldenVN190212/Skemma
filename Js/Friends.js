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
