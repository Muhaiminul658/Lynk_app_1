// =========================================================
// LYNK — MAIN APPLICATION ENGINE (MODULAR & OPTIMIZED)
// =========================================================

import { 
  initializeApp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut, 
  updateProfile as firebaseUpdateProfile 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
  getDatabase, 
  ref, 
  set, 
  get, 
  update, 
  push, 
  remove, 
  onValue, 
  onDisconnect, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const CLOUDINARY_CLOUD = "vnnsmgyy",
      CLOUDINARY_PRESET = "profile pic",
      ADMIN_EMAIL = "admin@gmail.com",
      ADMIN_PASSWORD = "admin123",
      STORY_EXPIRY_MS = 24 * 60 * 60 * 1000,
      VERIFICATION_THRESHOLD = 10,
      COMMISSION_RATE = 0.05;

const firebaseConfig = {
    apiKey: "AIzaSyBqdWrCR_2KSoxWMVkVOJMmXCanXoo7nZQ",
    authDomain: "kothabolo-23a9f.firebaseapp.com",
    databaseURL: "https://kothabolo-23a9f-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "kothabolo-23a9f",
    storageBucket: "kothabolo-23a9f.firebasestorage.app",
    messagingSenderId: "630943791166",
    appId: "1:630943791166:web:6f9512cf4534f7627bb96f",
    measurementId: "G-1K1YJRBC5V"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const $ = (id) => document.getElementById(id);
const LS_PREFIX = "kb_";

function escapeHTML(s) { 
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); 
}

function showToast(msg, type = "info") {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "fixed top-4 right-4 left-4 md:left-auto md:w-auto z-[10000] bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] px-5 py-3 rounded-xl shadow-2xl opacity-0 pointer-events-none transition-all duration-300";
    if (type === "error") t.classList.add("border-red-500", "text-red-400");
    if (type === "success") t.classList.add("border-green-500", "text-green-400");
    setTimeout(() => { t.classList.add("opacity-100", "pointer-events-auto"); t.style.transform = "translateY(0)"; }, 10);
    setTimeout(() => { t.classList.remove("opacity-100", "pointer-events-auto"); t.style.transform = "translateY(-10px)"; }, 3000);
}

function showLoader(text = "Loading…") { 
  const t = $("loader-text"); 
  if (t) t.textContent = text;
  const gl = $("global-loader");
  if (gl) gl.style.display = "flex"; 
}

function hideLoader() { 
  const gl = $("global-loader");
  if (gl) gl.style.display = "none"; 
}

function showView(id) { 
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  $(id)?.classList.add("active"); 
}

function lsGet(key) { 
  try { const v = localStorage.getItem(LS_PREFIX + key); return v ? JSON.parse(v) : null; }
  catch { return null; } 
}

function lsSet(key, val) { 
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); } catch {} 
}

function lsDel(key) { 
  try { localStorage.removeItem(LS_PREFIX + key); } catch {} 
}

function getCachedUser(uid) {
    if (usersCache[uid]) return usersCache[uid];
    const c = lsGet(`user_${uid}`);
    if (c) { usersCache[uid] = c; return c; }
    return null;
}

function setCachedUser(uid, data) { 
  usersCache[uid] = data;
  lsSet(`user_${uid}`, data); 
}

function invalidateUser(uid) { 
  delete usersCache[uid];
  lsDel(`user_${uid}`); 
}

function getTheme() { return localStorage.getItem('kb_theme') || 'dark'; }

function setTheme(theme) {
    const html = document.documentElement;
    html.classList.remove('dark', 'light');
    html.classList.add(theme);
    localStorage.setItem('kb_theme', theme);
    const isDark = theme === 'dark';
    document.querySelectorAll('#theme-toggle-desktop i, #theme-toggle-mobile i').forEach(el => { 
      el.className = `fas ${isDark ? 'fa-moon' : 'fa-sun'}`; 
    });
    document.querySelectorAll('#theme-label-desktop, #theme-value').forEach(el => {
        if (el.id === 'theme-value') el.textContent = isDark ? 'Dark' : 'Light';
        else el.textContent = isDark ? 'Dark Mode' : 'Light Mode';
    });
}
setTheme(getTheme());

document.addEventListener('click', e => {
    const t = e.target.closest('#theme-toggle-desktop') || e.target.closest('#theme-toggle-mobile') || e.target.closest('#settings-theme-row');
    if (t) { 
      const cur = getTheme();
      setTheme(cur === 'dark' ? 'light' : 'dark'); 
    }
});

async function compressImage(file, maxSize = 800, quality = 0.75) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            let { width, height } = img;
            if (width > maxSize || height > maxSize) {
                if (width > height) { 
                  height = Math.round(height * maxSize / width);
                  width = maxSize; 
                } else { 
                  width = Math.round(width * maxSize / height);
                  height = maxSize; 
                }
            }
            const c = document.createElement("canvas");
            c.width = width;
            c.height = height;
            c.getContext("2d").drawImage(img, 0, 0, width, height);
            c.toBlob(b => {
                if (!b) reject(new Error("Compression failed"));
                else resolve(new File([b], file.name, { type: "image/jpeg" }));
            }, "image/jpeg", quality);
        };
        img.onerror = reject;
        img.src = url;
    });
}

async function uploadToCloudinary(file) {
    const compressed = await compressImage(file);
    const fd = new FormData();
    fd.append("file", compressed);
    fd.append("upload_preset", CLOUDINARY_PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: "POST", body: fd });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return data.secure_url;
}

function getFirebaseErrorMessage(error) {
    const m = { 
      "auth/invalid-credential": "Invalid email or password.",
      "auth/invalid-email": "Invalid email address.",
      "auth/email-already-in-use": "Email already registered.",
      "auth/weak-password": "Password too weak.", 
      "auth/user-not-found": "User not found.",
      "auth/wrong-password": "Incorrect password.",
      "auth/network-request-failed": "Network error." 
    };
    return m[error?.code] || error?.message || "Something went wrong.";
}

function formatLastSeen(ts) {
    if (!ts) return "Offline";
    const d = Date.now() - ts;
    if (d < 60000) return "Just now";
    const m = Math.floor(d / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return "Offline";
}

function getPrivacyLabel(val) { return val === "public" ? "🌍 Public" : "🔒 Personal"; }
function isBlocked(uid) { return !!blockedCache[uid]; }
function isFollowing(uid) { return !!followingCache[uid]; }
function isFriend(uid) { return !!friendsCache[uid]; }

// State variables
let currentUser = null,
    currentUserData = null,
    isAdmin = false,
    currentChatUser = null,
    currentChatId = null,
    currentSupportChatUser = null,
    adminTargetUser = null,
    friendsCache = {},
    usersCache = {},
    blockedCache = {},
    followingCache = {},
    followerCache = {},
    verificationRequestsCache = {},
    storyInterval = null,
    activeChatMessageListener = null,
    activeTypingListener = null,
    activePresenceListener = null,
    typingTimer = null,
    lastMsgTimestamps = {},
    currentProfileListener = null,
    storyViewerIndex = 0,
    storyViewerStories = [],
    storyViewerTimer = null,
    viewingUserProfile = null,
    navStack = ['feed'],
    isNavBack = false,
    currentStoryId = null,
    storyReactionListener = null,
    storyCommentListener = null,
    currentChatTheme = 'default',
    mandatoryCheckDone = false,
    initDone = false;

const REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍"],
      STORY_REACTIONS = ["❤️", "😂", "😮", "😢", "🔥", "👍"],
      DEFAULT_AVATAR = "https://ui-avatars.com/api/?name=User&background=262626&color=ffffff&size=256",
      DEFAULT_COVER = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&h=300&fit=crop&crop=center",
      THEMES = ['default', 'love', 'bff', 'ocean', 'sunset', 'forest'];

// Initialize App Auth
let authMode = "login";

function updateAuthUI() {
    const rf = $("register-fields"),
          sub = $("auth-submit"),
          tog = $("toggle-auth");
    if (authMode === "register") { 
      rf?.classList.remove("hidden"); 
      if (sub) sub.textContent = "Sign Up"; 
      if (tog) tog.textContent = "Have an account? Log in"; 
    } else { 
      rf?.classList.add("hidden"); 
      if (sub) sub.textContent = "Log In"; 
      if (tog) tog.textContent = "Don't have an account? Sign up"; 
    }
}
$("toggle-auth")?.addEventListener("click", () => { 
  authMode = authMode === "login" ? "register" : "login";
  updateAuthUI(); 
});

$("auth-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const id = $("auth-identifier")?.value.trim(),
          pw = $("auth-password")?.value;
    if (!id || !pw) { showToast("Please enter your credentials.", "error"); return; }
    const isAdminLogin = (id.toLowerCase() === "admin.gmail.com" || id.toLowerCase() === "admin@gmail.com") && pw === ADMIN_PASSWORD;
    if (isAdminLogin) {
        showLoader("Signing in as Admin…");
        try { await signInWithEmailAndPassword(auth, ADMIN_EMAIL, pw); } 
        catch (err) { showToast(getFirebaseErrorMessage(err), "error"); hideLoader(); }
        return;
    }
    showLoader(authMode === "login" ? "Logging in…" : "Creating account…");
    try { 
      if (authMode === "register") await registerUser(id, pw);
      else await loginUser(id, pw); 
    } catch (err) { 
      showToast(getFirebaseErrorMessage(err), "error");
      hideLoader(); 
    }
});

async function registerUser(identifier, password) {
    const email = $("auth-email")?.value.trim(),
          nickname = $("auth-nickname")?.value.trim(),
          phone = $("auth-phone")?.value.trim();
    if (!email || !nickname) throw new Error("Please enter your name and email.");
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const user = cred.user,
          username = await createUniqueUsername(nickname),
          kbId = await createUniqueKBID(),
          photoURL = user.photoURL || DEFAULT_AVATAR;
    await firebaseUpdateProfile(user, { displayName: nickname, photoURL });
    const data = { 
      uid: user.uid, email, nickname, username, phone: phone || "", bio: "", photoURL,
      coverPhoto: DEFAULT_COVER, kbId, verified: false, suspended: false, online: true, privacy: "public",
      createdAt: serverTimestamp(), lastSeen: serverTimestamp(), role: "user", walletBalance: 0,
      teacherPhone: "", subject: "", institution: "", teacherUsername: "", gender: "", dob: "" 
    };
    await set(ref(db, `users/${user.uid}`), data);
    await set(ref(db, `kbIds/${kbId}`), user.uid);
    await set(ref(db, `usernames/${username}`), user.uid);
    showToast("Account created!", "success");
}

async function createUniqueUsername(name) {
    let base = String(name).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 15) || "user";
    let username = base, c = 1;
    while (true) { 
      const s = await get(ref(db, `usernames/${username}`)); 
      if (!s.exists()) return username;
      username = base + c++; 
    }
}

async function createUniqueKBID() {
    while (true) { 
      const kbId = `KB${Math.floor(100000 + Math.random() * 900000)}`; 
      const s = await get(ref(db, `kbIds/${kbId}`)); 
      if (!s.exists()) return kbId; 
    }
}

async function loginUser(identifier, password) {
    if (identifier.includes("@")) { 
      await signInWithEmailAndPassword(auth, identifier, password); 
      return; 
    }
    const uid = await resolveIdentifier(identifier);
    if (!uid) throw new Error("User not found.");
    const snap = await get(ref(db, `users/${uid}`));
    if (!snap.exists()) throw new Error("Profile not found.");
    await signInWithEmailAndPassword(auth, snap.val().email, password);
}

async function resolveIdentifier(identifier) {
    const lower = identifier.trim().toLowerCase();
    let s = await get(ref(db, `usernames/${lower}`));
    if (s.exists()) return s.val();
    const kbId = identifier.trim().toUpperCase();
    s = await get(ref(db, `kbIds/${kbId}`));
    if (s.exists()) return s.val();
    return null;
}

async function logoutUser() { 
  try { 
    await removePresence();
    await signOut(auth);
    showToast("Logged out.", "success"); 
  } catch (e) { 
    console.error(e); 
  } 
}

// Presence handling
async function setPresence() {
    if (!currentUser) return;
    const pr = ref(db, `presence/${currentUser.uid}`);
    await set(pr, { online: true, lastSeen: serverTimestamp() });
    onDisconnect(pr).set({ online: false, lastSeen: serverTimestamp() });
    await update(ref(db, `users/${currentUser.uid}`), { online: true, lastSeen: serverTimestamp() });
}

async function removePresence() {
    if (!currentUser) return;
    await update(ref(db, `presence/${currentUser.uid}`), { online: false, lastSeen: serverTimestamp() }).catch(() => {});
    await update(ref(db, `users/${currentUser.uid}`), { online: false, lastSeen: serverTimestamp() }).catch(() => {});
}

function listenToPresence(uid, cb) { 
  return onValue(ref(db, `presence/${uid}`), s => cb(s.val() || { online: false })); 
}

async function getUserByUID(uid, forceFresh = false) {
    if (!uid) return null;
    if (!forceFresh) { 
      const cached = getCachedUser(uid); 
      if (cached) return cached; 
    }
    const s = await get(ref(db, `users/${uid}`));
    if (s.exists()) { setCachedUser(uid, s.val()); return s.val(); }
    return null;
}

// Attach to window
window.logoutUser = logoutUser;
window.showToast = showToast;
window.showLoader = showLoader;
window.hideLoader = hideLoader;
window.showView = showView;
window.getUserByUID = getUserByUID;

// Auth observer
onAuthStateChanged(auth, async user => {
    const safetyTimer = setTimeout(() => {
        if (!initDone) {
            hideLoader();
            initDone = true;
        }
    }, 4000);

    try {
        if (!user) {
            currentUser = null;
            currentUserData = null;
            isAdmin = false;
            showView("auth-view");
            hideLoader();
            clearTimeout(safetyTimer);
            return;
        }

        currentUser = user;
        showLoader("Loading your profile…");

        let profileSnap = null;
        try {
            const profilePromise = get(ref(db, `users/${user.uid}`));
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000));
            profileSnap = await Promise.race([profilePromise, timeoutPromise]);
        } catch (_) {}

        if (!profileSnap || !profileSnap.exists()) {
            await ensureUserProfile(user);
            profileSnap = await get(ref(db, `users/${user.uid}`));
        }

        if (profileSnap && profileSnap.exists()) {
            currentUserData = profileSnap.val();
            setCachedUser(user.uid, currentUserData);
        }

        isAdmin = currentUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
        if (isAdmin) {
            await set(ref(db, `admins/${currentUser.uid}`), { role: "admin", email: ADMIN_EMAIL });
        }

        if (!currentUserData.gender || !currentUserData.dob) {
            if (!mandatoryCheckDone) setTimeout(() => showMandatoryModal(), 300);
        } else {
            mandatoryCheckDone = true;
        }

        try { await setPresence(); } catch (_) {}

        showView("app-view");
        const hash = location.hash.slice(1) || "feed";
        const validPages = ["feed", "chats", "courses", "wallet", "search", "friends", "support", "profile", "admin", "settings", "user-profile", "teacher-dashboard", "teacher-builder", "teacher-web", "content-viewer", "videos"];
        if (validPages.includes(hash)) showPage(hash);
        else showPage("feed");

        renderProfile();
        loadFeed();
        loadNotes();
        await loadFriends();
        loadChatList();
        loadFriendRequests();
        loadBlocked();
        loadFollowing();
        loadFollowers();
        loadStories();
        loadVerificationRequests();
        if (isAdmin) { loadAdminUsers(); loadAdminSupportInbox(); }
        setupStoryModal();
        setupMessageNotifications();
        setupUserNotificationListener();
        loadCourses();
        loadWallet();
        loadTeacherDashboard();
        loadWithdrawHistory();
        if (isAdmin) { loadAdminRechargeCodes(); loadAdminWithdrawals(); }

        setupNavigation();
        startProfileListener();
        updateSettingsUI();
        updateRoleUI();

        if (currentUserData) {
            const composerAvatar = $("composer-user-avatar");
            if (composerAvatar) composerAvatar.src = currentUserData.photoURL || DEFAULT_AVATAR;
        }

        initDone = true;
        hideLoader();
        clearTimeout(safetyTimer);
    } catch (err) {
        console.error("Auth init error:", err);
        hideLoader();
        clearTimeout(safetyTimer);
        initDone = true;
    }
});

async function ensureUserProfile(user) {
    const ur = ref(db, `users/${user.uid}`);
    const s = await get(ur);
    if (s.exists()) return;
    const nickname = user.displayName || "User",
          username = await createUniqueUsername(nickname),
          kbId = await createUniqueKBID(),
          photoURL = user.photoURL || DEFAULT_AVATAR;
    const data = { 
      uid: user.uid, email: user.email || "", nickname, username, phone: "", bio: "", photoURL,
      coverPhoto: DEFAULT_COVER, kbId, verified: false, suspended: false, online: true, privacy: "public",
      createdAt: serverTimestamp(), lastSeen: serverTimestamp(), role: "user", walletBalance: 0,
      teacherPhone: "", subject: "", institution: "", teacherUsername: "", gender: "", dob: "" 
    };
    await set(ur, data);
    await set(ref(db, `kbIds/${kbId}`), user.uid);
    await set(ref(db, `usernames/${username}`), user.uid);
}

function showMandatoryModal() {
    const modal = $("mandatory-modal");
    if (!modal) return;
    modal.classList.add("active");
    $("mandatory-gender").value = "";
    $("mandatory-dob").value = "";
    $("mandatory-error")?.classList.add("hidden");
}

$("mandatory-submit")?.addEventListener("click", async () => {
    const gender = $("mandatory-gender").value;
    const dob = $("mandatory-dob").value;
    if (!gender || !dob) {
        const err = $("mandatory-error");
        if (err) { err.textContent = "Please fill in both fields."; err.classList.remove("hidden"); }
        return;
    }
    if (!currentUser) return;
    showLoader("Saving…");
    try {
        await update(ref(db, `users/${currentUser.uid}`), { gender, dob });
        invalidateUser(currentUser.uid);
        const snap = await get(ref(db, `users/${currentUser.uid}`));
        if (snap.exists()) { 
          currentUserData = snap.val();
          setCachedUser(currentUser.uid, currentUserData); 
        }
        mandatoryCheckDone = true;
        $("mandatory-modal").classList.remove("active");
        showToast("Profile updated!", "success");
    } catch (e) { 
      showToast("Could not save.", "error"); 
    }
    hideLoader();
});

// Navigation System
export function showPage(page, pushState = true) {
    if (page === "admin" && !isAdmin) return;
    if (page === "user-profile" && !viewingUserProfile) page = "feed";
    const chatEl = $("active-chat");
    if (chatEl && !chatEl.classList.contains("hidden") && page !== "chats") { closeChatInternal(false); }
    
    // Pause any playing videos when switching views
    pauseAllVideos();

    document.querySelectorAll(".content").forEach(c => c.classList.remove("active"));
    const el = $(`page-${page}`);
    if (el) el.classList.add("active");
    document.querySelectorAll(".nav-btn, .mobile-nav-btn").forEach(b => {
        b.classList.remove("active-nav", "active");
        if (b.dataset.page === page) b.classList.add("active-nav", "active");
    });
    if (page === "feed") { loadFeed(); }
    if (page === "support") loadSupportMessages();
    if (page === "admin" && isAdmin) { loadAdminSupportInbox(); loadVerificationRequests(); loadAdminRechargeCodes(); loadAdminWithdrawals(); }
    if (page === "profile") renderProfilePosts();
    if (page === "user-profile" && viewingUserProfile) renderUserProfilePage(viewingUserProfile);
    if (page === "courses") loadCourses();
    if (page === "wallet") { loadWallet(); loadWithdrawHistory(); }
    if (page === "teacher-dashboard") loadTeacherDashboard();
    if (page === "teacher-builder") loadTeacherBuilder();
    if (page === "teacher-web" && window._teacherWebHandle) renderTeacherWeb(window._teacherWebHandle);
    if (page === "content-viewer" && window._currentContent) renderContentViewer(window._currentContent);
    if (page === "videos") loadVideosPage();
    if (pushState && !isNavBack) { 
      if (navStack[navStack.length - 1] !== page) navStack.push(page);
      history.pushState({ page, stack: [...navStack] }, "", `#${page}`); 
    }
    isNavBack = false;
}
window.showPage = showPage;

window.addEventListener("popstate", e => {
    const state = e.state;
    if (!state || !state.stack || state.stack.length === 0) {
        if (navStack.length > 1) { 
          navStack.pop();
          const last = navStack[navStack.length - 1] || "feed";
          isNavBack = true;
          showPage(last, false); 
        }
        return;
    }
    navStack = state.stack;
    const page = state.page || navStack[navStack.length - 1] || "feed";
    isNavBack = true;
    showPage(page, false);
});

function setupNavigation() {
    document.querySelectorAll("[data-page]").forEach(btn => {
        btn.onclick = () => {
            const page = btn.dataset.page;
            if (page === "admin" && !isAdmin) { showToast("Admin access required.", "error"); return; }
            if (page === "user-profile") return;
            showPage(page);
        };
    });
    document.querySelectorAll("#settings-mobile-btn, #profile-settings-btn").forEach(b => { 
      b?.addEventListener("click", () => showPage("settings")); 
    });
    $("settings-back-btn")?.addEventListener("click", () => {
        if (navStack.length > 1) { 
          navStack.pop();
          const prev = navStack[navStack.length - 1] || "profile";
          isNavBack = true;
          showPage(prev, false); 
        } else showPage("profile");
    });
    $("settings-logout-btn")?.addEventListener("click", logoutUser);
    $("logout-btn")?.addEventListener("click", logoutUser);
    $("settings-blocked")?.addEventListener("click", () => openBlockedModal());
    $("user-profile-back")?.addEventListener("click", () => {
        if (navStack.length > 1) { 
          navStack.pop();
          const prev = navStack[navStack.length - 1] || "feed";
          isNavBack = true;
          viewingUserProfile = null;
          showPage(prev, false); 
        } else { 
          viewingUserProfile = null;
          showPage("feed"); 
        }
    });
    $("settings-teacher-register")?.addEventListener("click", () => {
        if (currentUserData?.role === "teacher") {
            showToast("You are already a teacher!", "info");
            return;
        }
        openTeacherRegistration();
    });
    $("teacher-dashboard-btn")?.addEventListener("click", openTeacherDashboard);
}

// Blocked users management
async function loadBlocked() {
    if (!currentUser) return;
    const s = await get(ref(db, `blocked/${currentUser.uid}`));
    blockedCache = s.exists() ? s.val() : {};
    const el = $("blocked-count");
    if (el) el.textContent = Object.keys(blockedCache).length;
}

async function blockUser(uid) {
    if (!currentUser || uid === currentUser.uid) return;
    await set(ref(db, `blocked/${currentUser.uid}/${uid}`), true);
    await loadBlocked();
    showToast("User blocked.", "success");
}

async function unblockUser(uid) {
    if (!currentUser) return;
    await remove(ref(db, `blocked/${currentUser.uid}/${uid}`));
    await loadBlocked();
    showToast("User unblocked.", "success");
}

function openBlockedModal() { 
  const modal = $("blocked-modal"); 
  if (!modal) return; 
  modal.classList.add("active");
  renderBlockedList(); 
}

async function renderBlockedList() {
    const container = $("blocked-list");
    if (!container) return;
    const uids = Object.keys(blockedCache);
    container.innerHTML = "";
    if (!uids.length) { 
      container.innerHTML = `<div class="text-center text-[var(--text-muted)] py-6 text-xs">No blocked accounts.</div>`; 
      return; 
    }
    for (const uid of uids) {
        const user = await getUserByUID(uid);
        if (!user) continue;
        const row = document.createElement("div");
        row.className = "flex items-center gap-3 p-2.5 rounded-xl bg-[var(--bg-soft)]";
        row.innerHTML = `
            <img src="${user.photoURL || DEFAULT_AVATAR}" class="w-8 h-8 rounded-full object-cover" />
            <div class="flex-1 min-w-0">
                <div class="font-bold text-xs truncate">${escapeHTML(user.nickname || "User")}</div>
                <div class="text-[10px] text-gray-500 truncate">@${escapeHTML(user.username || "")}</div>
            </div>
            <button class="unblock-btn text-red-400 text-xs px-3 py-1 rounded-lg border border-red-500/30 hover:bg-red-500/10">Unblock</button>`;
        row.querySelector(".unblock-btn")?.addEventListener("click", () => unblockUser(uid));
        container.appendChild(row);
    }
}
$("close-blocked-modal")?.addEventListener("click", () => { 
  $("blocked-modal")?.classList.remove("active"); 
});

// Follow system
async function loadFollowing() {
    if (!currentUser) return;
    const s = await get(ref(db, `following/${currentUser.uid}`));
    followingCache = s.exists() ? s.val() : {};
    updateFollowCounts();
}

async function loadFollowers() {
    if (!currentUser) return;
    const s = await get(ref(db, `followers/${currentUser.uid}`));
    followerCache = s.exists() ? s.val() : {};
    updateFollowCounts();
}

function updateFollowCounts() {
    const fw = Object.keys(followingCache).length,
          fr = Object.keys(followerCache).length;
    const pfw = $("profile-following-count"), pfr = $("profile-follower-count");
    if (pfw) pfw.textContent = fw;
    if (pfr) pfr.textContent = fr;
    updateVerificationButton();
}

async function followUser(uid) {
    if (!currentUser || uid === currentUser.uid) return;
    if (isBlocked(uid)) { showToast("You have blocked this user.", "error"); return; }
    await set(ref(db, `following/${currentUser.uid}/${uid}`), true);
    await set(ref(db, `followers/${uid}/${currentUser.uid}`), true);
    await loadFollowing();
    await loadFollowers();
    showToast("Followed!", "success");
}

async function unfollowUser(uid) {
    if (!currentUser) return;
    await remove(ref(db, `following/${currentUser.uid}/${uid}`));
    await remove(ref(db, `followers/${uid}/${currentUser.uid}`));
    await loadFollowing();
    await loadFollowers();
    showToast("Unfollowed.", "success");
}

// Verification system
async function loadVerificationRequests() {
    if (!currentUser) return;
    const s = await get(ref(db, "verificationRequests"));
    verificationRequestsCache = s.exists() ? s.val() : {};
    if (isAdmin) renderVerificationRequests();
    updateVerificationButton();
}

function updateVerificationButton() {
    const btn = $("request-verify-btn");
    if (!btn || !currentUserData) return;
    const isVerified = currentUserData.verified,
          followerCount = Object.keys(followerCache).length,
          hasRequested = verificationRequestsCache[currentUser?.uid];
    if (isVerified) { 
      btn.className = "profile-action-btn text-xs text-blue-400 border-blue-500/30";
      btn.innerHTML = `<i class="fas fa-check-circle mr-1"></i> Verified ✓`;
      btn.classList.remove("hidden");
      btn.onclick = null; 
      return; 
    }
    if (hasRequested) { 
      btn.className = "profile-action-btn text-xs text-amber-400 border-amber-500/30";
      btn.innerHTML = `<i class="fas fa-clock mr-1"></i> Request Pending`;
      btn.classList.remove("hidden");
      btn.onclick = null; 
      return; 
    }
    if (followerCount >= VERIFICATION_THRESHOLD) { 
      btn.className = "profile-action-btn text-xs text-blue-400 border-blue-500/30";
      btn.innerHTML = `<i class="fas fa-check-circle mr-1"></i> Request Badge`;
      btn.classList.remove("hidden");
      btn.onclick = requestVerification; 
    } else { 
      btn.classList.add("hidden"); 
    }
}

async function requestVerification() {
    if (!currentUser) return;
    const followerCount = Object.keys(followerCache).length;
    if (followerCount < VERIFICATION_THRESHOLD) { 
      showToast(`Need ${VERIFICATION_THRESHOLD} followers to request badge.`, "error"); 
      return; 
    }
    showLoader("Sending request…");
    try {
        await set(ref(db, `verificationRequests/${currentUser.uid}`), { 
          uid: currentUser.uid,
          name: currentUserData.nickname, 
          username: currentUserData.username,
          photo: currentUserData.photoURL, 
          followerCount, 
          requestedAt: serverTimestamp(),
          status: "pending" 
        });
        await loadVerificationRequests();
        showToast("Verification request sent!", "success");
    } catch (e) { 
      showToast("Could not send request.", "error"); 
    }
    hideLoader();
}

async function renderVerificationRequests() {
    const container = $("admin-verification-list");
    if (!container) return;
    const requests = Object.values(verificationRequestsCache || {}).filter(r => r.status === "pending");
    container.innerHTML = "";
    if (!requests.length) { 
      container.innerHTML = `<div class="text-[var(--text-muted)] text-xs py-2">No pending verification requests.</div>`; 
      return; 
    }
    for (const req of requests) {
        const user = await getUserByUID(req.uid);
        if (!user) continue;
        const row = document.createElement("div");
        row.className = "flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-soft)] border border-[var(--border-color)]";
        row.innerHTML = `
            <img src="${user.photoURL || DEFAULT_AVATAR}" class="w-8 h-8 rounded-full object-cover" />
            <div class="flex-1 min-w-0">
                <div class="font-bold text-xs truncate">${escapeHTML(user.nickname || "User")}</div>
                <div class="text-[10px] text-gray-500">@${escapeHTML(user.username || "")} · ${req.followerCount || 0} followers</div>
            </div>
            <button class="verify-approve-btn bg-green-600 text-white px-3 py-1 rounded-lg text-xs mr-1">Approve</button>
            <button class="verify-reject-btn bg-red-600 text-white px-3 py-1 rounded-lg text-xs">Reject</button>`;
        row.querySelector(".verify-approve-btn")?.addEventListener("click", () => approveVerification(req.uid));
        row.querySelector(".verify-reject-btn")?.addEventListener("click", () => rejectVerification(req.uid));
        container.appendChild(row);
    }
}

async function approveVerification(uid) {
    if (!isAdmin) return;
    showLoader("Approving…");
    try { 
      await update(ref(db, `users/${uid}`), { verified: true, verifiedAt: serverTimestamp(), verifiedBy: currentUser.uid });
      await remove(ref(db, `verificationRequests/${uid}`));
      invalidateUser(uid);
      await loadVerificationRequests();
      showToast("User verified!", "success"); 
    } catch (e) { 
      showToast("Could not approve.", "error"); 
    }
    hideLoader();
}

async function rejectVerification(uid) {
    if (!isAdmin) return;
    showLoader("Rejecting…");
    try { 
      await remove(ref(db, `verificationRequests/${uid}`));
      await loadVerificationRequests();
      showToast("Request rejected.", "success"); 
    } catch (e) { 
      showToast("Could not reject.", "error"); 
    }
    hideLoader();
}

function updateRoleUI() {
    if (!currentUserData) return;
    const role = currentUserData.role || "user";
    const isTeacher = role === "teacher";
    const dashBtn = $("teacher-dashboard-btn");
    if (dashBtn) dashBtn.style.display = isTeacher ? "inline-flex" : "none";
    const roleBadge = $("profile-role-badge");
    if (roleBadge) {
        if (isTeacher) {
            roleBadge.textContent = "👨‍🏫 Teacher";
            roleBadge.classList.remove("hidden");
        } else if (isAdmin) {
            roleBadge.textContent = "🛡 Admin";
            roleBadge.classList.remove("hidden");
        } else {
            roleBadge.classList.add("hidden");
        }
    }
    const withdrawSec = $("teacher-withdraw-section");
    const withdrawHist = $("teacher-withdraw-history");
    if (withdrawSec) withdrawSec.classList.toggle("hidden", !isTeacher);
    if (withdrawHist) withdrawHist.classList.toggle("hidden", !isTeacher);
    const adminNav = $("admin-nav-btn");
    if (adminNav) adminNav.classList.toggle("hidden", !isAdmin);
    const adBtn = $("post-ad-btn");
    if (adBtn) adBtn.classList.toggle("hidden", !isAdmin);
}

// Profile rendering
function renderProfile() {
    if (!currentUserData) return;
    const d = currentUserData,
          photo = d.photoURL || DEFAULT_AVATAR,
          cover = d.coverPhoto || DEFAULT_COVER;
    const pp = $("profile-pic"), pc = $("profile-cover");
    if (pp) pp.src = photo;
    if (pc) pc.src = cover;
    const pn = $("profile-name"), pu = $("profile-username"), pk = $("profile-kbid"), pb = $("profile-bio");
    if (pn) pn.textContent = d.nickname || "User";
    if (pu) pu.textContent = d.username || "";
    if (pk) pk.textContent = d.kbId || "";
    if (pb) pb.textContent = d.bio || "No bio yet.";
    const navK = $("nav-kbid");
    if (navK) navK.textContent = d.kbId || "";
    const badge = $("profile-verified-badge");
    if (badge) badge.innerHTML = d.verified ? `<span class="verified-badge"><i class="fas fa-check"></i></span>` : "";
    $("profile-online-dot")?.classList.toggle("hidden", !d.online);
    loadFollowing();
    loadFollowers();
    renderProfilePosts();
    updateVerificationButton();
    updateRoleUI();
}

$("edit-profile")?.addEventListener("click", () => {
    if (!currentUserData) return;
    $("edit-nickname").value = currentUserData.nickname || "";
    $("edit-bio").value = currentUserData.bio || "";
    $("edit-profile-preview").src = currentUserData.photoURL || DEFAULT_AVATAR;
    $("edit-cover-preview").src = currentUserData.coverPhoto || DEFAULT_COVER;
    $("edit-profile-modal")?.classList.add("active");
});
$("close-edit-profile")?.addEventListener("click", () => { 
  $("edit-profile-modal")?.classList.remove("active"); 
});

$("edit-profile-image")?.addEventListener("change", e => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = ev => { $("edit-profile-preview").src = ev.target.result; };
    r.readAsDataURL(f);
});

$("edit-cover-image")?.addEventListener("change", e => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = ev => { $("edit-cover-preview").src = ev.target.result; };
    r.readAsDataURL(f);
});

$("change-cover-btn")?.addEventListener("click", () => { 
  $("edit-profile")?.click();
  setTimeout(() => $("edit-cover-image")?.click(), 250); 
});

$("save-profile")?.addEventListener("click", saveProfile);

async function saveProfile() {
    if (!currentUser) return;
    const nickname = $("edit-nickname")?.value.trim(),
          bio = $("edit-bio")?.value.trim();
    if (!nickname) { showToast("Name cannot be empty.", "error"); return; }
    showLoader("Saving profile…");
    try {
        let photoURL = currentUserData.photoURL || DEFAULT_AVATAR;
        const imgFile = $("edit-profile-image")?.files?.[0];
        if (imgFile) photoURL = await uploadToCloudinary(imgFile);
        let coverPhoto = currentUserData.coverPhoto || DEFAULT_COVER;
        const coverFile = $("edit-cover-image")?.files?.[0];
        if (coverFile) coverPhoto = await uploadToCloudinary(coverFile);
        await update(ref(db, `users/${currentUser.uid}`), { nickname, bio, photoURL, coverPhoto, updatedAt: serverTimestamp() });
        await firebaseUpdateProfile(currentUser, { displayName: nickname, photoURL });
        invalidateUser(currentUser.uid);
        const fresh = await getUserByUID(currentUser.uid, true);
        if (fresh) currentUserData = fresh;
        renderProfile();
        $("edit-profile-modal").classList.remove("active");
        showToast("Profile updated!", "success");
    } catch (err) { 
      showToast("Could not update profile.", "error"); 
    }
    hideLoader();
}

function startProfileListener() {
    if (currentProfileListener) currentProfileListener();
    if (!currentUser) return;
    currentProfileListener = onValue(ref(db, `users/${currentUser.uid}`), s => {
        if (s.exists()) { 
          currentUserData = s.val();
          setCachedUser(currentUser.uid, currentUserData);
          renderProfile(); 
        }
    });
}

function updateSettingsUI() {
    if (!currentUserData) return;
    const isPublic = currentUserData.privacy !== "personal";
    const sw = $("privacy-switch");
    if (sw) { 
      sw.classList.toggle("active", isPublic);
      const lbl = $("privacy-label"); 
      if (lbl) lbl.textContent = isPublic ? "Public" : "Personal"; 
    }
    const theme = getTheme();
    const tv = $("theme-value");
    if (tv) tv.textContent = theme === "dark" ? "Dark" : "Light";
}

$("privacy-switch")?.addEventListener("click", async () => {
    if (!currentUser) return;
    const sw = $("privacy-switch"),
          currentlyPublic = sw.classList.contains("active"),
          newPrivacy = currentlyPublic ? "personal" : "public";
    await update(ref(db, `users/${currentUser.uid}`), { privacy: newPrivacy });
    invalidateUser(currentUser.uid);
    currentUserData.privacy = newPrivacy;
    renderProfile();
    updateSettingsUI();
    showToast(`Account is now ${newPrivacy === "public" ? "🌍 Public" : "🔒 Personal"}`, "success");
});

function canSeeContent(item, itemOwnerUid) {
    if (!currentUser) return false;
    if (itemOwnerUid === currentUser.uid) return true;
    if (isBlocked(itemOwnerUid)) return false;
    if (isAdmin) return true;
    const privacy = item.privacy || "public";
    if (privacy === "public") return true;
    return !!friendsCache[itemOwnerUid];
}

// Instagram Notes System
$("create-note-profile")?.addEventListener("click", openNoteModal);

function openNoteModal() {
    $("note-input").value = "";
    $("note-counter").textContent = "0 / 60";
    $("note-preview-bubble").textContent = "Your thought preview…";
    $("note-preview-avatar").src = currentUserData?.photoURL || DEFAULT_AVATAR;
    $("note-preview-name").textContent = currentUserData?.nickname || "You";
    $("note-modal")?.classList.add("active");
}
$("close-note")?.addEventListener("click", () => { 
  $("note-modal")?.classList.remove("active"); 
});

$("note-input")?.addEventListener("input", e => {
    const t = e.target.value.slice(0, 60);
    e.target.value = t;
    $("note-counter").textContent = `${t.length} / 60`;
    $("note-preview-bubble").textContent = t || "Your thought preview…";
});

$("save-note")?.addEventListener("click", saveNote);

async function saveNote() {
    if (!currentUser) return;
    const text = $("note-input")?.value.trim();
    if (!text) { showToast("Write a thought first.", "error"); return; }
    const privacy = $("note-privacy")?.value || "public";
    showLoader("Sharing note…");
    try {
        const existing = await get(ref(db, "notes"));
        if (existing.exists()) { 
          for (const [k, n] of Object.entries(existing.val())) { 
            if (n.uid === currentUser.uid) await remove(ref(db, `notes/${k}`)); 
          } 
        }
        const nr = push(ref(db, "notes"));
        await set(nr, { 
          noteId: nr.key, uid: currentUser.uid, text: text.slice(0, 60), privacy,
          createdAt: serverTimestamp(), expiresAt: Date.now() + 86400000 
        });
        $("note-modal")?.classList.remove("active");
        showToast("Thought shared!", "success");
    } catch (e) { 
      showToast("Could not share thought.", "error"); 
    }
    hideLoader();
}

$("close-view-note")?.addEventListener("click", () => { 
  $("view-note-modal")?.classList.remove("active"); 
});

function loadNotes() {
    onValue(ref(db, "notes"), async s => {
        const data = s.val() || {};
        const valid = Object.values(data).filter(n => n && n.expiresAt > Date.now()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const container = $("notes-container");
        if (!container) return;
        container.innerHTML = "";
        const myNote = valid.find(n => n.uid === currentUser?.uid);
        const addItem = document.createElement("div");
        addItem.className = "note-item";
        if (myNote) {
            addItem.innerHTML = `
                <div class="note-bubble-wrap">
                    <div class="note-bubble">${escapeHTML(myNote.text)}</div>
                    <div class="note-avatar-ring">
                        <img src="${currentUserData?.photoURL || DEFAULT_AVATAR}">
                    </div>
                </div>
                <div class="text-[11px] text-gray-400 mt-1 truncate">Your note</div>`;
        } else {
            addItem.innerHTML = `
                <div class="note-bubble-wrap">
                    <div class="add-note-circle"><i class="fas fa-plus"></i></div>
                </div>
                <div class="text-[11px] text-gray-400 mt-1 truncate">Add Note</div>`;
        }
        addItem.onclick = openNoteModal;
        container.appendChild(addItem);
        for (const note of valid) {
            if (note.uid === currentUser?.uid) continue;
            const user = await getUserByUID(note.uid);
            if (!user || !canSeeContent(note, note.uid)) continue;
            const item = document.createElement("div");
            item.className = "note-item";
            item.innerHTML = `
                <div class="note-bubble-wrap">
                    <div class="note-bubble">${escapeHTML(note.text)}</div>
                    <div class="note-avatar-ring">
                        <img src="${user.photoURL || DEFAULT_AVATAR}">
                    </div>
                </div>
                <div class="text-[11px] text-gray-400 mt-1 truncate">${escapeHTML(user.nickname?.split(" ")[0] || "User")}</div>`;
            item.onclick = () => viewNote(user, note);
            container.appendChild(item);
        }
    });
}

function viewNote(user, note) {
    $("view-note-avatar").src = user.photoURL || DEFAULT_AVATAR;
    $("view-note-name").textContent = user.nickname || "User";
    $("view-note-username").textContent = `@${user.username || ""}`;
    $("view-note-bubble").textContent = note.text;
    $("view-note-modal")?.classList.add("active");
}

// Friends System
async function loadFriends() {
    if (!currentUser) return;
    const s = await get(ref(db, `friends/${currentUser.uid}`));
    friendsCache = s.exists() ? s.val() : {};
    renderFriends();
    renderChatTop();
    const reqSnap = await get(ref(db, `friendRequests/${currentUser.uid}`));
    const reqs = reqSnap.exists() ? Object.keys(reqSnap.val()) : [];
    const badge = $("friend-badge");
    if (badge) { 
      if (reqs.length > 0) { badge.textContent = reqs.length; badge.classList.remove("hidden"); } 
      else badge.classList.add("hidden"); 
    }
}

async function renderFriends() {
    const container = $("friends-list");
    if (!container) return;
    container.innerHTML = "";
    const ids = Object.keys(friendsCache || {});
    if (!ids.length) { 
      container.innerHTML = `<div class="text-center text-[var(--text-muted)] py-10 text-xs">No friends yet.</div>`; 
      return; 
    }
    for (const uid of ids) {
        const user = await getUserByUID(uid);
        if (!user) continue;
        container.appendChild(createUserCard(user, true));
    }
}

function createUserCard(user, showChat = false) {
    const card = document.createElement("div");
    card.className = "dark-card p-3 flex items-center gap-3 cursor-pointer hover:bg-[var(--bg-soft)] transition";
    card.innerHTML = `
        <div class="avatar-wrap"><img src="${user.photoURL || DEFAULT_AVATAR}" class="avatar-img">${user.online ? `<span class="online-dot"></span>` : ""}</div>
        <div class="flex-1 min-w-0">
            <div class="font-bold text-xs truncate">${escapeHTML(user.nickname || "User")}${user.verified ? `<span class="verified-badge"><i class="fas fa-check"></i></span>` : ""}</div>
            <div class="text-[10px] text-gray-400 truncate">@${escapeHTML(user.username || "")} · ${user.online ? "Online" : "Offline"}</div>
        </div>`;
    if (showChat) {
        const btn = document.createElement("button");
        btn.className = "w-8 h-8 rounded-full bg-[#0095f6] flex items-center justify-center text-white text-xs";
        btn.innerHTML = `<i class="fas fa-paper-plane"></i>`;
        btn.onclick = e => { e.stopPropagation(); openChat(user); };
        card.appendChild(btn);
    }
    card.onclick = () => openUserProfileFull(user);
    return card;
}

async function renderChatTop() {
    const container = $("chat-top-container");
    if (!container) return;
    container.innerHTML = "";
    const ids = Object.keys(friendsCache || {});
    if (!ids.length) { 
      container.innerHTML = `<div class="text-xs text-gray-500 px-3 py-2">Add friends to start direct chats.</div>`; 
      return; 
    }
    for (const uid of ids) {
        const user = await getUserByUID(uid);
        if (!user || isBlocked(uid)) continue;
        const item = document.createElement("div");
        item.className = "flex flex-col items-center gap-1 cursor-pointer flex-shrink-0";
        item.innerHTML = `
            <div class="relative"><img src="${user.photoURL || DEFAULT_AVATAR}" class="w-12 h-12 rounded-full object-cover border-2 border-[var(--border-color)]">${user.online ? `<span class="online-dot"></span>` : ""}</div>
            <span class="text-[10px] text-gray-400 max-w-[50px] truncate">${escapeHTML(user.nickname?.split(" ")[0] || "User")}</span>`;
        item.onclick = () => openChat(user);
        container.appendChild(item);
    }
}

async function sendFriendRequest(user) {
    if (!currentUser || user.uid === currentUser.uid) return;
    if (isBlocked(user.uid)) { showToast("You have blocked this user.", "error"); return; }
    try {
        await set(ref(db, `friendRequests/${user.uid}/${currentUser.uid}`), { 
          uid: currentUser.uid,
          fromName: currentUserData?.nickname || "User",
          fromPhoto: currentUserData?.photoURL || DEFAULT_AVATAR, 
          createdAt: serverTimestamp() 
        });
        showToast("Friend request sent.", "success");
    } catch (e) { 
      showToast("Could not send request.", "error"); 
    }
}

function loadFriendRequests() {
    if (!currentUser) return;
    onValue(ref(db, `friendRequests/${currentUser.uid}`), s => {
        const requests = s.val() || {};
        const container = $("incoming-requests");
        if (!container) return;
        container.innerHTML = "";
        const entries = Object.entries(requests);
        const badge = $("friend-badge");
        if (badge) { 
          if (entries.length > 0) { badge.textContent = entries.length; badge.classList.remove("hidden"); } 
          else badge.classList.add("hidden"); 
        }
        if (!entries.length) { 
          container.innerHTML = `<div class="text-center text-gray-500 p-4 dark-card text-xs">No pending requests.</div>`; 
          return; 
        }
        entries.forEach(([uid, req]) => {
            const item = document.createElement("div");
            item.className = "dark-card p-3 flex items-center gap-3";
            item.innerHTML = `
                <img src="${req.fromPhoto || DEFAULT_AVATAR}" class="avatar-img">
                <div class="flex-1 min-w-0"><div class="font-bold text-xs truncate">${escapeHTML(req.fromName || "User")}</div><div class="text-[10px] text-gray-400">Wants to connect.</div></div>
                <button class="accept-btn bg-[#0095f6] text-white px-3 py-1.5 rounded-lg text-xs font-bold">Accept</button>
                <button class="reject-btn bg-[var(--bg-soft)] text-gray-400 px-3 py-1.5 rounded-lg text-xs font-semibold">Reject</button>`;
            item.querySelector(".accept-btn")?.addEventListener("click", () => acceptFriendRequest(uid));
            item.querySelector(".reject-btn")?.addEventListener("click", () => rejectFriendRequest(uid));
            container.appendChild(item);
        });
    });
}

async function acceptFriendRequest(uid) {
    if (!currentUser) return;
    try {
        await update(ref(db), { 
          [`friends/${currentUser.uid}/${uid}`]: true, 
          [`friends/${uid}/${currentUser.uid}`]: true, 
          [`friendRequests/${currentUser.uid}/${uid}`]: null 
        });
        showToast("Connected as friends.", "success");
        await loadFriends();
    } catch (e) { 
      showToast("Could not accept request.", "error"); 
    }
}

async function rejectFriendRequest(uid) {
    if (!currentUser) return;
    try { 
      await remove(ref(db, `friendRequests/${currentUser.uid}/${uid}`));
      showToast("Rejected.", "info"); 
    } catch (e) {}
}

// User Profile Full Page
async function openUserProfileFull(user) {
    if (!user) return;
    if (isBlocked(user.uid)) { showToast("You have blocked this user.", "error"); return; }
    viewingUserProfile = user;
    const followingSnap = await get(ref(db, `following/${user.uid}`));
    const followersSnap = await get(ref(db, `followers/${user.uid}`));
    user._followingCount = followingSnap.exists() ? Object.keys(followingSnap.val()).length : 0;
    user._followerCount = followersSnap.exists() ? Object.keys(followersSnap.val()).length : 0;
    showPage("user-profile");
    setTimeout(() => renderUserProfilePage(user), 50);
}

async function renderUserProfilePage(user) {
    if (!user) return;
    const photo = user.photoURL || DEFAULT_AVATAR,
          cover = user.coverPhoto || DEFAULT_COVER;
    $("user-profile-page-title").textContent = user.nickname || "Profile";
    $("user-profile-page-pic").src = photo;
    $("user-profile-page-cover").src = cover;
    $("user-profile-page-name").textContent = user.nickname || "User";
    $("user-profile-page-username").textContent = user.username || "";
    $("user-profile-page-kbid").textContent = user.kbId || "";
    $("user-profile-page-bio").textContent = user.bio || "No bio yet.";
    const badge = $("user-profile-page-verified-badge");
    if (badge) badge.innerHTML = user.verified ? `<span class="verified-badge"><i class="fas fa-check"></i></span>` : "";
    $("user-profile-page-online-dot")?.classList.toggle("hidden", !user.online);
    $("user-profile-page-following").textContent = user._followingCount || 0;
    $("user-profile-page-followers").textContent = user._followerCount || 0;
    const ps = await get(ref(db, "posts"));
    const allPosts = ps.exists() ? Object.values(ps.val()) : [];
    const userPosts = allPosts.filter(p => p.uid === user.uid).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    $("user-profile-page-post-count").textContent = userPosts.length;
    const isMe = currentUser?.uid === user.uid;
    const actions = $("user-profile-page-actions");
    if (isMe) {
        actions.innerHTML = `<button class="profile-action-btn text-xs" onclick="window.showPage('profile')"><i class="fas fa-user mr-1"></i>My Profile</button>`;
        const container = $("user-profile-posts-container");
        if (!container) return;
        container.innerHTML = "";
        if (!userPosts.length) { 
          container.innerHTML = `<div class="text-center text-gray-500 py-8 dark-card text-xs">No posts yet.</div>`; 
          return; 
        }
        for (const post of userPosts) { container.appendChild(createPostCard(post, user)); }
        return;
    }
    const isFollower = isFollowing(user.uid),
          isFriendUser = isFriend(user.uid),
          isBlockedUser = isBlocked(user.uid);
    actions.innerHTML = `
        <div class="flex gap-2 flex-wrap">
            <button id="user-page-chat-btn" class="profile-action-btn primary text-xs"><i class="fas fa-paper-plane mr-1"></i>Message</button>
            <button id="user-page-friend-btn" class="profile-action-btn text-xs"><i class="fas fa-${isFriendUser ? "user-check" : "user-plus"} mr-1"></i>${isFriendUser ? "Friends" : "Add"}</button>
            <button id="user-page-follow-btn" class="profile-action-btn text-xs ${isFollower ? "bg-green-600/30 text-green-400" : ""}"><i class="fas fa-${isFollower ? "check" : "plus"} mr-1"></i>${isFollower ? "Following" : "Follow"}</button>
        </div>
        <button id="user-page-block-btn" class="profile-action-btn text-xs text-red-400 border-red-500/30 mt-1"><i class="fas fa-${isBlockedUser ? "undo" : "ban"} mr-1"></i>${isBlockedUser ? "Unblock" : "Block"}</button>`;
    
    $("user-page-chat-btn")?.addEventListener("click", () => { showPage("chats"); openChat(user); });
    $("user-page-friend-btn")?.addEventListener("click", () => { 
      if (!isFriendUser) { 
        sendFriendRequest(user); 
        $("user-page-friend-btn").textContent = "Sent"; 
      } 
    });
    $("user-page-follow-btn")?.addEventListener("click", async () => {
        if (isFollower) await unfollowUser(user.uid);
        else await followUser(user.uid);
        renderUserProfilePage(user);
    });
    $("user-page-block-btn")?.addEventListener("click", async () => {
        if (isBlockedUser) await unblockUser(user.uid);
        else await blockUser(user.uid);
        renderUserProfilePage(user);
    });
    const container = $("user-profile-posts-container");
    if (!container) return;
    container.innerHTML = "";
    if (!userPosts.length) { 
      container.innerHTML = `<div class="text-center text-gray-500 py-8 dark-card text-xs">No posts yet.</div>`; 
      return; 
    }
    for (const post of userPosts) {
        if (!canSeeContent(post, post.uid)) continue;
        container.appendChild(createPostCard(post, user));
    }
}

// Instagram Direct Messages
async function openChat(user) {
    if (!user || !currentUser) return;
    if (isBlocked(user.uid)) { showToast("You have blocked this user.", "error"); return; }
    const freshUser = await getUserByUID(user.uid, true);
    if (!freshUser) { showToast("User not found.", "error"); return; }
    user = freshUser;
    currentChatUser = user;
    currentChatId = [currentUser.uid, user.uid].sort().join("_");
    await loadChatTheme();
    const chatEl = $("active-chat");
    if (chatEl) { chatEl.classList.remove("hidden"); chatEl.classList.add("flex"); }
    $("active-name").textContent = user.nickname || "User";
    $("active-pic").src = user.photoURL || DEFAULT_AVATAR;
    const badge = $("active-verified-badge");
    if (badge) badge.classList.toggle("hidden", !user.verified);
    updateChatStatus(user);
    applyChatTheme(currentChatTheme);
    loadChatMessages();
    startTypingListener();
    startChatPresenceListener();
    
    const attachBtn = $("chat-attach-btn"), imageInput = $("chat-image-input");
    if (attachBtn && imageInput) {
        attachBtn.onclick = () => imageInput.click();
        imageInput.onchange = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            showLoader("Uploading image…");
            try {
                const url = await uploadToCloudinary(file);
                const mr = push(ref(db, `messages/${currentChatId}`));
                await set(mr, { 
                  messageId: mr.key, senderId: currentUser.uid, receiverId: currentChatUser.uid, 
                  text: "📷 Photo", type: "image", imageUrl: url, createdAt: serverTimestamp(), seen: false 
                });
                await updateChatList("📷 Photo");
                showToast("Photo sent!", "success");
            } catch (err) { 
              showToast("Could not upload image.", "error"); 
            }
            e.target.value = "";
            hideLoader();
        };
    }
    $("chat-header-profile").onclick = () => { closeActionsSheet(); openUserProfileFull(currentChatUser); };
    $("chat-actions-btn").onclick = openActionsSheet;
    $("close-chat").onclick = () => closeChatInternal(true);
    history.pushState({ page: "chats", chat: user.uid, stack: [...navStack] }, "", "#chats");
}

function updateChatStatus(user) {
    const statusEl = $("active-status"), dotEl = $("active-status-dot");
    if (!statusEl || !dotEl) return;
    const isOnline = user?.online === true;
    dotEl.classList.toggle("hidden", !isOnline);
    statusEl.textContent = isOnline ? "Active now" : formatLastSeen(user?.lastSeen);
}

function closeChatInternal(pushBack = true) {
    if (activeChatMessageListener) { activeChatMessageListener(); activeChatMessageListener = null; }
    if (activeTypingListener) { activeTypingListener(); activeTypingListener = null; }
    if (activePresenceListener) { activePresenceListener(); activePresenceListener = null; }
    if (typingTimer) clearTimeout(typingTimer);
    if (currentUser && currentChatUser) { 
      remove(ref(db, `typing/${currentChatUser.uid}/${currentUser.uid}`)).catch(() => {}); 
    }
    const chatEl = $("active-chat");
    if (chatEl) { chatEl.classList.add("hidden"); chatEl.classList.remove("flex"); }
    currentChatUser = null;
    currentChatId = null;
    if (pushBack) {
        if (navStack.length > 1) { 
          navStack.pop();
          const prev = navStack[navStack.length - 1] || "chats";
          isNavBack = true;
          showPage(prev, false); 
        } else showPage("chats");
    }
}

function loadChatMessages() {
    if (!currentUser || !currentChatUser || !currentChatId) return;
    if (activeChatMessageListener) activeChatMessageListener();
    activeChatMessageListener = onValue(ref(db, `messages/${currentChatId}`), s => {
        const msgs = Object.values(s.val() || {}).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        renderChatMessages(msgs);
    });
}

function renderChatMessages(messages) {
    const container = $("chat-messages");
    if (!container) return;
    container.innerHTML = "";
    if (!messages.length) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-gray-500 py-10">
                <div class="w-16 h-16 rounded-full bg-[var(--bg-soft)] flex items-center justify-center text-2xl mb-3"><i class="fas fa-paper-plane"></i></div>
                <p class="text-xs">No messages yet. Send a greeting!</p>
            </div>`;
        return;
    }
    messages.forEach((msg) => {
        const mine = msg.senderId === currentUser.uid;
        const wrapper = document.createElement("div");
        wrapper.className = mine ? "flex justify-end mb-2" : "flex justify-start mb-2";
        const bubble = document.createElement("div");
        bubble.className = mine ? "message-bubble mine" : "message-bubble other";
        let content = "";
        if (msg.type === "image" && msg.imageUrl) {
            content += `<img src="${msg.imageUrl}" class="max-w-[200px] max-h-[260px] rounded-xl object-cover mb-1" loading="lazy" />`;
        }
        if (msg.text && msg.type !== "image") {
            content += `<div class="whitespace-pre-wrap break-words">${escapeHTML(msg.text)}</div>`;
        }
        const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
        content += `<div class="text-[9px] mt-1 opacity-60 flex justify-end items-center gap-1">${time}${mine ? `<i class="fas fa-${msg.seen ? "check-double text-blue-300" : "check"}"></i>` : ""}</div>`;
        bubble.innerHTML = content;
        wrapper.appendChild(bubble);
        container.appendChild(wrapper);
    });
    container.scrollTop = container.scrollHeight;
    markMessagesSeen();
}

$("chat-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    if (!currentUser || !currentChatUser || !currentChatId) return;
    const input = $("chat-input");
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    try {
        const mr = push(ref(db, `messages/${currentChatId}`));
        await set(mr, { 
          messageId: mr.key, senderId: currentUser.uid, receiverId: currentChatUser.uid,
          text, type: "text", createdAt: serverTimestamp(), seen: false 
        });
        input.value = "";
        stopTyping();
        await updateChatList(text);
    } catch (err) { 
      showToast("Message could not be sent.", "error"); 
    }
});

async function updateChatList(lastMessage) {
    if (!currentUser || !currentChatUser) return;
    const now = Date.now();
    await update(ref(db), {
        [`chatList/${currentUser.uid}/${currentChatUser.uid}`]: { uid: currentChatUser.uid, lastMessage, updatedAt: now, theme: currentChatTheme || 'default' },
        [`chatList/${currentChatUser.uid}/${currentUser.uid}`]: { uid: currentUser.uid, lastMessage, updatedAt: now, theme: currentChatTheme || 'default' }
    });
}

function loadChatList() {
    if (!currentUser) return;
    onValue(ref(db, `chatList/${currentUser.uid}`), async s => {
        const chats = Object.values(s.val() || {}).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        const container = $("chat-list");
        if (!container) return;
        container.innerHTML = "";
        const filtered = chats.filter(c => !isBlocked(c.uid));
        if (!filtered.length) { 
          container.innerHTML = `<div class="text-center text-gray-500 py-10 px-4 text-xs">No conversations yet.</div>`; 
          return; 
        }
        for (const chat of filtered) {
            const user = await getUserByUID(chat.uid);
            if (!user || isBlocked(user.uid)) continue;
            const item = document.createElement("div");
            item.className = "p-3.5 flex items-center gap-3 cursor-pointer hover:bg-[var(--bg-soft)] transition";
            item.innerHTML = `
                <div class="avatar-wrap"><img src="${user.photoURL || DEFAULT_AVATAR}" class="avatar-img">${user.online ? `<span class="online-dot"></span>` : ""}</div>
                <div class="flex-1 min-w-0">
                    <div class="font-semibold text-xs truncate flex items-center gap-1">
                        ${escapeHTML(user.nickname || "User")}
                        ${user.verified ? `<span class="verified-badge"><i class="fas fa-check"></i></span>` : ""}
                    </div>
                    <div class="text-[11px] text-gray-400 truncate mt-0.5">${escapeHTML(chat.lastMessage || "Message")}</div>
                </div>`;
            item.onclick = () => openChat(user);
            container.appendChild(item);
        }
    });
}

async function markMessagesSeen() {
    if (!currentUser || !currentChatId) return;
    const s = await get(ref(db, `messages/${currentChatId}`));
    if (!s.exists()) return;
    const updates = {};
    Object.entries(s.val()).forEach(([k, msg]) => {
        if (msg.receiverId === currentUser.uid && !msg.seen) updates[`messages/${currentChatId}/${k}/seen`] = true;
    });
    if (Object.keys(updates).length) await update(ref(db), updates);
}

$("chat-input")?.addEventListener("input", () => {
    if (!currentUser || !currentChatUser) return;
    setTyping();
    clearTimeout(typingTimer);
    typingTimer = setTimeout(stopTyping, 1800);
});

async function setTyping() {
    if (!currentUser || !currentChatUser) return;
    await set(ref(db, `typing/${currentChatUser.uid}/${currentUser.uid}`), { 
      typing: true, name: currentUserData?.nickname || "Someone", timestamp: serverTimestamp() 
    }).catch(() => {});
}

async function stopTyping() {
    if (!currentUser || !currentChatUser) return;
    await remove(ref(db, `typing/${currentChatUser.uid}/${currentUser.uid}`)).catch(() => {});
}

function startTypingListener() {
    if (!currentUser || !currentChatUser) return;
    if (activeTypingListener) activeTypingListener();
    activeTypingListener = onValue(ref(db, `typing/${currentUser.uid}/${currentChatUser.uid}`), s => {
        const data = s.val();
        const indicator = $("typing-indicator"), nameEl = $("typing-name-text");
        if (!indicator) return;
        if (data?.typing) { 
          if (nameEl) nameEl.textContent = `${escapeHTML(data.name || "Someone")} is typing…`;
          indicator.classList.remove("hidden");
          indicator.classList.add("show"); 
        } else { 
          indicator.classList.add("hidden");
          indicator.classList.remove("show"); 
        }
    });
}

function startChatPresenceListener() {
    if (!currentChatUser) return;
    if (activePresenceListener) activePresenceListener();
    activePresenceListener = listenToPresence(currentChatUser.uid, data => {
        const online = data?.online === true;
        const dot = $("active-status-dot"), status = $("active-status");
        if (dot) dot.classList.toggle("hidden", !online);
        if (status) status.textContent = online ? "Active now" : formatLastSeen(data?.lastSeen);
    });
}

async function loadChatTheme() {
    if (!currentUser || !currentChatUser) return;
    const key = [currentUser.uid, currentChatUser.uid].sort().join("_");
    try {
        const s = await get(ref(db, `chatThemes/${key}`));
        currentChatTheme = s.exists() ? (s.val().theme || 'default') : 'default';
    } catch (_) { currentChatTheme = 'default'; }
    applyChatTheme(currentChatTheme);
}

function applyChatTheme(theme) {
    const chatEl = $("active-chat");
    if (!chatEl) return;
    THEMES.forEach(t => chatEl.classList.remove(`theme-${t}`));
    if (theme !== 'default') chatEl.classList.add(`theme-${theme}`);
}

function openActionsSheet() {
    const sheet = $("chat-actions-sheet"), overlay = $("chat-actions-overlay");
    if (!sheet || !overlay) return;
    const isBlockedUser = isBlocked(currentChatUser?.uid);
    const blockLabel = $("block-action-label");
    if (blockLabel) blockLabel.textContent = isBlockedUser ? "Unblock User" : "Block User";
    sheet.classList.remove("translate-y-full");
    overlay.classList.add("active");
}

function closeActionsSheet() {
    const sheet = $("chat-actions-sheet"), overlay = $("chat-actions-overlay");
    if (sheet) sheet.classList.add("translate-y-full");
    if (overlay) overlay.classList.remove("active");
}

$("close-actions-sheet")?.addEventListener("click", closeActionsSheet);
$("chat-actions-overlay")?.addEventListener("click", closeActionsSheet);

document.querySelectorAll(".theme-option").forEach(opt => {
    opt.addEventListener("click", async () => {
        const theme = opt.dataset.theme;
        if (theme && currentChatUser) {
            const key = [currentUser.uid, currentChatUser.uid].sort().join("_");
            await set(ref(db, `chatThemes/${key}`), { theme, updatedAt: serverTimestamp() });
            currentChatTheme = theme;
            applyChatTheme(theme);
            closeActionsSheet();
            showToast("Theme updated!", "success");
        }
    });
});

$("action-view-profile")?.addEventListener("click", () => { 
  if (currentChatUser) { closeActionsSheet(); openUserProfileFull(currentChatUser); } 
});

$("action-block")?.addEventListener("click", async () => {
    if (!currentChatUser) return;
    if (isBlocked(currentChatUser.uid)) { await unblockUser(currentChatUser.uid); } 
    else { await blockUser(currentChatUser.uid); closeChatInternal(true); }
    closeActionsSheet();
});

$("action-report")?.addEventListener("click", () => { 
  closeActionsSheet(); 
  setTimeout(() => {
    if (currentChatUser) $("report-user-name").textContent = currentChatUser.nickname || "User";
    $("report-modal")?.classList.add("active");
  }, 250); 
});

$("cancel-report-btn")?.addEventListener("click", () => $("report-modal")?.classList.remove("active"));
$("submit-report-btn")?.addEventListener("click", async () => {
    if (!currentUser || !currentChatUser) return;
    const reason = document.querySelector('input[name="report-reason"]:checked')?.value || "Spam";
    const details = $("report-details")?.value.trim() || "";
    showLoader("Submitting…");
    try {
        const rr = push(ref(db, "reports"));
        await set(rr, { reportId: rr.key, reporterUid: currentUser.uid, reportedUid: currentChatUser.uid, reason, details, createdAt: serverTimestamp() });
        $("report-modal")?.classList.remove("active");
        showToast("Report submitted.", "success");
    } catch (_) { showToast("Could not submit.", "error"); }
    hideLoader();
});

$("action-clear-chat")?.addEventListener("click", async () => {
    if (!currentChatId || !currentUser) return;
    if (!confirm("Clear all messages in this conversation?")) return;
    showLoader("Clearing…");
    try { 
      await remove(ref(db, `messages/${currentChatId}`));
      await updateChatList("Chat cleared");
      showToast("Chat cleared.", "success");
    } catch (e) {}
    hideLoader();
    closeActionsSheet();
});

// Notifications
function setupUserNotificationListener() {
    if (!currentUser) return;
    onValue(ref(db, `userNotifications/${currentUser.uid}`), async s => {
        if (!s.exists()) return;
        const items = Object.values(s.val() || {});
        const unread = items.filter(n => n && !n.read).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (!unread.length) return;
        const n = unread[0];
        if (window._lastNotifId === n.id) return;
        window._lastNotifId = n.id;
        showPushNotification({ icon: n.fromPhoto || DEFAULT_AVATAR, title: n.fromName || "Lynk", body: n.text || "New message" });
        try { await update(ref(db, `userNotifications/${currentUser.uid}/${n.id}`), { read: true }); } catch (_) {}
    });
}

function setupMessageNotifications() {
    if (!currentUser) return;
    onValue(ref(db, `chatList/${currentUser.uid}`), async s => {
        if (!s.exists()) return;
        for (const [uid, chat] of Object.entries(s.val())) {
            const ts = chat.updatedAt || 0;
            if (lastMsgTimestamps[uid] !== undefined && ts > lastMsgTimestamps[uid]) {
                const sender = await getUserByUID(uid);
                if (sender && uid !== currentUser.uid && !isBlocked(uid)) {
                    showPushNotification({ icon: sender.photoURL || DEFAULT_AVATAR, title: sender.nickname || "Someone", body: chat.lastMessage || "Sent a message", onClick: () => openChat(sender) });
                }
            }
            lastMsgTimestamps[uid] = ts;
        }
    });
}

function showPushNotification({ icon, title, body, onClick }) {
    const el = $("push-notification");
    if (!el) return;
    $("push-notif-icon").src = icon || DEFAULT_AVATAR;
    $("push-notif-title").textContent = title || "Lynk";
    $("push-notif-body").textContent = body || "";
    el.classList.add("show");
    el.onclick = () => { el.classList.remove("show"); if (onClick) onClick(); };
    setTimeout(() => el.classList.remove("show"), 4000);
}

// Search
$("search-btn")?.addEventListener("click", () => searchUsersAndHandles($("search-input")?.value.trim()));
$("search-input")?.addEventListener("keydown", e => { if (e.key === "Enter") searchUsersAndHandles($("search-input")?.value.trim()); });

async function searchUsersAndHandles(query) {
    const container = $("search-results");
    if (!container || !query) return;
    container.innerHTML = `<div class="p-4 text-center text-gray-500 text-xs">Searching…</div>`;
    const q = query.toLowerCase();
    const handleQ = q.replace(/\.edu$/, "").replace(/[^a-z0-9-]/g, "");

    const results = [];

    if (handleQ.length >= 2) {
        try {
            const hSnap = await get(ref(db, `teacherHandles/${handleQ}`));
            if (hSnap.exists()) {
                const teacher = await getUserByUID(hSnap.val());
                results.push(`
                    <div class="dark-card p-3.5 flex items-center gap-3 cursor-pointer hover:bg-[var(--bg-soft)] border-indigo-500/30" onclick="window.openTeacherWebByHandle && window.openTeacherWebByHandle('${handleQ}')">
                        <div class="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-lg"><i class="fas fa-globe"></i></div>
                        <div class="flex-1 min-w-0">
                            <div class="font-bold text-xs text-indigo-400">${handleQ}.edu</div>
                            <div class="text-[10px] text-gray-400 truncate">Teacher hub · ${escapeHTML(teacher?.nickname || "")}</div>
                        </div>
                        <span class="bg-indigo-600 text-white px-3 py-1 rounded-lg text-xs font-bold">Visit</span>
                    </div>`);
            }
        } catch (_) {}
    }

    try {
        const s = await get(ref(db, "users"));
        const users = s.exists() ? Object.values(s.val()) : [];
        const matches = users.filter(u => u.uid !== currentUser?.uid && ((u.nickname || "").toLowerCase().includes(q) || (u.username || "").toLowerCase().includes(q) || (u.kbId || "").toLowerCase().includes(q))).slice(0, 15);
        for (const u of matches) {
            results.push(`
                <div class="dark-card p-3 flex items-center gap-3 cursor-pointer hover:bg-[var(--bg-soft)] search-user-row" data-uid="${u.uid}">
                    <div class="avatar-wrap"><img src="${u.photoURL || DEFAULT_AVATAR}" class="avatar-img">${u.online ? `<span class="online-dot"></span>` : ""}</div>
                    <div class="flex-1 min-w-0">
                        <div class="font-bold text-xs truncate">${escapeHTML(u.nickname || "User")}${u.verified ? `<span class="verified-badge"><i class="fas fa-check"></i></span>` : ""}</div>
                        <div class="text-[10px] text-gray-400 truncate">@${escapeHTML(u.username || "")} · ${u.kbId || ""}</div>
                    </div>
                </div>`);
        }
    } catch (_) {}

    container.innerHTML = results.length ? results.join("") : `<div class="p-6 text-center text-gray-500 text-xs">No accounts found for "${escapeHTML(query)}"</div>`;
    container.querySelectorAll(".search-user-row").forEach(row => {
        row.onclick = async () => {
            const user = await getUserByUID(row.dataset.uid);
            if (user) openUserProfileFull(user);
        };
    });
}
window.searchUsersAndHandles = searchUsersAndHandles;

// Helper: YouTube URL ID Extraction
function extractYouTubeId(url) {
    if (!url || typeof url !== "string") return null;
    url = url.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
    const patterns = [
        /(?:youtube\.com\/watch\?(?:[^#]*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
        /[?&]v=([a-zA-Z0-9_-]{11})/,
        /youtu\.be\/([a-zA-Z0-9_-]{11})/
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m && m[1]) return m[1];
    }
    return null;
}

function parseTags(str) {
    if (!str) return [];
    return [...new Set(String(str).split(/[,#\s]+/).map(t => t.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "")).filter(t => t.length >= 2))].slice(0, 15);
}

// Feed Post Composer
$("post-img-btn")?.addEventListener("click", () => $("post-image")?.click());
$("post-image")?.addEventListener("change", e => {
    const f = e.target.files?.[0];
    if (f && $("selected-image")) $("selected-image").textContent = f.name;
    $("post-youtube-row")?.classList.add("hidden");
    $("post-ad-row")?.classList.add("hidden");
});
$("post-yt-btn")?.addEventListener("click", () => {
    $("post-youtube-row")?.classList.toggle("hidden");
    $("post-ad-row")?.classList.add("hidden");
});
$("post-ad-btn")?.addEventListener("click", () => {
    if (!isAdmin) return;
    $("post-ad-row")?.classList.toggle("hidden");
    $("post-youtube-row")?.classList.add("hidden");
});

$("create-post")?.addEventListener("click", createPost);

async function createPost() {
    if (!currentUser) return;
    const text = $("post-text")?.value.trim() || "";
    const imageFile = $("post-image")?.files?.[0];
    const privacy = $("post-privacy")?.value || "public";
    const ytLink = $("post-youtube")?.value.trim() || "";
    const isAdMode = $("post-ad-row") && !$("post-ad-row").classList.contains("hidden");

    if (isAdMode && isAdmin) {
        const advertiser = $("post-ad-advertiser")?.value.trim() || "Sponsored";
        const adLink = $("post-ad-link")?.value.trim() || "";
        const cta = $("post-ad-cta")?.value.trim() || "Learn More";
        showLoader("Publishing…");
        try {
            let imageUrl = "";
            if (imageFile) imageUrl = await uploadToCloudinary(imageFile);
            const pr = push(ref(db, "posts"));
            await set(pr, {
                postId: pr.key, uid: currentUser.uid, text, imageUrl, privacy: "public",
                type: "ad", advertiser, adLink, ctaText: cta, createdAt: serverTimestamp(), reactions: {}, comments: {}
            });
            resetPostComposer();
            showToast("Sponsored post shared!", "success");
            loadFeed();
        } catch (e) {}
        hideLoader();
        return;
    }

    if (ytLink) {
        const ytId = extractYouTubeId(ytLink);
        if (!ytId) { showToast("Invalid YouTube link.", "error"); return; }
        showLoader("Posting video…");
        try {
            let imageUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
            if (imageFile) imageUrl = await uploadToCloudinary(imageFile);
            const pr = push(ref(db, "posts"));
            const tags = parseTags($("post-tags")?.value);
            await set(pr, {
                postId: pr.key, uid: currentUser.uid, text, imageUrl, privacy,
                type: "youtube", youtubeUrl: ytLink, youtubeId: ytId, tags, views: 0,
                createdAt: serverTimestamp(), reactions: {}, comments: {}
            });
            resetPostComposer();
            showToast("Video shared!", "success");
            loadFeed();
        } catch (e) {}
        hideLoader();
        return;
    }

    if (!text && !imageFile) { showToast("Add a caption, photo, or YouTube link.", "error"); return; }
    showLoader("Sharing…");
    try {
        let imageUrl = "";
        if (imageFile) imageUrl = await uploadToCloudinary(imageFile);
        const pr = push(ref(db, "posts"));
        const tags = parseTags($("post-tags")?.value);
        await set(pr, {
            postId: pr.key, uid: currentUser.uid, text, imageUrl, privacy,
            type: "post", tags, views: 0, createdAt: serverTimestamp(), reactions: {}, comments: {}
        });
        resetPostComposer();
        showToast("Post shared!", "success");
        loadFeed();
    } catch (e) {}
    hideLoader();
}

function resetPostComposer() {
    if ($("post-text")) $("post-text").value = "";
    if ($("post-image")) $("post-image").value = "";
    if ($("selected-image")) $("selected-image").textContent = "";
    if ($("post-youtube")) $("post-youtube").value = "";
    $("post-youtube-row")?.classList.add("hidden");
    $("post-ad-row")?.classList.add("hidden");
    if ($("post-tags")) $("post-tags").value = "";
}

// ==========================================
// Video Autoplay & Sound Controller Engine
// ==========================================
let isGlobalMuted = true;
let reelsObserver = null;
let feedVideoObserver = null;

function sendYouTubeCommand(iframe, func, args = "") {
    if (!iframe || !iframe.contentWindow) return;
    try {
        iframe.contentWindow.postMessage(JSON.stringify({
            event: "command",
            func: func,
            args: args
        }), "*");
    } catch (_) {}
}

function toggleGlobalSound(e) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    isGlobalMuted = !isGlobalMuted;
    
    // Update all audio toggle buttons throughout the DOM
    document.querySelectorAll(".video-sound-pill i, .reel-sound-btn i").forEach(icon => {
        icon.className = isGlobalMuted ? "fas fa-volume-xmark" : "fas fa-volume-high";
    });
    
    // Update currently rendered iframes
    document.querySelectorAll(".feed-video-wrap iframe, .reel-player iframe").forEach(iframe => {
        sendYouTubeCommand(iframe, isGlobalMuted ? "mute" : "unMute");
    });
    
    showToast(isGlobalMuted ? "Muted 🔇" : "Sound Unmuted 🔊", "info");
}

function pauseAllVideos() {
    document.querySelectorAll(".feed-video-wrap iframe, .reel-player iframe").forEach(iframe => {
        sendYouTubeCommand(iframe, "pauseVideo");
    });
}

function initFeedVideoObserver() {
    if (feedVideoObserver) feedVideoObserver.disconnect();
    feedVideoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const wrap = entry.target;
            const ytid = wrap.dataset.ytid;
            if (!ytid) return;
            
            let iframe = wrap.querySelector("iframe");
            if (entry.isIntersecting && entry.intersectionRatio >= 0.45) {
                // Auto play video when scrolled in
                if (!iframe) {
                    const poster = wrap.querySelector(".feed-video-poster-box");
                    iframe = document.createElement("iframe");
                    iframe.className = "w-full h-full";
                    iframe.src = `https://www.youtube-nocookie.com/embed/${ytid}?autoplay=1&mute=${isGlobalMuted ? 1 : 0}&enablejsapi=1&playsinline=1&loop=1&playlist=${ytid}&controls=1&rel=0`;
                    iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture");
                    iframe.setAttribute("allowfullscreen", "true");
                    if (poster) poster.style.display = "none";
                    wrap.appendChild(iframe);
                } else {
                    sendYouTubeCommand(iframe, "playVideo");
                    sendYouTubeCommand(iframe, isGlobalMuted ? "mute" : "unMute");
                }
            } else if (entry.intersectionRatio < 0.2) {
                // Pause when scrolled past
                if (iframe) {
                    sendYouTubeCommand(iframe, "pauseVideo");
                }
            }
        });
    }, {
        threshold: [0.15, 0.45, 0.75]
    });
    
    document.querySelectorAll(".feed-video-wrap").forEach(el => feedVideoObserver.observe(el));
}

// Feed Loader
async function loadFeed() {
    const container = $("feed-container");
    if (!container) return;
    try {
        const snap = await get(ref(db, "posts"));
        const posts = snap.exists() ? Object.values(snap.val()) : [];
        posts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        container.innerHTML = "";
        if (!posts.length) {
            container.innerHTML = `<div class="dark-card p-10 text-center text-gray-500 text-xs">No posts yet. Be the first to share!</div>`;
            return;
        }
        for (const post of posts) {
            if (isBlocked(post.uid)) continue;
            if (!canSeeContent(post, post.uid)) continue;
            const user = await getUserByUID(post.uid);
            container.appendChild(createPostCard(post, user || { nickname: "User", photoURL: DEFAULT_AVATAR, uid: post.uid }));
        }
        // Initialize autoplay observer for all feed videos
        initFeedVideoObserver();
    } catch (e) {}
}

function createPostCard(post, user) {
    const card = document.createElement("article");
    card.className = "ig-post-card";
    const reactions = post.reactions || {}, comments = post.comments || {};
    const totalReactions = Object.keys(reactions).length, totalComments = Object.keys(comments).length;
    const myReaction = currentUser ? reactions[currentUser.uid] : null;

    card.innerHTML = `
        <div class="ig-post-header">
            <div class="flex items-center gap-3 cursor-pointer user-header-trigger">
                <img src="${user.photoURL || DEFAULT_AVATAR}" class="w-8 h-8 rounded-full object-cover" />
                <div>
                    <div class="font-bold text-xs flex items-center gap-1">
                        ${escapeHTML(user.nickname || "User")}
                        ${user.verified ? `<span class="verified-badge"><i class="fas fa-check"></i></span>` : ""}
                    </div>
                    <div class="text-[10px] text-gray-400">@${escapeHTML(user.username || "")}</div>
                </div>
            </div>
            <button class="text-gray-400 text-xs post-options-btn"><i class="fas fa-ellipsis-h"></i></button>
        </div>

        ${post.text ? `<div class="px-3.5 pb-2 text-xs leading-relaxed text-[var(--text-primary)]">${escapeHTML(post.text)}</div>` : ""}

        ${post.type === "youtube" && post.youtubeId ? `
            <div class="feed-video-wrap" data-ytid="${post.youtubeId}">
                <div class="feed-video-poster-box absolute inset-0 cursor-pointer">
                    <img src="${post.imageUrl || (`https://img.youtube.com/vi/${post.youtubeId}/hqdefault.jpg`)}" class="w-full h-full object-cover" />
                    <div class="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div class="w-12 h-12 rounded-full bg-black/60 backdrop-blur text-white flex items-center justify-center text-lg pl-0.5"><i class="fas fa-play"></i></div>
                    </div>
                </div>
                <button class="video-sound-pill" title="Toggle sound">
                    <i class="fas ${isGlobalMuted ? 'fa-volume-xmark' : 'fa-volume-high'}"></i>
                </button>
            </div>
        ` : (post.imageUrl ? `<img src="${post.imageUrl}" class="w-full max-h-[520px] object-cover" loading="lazy" />` : "")}

        <div class="ig-post-actions">
            <div class="flex items-center gap-4">
                <button class="ig-action-btn like-btn ${myReaction ? "liked" : ""}"><i class="fas fa-heart"></i></button>
                <button class="ig-action-btn comment-btn"><i class="fas fa-comment"></i></button>
                <button class="ig-action-btn share-btn"><i class="fas fa-paper-plane"></i></button>
            </div>
            <button class="ig-action-btn bookmark-btn"><i class="far fa-bookmark"></i></button>
        </div>

        <div class="px-3.5 pb-2 text-xs">
            <div class="font-bold mb-1 likes-count">${totalReactions ? `${totalReactions} likes` : "Be the first to like"}</div>
            ${totalComments ? `<button class="text-[11px] text-gray-500 font-medium view-comments-btn">View all ${totalComments} comments</button>` : ""}
            <div class="comments-container hidden mt-2 space-y-1.5 pt-2 border-t border-[var(--border-color)]">
                <div class="comments-list max-h-36 overflow-y-auto space-y-1.5"></div>
                <div class="flex gap-2 pt-2">
                    <input class="flex-1 bg-transparent border-b border-[var(--border-color)] pb-1 outline-none text-xs text-[var(--text-primary)]" placeholder="Add a comment…" />
                    <button class="send-comment-btn text-xs font-bold text-[#0095f6]">Post</button>
                </div>
            </div>
        </div>
    `;

    card.querySelector(".user-header-trigger")?.addEventListener("click", () => openUserProfileFull(user));
    
    // Sound button toggle
    const soundBtn = card.querySelector(".video-sound-pill");
    if (soundBtn) {
        soundBtn.addEventListener("click", toggleGlobalSound);
    }

    // Direct click to start video immediately if not started
    const posterBox = card.querySelector(".feed-video-poster-box");
    if (posterBox) {
        posterBox.addEventListener("click", () => {
            const wrap = card.querySelector(".feed-video-wrap");
            const ytid = wrap?.dataset.ytid;
            if (wrap && ytid && !wrap.querySelector("iframe")) {
                const iframe = document.createElement("iframe");
                iframe.className = "w-full h-full";
                iframe.src = `https://www.youtube-nocookie.com/embed/${ytid}?autoplay=1&mute=${isGlobalMuted ? 1 : 0}&enablejsapi=1&playsinline=1&loop=1&playlist=${ytid}&controls=1&rel=0`;
                iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture");
                iframe.setAttribute("allowfullscreen", "true");
                posterBox.style.display = "none";
                wrap.appendChild(iframe);
            }
        });
    }

    // Like handler
    const likeBtn = card.querySelector(".like-btn");
    likeBtn?.addEventListener("click", async () => {
        if (!currentUser) { showToast("Please login first.", "error"); return; }
        const rRef = ref(db, `posts/${post.postId}/reactions/${currentUser.uid}`);
        const snap = await get(rRef);
        if (snap.exists()) {
            await remove(rRef);
            likeBtn.classList.remove("liked");
        } else {
            await set(rRef, "❤️");
            likeBtn.classList.add("liked");
        }
        const updatedSnap = await get(ref(db, `posts/${post.postId}/reactions`));
        const count = updatedSnap.exists() ? Object.keys(updatedSnap.val()).length : 0;
        const countEl = card.querySelector(".likes-count");
        if (countEl) countEl.textContent = count ? `${count} likes` : "Be the first to like";
    });

    // Comments handler
    const commentToggle = card.querySelector(".comment-btn"), viewComments = card.querySelector(".view-comments-btn"), commentsBox = card.querySelector(".comments-container");
    const openComments = () => {
        commentsBox?.classList.toggle("hidden");
        if (!commentsBox?.classList.contains("hidden")) loadPostComments(post.postId, commentsBox.querySelector(".comments-list"));
    };
    commentToggle?.addEventListener("click", openComments);
    viewComments?.addEventListener("click", openComments);

    card.querySelector(".send-comment-btn")?.addEventListener("click", async () => {
        const inp = card.querySelector(".comments-container input");
        const val = inp?.value.trim();
        if (!val || !currentUser) return;
        const cr = push(ref(db, `posts/${post.postId}/comments`));
        await set(cr, { commentId: cr.key, uid: currentUser.uid, text: val, createdAt: serverTimestamp() });
        inp.value = "";
        loadPostComments(post.postId, commentsBox.querySelector(".comments-list"));
    });

    card.querySelector(".share-btn")?.addEventListener("click", () => {
        if (navigator.share) navigator.share({ title: "Lynk Post", text: post.text || "Check out this post on Lynk!" });
        else { navigator.clipboard.writeText(post.text || "Lynk Post"); showToast("Copied to clipboard!", "success"); }
    });

    return card;
}

async function loadPostComments(postId, container) {
    if (!container) return;
    const snap = await get(ref(db, `posts/${postId}/comments`));
    const comments = snap.exists() ? Object.values(snap.val()) : [];
    container.innerHTML = "";
    for (const c of comments) {
        const u = await getUserByUID(c.uid);
        const div = document.createElement("div");
        div.className = "text-[11px] flex gap-1.5";
        div.innerHTML = `<strong class="font-bold">${escapeHTML(u?.nickname || "User")}</strong> <span>${escapeHTML(c.text)}</span>`;
        container.appendChild(div);
    }
}

async function renderProfilePosts() {
    const container = $("profile-posts-container");
    if (!container || !currentUserData) return;
    container.innerHTML = `<div class="text-center text-gray-500 py-4 text-xs">Loading…</div>`;
    const s = await get(ref(db, "posts"));
    const all = s.exists() ? Object.values(s.val()) : [];
    const myPosts = all.filter(p => p.uid === currentUser.uid).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    container.innerHTML = "";
    if (!myPosts.length) { 
      container.innerHTML = `<div class="text-center text-gray-500 py-8 dark-card text-xs">No posts shared yet.</div>`; 
      return; 
    }
    const count = $("profile-post-count");
    if (count) count.textContent = myPosts.length;
    for (const post of myPosts) { container.appendChild(createPostCard(post, currentUserData)); }
    initFeedVideoObserver();
}

// Instagram Reels Page with Vertical Snap Autoplay
let videosItems = [], videosOffset = 0, videosLoading = false;

function initReelsObserver() {
    if (reelsObserver) reelsObserver.disconnect();
    const container = $("videos-container");
    reelsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const slide = entry.target;
            const player = slide.querySelector(".reel-player");
            const ytid = slide.dataset.ytid;
            if (!player || !ytid) return;
            
            let iframe = player.querySelector("iframe");
            if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
                // Auto play active reel
                if (!iframe) {
                    iframe = document.createElement("iframe");
                    iframe.className = "w-full h-full";
                    iframe.src = `https://www.youtube-nocookie.com/embed/${ytid}?autoplay=1&mute=${isGlobalMuted ? 1 : 0}&enablejsapi=1&playsinline=1&loop=1&playlist=${ytid}&controls=1&rel=0&modestbranding=1`;
                    iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture");
                    iframe.setAttribute("allowfullscreen", "true");
                    player.appendChild(iframe);
                } else {
                    sendYouTubeCommand(iframe, "playVideo");
                    sendYouTubeCommand(iframe, isGlobalMuted ? "mute" : "unMute");
                }
            } else if (entry.intersectionRatio < 0.3) {
                // Pause inactive reel
                if (iframe) {
                    sendYouTubeCommand(iframe, "pauseVideo");
                }
            }
        });
    }, {
        root: container,
        threshold: [0.25, 0.55, 0.85]
    });

    document.querySelectorAll(".reel-slide").forEach(slide => reelsObserver.observe(slide));
}

async function loadVideosPage(tagFilter) {
    const container = $("videos-container");
    if (!container) return;
    container.innerHTML = "";
    videosOffset = 0;
    const snap = await get(ref(db, "posts"));
    const posts = snap.exists() ? Object.values(snap.val()) : [];
    videosItems = posts.filter(p => p.type === "youtube" && p.youtubeId);
    if (tagFilter) {
        const t = tagFilter.toLowerCase().replace(/^#/, "");
        videosItems = videosItems.filter(p => (p.tags || []).some(x => x.includes(t)) || (p.text || "").toLowerCase().includes(t));
    }
    if (!videosItems.length) {
        container.innerHTML = `<div class="h-full flex items-center justify-center text-gray-500 text-xs">No reels found. Share a YouTube link!</div>`;
        return;
    }
    renderNextReelsBatch();
    container.onscroll = () => {
        if (container.scrollTop + container.clientHeight > container.scrollHeight - container.clientHeight * 1.5) {
            renderNextReelsBatch();
        }
    };
}

function renderNextReelsBatch() {
    if (videosLoading || videosOffset >= videosItems.length) return;
    videosLoading = true;
    const container = $("videos-container");
    const slice = videosItems.slice(videosOffset, videosOffset + 4);
    
    for (const post of slice) {
        const slide = document.createElement("div");
        slide.className = "reel-slide";
        slide.dataset.ytid = post.youtubeId;
        const myReaction = currentUser ? (post.reactions || {})[currentUser.uid] : null;

        slide.innerHTML = `
            <div class="reel-player"></div>
            <div class="reel-actions">
                <div class="reel-action-wrap">
                    <button class="reel-action-btn reel-sound-btn" title="Toggle audio"><i class="fas ${isGlobalMuted ? 'fa-volume-xmark' : 'fa-volume-high'}"></i></button>
                </div>
                <div class="reel-action-wrap">
                    <button class="reel-action-btn like-reel-btn ${myReaction ? 'liked' : ''}"><i class="fas fa-heart"></i></button>
                    <span class="count">${Object.keys(post.reactions || {}).length || ""}</span>
                </div>
                <div class="reel-action-wrap">
                    <button class="reel-action-btn comment-reel-btn"><i class="fas fa-comment"></i></button>
                    <span class="count">${Object.keys(post.comments || {}).length || ""}</span>
                </div>
                <div class="reel-action-wrap">
                    <button class="reel-action-btn share-reel-btn"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>
            <div class="absolute bottom-16 left-0 right-16 p-4 z-10 pointer-events-none">
                <div class="text-white text-xs font-bold drop-shadow mb-1">${escapeHTML((post.text || "Reel").slice(0, 100))}</div>
                <div class="text-white/70 text-[10px] drop-shadow">${(post.tags || []).map(t => `#${t}`).join(" ")}</div>
            </div>
        `;

        // Sound toggle on reel
        slide.querySelector(".reel-sound-btn")?.addEventListener("click", toggleGlobalSound);

        // Like button on reel
        const reelLikeBtn = slide.querySelector(".like-reel-btn");
        reelLikeBtn?.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!currentUser) { showToast("Please login first.", "error"); return; }
            const rRef = ref(db, `posts/${post.postId}/reactions/${currentUser.uid}`);
            const snap = await get(rRef);
            if (snap.exists()) {
                await remove(rRef);
                reelLikeBtn.classList.remove("liked");
            } else {
                await set(rRef, "❤️");
                reelLikeBtn.classList.add("liked");
            }
            const updatedSnap = await get(ref(db, `posts/${post.postId}/reactions`));
            const count = updatedSnap.exists() ? Object.keys(updatedSnap.val()).length : 0;
            const countEl = slide.querySelector(".reel-action-wrap .count");
            if (countEl) countEl.textContent = count || "";
        });

        // Share button on reel
        slide.querySelector(".share-reel-btn")?.addEventListener("click", (e) => {
            e.stopPropagation();
            if (navigator.share) navigator.share({ title: "Lynk Reel", text: post.text || "Check out this reel on Lynk!" });
            else { navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${post.youtubeId}`); showToast("Reel link copied!", "success"); }
        });

        container.appendChild(slide);
        videosOffset++;
    }
    videosLoading = false;
    
    // Connect observer to new slides
    initReelsObserver();
}

$("videos-tag-search")?.addEventListener("keydown", e => { 
  if (e.key === "Enter") loadVideosPage($("videos-tag-search").value.trim()); 
});

// Instagram Stories System
function setupStoryModal() {
    const dropZone = $("story-drop-zone"), fileInput = $("story-file-input"), previewContainer = $("story-preview-container"), previewImg = $("story-preview-img");
    dropZone?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", e => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            if (previewImg) previewImg.src = ev.target.result;
            previewContainer?.classList.remove("hidden");
        };
        reader.readAsDataURL(file);
    });
    $("publish-story-btn")?.addEventListener("click", async () => {
        if (!currentUser) return;
        const file = fileInput?.files?.[0];
        if (!file) { showToast("Select an image first.", "error"); return; }
        const privacy = $("story-privacy")?.value || "public";
        showLoader("Posting story…");
        try {
            const url = await uploadToCloudinary(file);
            const sr = push(ref(db, "stories"));
            await set(sr, { 
              storyId: sr.key, uid: currentUser.uid, imageUrl: url, privacy,
              createdAt: serverTimestamp(), expiresAt: Date.now() + STORY_EXPIRY_MS, views: {} 
            });
            $("story-modal")?.classList.remove("active");
            showToast("Story shared!", "success");
            loadStories();
        } catch (_) { showToast("Could not share story.", "error"); }
        hideLoader();
    });
    $("close-story-modal")?.addEventListener("click", () => $("story-modal")?.classList.remove("active"));
}

function openStoryModal() { $("story-modal")?.classList.add("active"); }
$("profile-story-btn")?.addEventListener("click", openStoryModal);

$("your-story-item")?.addEventListener("click", async () => {
    if (!currentUser) return;
    const s = await get(ref(db, "stories"));
    const data = s.val() || {};
    const myStories = Object.values(data).filter(st => st.uid === currentUser.uid && st.expiresAt > Date.now());
    if (myStories.length > 0) openStoryViewer(currentUser.uid);
    else openStoryModal();
});

function loadStories() {
    const container = $("stories-list");
    if (!container) return;
    onValue(ref(db, "stories"), async s => {
        const data = s.val() || {};
        const now = Date.now();
        const valid = Object.values(data).filter(st => st.expiresAt > now && st.uid !== currentUser?.uid);
        const myStories = Object.values(data).filter(st => st.uid === currentUser?.uid && st.expiresAt > now);
        const yourRing = $("your-story-ring");
        if (yourRing) {
            if (myStories.length > 0) yourRing.innerHTML = `<img src="${myStories[0].imageUrl}" />`;
            else yourRing.innerHTML = `<div class="story-ring-add"><i class="fas fa-plus"></i></div>`;
        }
        container.innerHTML = "";
        const userStories = {};
        valid.forEach(st => { if (!userStories[st.uid] || st.createdAt > userStories[st.uid].createdAt) userStories[st.uid] = st; });
        for (const st of Object.values(userStories)) {
            const user = await getUserByUID(st.uid);
            if (!user || isBlocked(st.uid) || !canSeeContent(st, st.uid)) continue;
            const item = document.createElement("div");
            item.className = "story-item";
            item.innerHTML = `<div class="story-ring"><img src="${st.imageUrl}" /></div><span class="story-name">${escapeHTML(user.nickname?.split(" ")[0] || "User")}</span>`;
            item.onclick = () => openStoryViewer(st.uid);
            container.appendChild(item);
        }
    });
}

async function openStoryViewer(uid) {
    const s = await get(ref(db, "stories"));
    const data = s.val() || {};
    const userStories = Object.values(data).filter(st => st.uid === uid && st.expiresAt > Date.now()).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    if (!userStories.length) return;
    storyViewerStories = userStories;
    storyViewerIndex = 0;
    $("story-viewer")?.classList.add("active");
    renderStorySlide();
}

function renderStorySlide() {
    const st = storyViewerStories[storyViewerIndex];
    if (!st) { $("story-viewer")?.classList.remove("active"); return; }
    $("story-viewer-image").src = st.imageUrl;
    getUserByUID(st.uid).then(u => {
        if (u) {
            $("story-viewer-avatar").src = u.photoURL || DEFAULT_AVATAR;
            $("story-viewer-name").textContent = u.nickname || "User";
        }
    });
}

$("story-close-btn")?.addEventListener("click", () => $("story-viewer")?.classList.remove("active"));
$("story-next-area")?.addEventListener("click", () => {
    if (storyViewerIndex < storyViewerStories.length - 1) { storyViewerIndex++; renderStorySlide(); }
    else $("story-viewer")?.classList.remove("active");
});
$("story-prev-area")?.addEventListener("click", () => {
    if (storyViewerIndex > 0) { storyViewerIndex--; renderStorySlide(); }
});

// LMS Courses System
let currentCourseTab = "free";
document.querySelectorAll(".lms-tab").forEach(tab => {
    tab.addEventListener("click", function() {
        document.querySelectorAll(".lms-tab").forEach(t => t.classList.remove("active"));
        this.classList.add("active");
        currentCourseTab = this.dataset.tab;
        loadCourses();
    });
});

async function loadCourses() {
    const container = $("courses-container");
    if (!container) return;
    container.innerHTML = `<div class="text-center text-gray-500 py-6 text-xs">Loading courses…</div>`;
    const snap = await get(ref(db, "courses"));
    const courses = snap.exists() ? Object.values(snap.val()) : [];
    let filtered = courses;
    if (currentCourseTab === "free") filtered = courses.filter(c => c.type === "free");
    else if (currentCourseTab === "pro") filtered = courses.filter(c => c.type === "pro");
    else if (currentCourseTab === "purchased") {
        const purchasesSnap = await get(ref(db, `purchases/${currentUser?.uid}`));
        const purchased = purchasesSnap.exists() ? Object.keys(purchasesSnap.val()) : [];
        filtered = courses.filter(c => purchased.includes(c.courseId));
    }
    container.innerHTML = "";
    if (!filtered.length) { 
      container.innerHTML = `<div class="dark-card p-8 text-center text-gray-500 text-xs">No courses found in this category.</div>`; 
      return; 
    }
    for (const course of filtered) {
        const teacher = await getUserByUID(course.teacherUid);
        const isPurchased = (await get(ref(db, `purchases/${currentUser?.uid}/${course.courseId}`))).exists();
        const card = document.createElement("div");
        card.className = "dark-card p-4";
        card.innerHTML = `
            <div class="flex gap-4">
                <img src="${course.thumbnail || DEFAULT_AVATAR}" class="w-24 h-24 rounded-xl object-cover flex-shrink-0" />
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <h3 class="font-bold text-sm truncate">${escapeHTML(course.title)}</h3>
                        <span class="text-[10px] px-2 py-0.5 rounded-full ${course.type === 'pro' ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'}">${course.type === 'pro' ? '⭐ Pro' : '📚 Free'}</span>
                    </div>
                    <p class="text-xs text-gray-400 line-clamp-2 mt-1">${escapeHTML(course.description)}</p>
                    <div class="flex items-center gap-3 mt-2 text-[11px] text-gray-500">
                        <span><i class="fas fa-chalkboard-teacher mr-1"></i>${escapeHTML(teacher?.nickname || "Teacher")}</span>
                        ${course.type === 'pro' ? `<span class="font-bold text-amber-400">৳${course.price}</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="mt-3 flex gap-2">
                ${course.type === 'pro' && !isPurchased ? `<button class="buy-btn bg-[#0095f6] text-white px-4 py-1.5 rounded-lg text-xs font-bold">Enroll for ৳${course.price}</button>` : ''}
                ${isPurchased || course.type === 'free' ? `<button class="view-content-btn bg-[var(--bg-soft)] text-white px-4 py-1.5 rounded-lg text-xs font-bold">Watch Lessons</button>` : ''}
            </div>
        `;
        card.querySelector(".buy-btn")?.addEventListener("click", () => purchaseCourse(course.courseId, course.price));
        card.querySelector(".view-content-btn")?.addEventListener("click", () => {
            const contents = course.contents ? Object.values(course.contents) : [];
            if (contents.length > 0) openContentViewer(course.courseId, contents[0]);
            else showToast("No lessons uploaded yet.", "info");
        });
        container.appendChild(card);
    }
}

async function purchaseCourse(courseId, price) {
    if (!currentUser) { showToast("Login to enroll.", "error"); return; }
    showLoader("Processing…");
    try {
        const uSnap = await get(ref(db, `users/${currentUser.uid}`));
        const balance = uSnap.val()?.walletBalance || 0;
        if (balance < price) { showToast("Insufficient wallet balance! Recharge your wallet.", "error"); hideLoader(); return; }
        const course = (await get(ref(db, `courses/${courseId}`))).val();
        const teacherUid = course.teacherUid;
        const fee = Math.round(price * COMMISSION_RATE);
        const teacherEarn = price - fee;
        await update(ref(db, `users/${currentUser.uid}`), { walletBalance: balance - price });
        const teacherBalance = (await get(ref(db, `users/${teacherUid}/walletBalance`))).val() || 0;
        await update(ref(db, `users/${teacherUid}`), { walletBalance: teacherBalance + teacherEarn });
        await set(ref(db, `purchases/${currentUser.uid}/${courseId}`), { courseId, purchasedAt: serverTimestamp(), price });
        showToast("Enrolled successfully! 🎉", "success");
        loadWallet();
        loadCourses();
    } catch (_) { showToast("Enrollment failed.", "error"); }
    hideLoader();
}

function openContentViewer(courseId, content) {
    window._currentContent = { courseId, ...content };
    showPage("content-viewer");
}

function renderContentViewer(data) {
    if (!data) return;
    $("content-viewer-title").textContent = data.title || "Lesson";
    const player = $("content-viewer-player");
    if (!player) return;
    const ytId = extractYouTubeId(data.link);
    if (ytId) player.innerHTML = `<iframe class="w-full h-full" src="https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&playsinline=1" frameborder="0" allowfullscreen></iframe>`;
    else player.innerHTML = `<div class="flex items-center justify-center h-full text-white text-xs"><a href="${data.link}" target="_blank" class="bg-green-600 px-4 py-2 rounded-lg font-bold">Open Meeting</a></div>`;
}

// Wallet & Recharge
async function loadWallet() {
    if (!currentUser) return;
    const snap = await get(ref(db, `users/${currentUser.uid}`));
    const balance = snap.val()?.walletBalance || 0;
    const disp = $("wallet-balance-display");
    if (disp) disp.textContent = `৳ ${balance}`;
    const avail = $("withdraw-available");
    if (avail) avail.textContent = `৳ ${balance}`;
}

$("recharge-btn")?.addEventListener("click", async () => {
    const code = $("recharge-input").value.trim().replace(/-/g, "");
    if (code.length !== 12) { showToast("Enter 12-digit code (XXXX-XXXX-XXXX)", "error"); return; }
    showLoader("Recharging…");
    try {
        const snap = await get(ref(db, `rechargeCodes/${code}`));
        if (!snap.exists() || snap.val().used) { showToast("Invalid or already used voucher code.", "error"); hideLoader(); return; }
        const amount = snap.val().amount || 0;
        const currentBal = (await get(ref(db, `users/${currentUser.uid}/walletBalance`))).val() || 0;
        await update(ref(db, `users/${currentUser.uid}`), { walletBalance: currentBal + amount });
        await update(ref(db, `rechargeCodes/${code}`), { used: true, usedBy: currentUser.uid, usedAt: serverTimestamp() });
        $("recharge-input").value = "";
        showToast(`Recharged ৳${amount} successfully! 💰`, "success");
        loadWallet();
    } catch (_) { showToast("Recharge failed.", "error"); }
    hideLoader();
});

// Teacher Registration
function openTeacherRegistration() {
    $("teacher-phone").value = currentUserData?.phone || "";
    $("teacher-reg-modal")?.classList.add("active");
}
$("teacher-reg-close")?.addEventListener("click", () => $("teacher-reg-modal")?.classList.remove("active"));
$("teacher-reg-submit")?.addEventListener("click", async () => {
    const phone = $("teacher-phone").value.trim(), subject = $("teacher-subject").value.trim(), institution = $("teacher-institution").value.trim(), teacherUsername = $("teacher-username").value.trim();
    if (!phone || !subject || !institution || !teacherUsername) { showToast("All fields required.", "error"); return; }
    showLoader("Registering…");
    try {
        await update(ref(db, `users/${currentUser.uid}`), { role: "teacher", teacherPhone: phone, subject, institution, teacherUsername });
        await set(ref(db, `teacherUsernames/${teacherUsername.toLowerCase()}`), currentUser.uid);
        invalidateUser(currentUser.uid);
        currentUserData = (await getUserByUID(currentUser.uid, true));
        updateRoleUI();
        $("teacher-reg-modal")?.classList.remove("active");
        showToast("You are now a certified teacher! 🎓", "success");
        openTeacherDashboard();
    } catch (_) { showToast("Registration failed.", "error"); }
    hideLoader();
});

function openTeacherDashboard() { showPage("teacher-dashboard"); loadTeacherDashboard(); }
async function loadTeacherDashboard() {
    if (!currentUser) return;
    const snap = await get(ref(db, "courses"));
    const courses = snap.exists() ? Object.values(snap.val()).filter(c => c.teacherUid === currentUser.uid) : [];
    const earned = courses.reduce((sum, c) => sum + (c.earned || 0), 0);
    const balance = currentUserData?.walletBalance || 0;
    $("stat-earned").textContent = `৳ ${earned}`;
    $("stat-students").textContent = courses.reduce((sum, c) => sum + (c.students || 0), 0);
    $("stat-balance").textContent = `৳ ${balance}`;
    const list = $("teacher-courses-list");
    if (!list) return;
    list.innerHTML = "";
    for (const c of courses) {
        const div = document.createElement("div");
        div.className = "dark-card p-3 flex items-center gap-3";
        div.innerHTML = `
            <img src="${c.thumbnail || DEFAULT_AVATAR}" class="w-12 h-12 rounded-lg object-cover" />
            <div class="flex-1 min-w-0">
                <div class="font-bold text-xs truncate">${escapeHTML(c.title)}</div>
                <div class="text-[10px] text-gray-400">৳${c.price || 0} · ${c.students || 0} students</div>
            </div>
            <button class="text-xs bg-red-600/30 text-red-400 px-3 py-1 rounded-lg delete-course-btn"><i class="fas fa-trash"></i></button>`;
        div.querySelector(".delete-course-btn")?.addEventListener("click", async () => {
            if (confirm("Delete this course?")) {
                await remove(ref(db, `courses/${c.courseId}`));
                loadTeacherDashboard();
                showToast("Course deleted.", "info");
            }
        });
        list.appendChild(div);
    }
}

// Course Creation
$("dash-create-course")?.addEventListener("click", () => {
    $("course-title").value = ""; $("course-desc").value = "";
    $("create-course-modal")?.classList.add("active");
});
$("create-course-close")?.addEventListener("click", () => $("create-course-modal")?.classList.remove("active"));
$("course-thumb-drop")?.addEventListener("click", () => $("course-thumbnail-file")?.click());
$("course-submit")?.addEventListener("click", async () => {
    const title = $("course-title").value.trim(), desc = $("course-desc").value.trim(), type = $("course-type").value, price = parseFloat($("course-price").value) || 0;
    if (!title || !desc) { showToast("Title and description required.", "error"); return; }
    showLoader("Creating…");
    try {
        let thumbnail = DEFAULT_AVATAR;
        const file = $("course-thumbnail-file")?.files?.[0];
        if (file) thumbnail = await uploadToCloudinary(file);
        const cr = push(ref(db, "courses"));
        await set(cr, { courseId: cr.key, teacherUid: currentUser.uid, title, description: desc, thumbnail, type, price: type === "pro" ? price : 0, earned: 0, students: 0, createdAt: serverTimestamp() });
        $("create-course-modal")?.classList.remove("active");
        showToast("Course published!", "success");
        loadTeacherDashboard();
    } catch (_) { showToast("Could not create course.", "error"); }
    hideLoader();
});

// Admin Features
async function generateRechargeCode() {
    const amount = parseInt($("admin-recharge-amount").value);
    if (!amount || amount <= 0) return;
    showLoader("Generating…");
    let code = "";
    for (let i = 0; i < 12; i++) code += Math.floor(Math.random() * 10);
    const formatted = `${code.slice(0,4)}-${code.slice(4,8)}-${code.slice(8,12)}`;
    await set(ref(db, `rechargeCodes/${code}`), { code: formatted, amount, used: false, createdAt: serverTimestamp() });
    $("admin-generated-code")?.classList.remove("hidden");
    $("admin-new-code-display").textContent = formatted;
    hideLoader();
    loadAdminRechargeCodes();
}
$("admin-generate-code-btn")?.addEventListener("click", generateRechargeCode);
$("admin-copy-code-btn")?.addEventListener("click", () => {
    const code = $("admin-new-code-display")?.textContent;
    if (code) {
        navigator.clipboard.writeText(code);
        showToast("Recharge code copied! 📋", "success");
    }
});

async function loadAdminRechargeCodes() {
    const container = $("admin-recharge-codes-list");
    if (!container) return;
    const snap = await get(ref(db, "rechargeCodes"));
    const codes = snap.exists() ? Object.values(snap.val()).slice(0, 15) : [];
    container.innerHTML = codes.map(c => `<div class="flex justify-between text-[11px] p-2 bg-[var(--bg-soft)] rounded-lg font-mono"><span>${c.code}</span><span class="${c.used ? 'text-red-400' : 'text-green-400'}">${c.used ? 'Used' : `৳${c.amount}`}</span></div>`).join("");
}

async function loadAdminWithdrawals() {
    const container = $("admin-withdrawal-list");
    if (!container) return;
    const snap = await get(ref(db, "withdrawalRequests"));
    const data = snap.exists() ? Object.values(snap.val()).filter(r => r.status === "pending") : [];
    container.innerHTML = data.length ? data.map(r => `
        <div class="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-soft)] text-xs">
            <div><div class="font-bold">${escapeHTML(r.teacherName || "Teacher")}</div><div class="text-[10px] text-gray-400">${r.teacherPhone} · ৳${r.amount}</div></div>
            <button class="bg-green-600 px-3 py-1 rounded-lg text-white font-bold" onclick="approveWithdrawal('${r.requestId}', '${r.teacherUid}', ${r.amount})">Approve</button>
        </div>`).join("") : `<div class="text-xs text-gray-500 py-2">No pending withdrawals.</div>`;
}

window.approveWithdrawal = async function(reqId, teacherUid, amount) {
    await update(ref(db, `withdrawalRequests/${reqId}`), { status: "completed" });
    const bal = (await get(ref(db, `users/${teacherUid}/walletBalance`))).val() || 0;
    await update(ref(db, `users/${teacherUid}`), { walletBalance: Math.max(0, bal - amount) });
    showToast("Withdrawal approved.", "success");
    loadAdminWithdrawals();
};

// Admin User Management
let adminSuspendTargetUid = null;

async function loadAdminUsers() {
    const container = $("admin-users-list");
    if (!container) return;
    container.innerHTML = `<div class="text-center text-gray-500 py-4 text-xs">Loading users…</div>`;
    const snap = await get(ref(db, "users"));
    if (!snap.exists()) {
        container.innerHTML = `<div class="text-center text-gray-500 py-4 text-xs">No users registered yet.</div>`;
        return;
    }
    const users = Object.values(snap.val()).filter(u => u && u.uid);
    container.innerHTML = "";
    users.slice(0, 50).forEach(u => {
        const row = document.createElement("div");
        row.className = "flex items-center justify-between p-3 rounded-xl bg-[var(--bg-soft)] text-xs";
        row.innerHTML = `
            <div class="flex items-center gap-2.5 min-w-0">
                <img src="${u.photoURL || DEFAULT_AVATAR}" class="w-8 h-8 rounded-full object-cover" />
                <div class="min-w-0">
                    <div class="font-bold truncate flex items-center gap-1">
                        ${escapeHTML(u.nickname || "User")}
                        ${u.verified ? `<i class="fas fa-check-circle text-blue-400 text-[10px]"></i>` : ""}
                        ${u.suspended ? `<span class="bg-red-600/30 text-red-400 px-1.5 py-0.5 rounded text-[9px]">Suspended</span>` : ""}
                    </div>
                    <div class="text-[10px] text-gray-400 truncate">@${u.username || "—"} · ${u.kbId || "—"} · ${u.role || "user"}</div>
                </div>
            </div>
            <div class="flex items-center gap-1.5 flex-shrink-0">
                <button class="px-2 py-1 rounded-lg text-[10px] font-bold ${u.verified ? 'bg-blue-600/30 text-blue-400' : 'bg-gray-700 text-gray-300'} admin-toggle-verify">${u.verified ? "Verified" : "Verify"}</button>
                <button class="px-2 py-1 rounded-lg text-[10px] font-bold ${u.suspended ? 'bg-green-600/30 text-green-400' : 'bg-red-600/30 text-red-400'} admin-toggle-suspend">${u.suspended ? "Unsuspend" : "Suspend"}</button>
                <button class="px-2 py-1 rounded-lg text-[10px] bg-[var(--border-color)] text-white font-bold admin-view-user"><i class="fas fa-eye"></i></button>
            </div>
        `;
        row.querySelector(".admin-toggle-verify")?.addEventListener("click", async () => {
            await update(ref(db, `users/${u.uid}`), { verified: !u.verified });
            invalidateUser(u.uid);
            showToast(u.verified ? "Badge removed." : "User verified! 🌟", "success");
            loadAdminUsers();
        });
        row.querySelector(".admin-toggle-suspend")?.addEventListener("click", () => {
            if (u.suspended) {
                update(ref(db, `users/${u.uid}`), { suspended: false, suspendedUntil: null });
                invalidateUser(u.uid);
                showToast("Account unsuspended.", "info");
                loadAdminUsers();
            } else {
                adminSuspendTargetUid = u.uid;
                $("suspend-modal-name").textContent = `Suspend @${u.username || u.nickname}`;
                $("admin-suspend-modal")?.classList.add("active");
            }
        });
        row.querySelector(".admin-view-user")?.addEventListener("click", () => openUserProfileFull(u));
        container.appendChild(row);
    });
}

$("admin-refresh-users")?.addEventListener("click", loadAdminUsers);

$("admin-search-btn")?.addEventListener("click", async () => {
    const q = $("admin-user-search")?.value.trim().toLowerCase();
    const resultBox = $("admin-user-result");
    if (!resultBox) return;
    if (!q) { resultBox.innerHTML = ""; return; }
    resultBox.innerHTML = `<div class="p-3 text-center text-gray-500 text-xs">Searching…</div>`;
    const snap = await get(ref(db, "users"));
    if (!snap.exists()) { resultBox.innerHTML = `<div class="p-3 text-center text-gray-500 text-xs">User not found.</div>`; return; }
    const users = Object.values(snap.val()).filter(u => u && (
        (u.username && u.username.toLowerCase().includes(q)) ||
        (u.nickname && u.nickname.toLowerCase().includes(q)) ||
        (u.kbId && u.kbId.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.phone && u.phone.includes(q))
    ));
    if (!users.length) {
        resultBox.innerHTML = `<div class="p-3 text-center text-gray-500 text-xs">No matching user found.</div>`;
        return;
    }
    resultBox.innerHTML = "";
    users.forEach(u => {
        const div = document.createElement("div");
        div.className = "dark-card p-4 mb-3 flex items-center justify-between";
        div.innerHTML = `
            <div class="flex items-center gap-3">
                <img src="${u.photoURL || DEFAULT_AVATAR}" class="w-10 h-10 rounded-full object-cover" />
                <div>
                    <div class="font-bold text-xs flex items-center gap-1">${escapeHTML(u.nickname || "User")} ${u.verified ? `<i class="fas fa-check-circle text-blue-400"></i>` : ""}</div>
                    <div class="text-[11px] text-gray-400">@${u.username} · ${u.kbId} · ${u.email || "No email"}</div>
                </div>
            </div>
            <button class="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold view-btn">View Profile</button>
        `;
        div.querySelector(".view-btn")?.addEventListener("click", () => openUserProfileFull(u));
        resultBox.appendChild(div);
    });
});

$("suspend-cancel-btn")?.addEventListener("click", () => {
    $("admin-suspend-modal")?.classList.remove("active");
    adminSuspendTargetUid = null;
});

$("suspend-confirm-btn")?.addEventListener("click", async () => {
    if (!adminSuspendTargetUid) return;
    const durHours = parseInt($("suspend-duration")?.value) || 0;
    const reason = $("suspend-reason")?.value.trim() || "Policy violation";
    const suspendedUntil = durHours > 0 ? Date.now() + (durHours * 3600000) : 0;
    showLoader("Suspending…");
    try {
        await update(ref(db, `users/${adminSuspendTargetUid}`), {
            suspended: true,
            suspendedUntil,
            suspendedReason: reason
        });
        invalidateUser(adminSuspendTargetUid);
        $("admin-suspend-modal")?.classList.remove("active");
        showToast("Account suspended.", "error");
        loadAdminUsers();
    } catch (_) { showToast("Could not suspend user.", "error"); }
    hideLoader();
});

// Broadcast Announcement
$("broadcast-send-btn")?.addEventListener("click", async () => {
    const text = $("broadcast-input")?.value.trim();
    if (!text) { showToast("Enter broadcast message.", "error"); return; }
    showLoader("Broadcasting…");
    try {
        const br = push(ref(db, "broadcasts"));
        await set(br, { broadcastId: br.key, text, createdAt: serverTimestamp(), adminUid: currentUser.uid });
        $("broadcast-input").value = "";
        showToast("System announcement broadcasted to all users! 📢", "success");
    } catch (_) { showToast("Broadcast failed.", "error"); }
    hideLoader();
});

// Support System (User & Admin Desk)
let activeSupportListener = null;

function loadSupportMessages() {
    if (!currentUser) return;
    const container = $("support-messages");
    if (!container) return;
    if (activeSupportListener) activeSupportListener();
    activeSupportListener = onValue(ref(db, `supportChats/${currentUser.uid}/messages`), snap => {
        const msgs = Object.values(snap.val() || {}).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        container.innerHTML = "";
        if (!msgs.length) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-gray-500 py-10">
                    <div class="w-12 h-12 rounded-full bg-[var(--bg-soft)] flex items-center justify-center text-xl mb-2"><i class="fas fa-headset"></i></div>
                    <p class="text-xs">Welcome to Lynk Support! How can we help you today?</p>
                </div>`;
            return;
        }
        msgs.forEach(msg => {
            const mine = msg.senderId === currentUser.uid;
            const wrap = document.createElement("div");
            wrap.className = mine ? "flex justify-end mb-2" : "flex justify-start mb-2";
            const bubble = document.createElement("div");
            bubble.className = mine ? "message-bubble mine" : "message-bubble other";
            bubble.innerHTML = `
                <div class="whitespace-pre-wrap break-words text-xs">${escapeHTML(msg.text)}</div>
                <div class="text-[9px] mt-1 opacity-60 text-right">${msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</div>
            `;
            wrap.appendChild(bubble);
            container.appendChild(wrap);
        });
        container.scrollTop = container.scrollHeight;
    });
}

$("support-send-btn")?.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    const input = $("support-input");
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    const mr = push(ref(db, `supportChats/${currentUser.uid}/messages`));
    await set(mr, {
        messageId: mr.key,
        senderId: currentUser.uid,
        senderName: currentUserData?.nickname || "User",
        text,
        createdAt: serverTimestamp(),
        isAdmin: false
    });
    await update(ref(db, `supportChats/${currentUser.uid}`), {
        uid: currentUser.uid,
        userName: currentUserData?.nickname || "User",
        userPic: currentUserData?.photoURL || DEFAULT_AVATAR,
        lastMessage: text,
        updatedAt: serverTimestamp()
    });
    input.value = "";
});

$("support-input")?.addEventListener("keydown", e => {
    if (e.key === "Enter") $("support-send-btn")?.click();
});

let currentAdminSupportUid = null;
let activeAdminSupportListener = null;

async function loadAdminSupportInbox() {
    // Admin support desk listener
    onValue(ref(db, "supportChats"), snap => {
        const chats = Object.values(snap.val() || {}).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        // We can expose an admin inbox or respond via user profile
    });
}

function openAdminSupportChat(user) {
    currentAdminSupportUid = user.uid;
    const chatEl = $("active-support-chat");
    if (!chatEl) return;
    chatEl.classList.remove("hidden");
    chatEl.classList.add("flex");
    $("support-chat-pic").src = user.photoURL || DEFAULT_AVATAR;
    $("support-chat-name").textContent = user.nickname || "User";
    if (activeAdminSupportListener) activeAdminSupportListener();
    activeAdminSupportListener = onValue(ref(db, `supportChats/${user.uid}/messages`), snap => {
        const msgs = Object.values(snap.val() || {}).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        const container = $("support-chat-messages");
        if (!container) return;
        container.innerHTML = "";
        msgs.forEach(msg => {
            const mine = msg.isAdmin === true;
            const wrap = document.createElement("div");
            wrap.className = mine ? "flex justify-end mb-2" : "flex justify-start mb-2";
            const bubble = document.createElement("div");
            bubble.className = mine ? "message-bubble mine" : "message-bubble other";
            bubble.innerHTML = `
                <div class="whitespace-pre-wrap break-words text-xs">${escapeHTML(msg.text)}</div>
                <div class="text-[9px] mt-1 opacity-60 text-right">${msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</div>
            `;
            wrap.appendChild(bubble);
            container.appendChild(wrap);
        });
        container.scrollTop = container.scrollHeight;
    });
}

$("close-support-chat")?.addEventListener("click", () => {
    if (activeAdminSupportListener) { activeAdminSupportListener(); activeAdminSupportListener = null; }
    $("active-support-chat")?.classList.add("hidden");
    $("active-support-chat")?.classList.remove("flex");
});

$("support-chat-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    if (!currentAdminSupportUid) return;
    const input = $("support-chat-input");
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    const mr = push(ref(db, `supportChats/${currentAdminSupportUid}/messages`));
    await set(mr, {
        messageId: mr.key,
        senderId: currentUser.uid,
        senderName: "Lynk Support",
        text,
        createdAt: serverTimestamp(),
        isAdmin: true
    });
    input.value = "";
});

// Wallet Withdrawal History & Requests
async function loadWithdrawHistory() {
    if (!currentUser) return;
    const isTeacher = currentUserData?.role === "teacher" || (currentUserData?.walletBalance || 0) > 0;
    const withdrawSection = $("teacher-withdraw-section");
    const withdrawHistSection = $("teacher-withdraw-history");
    if (withdrawSection) withdrawSection.classList.toggle("hidden", !isTeacher);
    if (withdrawHistSection) withdrawHistSection.classList.toggle("hidden", !isTeacher);
    
    const snap = await get(ref(db, "withdrawalRequests"));
    const list = $("withdraw-history-list");
    if (!list) return;
    const all = snap.exists() ? Object.values(snap.val()) : [];
    const myReqs = all.filter(r => r.teacherUid === currentUser.uid).sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0));
    list.innerHTML = "";
    if (!myReqs.length) {
        list.innerHTML = `<div class="text-center text-gray-500 py-3 text-xs">No withdrawal history.</div>`;
        return;
    }
    myReqs.forEach(r => {
        const div = document.createElement("div");
        div.className = "flex items-center justify-between p-3 rounded-xl bg-[var(--bg-soft)] text-xs";
        div.innerHTML = `
            <div>
                <div class="font-bold">৳ ${r.amount}</div>
                <div class="text-[10px] text-gray-400">${r.requestedAt ? new Date(r.requestedAt).toLocaleDateString() : 'Recent'}</div>
            </div>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}">${r.status === 'completed' ? '✓ Completed' : '⏳ Pending'}</span>
        `;
        list.appendChild(div);
    });
}

$("withdraw-btn")?.addEventListener("click", async () => {
    if (!currentUser) return;
    const amount = parseFloat($("withdraw-amount")?.value) || 0;
    const bal = currentUserData?.walletBalance || 0;
    if (amount <= 0) { showToast("Enter valid withdrawal amount.", "error"); return; }
    if (amount > bal) { showToast("Amount exceeds your available balance.", "error"); return; }
    showLoader("Submitting…");
    try {
        const wr = push(ref(db, "withdrawalRequests"));
        await set(wr, {
            requestId: wr.key,
            teacherUid: currentUser.uid,
            teacherName: currentUserData?.nickname || "Teacher",
            teacherPhone: currentUserData?.teacherPhone || currentUserData?.phone || "",
            amount,
            status: "pending",
            requestedAt: serverTimestamp()
        });
        $("withdraw-amount").value = "";
        showToast(`Withdrawal request for ৳${amount} submitted!`, "success");
        loadWithdrawHistory();
    } catch (_) { showToast("Could not submit request.", "error"); }
    hideLoader();
});

$("dash-withdraw")?.addEventListener("click", () => showPage("wallet"));
$("dash-open-builder")?.addEventListener("click", () => showPage("teacher-builder"));

// Teacher Website Builder (.edu)
let builderCurrentTheme = "dark";

async function loadTeacherBuilder() {
    if (!currentUser) return;
    const handle = currentUserData?.teacherUsername || "";
    if ($("builder-handle")) $("builder-handle").value = handle;
    if ($("builder-handle-preview")) $("builder-handle-preview").textContent = handle ? `teacher.edu/${handle}` : "—";
    
    // Toggle switch listeners
    document.querySelectorAll("#block-announcement, #block-social, #block-faq, #block-videos, #block-courses").forEach(sw => {
        sw.onclick = () => {
            sw.classList.toggle("active");
            if (sw.id === "block-announcement") $("builder-announcement")?.classList.toggle("hidden", !sw.classList.contains("active"));
            if (sw.id === "block-social") $("builder-social-fields")?.classList.toggle("hidden", !sw.classList.contains("active"));
            if (sw.id === "block-faq") $("builder-faq-fields")?.classList.toggle("hidden", !sw.classList.contains("active"));
        };
    });

    document.querySelectorAll(".builder-theme-btn").forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll(".builder-theme-btn").forEach(b => b.classList.remove("border-indigo-500", "bg-indigo-600/20"));
            btn.classList.add("border-indigo-500", "bg-indigo-600/20");
            builderCurrentTheme = btn.dataset.theme;
        };
    });

    const snap = await get(ref(db, `teacherWebsites/${currentUser.uid}`));
    if (snap.exists()) {
        const data = snap.val();
        if ($("builder-title")) $("builder-title").value = data.title || "";
        if ($("builder-bio")) $("builder-bio").value = data.bio || "";
        if ($("builder-announcement")) $("builder-announcement").value = data.announcement || "";
        if ($("builder-fb")) $("builder-fb").value = data.facebook || "";
        if ($("builder-yt")) $("builder-yt").value = data.youtube || "";
        if ($("builder-ig")) $("builder-ig").value = data.instagram || "";
        if ($("builder-video1")) $("builder-video1").value = data.video1 || "";
        if ($("builder-video2")) $("builder-video2").value = data.video2 || "";
        if ($("builder-faq-q1")) $("builder-faq-q1").value = data.faqQ1 || "";
        if ($("builder-faq-a1")) $("builder-faq-a1").value = data.faqA1 || "";
        if ($("builder-faq-q2")) $("builder-faq-q2").value = data.faqQ2 || "";
        if ($("builder-faq-a2")) $("builder-faq-a2").value = data.faqA2 || "";
        if (data.theme) {
            builderCurrentTheme = data.theme;
            const themeBtn = document.querySelector(`.builder-theme-btn[data-theme="${data.theme}"]`);
            if (themeBtn) themeBtn.click();
        }
    }
}

$("builder-back")?.addEventListener("click", () => showPage("teacher-dashboard"));

$("builder-banner-drop")?.addEventListener("click", () => $("builder-banner-file")?.click());
$("builder-banner-file")?.addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const preview = $("builder-banner-preview");
        if (preview) { preview.src = ev.target.result; preview.classList.remove("hidden"); }
    };
    reader.readAsDataURL(file);
});

$("builder-save-handle")?.addEventListener("click", async () => {
    const handle = $("builder-handle")?.value.trim().toLowerCase();
    if (!handle) { showToast("Enter a valid handle.", "error"); return; }
    showLoader("Saving handle…");
    try {
        await update(ref(db, `users/${currentUser.uid}`), { teacherUsername: handle });
        await set(ref(db, `teacherUsernames/${handle}`), currentUser.uid);
        invalidateUser(currentUser.uid);
        currentUserData = await getUserByUID(currentUser.uid, true);
        if ($("builder-handle-preview")) $("builder-handle-preview").textContent = `teacher.edu/${handle}`;
        showToast("Handle saved! 🌐", "success");
    } catch (_) { showToast("Could not save handle.", "error"); }
    hideLoader();
});

$("builder-publish")?.addEventListener("click", async () => {
    if (!currentUser) return;
    showLoader("Publishing…");
    try {
        let bannerUrl = null;
        const bannerFile = $("builder-banner-file")?.files?.[0];
        if (bannerFile) bannerUrl = await uploadToCloudinary(bannerFile);
        
        const payload = {
            teacherUid: currentUser.uid,
            title: $("builder-title")?.value.trim() || "",
            bio: $("builder-bio")?.value.trim() || "",
            theme: builderCurrentTheme,
            announcement: $("builder-announcement")?.value.trim() || "",
            facebook: $("builder-fb")?.value.trim() || "",
            youtube: $("builder-yt")?.value.trim() || "",
            instagram: $("builder-ig")?.value.trim() || "",
            video1: $("builder-video1")?.value.trim() || "",
            video2: $("builder-video2")?.value.trim() || "",
            faqQ1: $("builder-faq-q1")?.value.trim() || "",
            faqA1: $("builder-faq-a1")?.value.trim() || "",
            faqQ2: $("builder-faq-q2")?.value.trim() || "",
            faqA2: $("builder-faq-a2")?.value.trim() || "",
            updatedAt: serverTimestamp()
        };
        if (bannerUrl) payload.bannerUrl = bannerUrl;
        await set(ref(db, `teacherWebsites/${currentUser.uid}`), payload);
        showToast("Website published successfully! 🚀", "success");
    } catch (_) { showToast("Failed to publish website.", "error"); }
    hideLoader();
});

// Render Teacher .edu Public Web
async function renderTeacherWeb(handle) {
    const container = $("teacher-web-container");
    if (!container) return;
    container.innerHTML = `<div class="p-12 text-center text-gray-500 text-sm">Loading teacher portal…</div>`;
    
    let teacherUid = null;
    const handleSnap = await get(ref(db, `teacherUsernames/${handle.toLowerCase()}`));
    if (handleSnap.exists()) teacherUid = handleSnap.val();
    if (!teacherUid) {
        const usersSnap = await get(ref(db, "users"));
        if (usersSnap.exists()) {
            const match = Object.values(usersSnap.val()).find(u => u.teacherUsername && u.teacherUsername.toLowerCase() === handle.toLowerCase());
            if (match) teacherUid = match.uid;
        }
    }
    if (!teacherUid) {
        container.innerHTML = `
            <div class="p-12 text-center">
                <div class="text-4xl mb-3">🎓</div>
                <h2 class="text-xl font-bold mb-2">Teacher Not Found</h2>
                <p class="text-xs text-gray-400 mb-4">No portal found for <strong>${escapeHTML(handle)}.edu</strong></p>
                <button class="bg-[#0095f6] text-white px-5 py-2 rounded-xl text-xs font-bold" onclick="showPage('feed')">Back to Feed</button>
            </div>`;
        return;
    }
    
    const teacher = await getUserByUID(teacherUid);
    const webSnap = await get(ref(db, `teacherWebsites/${teacherUid}`));
    const webData = webSnap.exists() ? webSnap.val() : {};
    const coursesSnap = await get(ref(db, "courses"));
    const allCourses = coursesSnap.exists() ? Object.values(coursesSnap.val()).filter(c => c.teacherUid === teacherUid) : [];
    
    container.innerHTML = `
        <div class="max-w-4xl mx-auto pb-24">
            <div class="relative">
                <img src="${webData.bannerUrl || teacher?.coverPhoto || DEFAULT_COVER}" class="w-full h-48 md:h-64 object-cover" />
                <button class="absolute top-4 left-4 bg-black/60 backdrop-blur text-white px-3 py-1.5 rounded-full text-xs" onclick="showPage('feed')">
                    <i class="fas fa-arrow-left mr-1"></i> Back
                </button>
            </div>
            <div class="px-6 -mt-16 relative z-10 flex flex-col md:flex-row items-center md:items-end justify-between gap-4">
                <div class="flex items-center gap-4">
                    <img src="${teacher?.photoURL || DEFAULT_AVATAR}" class="w-24 h-24 rounded-2xl object-cover border-4 border-[var(--bg-primary)] shadow-2xl" />
                    <div>
                        <h1 class="text-xl md:text-2xl font-black flex items-center gap-1.5">
                            ${escapeHTML(webData.title || teacher?.nickname || "Teacher")}
                            <i class="fas fa-check-circle text-blue-400 text-sm"></i>
                        </h1>
                        <p class="text-xs text-indigo-400 font-mono">@${escapeHTML(handle)}.edu</p>
                        <p class="text-xs text-gray-400 mt-1">${escapeHTML(teacher?.subject || "")} · ${escapeHTML(teacher?.institution || "")}</p>
                    </div>
                </div>
                <div class="flex gap-2">
                    ${webData.facebook ? `<a href="${webData.facebook}" target="_blank" class="w-9 h-9 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center text-sm"><i class="fab fa-facebook-f"></i></a>` : ''}
                    ${webData.youtube ? `<a href="${webData.youtube}" target="_blank" class="w-9 h-9 rounded-full bg-red-600/20 text-red-400 flex items-center justify-center text-sm"><i class="fab fa-youtube"></i></a>` : ''}
                    ${webData.instagram ? `<a href="${webData.instagram}" target="_blank" class="w-9 h-9 rounded-full bg-pink-600/20 text-pink-400 flex items-center justify-center text-sm"><i class="fab fa-instagram"></i></a>` : ''}
                </div>
            </div>
            
            ${webData.announcement ? `
                <div class="mx-6 mt-6 p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 text-xs">
                    <div class="font-bold text-indigo-400 mb-1 flex items-center gap-1"><i class="fas fa-bullhorn"></i> Announcement</div>
                    <p class="text-gray-300 leading-relaxed">${escapeHTML(webData.announcement)}</p>
                </div>` : ''}

            <!-- Courses Section -->
            <div class="px-6 mt-8">
                <h2 class="text-lg font-bold mb-4 flex items-center gap-2"><i class="fas fa-graduation-cap text-indigo-400"></i> Masterclasses & Lessons</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${allCourses.length ? allCourses.map(c => `
                        <div class="dark-card p-4 flex gap-3">
                            <img src="${c.thumbnail || DEFAULT_AVATAR}" class="w-20 h-20 rounded-xl object-cover" />
                            <div class="flex-1 min-w-0">
                                <h3 class="font-bold text-xs truncate">${escapeHTML(c.title)}</h3>
                                <p class="text-[11px] text-gray-400 line-clamp-2 mt-0.5">${escapeHTML(c.description)}</p>
                                <div class="mt-2 flex items-center justify-between">
                                    <span class="text-xs font-bold text-amber-400">${c.type === 'pro' ? `৳${c.price}` : 'Free'}</span>
                                    <button class="bg-[#0095f6] text-white px-3 py-1 rounded-lg text-xs font-bold" onclick="showPage('courses')">View</button>
                                </div>
                            </div>
                        </div>
                    `).join("") : `<div class="col-span-2 text-center text-gray-500 py-6 text-xs dark-card">No courses published yet.</div>`}
                </div>
            </div>

            <!-- Demo Videos -->
            ${(webData.video1 || webData.video2) ? `
                <div class="px-6 mt-8">
                    <h2 class="text-lg font-bold mb-4 flex items-center gap-2"><i class="fas fa-play text-red-400"></i> Featured Lectures</h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        ${webData.video1 && extractYouTubeId(webData.video1) ? `
                            <div class="aspect-video rounded-xl overflow-hidden bg-black">
                                <iframe class="w-full h-full" src="https://www.youtube-nocookie.com/embed/${extractYouTubeId(webData.video1)}?rel=0" frameborder="0" allowfullscreen></iframe>
                            </div>` : ''}
                        ${webData.video2 && extractYouTubeId(webData.video2) ? `
                            <div class="aspect-video rounded-xl overflow-hidden bg-black">
                                <iframe class="w-full h-full" src="https://www.youtube-nocookie.com/embed/${extractYouTubeId(webData.video2)}?rel=0" frameborder="0" allowfullscreen></iframe>
                            </div>` : ''}
                    </div>
                </div>` : ''}
        </div>
    `;
}

// Global Exports
window.openTeacherDashboard = openTeacherDashboard;
window.openTeacherWebByHandle = (handle) => { window._teacherWebHandle = handle; showPage("teacher-web"); };
window.loadAdminUsers = loadAdminUsers;
window.loadAdminSupportInbox = loadAdminSupportInbox;
window.loadSupportMessages = loadSupportMessages;
window.loadWithdrawHistory = loadWithdrawHistory;
window.loadTeacherBuilder = loadTeacherBuilder;
window.renderTeacherWeb = renderTeacherWeb;

setupStoryModal();
console.log("Lynk Instagram Edition Active");

