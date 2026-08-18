self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => self.clients.claim());
self.addEventListener("push", (event) => {
  let data = { title: "Lynk", body: "New notification", icon: "https://api.iconify.design/lucide:instagram.svg?color=%23e1306c", url: "/" };
  try {
    if (event.data) data = Object.assign(data, event.data.json());
  } catch (e) {
    try { data.body = event.data.text(); } catch (_) {}
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Lynk", {
      body: data.body || "",
      icon: data.icon || "https://api.iconify.design/lucide:instagram.svg?color=%23e1306c",
      badge: data.icon || "https://api.iconify.design/lucide:instagram.svg?color=%23e1306c",
      data: data,
      tag: data.tag || "lynk-push",
      renotify: true,
      vibrate: [120, 60, 120]
    })
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) {
          await c.focus();
          try { c.postMessage({ type: "NOTIFICATION_CLICK", url: target }); } catch (_) {}
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })()
  );
});
