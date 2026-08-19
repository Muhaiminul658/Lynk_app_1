importScripts("https://js.pusher.com/beams/service-worker.js");

PusherPushNotifications.onNotificationReceived = (payload) => {
  console.log("[Pusher Beams] Notification received in Service Worker:", payload);
};
