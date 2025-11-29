// ================= FIREBASE IMPORT =================
import { auth, db } from "./Firebase_config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { setDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// =================== HÀM KIỂM TRA ===================
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// =================== DOM EVENTS ===================
document.addEventListener("DOMContentLoaded", () => {
  // ====== ĐĂNG KÝ ======
  const signupForm = document.getElementById("registerForm");
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = document.getElementById("signupUsername").value.trim();
      const email = document.getElementById("signupEmail").value.trim();
      const password = document.getElementById("signupPassword").value;
      const confirmPassword = document.getElementById("confirmPassword").value;

      if (!isValidEmail(email)) return alert("⚠️ Email không hợp lệ!");
      if (password !== confirmPassword) return alert("⚠️ Mật khẩu xác nhận không khớp!");

      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await setDoc(doc(db, "users", user.uid), {
          email,
          username,
          createdAt: new Date(),
          provider: "email",
        });

        console.log("User saved:", user.uid, username);
        alert(`✅ Chào mừng ${username} đến với Skemma!`);
        window.location.href = "Chat.html";
      } catch (error) {
        console.error(error);
        let message = "❌ Đăng ký thất bại!";
        switch (error.code) {
          case "auth/email-already-in-use":
            message = "⚠️ Email đã được sử dụng!";
            break;
          case "auth/weak-password":
            message = "⚠️ Mật khẩu quá yếu!";
            break;
          default:
            message = `⚠️ Lỗi: ${error.message}`;
        }
        alert(message);
      }
    });
  }

  // ====== ĐĂNG NHẬP ======
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;

      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        let username = "";
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            username = userDoc.data().username;
          } else {
            username = email.split("@")[0];
          }
        } catch (err) {
          console.error("Lỗi lấy username:", err);
          username = email.split("@")[0];
        }

        alert(`✅ Chào mừng ${username} quay trở lại Skemma!`);
        window.location.href = "Chat.html";
      } catch (error) {
        console.error(error);
        let message = "❌ Đăng nhập thất bại!";
        switch (error.code) {
          case "auth/invalid-email":
          case "auth/wrong-password":
            message = "⚠️ Email hoặc mật khẩu không đúng!";
            break;
          case "auth/user-not-found":
            message = "❌ Không tìm thấy tài khoản!";
            break;
        }
        alert(message);
      }
    });
  }

  // ====== GOOGLE LOGIN ======
  const googleBtn = document.getElementById("googleLogin");
  if (googleBtn) {
    const provider = new GoogleAuthProvider();
    googleBtn.addEventListener("click", async () => {
      try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        const userDoc = await getDoc(doc(db, "users", user.uid));

        if (!userDoc.exists()) {
          await setDoc(doc(db, "users", user.uid), {
            email: user.email,
            username: user.displayName || user.email.split("@")[0],
            createdAt: new Date(),
            provider: "Google",
          });
        }

        alert(`✅ Xin chào ${user.displayName || user.email}!`);
        window.location.href = "Chat.html";
      } catch (error) {
        if (error.code !== "auth/popup-closed-by-user") {
          alert("❌ Lỗi đăng nhập Google!");
          console.error(error);
        }
      }
    });
  }

  // ====== FACEBOOK LOGIN ======
  const facebookBtn = document.getElementById("facebookLogin");
  if (facebookBtn) {
    const fbProvider = new FacebookAuthProvider();
    facebookBtn.addEventListener("click", async () => {
      try {
        const result = await signInWithPopup(auth, fbProvider);
        const user = result.user;
        const userDoc = await getDoc(doc(db, "users", user.uid));

        if (!userDoc.exists()) {
          await setDoc(doc(db, "users", user.uid), {
            email: user.email,
            username: user.displayName || user.email.split("@")[0],
            createdAt: new Date(),
            provider: "Facebook",
          });
        }

        alert(`✅ Xin chào ${user.displayName || user.email}!`);
        window.location.href = "Chat.html";
      } catch (error) {
        if (error.code !== "auth/popup-closed-by-user") {
          alert("❌ Lỗi đăng nhập Facebook!");
          console.error(error);
        }
      }
    });
  }
});
