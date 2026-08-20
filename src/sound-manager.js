// =========================================================
// LYNK SOUND & PUSH NOTIFICATION MANAGER
// =========================================================
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

const PUSHER_BEAMS_INSTANCE_ID = "71cf24d7-5e54-48d2-a980-2bd7495d6ef2";

// Web Audio API Synth Engine
let audioContextInstance = null;

function getAudioContext() {
    if (!audioContextInstance && typeof window !== "undefined") {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
            audioContextInstance = new AudioCtx();
        }
    }
    if (audioContextInstance && audioContextInstance.state === "suspended") {
        audioContextInstance.resume().catch(() => {});
    }
    return audioContextInstance;
}

// Unlock audio on initial user touch / click
if (typeof document !== "undefined") {
    const unlockAudio = () => {
        getAudioContext();
        document.removeEventListener("click", unlockAudio);
        document.removeEventListener("touchstart", unlockAudio);
        document.removeEventListener("keydown", unlockAudio);
    };
    document.addEventListener("click", unlockAudio, { once: true });
    document.addEventListener("touchstart", unlockAudio, { once: true });
    document.addEventListener("keydown", unlockAudio, { once: true });
}

/**
 * Play high-fidelity synthesized notification sound ("Putung" / "পুটুং" chime or bubble pop)
 * @param {"receive" | "send" | "pop"} mode
 */
export function playPutungSound(mode = "receive") {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        if (mode === "send") {
            // Outgoing message bubble pop sound
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.07);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.1);
            return;
        }

        // Classic "Pu-Tung!" Incoming Notification Pop Chime
        // Step 1: "Pu" (Warm gentle rising swell)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(587.33, now); // D5
        osc1.frequency.exponentialRampToValueAtTime(880.00, now + 0.06); // A5
        gain1.gain.setValueAtTime(0.25, now);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.08);

        // Step 2: "Tung!" (Bright glass chime resonance)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        const oscHarmonic = ctx.createOscillator();
        const gainHarmonic = ctx.createGain();

        osc2.type = "sine";
        osc2.frequency.setValueAtTime(1318.51, now + 0.06); // E6
        osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.35); // D6
        gain2.gain.setValueAtTime(0, now);
        gain2.gain.setValueAtTime(0.35, now + 0.06);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

        oscHarmonic.type = "triangle";
        oscHarmonic.frequency.setValueAtTime(1975.53, now + 0.06); // B6 sparkle
        gainHarmonic.gain.setValueAtTime(0, now);
        gainHarmonic.gain.setValueAtTime(0.12, now + 0.06);
        gainHarmonic.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        oscHarmonic.connect(gainHarmonic);
        gainHarmonic.connect(ctx.destination);

        osc2.start(now + 0.06);
        osc2.stop(now + 0.42);
        oscHarmonic.start(now + 0.06);
        oscHarmonic.stop(now + 0.28);
    } catch (e) {
        console.warn("[SoundManager] playback error:", e);
    }
}

/**
 * Universal sound player that handles synthesized sounds or custom audio files
 */
export function playNotificationSound(soundName = "notification_sound") {
    playPutungSound("receive");
    try {
        const audio = new Audio(`/assets/${soundName}.mp3`);
        audio.play().catch(() => {});
    } catch (_) {}
}

/**
 * Initialize Capacitor Native Push Notifications & Android Channels
 */
export async function initCapacitorPush(userId) {
    const isNative = Capacitor.isNativePlatform();
    console.log(`[SoundManager] Initializing Push. Native: ${isNative}`);

    if (isNative) {
        try {
            // 1. Create Android Notification Channel with custom sound & high importance
            await PushNotifications.createChannel({
                id: 'lynk_notifications',
                name: 'Lynk Alerts',
                description: 'Lynk messages, friend requests, reels, and post alerts',
                sound: 'notification_sound',
                importance: 5,
                visibility: 1,
                vibration: true,
                lights: true,
                lightColor: '#0095F6'
            });

            // 2. Request Permissions
            let permStatus = await PushNotifications.checkPermissions();
            if (permStatus.receive === 'prompt') {
                permStatus = await PushNotifications.requestPermissions();
            }

            if (permStatus.receive !== 'granted') {
                console.warn('[SoundManager] Push notifications permission was not granted');
                return;
            }

            // 3. Register with Apple / Firebase
            await PushNotifications.register();

            // 4. Listeners
            PushNotifications.addListener('registration', async (token) => {
                console.log('[SoundManager] Push Registration Success. Token:', token.value);
                // Subscribe native device token or interest to Pusher Beams if applicable
                if (window.PusherPushNotifications && userId) {
                    window.initPusherBeams?.(userId);
                }
            });

            PushNotifications.addListener('registrationError', (err) => {
                console.error('[SoundManager] Push registration error:', err);
            });

            // 5. Handle Foreground Push Notifications
            PushNotifications.addListener('pushNotificationReceived', (notification) => {
                console.log('[SoundManager] Foreground Push Received:', notification);
                
                // Play custom sound programmatically in foreground
                const sound = notification.data?.sound || notification.sound || 'notification_sound';
                playNotificationSound(sound);

                // Trigger in-app banner toast
                if (window.showPushNotification) {
                    window.showPushNotification({
                        title: notification.title || 'Lynk',
                        body: notification.body || 'New alert',
                        onClick: () => {
                            if (notification.data?.deep_link) {
                                window.location.href = notification.data.deep_link;
                            }
                        }
                    });
                }
            });

            // 6. Handle Background / Closed App Notification Click Action
            PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
                console.log('[SoundManager] Push Action Performed:', notification);
                const data = notification.notification.data;
                if (data && (data.deepLink || data.deep_link)) {
                    window.location.href = data.deepLink || data.deep_link;
                } else if (data?.targetUid) {
                    window.showPage?.("messages");
                }
            });

        } catch (err) {
            console.error('[SoundManager] Capacitor Push Init Error:', err);
        }
    } else {
        // Fallback / Web: Initialize Pusher Beams Web SDK
        if (window.initPusherBeams && userId) {
            window.initPusherBeams(userId);
        }
    }
}

// Ringtone and Dial Tone Synthesizer State
let ringtoneInterval = null;
let dialToneInterval = null;
let ringtoneAudioElement = null;

/**
 * Start Looping Incoming Ringtone (Synthesized Marimba + Vibration)
 */
export function startIncomingRingtone() {
    stopIncomingRingtone();

    // Trigger device vibration pattern if supported on mobile
    if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([500, 250, 500, 1000]);
    }

    const playRingtoneChord = () => {
        try {
            const ctx = getAudioContext();
            if (!ctx) return;
            const now = ctx.currentTime;

            // Musical Marimba-style melodic call ring tone sequence
            const notes = [
                { freq: 523.25, time: 0.00, dur: 0.18 }, // C5
                { freq: 659.25, time: 0.20, dur: 0.18 }, // E5
                { freq: 783.99, time: 0.40, dur: 0.18 }, // G5
                { freq: 1046.50, time: 0.60, dur: 0.35 }, // C6
                { freq: 783.99, time: 0.95, dur: 0.18 }, // G5
                { freq: 1046.50, time: 1.15, dur: 0.50 }  // C6
            ];

            notes.forEach(n => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "triangle";
                osc.frequency.setValueAtTime(n.freq, now + n.time);
                
                gain.gain.setValueAtTime(0, now + n.time);
                gain.gain.linearRampToValueAtTime(0.28, now + n.time + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, now + n.time + n.dur);

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start(now + n.time);
                osc.stop(now + n.time + n.dur);
            });
        } catch (e) {
            console.warn("[SoundManager] ringtone synth error:", e);
        }
    };

    // Play first cycle immediately
    playRingtoneChord();
    // Repeat every 2.4 seconds
    ringtoneInterval = setInterval(() => {
        playRingtoneChord();
        if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate([500, 250, 500, 1000]);
        }
    }, 2400);
}

/**
 * Stop Incoming Ringtone and Vibration
 */
export function stopIncomingRingtone() {
    if (ringtoneInterval) {
        clearInterval(ringtoneInterval);
        ringtoneInterval = null;
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(0);
    }
}

/**
 * Start Outgoing Ringback Dial Tone (Standard phone dial tone "Tuuuuut... Tuuuuut...")
 */
export function startOutgoingRingtone() {
    stopOutgoingRingtone();

    const playDialBeep = () => {
        try {
            const ctx = getAudioContext();
            if (!ctx) return;
            const now = ctx.currentTime;

            // Dual tone 440Hz + 480Hz
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();

            osc1.type = "sine";
            osc2.type = "sine";
            osc1.frequency.setValueAtTime(440, now);
            osc2.frequency.setValueAtTime(480, now);

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
            gain.gain.setValueAtTime(0.12, now + 1.2);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);

            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + 1.3);
            osc2.stop(now + 1.3);
        } catch (e) {
            console.warn("[SoundManager] dial tone error:", e);
        }
    };

    playDialBeep();
    dialToneInterval = setInterval(playDialBeep, 3500);
}

/**
 * Stop Outgoing Ringback Dial Tone
 */
export function stopOutgoingRingtone() {
    if (dialToneInterval) {
        clearInterval(dialToneInterval);
        dialToneInterval = null;
    }
}

// Expose on global window object
if (typeof window !== "undefined") {
    window.SoundManager = {
        playPutungSound,
        playNotificationSound,
        initCapacitorPush,
        startIncomingRingtone,
        stopIncomingRingtone,
        startOutgoingRingtone,
        stopOutgoingRingtone
    };
    window.playPutungSound = playPutungSound;
    window.playNotificationSound = playNotificationSound;
    window.initCapacitorPush = initCapacitorPush;
    window.startIncomingRingtone = startIncomingRingtone;
    window.stopIncomingRingtone = stopIncomingRingtone;
    window.startOutgoingRingtone = startOutgoingRingtone;
    window.stopOutgoingRingtone = stopOutgoingRingtone;
}

