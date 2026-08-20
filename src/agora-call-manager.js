// =========================================================
// AGORA WEB SDK v4 VOICE & SD VIDEO CALL MANAGER
// =========================================================
import AgoraRTC from "agora-rtc-sdk-ng";
import { startIncomingRingtone, stopIncomingRingtone, startOutgoingRingtone, stopOutgoingRingtone } from "./sound-manager.js";

// Agora Configuration
const AGORA_APP_ID = "bbed08f1b0494680a4a50b7d842d2f4e";

// Standard Definition (SD) Video Encoder Profile
// 480p SD resolution (640x480 @ 15fps) provides butter-smooth streaming with minimal data usage
const SD_VIDEO_PROFILE = {
    width: 640,
    height: 480,
    frameRate: 15,
    bitrateMin: 250,
    bitrateMax: 500
};

// Call State
let agoraClient = null;
let localAudioTrack = null;
let localVideoTrack = null;
let remoteUsers = {};
let currentCallData = null; // { callId, channelName, type: 'voice'|'video', otherUser, isCaller, status }
let callTimerInterval = null;
let callStartTime = null;
let activeCallListener = null;
let incomingCallListener = null;

// Firebase references injector (injected from main-app.js)
let firebaseDb = null;
let firebaseRefs = {};
let currentUserGetter = null;

export function initAgoraCallManager({ db, ref, set, get, update, onValue, remove, push, serverTimestamp, getCurrentUser, getCurrentUserData }) {
    firebaseDb = db;
    firebaseRefs = { ref, set, get, update, onValue, remove, push, serverTimestamp };
    currentUserGetter = { getCurrentUser, getCurrentUserData };

    // Disable Agora debug logs in production
    AgoraRTC.setLogLevel(1);

    // Initialize UI Event Listeners for Call Controls
    setupCallUIControls();

    console.log("[AgoraCallManager] Initialized with App ID:", AGORA_APP_ID);
}

/**
 * Start listening for incoming calls for the logged-in user
 */
export function startIncomingCallListener(uid) {
    if (!firebaseDb || !uid) return;
    if (incomingCallListener) incomingCallListener();

    const userCallRef = firebaseRefs.ref(firebaseDb, `userCalls/${uid}`);
    incomingCallListener = firebaseRefs.onValue(userCallRef, async (snapshot) => {
        const callData = snapshot.val();
        if (!callData) {
            // No active incoming call
            hideIncomingCallModal();
            stopIncomingRingtone();
            return;
        }

        // Only handle calls that are in 'ringing' status and directed to us
        if (callData.status === "ringing" && callData.receiverUid === uid) {
            // Check if call timed out (older than 40s)
            if (Date.now() - (callData.createdAt || 0) > 40000) {
                await rejectIncomingCall(callData.channelName, true);
                return;
            }

            // Show incoming call modal and start ringtone
            currentCallData = {
                ...callData,
                isCaller: false
            };
            showIncomingCallModal(callData);
            startIncomingRingtone();
        } else if (callData.status === "ended" || callData.status === "declined" || callData.status === "missed") {
            hideIncomingCallModal();
            stopIncomingRingtone();
            if (currentCallData?.channelName === callData.channelName) {
                endCallLocally("Call ended");
            }
        }
    });
}

/**
 * Initiate an Outgoing Voice or Video Call
 */
export async function startCall({ targetUser, type = "voice" }) {
    const currentUser = currentUserGetter.getCurrentUser?.();
    const currentUserData = currentUserGetter.getCurrentUserData?.();

    if (!currentUser || !targetUser) {
        window.showToast?.("Unable to start call. Please sign in.", "error");
        return;
    }

    if (currentCallData) {
        window.showToast?.("You are already in a call.", "info");
        return;
    }

    const channelName = `lynk_call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    currentCallData = {
        channelName,
        type, // 'voice' | 'video'
        callerUid: currentUser.uid,
        callerName: currentUserData?.nickname || "User",
        callerPhoto: currentUserData?.photoURL || "https://ui-avatars.com/api/?name=User",
        receiverUid: targetUser.uid,
        receiverName: targetUser.nickname || "User",
        receiverPhoto: targetUser.photoURL || "https://ui-avatars.com/api/?name=User",
        status: "ringing",
        createdAt: Date.now(),
        isCaller: true
    };

    // 1. Show Call Overlay in "Calling..." state
    showActiveCallModal(currentCallData, "Calling…");
    startOutgoingRingtone();

    try {
        // 2. Set Call in Firebase Realtime Database
        await firebaseRefs.set(firebaseRefs.ref(firebaseDb, `calls/${channelName}`), currentCallData);
        await firebaseRefs.set(firebaseRefs.ref(firebaseDb, `userCalls/${targetUser.uid}`), currentCallData);
        await firebaseRefs.set(firebaseRefs.ref(firebaseDb, `userCalls/${currentUser.uid}`), currentCallData);

        // 3. Dispatch Device Push Notification (Pusher Beams)
        if (window.triggerPusherPushNotification) {
            window.triggerPusherPushNotification({
                targetUid: targetUser.uid,
                title: `Incoming ${type === 'video' ? 'Video' : 'Voice'} Call`,
                body: `${currentCallData.callerName} is calling you on Lynk`,
                icon: currentCallData.callerPhoto,
                deepLink: `${window.location.origin}#call`
            });
        }

        // 4. Listen for Call Answer / Decline from receiver
        listenToCallState(channelName);

        // 5. Set 35-second call timeout if unanswered
        setTimeout(async () => {
            if (currentCallData && currentCallData.status === "ringing" && currentCallData.channelName === channelName) {
                await endCall("No answer (Call Timed Out)");
            }
        }, 35000);

    } catch (err) {
        console.error("[AgoraCallManager] Error initiating call:", err);
        stopOutgoingRingtone();
        hideActiveCallModal();
        currentCallData = null;
        window.showToast?.("Failed to initiate call. Check connection.", "error");
    }
}

/**
 * Accept an Incoming Call
 */
export async function acceptIncomingCall() {
    if (!currentCallData || !currentCallData.channelName) return;

    stopIncomingRingtone();
    hideIncomingCallModal();

    const currentUser = currentUserGetter.getCurrentUser?.();
    const channelName = currentCallData.channelName;

    showActiveCallModal(currentCallData, "Connecting…");

    try {
        // 1. Update status to 'accepted' in Firebase
        const updates = {
            [`calls/${channelName}/status`]: "accepted",
            [`calls/${channelName}/acceptedAt`]: Date.now(),
            [`userCalls/${currentCallData.callerUid}/status`]: "accepted",
            [`userCalls/${currentUser.uid}/status`]: "accepted"
        };
        await firebaseRefs.update(firebaseRefs.ref(firebaseDb), updates);

        // 2. Listen to call status changes (e.g. other side hangs up)
        listenToCallState(channelName);

        // 3. Join Agora RTC Room
        await joinAgoraRoom(channelName, currentCallData.type);

    } catch (err) {
        console.error("[AgoraCallManager] Failed to accept call:", err);
        endCallLocally("Failed to connect to Agora room");
    }
}

/**
 * Reject an Incoming Call
 */
export async function rejectIncomingCall(channelName = null, isTimeout = false) {
    const chName = channelName || currentCallData?.channelName;
    stopIncomingRingtone();
    hideIncomingCallModal();

    if (!chName || !firebaseDb) {
        currentCallData = null;
        return;
    }

    const currentUser = currentUserGetter.getCurrentUser?.();
    const status = isTimeout ? "missed" : "declined";

    try {
        const callSnap = await firebaseRefs.get(firebaseRefs.ref(firebaseDb, `calls/${chName}`));
        if (callSnap.exists()) {
            const data = callSnap.val();
            const updates = {
                [`calls/${chName}/status`]: status,
                [`userCalls/${data.callerUid}/status`]: status,
                [`userCalls/${data.receiverUid}/status`]: status
            };
            await firebaseRefs.update(firebaseRefs.ref(firebaseDb), updates);
        }
    } catch (_) {}

    currentCallData = null;
}

/**
 * Listen to Call State Changes in Firebase
 */
function listenToCallState(channelName) {
    if (activeCallListener) activeCallListener();

    const callRef = firebaseRefs.ref(firebaseDb, `calls/${channelName}`);
    activeCallListener = firebaseRefs.onValue(callRef, async (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        if (data.status === "accepted" && currentCallData?.isCaller && !agoraClient) {
            // Receiver accepted the call! Stop dial tone and join Agora channel
            stopOutgoingRingtone();
            updateCallStatusBadge("Connected");
            startCallTimer();
            await joinAgoraRoom(channelName, currentCallData.type);
        } else if (data.status === "declined") {
            stopOutgoingRingtone();
            endCallLocally("Call declined");
            window.showToast?.("User declined the call", "info");
        } else if (data.status === "missed") {
            stopOutgoingRingtone();
            endCallLocally("Call timed out");
            window.showToast?.("User is unavailable", "info");
        } else if (data.status === "ended") {
            stopOutgoingRingtone();
            endCallLocally("Call ended");
        }
    });
}

/**
 * Join Agora RTC Channel and Initialize Audio/Video Tracks
 */
async function joinAgoraRoom(channelName, callType = "voice") {
    try {
        agoraClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

        // Event: Remote user published audio/video
        agoraClient.on("user-published", async (user, mediaType) => {
            await agoraClient.subscribe(user, mediaType);
            remoteUsers[user.uid] = user;

            if (mediaType === "video") {
                const remoteVideoContainer = document.getElementById("remote-video-player");
                if (remoteVideoContainer) {
                    remoteVideoContainer.innerHTML = "";
                    user.videoTrack.play(remoteVideoContainer);
                    document.getElementById("remote-user-avatar-placeholder")?.classList.add("hidden");
                }
            }
            if (mediaType === "audio") {
                user.audioTrack.play();
            }
        });

        // Event: Remote user unpublished video/audio
        agoraClient.on("user-unpublished", (user, mediaType) => {
            if (mediaType === "video") {
                document.getElementById("remote-user-avatar-placeholder")?.classList.remove("hidden");
            }
        });

        // Event: Remote user left call
        agoraClient.on("user-left", (user) => {
            delete remoteUsers[user.uid];
            endCallLocally("Participant left the call");
        });

        // Join Agora RTC Channel (Testing mode: token is null)
        await agoraClient.join(AGORA_APP_ID, channelName, null, null);

        // Create Local Microphone Track
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
            encoderConfig: "speech_standard",
            AEC: true,
            ANS: true
        });

        const tracksToPublish = [localAudioTrack];

        // If Video Call: Create Local Camera Video Track with SD Quality
        if (callType === "video") {
            try {
                localVideoTrack = await AgoraRTC.createCameraVideoTrack({
                    encoderConfig: SD_VIDEO_PROFILE,
                    facingMode: "user"
                });

                const localVideoContainer = document.getElementById("local-video-player");
                if (localVideoContainer) {
                    localVideoContainer.innerHTML = "";
                    localVideoTrack.play(localVideoContainer);
                    document.getElementById("local-video-pip")?.classList.remove("hidden");
                }
                tracksToPublish.push(localVideoTrack);
            } catch (videoErr) {
                console.warn("[AgoraCallManager] Camera access error:", videoErr);
                window.showToast?.("Camera unavailable. Proceeding with voice only.", "info");
            }
        } else {
            document.getElementById("local-video-pip")?.classList.add("hidden");
        }

        // Publish Local Tracks
        await agoraClient.publish(tracksToPublish);

        updateCallStatusBadge(callType === "video" ? "SD Video Call" : "Voice Call");
        startCallTimer();

    } catch (err) {
        console.error("[AgoraCallManager] Agora join error:", err);
        endCallLocally("Failed to connect audio/video devices");
    }
}

/**
 * End Call & Teardown Agora Session
 */
export async function endCall(reason = "Call ended") {
    stopOutgoingRingtone();
    stopIncomingRingtone();

    if (currentCallData?.channelName && firebaseDb) {
        try {
            const chName = currentCallData.channelName;
            const callerUid = currentCallData.callerUid;
            const receiverUid = currentCallData.receiverUid;

            const updates = {
                [`calls/${chName}/status`]: "ended",
                [`calls/${chName}/endedAt`]: Date.now(),
                [`userCalls/${callerUid}/status`]: "ended",
                [`userCalls/${receiverUid}/status`]: "ended"
            };
            await firebaseRefs.update(firebaseRefs.ref(firebaseDb), updates);
            
            // Clean userCalls after short delay
            setTimeout(() => {
                firebaseRefs.remove(firebaseRefs.ref(firebaseDb, `userCalls/${callerUid}`)).catch(() => {});
                firebaseRefs.remove(firebaseRefs.ref(firebaseDb, `userCalls/${receiverUid}`)).catch(() => {});
            }, 3000);
        } catch (_) {}
    }

    endCallLocally(reason);
}

/**
 * Clean up local tracks, Agora client, and UI
 */
function endCallLocally(message = null) {
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }

    if (activeCallListener) {
        activeCallListener();
        activeCallListener = null;
    }

    // Stop and close local tracks
    if (localAudioTrack) {
        localAudioTrack.stop();
        localAudioTrack.close();
        localAudioTrack = null;
    }
    if (localVideoTrack) {
        localVideoTrack.stop();
        localVideoTrack.close();
        localVideoTrack = null;
    }

    // Leave Agora room
    if (agoraClient) {
        agoraClient.leave().catch(() => {});
        agoraClient = null;
    }

    remoteUsers = {};
    currentCallData = null;

    hideActiveCallModal();
    hideIncomingCallModal();

    if (message) {
        window.showToast?.(message, "info");
    }
}

/**
 * Setup Controls (Mute, Camera Toggle, Flip, End Call)
 */
function setupCallUIControls() {
    // 1. End Call Button
    document.getElementById("call-control-end")?.addEventListener("click", () => endCall("You left the call"));
    document.getElementById("incoming-call-decline")?.addEventListener("click", () => rejectIncomingCall());
    document.getElementById("incoming-call-accept")?.addEventListener("click", () => acceptIncomingCall());

    // 2. Toggle Microphone (Mute / Unmute)
    const micBtn = document.getElementById("call-control-mic");
    if (micBtn) {
        micBtn.addEventListener("click", () => {
            if (!localAudioTrack) return;
            const isMuted = !localAudioTrack.enabled;
            localAudioTrack.setEnabled(isMuted);
            
            micBtn.classList.toggle("bg-red-600/80", !isMuted);
            micBtn.classList.toggle("text-white", true);
            const icon = micBtn.querySelector("i");
            if (icon) {
                icon.className = isMuted ? "fas fa-microphone" : "fas fa-microphone-slash";
            }
            window.showToast?.(isMuted ? "Microphone Unmuted" : "Microphone Muted", "info");
        });
    }

    // 3. Toggle Video Camera
    const camBtn = document.getElementById("call-control-cam");
    if (camBtn) {
        camBtn.addEventListener("click", async () => {
            if (!localVideoTrack && currentCallData?.type === "voice") {
                // Upgrading Voice Call to Video Call
                try {
                    localVideoTrack = await AgoraRTC.createCameraVideoTrack({ encoderConfig: SD_VIDEO_PROFILE });
                    const localVideoContainer = document.getElementById("local-video-player");
                    if (localVideoContainer) {
                        localVideoContainer.innerHTML = "";
                        localVideoTrack.play(localVideoContainer);
                        document.getElementById("local-video-pip")?.classList.remove("hidden");
                    }
                    if (agoraClient) await agoraClient.publish([localVideoTrack]);
                    camBtn.classList.remove("bg-red-600/80");
                    const icon = camBtn.querySelector("i");
                    if (icon) icon.className = "fas fa-video";
                    window.showToast?.("Camera turned on", "info");
                } catch (e) {
                    window.showToast?.("Could not access camera", "error");
                }
                return;
            }

            if (!localVideoTrack) return;
            const isCamOff = !localVideoTrack.enabled;
            localVideoTrack.setEnabled(isCamOff);
            
            camBtn.classList.toggle("bg-red-600/80", !isCamOff);
            const icon = camBtn.querySelector("i");
            if (icon) {
                icon.className = isCamOff ? "fas fa-video" : "fas fa-video-slash";
            }
            document.getElementById("local-video-pip")?.classList.toggle("opacity-0", !isCamOff);
            window.showToast?.(isCamOff ? "Camera turned on" : "Camera turned off", "info");
        });
    }

    // 4. Switch Camera (Front / Back)
    const switchCamBtn = document.getElementById("call-control-switch");
    if (switchCamBtn) {
        switchCamBtn.addEventListener("click", async () => {
            if (!localVideoTrack) return;
            try {
                const cameras = await AgoraRTC.getCameras();
                if (cameras.length < 2) {
                    window.showToast?.("Only one camera available on this device.", "info");
                    return;
                }
                const currentDeviceId = localVideoTrack.getMediaStreamTrack()?.getSettings()?.deviceId;
                const nextCam = cameras.find(c => c.deviceId !== currentDeviceId) || cameras[0];
                await localVideoTrack.setDevice(nextCam.deviceId);
                window.showToast?.("Camera switched", "info");
            } catch (err) {
                console.error("Camera switch error:", err);
            }
        });
    }
}

// UI Helpers
function showIncomingCallModal(callData) {
    const modal = document.getElementById("incoming-call-modal");
    if (!modal) return;

    document.getElementById("incoming-caller-name").textContent = callData.callerName || "Someone";
    document.getElementById("incoming-caller-avatar").src = callData.callerPhoto || "https://ui-avatars.com/api/?name=User";
    
    const typeBadge = document.getElementById("incoming-call-type-badge");
    if (typeBadge) {
        if (callData.type === "video") {
            typeBadge.innerHTML = `<i class="fas fa-video text-blue-400 mr-1.5"></i> Incoming Video Call (SD)`;
        } else {
            typeBadge.innerHTML = `<i class="fas fa-phone-alt text-green-400 mr-1.5"></i> Incoming Voice Call`;
        }
    }

    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function hideIncomingCallModal() {
    const modal = document.getElementById("incoming-call-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
}

function showActiveCallModal(callData, initialStatus = "Connecting…") {
    const modal = document.getElementById("active-call-modal");
    if (!modal) return;

    const isCaller = callData.isCaller;
    const otherName = isCaller ? callData.receiverName : callData.callerName;
    const otherPhoto = isCaller ? callData.receiverPhoto : callData.callerPhoto;

    document.getElementById("call-other-name").textContent = otherName || "User";
    document.getElementById("call-other-avatar").src = otherPhoto || "https://ui-avatars.com/api/?name=User";
    document.getElementById("remote-user-avatar-img").src = otherPhoto || "https://ui-avatars.com/api/?name=User";
    document.getElementById("remote-user-name-text").textContent = otherName || "User";

    updateCallStatusBadge(initialStatus);

    // Reset buttons
    const micBtn = document.getElementById("call-control-mic");
    const camBtn = document.getElementById("call-control-cam");
    if (micBtn) {
        micBtn.classList.remove("bg-red-600/80");
        micBtn.querySelector("i").className = "fas fa-microphone";
    }
    if (camBtn) {
        camBtn.classList.remove("bg-red-600/80");
        camBtn.querySelector("i").className = callData.type === "video" ? "fas fa-video" : "fas fa-video-slash";
    }

    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function hideActiveCallModal() {
    const modal = document.getElementById("active-call-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
    document.getElementById("remote-video-player").innerHTML = "";
    document.getElementById("local-video-player").innerHTML = "";
}

function updateCallStatusBadge(text) {
    const badge = document.getElementById("call-status-badge");
    if (badge) badge.textContent = text;
}

function startCallTimer() {
    if (callTimerInterval) clearInterval(callTimerInterval);
    callStartTime = Date.now();
    const timerEl = document.getElementById("call-timer-display");
    
    callTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
        const secs = String(elapsed % 60).padStart(2, "0");
        if (timerEl) timerEl.textContent = `${mins}:${secs}`;
    }, 1000);
}

// Global exposure
if (typeof window !== "undefined") {
    window.AgoraCallManager = {
        initAgoraCallManager,
        startIncomingCallListener,
        startCall,
        acceptIncomingCall,
        rejectIncomingCall,
        endCall
    };
    window.startVoiceCall = (targetUser) => startCall({ targetUser, type: "voice" });
    window.startVideoCall = (targetUser) => startCall({ targetUser, type: "video" });
}
