import { openDatabase } from './db.js'

// IndexedDB helpers
export function openSettingsDB() {
  return openDatabase();
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

// Count the distinct keys of an index, e.g. how many different artists there are
function countUnique(index) {
  return new Promise((resolve, reject) => {
    let count = 0;
    const req = index.openKeyCursor(null, 'nextunique');
    req.onsuccess = () => {
      if (!req.result) return resolve(count);
      count++;
      req.result.continue();
    };
    req.onerror = reject;
  });
}

function countAll(store) {
  return new Promise((resolve, reject) => {
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;
  });
}

function getAll(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;
  });
}

// Totals for the synced library, as of the last sync
export async function getLibraryStats() {
  const db = await openDatabase();
  const tx = db.transaction(['tracks', 'playlists'], 'readonly');
  const tracks = tx.objectStore('tracks');
  const [artists, albums, trackCount, playlists] = await Promise.all([
    countUnique(tracks.index('artist')),
    countUnique(tracks.index('artist_album')),
    countAll(tracks),
    getAll(tx.objectStore('playlists')),
  ]);
  return { artists, albums, tracks: trackCount, playlists: playlists.filter(playlist => !playlist.deleted).length };
}
