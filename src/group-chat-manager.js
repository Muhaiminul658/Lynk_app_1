// =========================================================
// LYNK GROUP CHAT ENGINE
// =========================================================

let firebaseDb = null;
let firebaseRefs = {};
let currentUserGetter = null;
let activeGroupListener = null;
let activeGroupMessagesListener = null;
let currentActiveGroup = null;

export function initGroupChatManager({ db, ref, set, get, update, onValue, remove, push, serverTimestamp, getCurrentUser, getCurrentUserData }) {
    firebaseDb = db;
    firebaseRefs = { ref, set, get, update, onValue, remove, push, serverTimestamp };
    currentUserGetter = { getCurrentUser, getCurrentUserData };

    setupGroupUIEventListeners();
}

/**
 * Setup Group Chat Modal and Action Listeners
 */
function setupGroupUIEventListeners() {
    // Open Create Group Modal
    document.getElementById("open-create-group-btn")?.addEventListener("click", openCreateGroupModal);
    document.getElementById("close-create-group-modal")?.addEventListener("click", closeCreateGroupModal);
    document.getElementById("cancel-create-group-btn")?.addEventListener("click", closeCreateGroupModal);

    // Group info modal controls
    document.getElementById("close-group-info-modal")?.addEventListener("click", closeGroupInfoModal);
    document.getElementById("leave-group-btn")?.addEventListener("click", leaveCurrentGroup);

    // Form submit
    document.getElementById("create-group-form")?.addEventListener("submit", handleCreateGroupSubmit);

    // Group search in friends selection
    document.getElementById("group-member-search")?.addEventListener("input", (e) => {
        const query = (e.target.value || "").toLowerCase().trim();
        document.querySelectorAll(".group-friend-select-item").forEach(item => {
            const name = (item.dataset.name || "").toLowerCase();
            const username = (item.dataset.username || "").toLowerCase();
            item.style.display = (name.includes(query) || username.includes(query)) ? "flex" : "none";
        });
    });
}

/**
 * Open the Create Group Chat Modal and load user's friends
 */
export async function openCreateGroupModal() {
    const modal = document.getElementById("create-group-modal");
    const friendsContainer = document.getElementById("group-select-friends-list");
    if (!modal || !friendsContainer) return;

    const currentUser = currentUserGetter.getCurrentUser?.();
    if (!currentUser) {
        window.showToast?.("Please log in to create group chats", "info");
        return;
    }

    friendsContainer.innerHTML = `<div class="p-4 text-center text-xs text-gray-500"><i class="fas fa-spinner fa-spin mr-1"></i> Loading friends…</div>`;
    modal.classList.remove("hidden");
    modal.classList.add("flex");

    // Load user's friends to select for group
    try {
        const friendsSnap = await firebaseRefs.get(firebaseRefs.ref(firebaseDb, `friends/${currentUser.uid}`));
        const friendsUids = friendsSnap.exists() ? Object.keys(friendsSnap.val()) : [];

        if (!friendsUids.length) {
            friendsContainer.innerHTML = `<div class="p-4 text-center text-xs text-gray-500">You don't have any friends yet to add to a group. Connect with people first!</div>`;
            return;
        }

        const friendObjects = [];
        for (const fUid of friendsUids) {
            const uSnap = await firebaseRefs.get(firebaseRefs.ref(firebaseDb, `users/${fUid}`));
            if (uSnap.exists()) {
                friendObjects.push({ uid: fUid, ...uSnap.val() });
            }
        }

        if (!friendObjects.length) {
            friendsContainer.innerHTML = `<div class="p-4 text-center text-xs text-gray-500">No friends found.</div>`;
            return;
        }

        friendsContainer.innerHTML = "";
        friendObjects.forEach(f => {
            const item = document.createElement("label");
            item.className = "group-friend-select-item p-2.5 rounded-xl bg-[var(--bg-soft)] border border-[var(--border-color)] flex items-center justify-between cursor-pointer hover:border-blue-500/50 transition";
            item.dataset.name = f.nickname || "User";
            item.dataset.username = f.username || "";
            item.innerHTML = `
                <div class="flex items-center gap-2.5 min-w-0">
                    <img src="${f.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(f.nickname || 'User')}" class="w-8 h-8 rounded-full object-cover" />
                    <div class="min-w-0">
                        <div class="text-xs font-bold truncate text-[var(--text-primary)]">${escapeHtml(f.nickname || "User")}</div>
                        <div class="text-[10px] text-gray-400 truncate">@${escapeHtml(f.username || "user")}</div>
                    </div>
                </div>
                <input type="checkbox" name="group-members" value="${f.uid}" class="w-4 h-4 rounded text-[#0095f6] accent-[#0095f6] cursor-pointer" />
            `;
            friendsContainer.appendChild(item);
        });

    } catch (err) {
        console.error("Error loading friends for group:", err);
        friendsContainer.innerHTML = `<div class="p-4 text-center text-xs text-red-400">Failed to load friends.</div>`;
    }
}

export function closeCreateGroupModal() {
    const modal = document.getElementById("create-group-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
    const form = document.getElementById("create-group-form");
    if (form) form.reset();
}

/**
 * Handle Group Creation
 */
async function handleCreateGroupSubmit(e) {
    e.preventDefault();
    const currentUser = currentUserGetter.getCurrentUser?.();
    const currentUserData = currentUserGetter.getCurrentUserData?.();
    if (!currentUser) return;

    const nameInput = document.getElementById("group-name-input");
    const name = nameInput?.value.trim();
    if (!name) {
        window.showToast?.("Please enter a group name", "info");
        return;
    }

    const selectedCheckboxes = document.querySelectorAll('input[name="group-members"]:checked');
    const memberUids = Array.from(selectedCheckboxes).map(cb => cb.value);

    if (memberUids.length === 0) {
        window.showToast?.("Please select at least 1 friend to create a group", "info");
        return;
    }

    // Include creator in members
    const allMembers = [currentUser.uid, ...memberUids];
    const membersMap = {};
    allMembers.forEach(uid => { membersMap[uid] = true; });

    window.showLoader?.("Creating Group…");

    try {
        const groupRef = firebaseRefs.push(firebaseRefs.ref(firebaseDb, "groups"));
        const groupId = groupRef.key;
        const now = Date.now();

        // Default stylish gradient group avatar
        const defaultGroupAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0095f6&color=ffffff&bold=true`;

        const groupData = {
            groupId,
            name,
            avatar: defaultGroupAvatar,
            creatorUid: currentUser.uid,
            admins: { [currentUser.uid]: true },
            members: membersMap,
            memberCount: allMembers.length,
            createdAt: now,
            updatedAt: now,
            lastMessage: `${currentUserData?.nickname || 'Someone'} created the group "${name}"`
        };

        // 1. Save group document
        await firebaseRefs.set(groupRef, groupData);

        // 2. Add group to each member's index & chatList
        const updates = {};
        allMembers.forEach(uid => {
            updates[`userGroups/${uid}/${groupId}`] = true;
            updates[`chatList/${uid}/group_${groupId}`] = {
                groupId,
                isGroup: true,
                name,
                avatar: defaultGroupAvatar,
                lastMessage: groupData.lastMessage,
                updatedAt: now
            };
        });

        // 3. Post initial system message inside group
        const msgRef = firebaseRefs.push(firebaseRefs.ref(firebaseDb, `groupMessages/${groupId}`));
        updates[`groupMessages/${groupId}/${msgRef.key}`] = {
            messageId: msgRef.key,
            groupId,
            senderId: "system",
            senderName: "Lynk System",
            senderPhoto: "/app-logo.svg",
            text: `🎉 ${currentUserData?.nickname || 'Someone'} created the group "${name}"`,
            type: "system",
            createdAt: now
        };

        await firebaseRefs.update(firebaseRefs.ref(firebaseDb), updates);

        closeCreateGroupModal();
        window.showToast?.(`Group "${name}" created!`, "success");

        // Notify other members
        memberUids.forEach(targetUid => {
            window.sendNotificationToUser?.(targetUid, {
                type: "group_invite",
                title: `Added to Group: ${name}`,
                text: `${currentUserData?.nickname || 'Someone'} added you to ${name}`,
                groupId
            });
        });

        // Open newly created group chat immediately
        openGroupChat(groupData);

    } catch (err) {
        console.error("Error creating group:", err);
        window.showToast?.("Failed to create group. Please try again.", "error");
    } finally {
        window.hideLoader?.();
    }
}

/**
 * Open Group Chat in Active Chat Screen
 */
export async function openGroupChat(groupData) {
    if (!groupData || !groupData.groupId) return;
    currentActiveGroup = groupData;
    window.currentActiveGroup = groupData;
    window.currentChatUser = null; // Clear 1-on-1 chat user

    const activeChat = document.getElementById("active-chat");
    if (!activeChat) return;

    // Set Header UI
    const activePic = document.getElementById("active-pic");
    const activeName = document.getElementById("active-name");
    const activeStatus = document.getElementById("active-status");
    const activeVerified = document.getElementById("active-verified-badge");
    const activeDot = document.getElementById("active-status-dot");

    if (activePic) activePic.src = groupData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(groupData.name || 'Group')}&background=0095f6&color=ffffff`;
    if (activeName) activeName.textContent = groupData.name || "Group Chat";
    if (activeVerified) activeVerified.classList.add("hidden");
    if (activeDot) activeDot.classList.add("hidden");
    if (activeStatus) activeStatus.textContent = `${groupData.memberCount || Object.keys(groupData.members || {}).length || 2} members • Click for info`;

    // Make header click open group info modal
    const headerProfile = document.getElementById("chat-header-profile");
    if (headerProfile) {
        headerProfile.onclick = () => openGroupInfoModal(currentActiveGroup);
    }

    activeChat.classList.remove("hidden");
    activeChat.classList.add("flex");

    // Start Realtime Group Messages Listener
    startGroupMessagesListener(groupData.groupId);
}

/**
 * Realtime Group Messages Listener
 */
function startGroupMessagesListener(groupId) {
    if (activeGroupMessagesListener) activeGroupMessagesListener();

    const messagesContainer = document.getElementById("chat-messages");
    if (!messagesContainer) return;
    messagesContainer.innerHTML = `<div class="p-6 text-center text-xs text-gray-500"><i class="fas fa-spinner fa-spin mr-1"></i> Loading messages…</div>`;

    const groupMsgRef = firebaseRefs.ref(firebaseDb, `groupMessages/${groupId}`);
    activeGroupMessagesListener = firebaseRefs.onValue(groupMsgRef, (snapshot) => {
        const currentUser = currentUserGetter.getCurrentUser?.();
        const data = snapshot.val();
        messagesContainer.innerHTML = "";

        if (!data) {
            messagesContainer.innerHTML = `<div class="text-center text-gray-500 py-10 text-xs">No messages yet. Start the group conversation!</div>`;
            return;
        }

        const messages = Object.values(data).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

        messages.forEach(msg => {
            if (msg.type === "system") {
                const sysEl = document.createElement("div");
                sysEl.className = "text-center my-3";
                sysEl.innerHTML = `<span class="px-3 py-1 rounded-full bg-[var(--bg-soft)] text-[11px] text-gray-400 font-medium">${escapeHtml(msg.text)}</span>`;
                messagesContainer.appendChild(sysEl);
                return;
            }

            const mine = msg.senderId === currentUser?.uid;
            const wrapper = document.createElement("div");
            wrapper.className = `flex mb-3 ${mine ? "justify-end" : "justify-start gap-2"}`;

            const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
            
            let bubbleHtml = "";
            if (!mine) {
                bubbleHtml += `
                    <img src="${msg.senderPhoto || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(msg.senderName || 'User')}" class="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-1 cursor-pointer" onclick="window.openUserProfileByUid?.('${msg.senderId}')" />
                    <div>
                        <div class="text-[10px] font-bold text-gray-400 mb-0.5 ml-1">${escapeHtml(msg.senderName || 'User')}</div>
                `;
            }

            bubbleHtml += `
                <div class="chat-bubble ${mine ? 'chat-bubble-mine' : 'chat-bubble-theirs'}">
                    <div class="text-xs break-words">${window.formatMentionsAndText ? window.formatMentionsAndText(msg.text) : escapeHtml(msg.text)}</div>
                    <div class="text-[9px] mt-1 opacity-60 flex justify-end items-center gap-1">${time}</div>
                </div>
            `;

            if (!mine) {
                bubbleHtml += `</div>`;
            }

            wrapper.innerHTML = bubbleHtml;
            messagesContainer.appendChild(wrapper);
        });

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

/**
 * Send Group Message
 */
export async function sendGroupMessage(text) {
    if (!currentActiveGroup || !text || !text.trim()) return;
    const currentUser = currentUserGetter.getCurrentUser?.();
    const currentUserData = currentUserGetter.getCurrentUserData?.();
    if (!currentUser) return;

    const groupId = currentActiveGroup.groupId;
    const cleanText = text.trim();
    const now = Date.now();

    try {
        const msgRef = firebaseRefs.push(firebaseRefs.ref(firebaseDb, `groupMessages/${groupId}`));
        const messageData = {
            messageId: msgRef.key,
            groupId,
            senderId: currentUser.uid,
            senderName: currentUserData?.nickname || "User",
            senderPhoto: currentUserData?.photoURL || "https://ui-avatars.com/api/?name=User",
            text: cleanText,
            type: "text",
            createdAt: now
        };

        const updates = {
            [`groupMessages/${groupId}/${msgRef.key}`]: messageData,
            [`groups/${groupId}/lastMessage`]: `${currentUserData?.nickname || 'Someone'}: ${cleanText}`,
            [`groups/${groupId}/updatedAt`]: now
        };

        // Update chat list for all group members
        const membersSnap = await firebaseRefs.get(firebaseRefs.ref(firebaseDb, `groups/${groupId}/members`));
        if (membersSnap.exists()) {
            const memberUids = Object.keys(membersSnap.val());
            memberUids.forEach(uid => {
                updates[`chatList/${uid}/group_${groupId}`] = {
                    groupId,
                    isGroup: true,
                    name: currentActiveGroup.name,
                    avatar: currentActiveGroup.avatar,
                    lastMessage: `${currentUserData?.nickname || 'Someone'}: ${cleanText}`,
                    updatedAt: now
                };
            });
        }

        await firebaseRefs.update(firebaseRefs.ref(firebaseDb), updates);
        window.playPutungSound?.("send");

        // Parse mentions inside group text
        if (window.parseAndSendMentions) {
            window.parseAndSendMentions(cleanText, { type: "group", groupId });
        }

    } catch (err) {
        console.error("Error sending group message:", err);
        window.showToast?.("Failed to send message", "error");
    }
}

/**
 * Open Group Info & Members Details Modal
 */
export async function openGroupInfoModal(group) {
    const targetGroup = group || currentActiveGroup;
    if (!targetGroup) return;

    const modal = document.getElementById("group-info-modal");
    const nameEl = document.getElementById("group-info-name");
    const avatarEl = document.getElementById("group-info-avatar");
    const countEl = document.getElementById("group-info-member-count");
    const listEl = document.getElementById("group-info-members-list");

    if (!modal || !nameEl || !avatarEl || !listEl) return;

    nameEl.textContent = targetGroup.name || "Group";
    avatarEl.src = targetGroup.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(targetGroup.name || 'Group')}`;
    listEl.innerHTML = `<div class="p-4 text-center text-xs text-gray-500"><i class="fas fa-spinner fa-spin mr-1"></i> Loading members…</div>`;

    modal.classList.remove("hidden");
    modal.classList.add("flex");

    try {
        const groupSnap = await firebaseRefs.get(firebaseRefs.ref(firebaseDb, `groups/${targetGroup.groupId}`));
        if (!groupSnap.exists()) return;
        const freshData = groupSnap.val();

        const memberUids = Object.keys(freshData.members || {});
        if (countEl) countEl.textContent = `${memberUids.length} members`;

        const memberUsers = [];
        for (const mUid of memberUids) {
            const uSnap = await firebaseRefs.get(firebaseRefs.ref(firebaseDb, `users/${mUid}`));
            if (uSnap.exists()) {
                memberUsers.push({
                    uid: mUid,
                    isAdmin: !!freshData.admins?.[mUid],
                    ...uSnap.val()
                });
            }
        }

        listEl.innerHTML = "";
        memberUsers.forEach(m => {
            const row = document.createElement("div");
            row.className = "p-2.5 flex items-center justify-between rounded-xl bg-[var(--bg-soft)] border border-[var(--border-color)]";
            row.innerHTML = `
                <div class="flex items-center gap-2.5 min-w-0 cursor-pointer" onclick="window.openUserProfileByUid?.('${m.uid}')">
                    <img src="${m.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(m.nickname || 'User')}" class="w-8 h-8 rounded-full object-cover" />
                    <div class="min-w-0">
                        <div class="text-xs font-bold text-[var(--text-primary)] truncate">${escapeHtml(m.nickname || 'User')}</div>
                        <div class="text-[10px] text-gray-400 truncate">@${escapeHtml(m.username || 'user')}</div>
                    </div>
                </div>
                ${m.isAdmin ? `<span class="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold">Admin</span>` : ''}
            `;
            listEl.appendChild(row);
        });

    } catch (e) {
        console.error("Error loading group info:", e);
    }
}

export function closeGroupInfoModal() {
    const modal = document.getElementById("group-info-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
}

/**
 * Leave Current Group
 */
async function leaveCurrentGroup() {
    if (!currentActiveGroup) return;
    const currentUser = currentUserGetter.getCurrentUser?.();
    const currentUserData = currentUserGetter.getCurrentUserData?.();
    if (!currentUser) return;

    if (!confirm(`Are you sure you want to leave "${currentActiveGroup.name}"?`)) return;

    const groupId = currentActiveGroup.groupId;
    window.showLoader?.("Leaving group…");

    try {
        const updates = {
            [`groups/${groupId}/members/${currentUser.uid}`]: null,
            [`groups/${groupId}/admins/${currentUser.uid}`]: null,
            [`userGroups/${currentUser.uid}/${groupId}`]: null,
            [`chatList/${currentUser.uid}/group_${groupId}`]: null
        };

        // Post system message: user left
        const msgRef = firebaseRefs.push(firebaseRefs.ref(firebaseDb, `groupMessages/${groupId}`));
        updates[`groupMessages/${groupId}/${msgRef.key}`] = {
            messageId: msgRef.key,
            groupId,
            senderId: "system",
            senderName: "Lynk System",
            senderPhoto: "/app-logo.svg",
            text: `${currentUserData?.nickname || 'A member'} left the group`,
            type: "system",
            createdAt: Date.now()
        };

        await firebaseRefs.update(firebaseRefs.ref(firebaseDb), updates);

        closeGroupInfoModal();
        document.getElementById("active-chat")?.classList.add("hidden");
        currentActiveGroup = null;
        window.currentActiveGroup = null;

        window.showToast?.("You left the group", "info");
        window.showPage?.("chats");

    } catch (e) {
        console.error("Error leaving group:", e);
        window.showToast?.("Failed to leave group", "error");
    } finally {
        window.hideLoader?.();
    }
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Expose on global window
if (typeof window !== "undefined") {
    window.GroupChatManager = {
        initGroupChatManager,
        openCreateGroupModal,
        closeCreateGroupModal,
        openGroupChat,
        sendGroupMessage,
        openGroupInfoModal,
        closeGroupInfoModal
    };
    window.openCreateGroupModal = openCreateGroupModal;
    window.closeCreateGroupModal = closeCreateGroupModal;
    window.openGroupChat = openGroupChat;
    window.openGroupInfoModal = openGroupInfoModal;
    window.closeGroupInfoModal = closeGroupInfoModal;
}
