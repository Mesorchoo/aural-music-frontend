
// IndexedDB helpers
export function openSettingsDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('musicapp-idb', 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
  });
}

export function getSetting(key) {
  return openSettingsDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : '');
      req.onerror = reject;
    });
  });
}

export function setSetting(key, value) {
  return openSettingsDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      const req = store.put({ key, value });
      req.onsuccess = () => resolve();
      req.onerror = reject;
    });
  });
}