// FILE: User_navbar.js

import { auth, db } from "./Firebase_config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Hàm xử lý đăng xuất và chuyển hướng
async function redirectToLogin() {
    await signOut(auth);
    window.location.href = "Login.html";
}

// ------------------------------------------------------------
// 3. Hàm tạo và hiển thị Menu Ngữ cảnh (Được gọi bởi cả chuột phải và nhấn giữ)
// ------------------------------------------------------------
function showContextMenu(e) {
    e.preventDefault(); 

    // Xóa menu cũ
    const existingMenu = document.getElementById("userContextMenu");
    if (existingMenu) existingMenu.remove();

    // Lấy vị trí: dùng e.touches[0] cho cảm ứng, dùng e cho chuột
    const x = e.touches ? e.touches[0].pageX : e.pageX;
    const y = e.touches ? e.touches[0].pageY : e.pageY;
    
    // Tạo Menu mới
    const menu = document.createElement("div");
    menu.id = "userContextMenu";
    menu.className = "context-menu"; 
    
    // Thiết lập style cơ bản (Nên đưa vào CSS file)
    menu.style.position = "absolute"; 
    menu.style.background = "#333"; 
    menu.style.color = "#fff";
    menu.style.padding = "0"; 
    menu.style.borderRadius = "6px"; 
    menu.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.4)";
    menu.style.zIndex = 99999; 
    menu.style.minWidth = "150px";

    // Tạo tùy chọn Logout
    const logoutItem = document.createElement("div");
    logoutItem.className = "context-menu-item";
    
    // Thêm Icon Logout (fa-right-from-bracket) và text
    logoutItem.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> <span>Logout</span>'; 
    logoutItem.style.cssText = "padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 0.9em;";
    
    // Thêm hiệu ứng hover
    logoutItem.onmouseover = () => { logoutItem.style.background = "#555"; };
    logoutItem.onmouseout = () => { logoutItem.style.background = "transparent"; };

    logoutItem.onclick = () => {
        menu.remove();
        redirectToLogin(); 
    };

    menu.appendChild(logoutItem);

    // Định vị và hiển thị Menu
    document.body.appendChild(menu);
    menu.style.left = `${x}px`; 
    menu.style.top = `${y}px`;

    // Đóng Menu khi nhấn ra ngoài
    document.addEventListener("click", () => menu.remove(), { once: true });
}


document.addEventListener("DOMContentLoaded", () => {
    const navLinks = document.querySelector(".nav-links");

    onAuthStateChanged(auth, async (user) => {
        navLinks.innerHTML = "";

        if (!user) {
            navLinks.innerHTML = `
                <li><a href="Register.html">Sign up</a></li>
                <li><a href="Login.html">Log in</a></li>
            `;
            return;
        }

        // ... (Logic lấy username giữ nguyên) ...
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
        
        // GÁN ID VÀ STYLE CHO NÚT
        btn.id = "currentUsernameButton"; 
        btn.innerText = `🔒 ${username}`;
        // ... (Style của nút giữ nguyên) ...
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

        // =======================================================
        // ✅ THÊM LISTENER CHO CẢ CHUỘT PHẢI VÀ CẢM ỨNG
        // =======================================================
        
        // 1. Chuột phải (Máy tính)
        btn.addEventListener("contextmenu", showContextMenu); 

        // 2. Nhấn và Giữ (iPad/Cảm ứng)
        let pressTimer = null;
        const LONG_PRESS_DURATION = 800; 

        btn.addEventListener('touchstart', (e) => {
            e.preventDefault(); 
            pressTimer = setTimeout(() => {
                showContextMenu(e);
            }, LONG_PRESS_DURATION);
        }, { passive: false });

        btn.addEventListener('touchend', () => {
            clearTimeout(pressTimer);
        });

        btn.addEventListener('touchmove', () => {
            clearTimeout(pressTimer);
        });

        
    });
});