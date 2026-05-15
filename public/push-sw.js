// Service Worker for Push Notifications
self.addEventListener("push", (event) => {
  let title = "Push";
  let options = { body: "빈 메시지", icon: "/next.svg" };

  if (event.data) {
    try {
      const payload = event.data.json();
      title = payload.title || title;
      options.body = payload.body || options.body;
      if (payload.url) {
        options.data = { url: payload.url };
      }
    } catch {
      // JSON 파싱 실패 시 plain text로 처리
      options.body = event.data.text();
    }
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

// 알림 클릭 시 url로 이동
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  if (url) {
    event.waitUntil(clients.openWindow(url));
  }
});
