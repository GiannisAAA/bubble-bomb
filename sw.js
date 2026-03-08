// インストール時の処理
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installed');
});

// アクティベート時の処理
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activated');
});

// ネットワークリクエストの処理（PWAとして認識させるために必要なおまじない）
self.addEventListener('fetch', (event) => {
  // ここを空にしておくと、常に最新のネット上のファイルを読み込みます
});
