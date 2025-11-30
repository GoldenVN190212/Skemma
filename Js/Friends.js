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
let userListenerUnsubscribe = null;

// --- Load current user ---
auth.onAuthStateChanged(async (user) => {
  if (!user) return;
  currentUserUid = user.uid;
  
  // Hủy listener cũ
  if (userListenerUnsubscribe) userListenerUnsubscribe();

  const userRef = doc(db, "users", currentUserUid);

  // Lắng nghe duy nhất document user
  userListenerUnsubscribe = onSnapshot(userRef, (snap) => {
    currentUserData = snap.data() || {};
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
      if (docSnap.id !== currentUserUid)
        results.push({ uid: docSnap.id, ...docSnap.data() });
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

  if (results.length === 0)
    searchResults.innerHTML = "<li>No user found</li>";
});

// --- Send friend request ---
addFriendBtn.addEventListener("click", async () => {
  if (!selectedUserToInvite) return;

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

// --- Render friends list ---
async function renderFriendsList(data) {
  friendsList.innerHTML = "";
  const friends = data.friends || [];

  for (const uid of friends) {
    const friendRef = doc(db, "users", uid);
    const friendSnap = await getDoc(friendRef);
    const friendData = friendSnap.data();

    const li = document.createElement("li");
    li.dataset.uid = uid;
    li.style.cursor = "pointer";

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

    // Select friend chat
    li.onclick = () => {
      Array.from(friendsList.children).forEach(c => c.style.background = "");
      li.style.background = "#88f";
      currentChatFriendUid = uid;

      const event = new CustomEvent("friendSelected", {
        detail: {
          uid,
          name: friendData?.username || uid,
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
  const q = query(
    collection(db, "friendRequests"),
    where("to", "==", currentUserUid),
    where("accepted", "==", false)
  );

  onSnapshot(q, async (snap) => {
    snap.docChanges().forEach(async (change) => {
      if (change.type === "added") {
        const req = change.doc.data();

        const fromRef = doc(db, "users", req.from);
        const fromSnap = await getDoc(fromRef);
        const fromData = fromSnap.data();
        const senderName = fromData?.username || req.from;

        const li = document.createElement("li");
        li.textContent = `Friend request from ${senderName} `;

        const acceptBtn = document.createElement("button");
        acceptBtn.textContent = "Accept";

        acceptBtn.onclick = async () => {
          await updateDoc(doc(db, "friendRequests", change.doc.id), {
            accepted: true
          });

          await updateDoc(doc(db, "users", currentUserUid), {
            friends: arrayUnion(req.from)
          });

          await updateDoc(doc(db, "users", req.from), {
            friends: arrayUnion(currentUserUid)
          });

          li.remove();
          console.log("Bạn đã chấp nhận lời mời!");
        };

        li.appendChild(acceptBtn);
        friendsList.appendChild(li);
      }
    });
  });
}

// --- Block / Unblock logic ---
async function toggleBlockUser(friendUid, isCurrentlyBlocked) {
  const userRef = doc(db, "users", currentUserUid);

  if (isCurrentlyBlocked) {
    await updateDoc(userRef, {
      blockedUsers: arrayRemove(friendUid)
    });

    console.log(`Đã bỏ chặn ${friendUid}`);
  } else {
    await updateDoc(userRef, {
      blockedUsers: arrayUnion(friendUid)
    });

    console.log(`Đã chặn ${friendUid}`);
  }

  // Update UI chat instantly
  if (currentChatFriendUid === friendUid) {
    const li = document.querySelector(`li[data-uid='${friendUid}']`);

    const name = li
      ? li.textContent.replace(" (Đã chặn)", "")
      : friendUid;

    const event = new CustomEvent("friendSelected", {
      detail: {
        uid: friendUid,
        name,
        isBlocked: !isCurrentlyBlocked
      }
    });

    window.dispatchEvent(event);
  }
}

// ---------- Context menu ----------
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

    // Block / Unblock
    const blockBtn = document.createElement("div");
    blockBtn.textContent = isBlocked ? "✅ Bỏ chặn" : "🚫 Chặn tin nhắn";
    blockBtn.style.padding = "4px 8px";
    blockBtn.style.cursor = "pointer";
    blockBtn.onmouseenter = () => (blockBtn.style.background = "#555");
    blockBtn.onmouseleave = () => (blockBtn.style.background = "");

    blockBtn.onclick = async () => {
      await toggleBlockUser(friendUid, isBlocked);
      menu.remove();
    };

    menu.appendChild(blockBtn);

    // Remove friend
    const removeBtn = document.createElement("div");
    removeBtn.textContent = "Xóa bạn bè";
    removeBtn.style.padding = "4px 8px";
    removeBtn.style.cursor = "pointer";
    removeBtn.onmouseenter = () => (removeBtn.style.background = "#555");
    removeBtn.onmouseleave = () => (removeBtn.style.background = "");

    removeBtn.onclick = async () => {
      if (
        window.confirm(
          `Bạn có chắc muốn xóa ${friendName.replace(" (Đã chặn)", "")}?`
        )
      ) {
        await updateDoc(doc(db, "users", currentUserUid), {
          friends: arrayRemove(friendUid)
        });

        await updateDoc(doc(db, "users", friendUid), {
          friends: arrayRemove(currentUserUid)
        });

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
