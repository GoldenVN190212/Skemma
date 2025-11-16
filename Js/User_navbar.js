import { auth, db } from "./Firebase_config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  const navLinks = document.querySelector(".nav-links");
  const logoutBtn = document.getElementById("logoutBtn");

  onAuthStateChanged(auth, async (user) => {
    navLinks.innerHTML = "";

    if (!user) {
      navLinks.innerHTML = `
        <li><a href="Register.html">Sign up</a></li>
        <li><a href="Login.html">Log in</a></li>
      `;
      if (logoutBtn) logoutBtn.style.display = "none";
      return;
    }

    if (logoutBtn) logoutBtn.style.display = "inline-block";

    // Lấy username từ Firestore
    let username = "User";
    try {
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists() && userDoc.data().username) {
        username = userDoc.data().username;
      } else {
        username = user.email ? user.email.split("@")[0] : "User";
        await setDoc(userDocRef, {
          email: user.email,
          username,
          createdAt: new Date(),
          provider: user.providerId || "email",
        });
      }
    } catch (err) {
      console.error("Lỗi lấy username:", err);
      username = user.email ? user.email.split("@")[0] : "User";
    }

    // Tạo nút username
    const userItem = document.createElement("li");
    const btn = document.createElement("button");
    btn.innerText = `🔒 ${username}`;
    btn.disabled = true;
    btn.style.cursor = "default";
    btn.style.background = "linear-gradient(90deg, #ff6a00, #ffcc00)";
    btn.style.color = "#000";
    btn.style.border = "none";
    btn.style.borderRadius = "16px";
    btn.style.padding = "12px 24px";
    btn.style.fontWeight = "700";
    btn.style.fontSize = "1.1em";
    btn.style.boxShadow = "0 0 8px rgba(255, 200, 0, 0.7)";
    userItem.appendChild(btn);
    navLinks.appendChild(userItem);

    // Logout
    if (logoutBtn) {
      logoutBtn.onclick = async () => {
        await signOut(auth);
        window.location.href = "Login.html";
      };
    }
  });
});
