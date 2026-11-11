// U N I CHAT — Service Worker

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

// Receive push notifications
self.addEventListener("push", event => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      body: event.data ? event.data.text() : "You have a new message."
    };
  }

  const title = payload.title || "u n i chat 💗";

  const options = {
    body: payload.body || "You received a new message.",
    data: {
      url: payload.url || "./"
    },
    tag: payload.tag || "uni-chat-message",
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Open the app when a notification is tapped
self.addEventListener("notificationclick", event => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || "./",
    self.location.origin
  ).href;

  event.waitUntil(
    self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(clients => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin)) {
          return client.focus();
        }
      }

      return self.clients.openWindow(targetUrl);
    })
  );
});
