import { cleanupOutdatedCaches, precacheAndRoute, matchPrecache, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { openDB, deleteDB, wrap, unwrap } from 'idb';
import { songUrl } from './song_url.js'

self.addEventListener('install', async event => {
    console.log('SERVICE WORKER installing…');

    const channel = new BroadcastChannel('sw-messages');
    channel.postMessage({ title: 'installing_update' });
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING')
        self.skipWaiting()
});

cleanupOutdatedCaches()


precacheAndRoute(self.__WB_MANIFEST)

// registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))




const bc = new BroadcastChannel("status");



self.addEventListener('install', async () => {
    bc.postMessage('Installing')
});

self.addEventListener('activate', event => {
    bc.postMessage('Updated')
});


// respondWith() must be called synchronously, so decide which requests to handle
// from the URL alone, and check the backend URL setting inside the response promise
self.addEventListener('fetch', function (event) {
    const url = new URL(event.request.url)
    if (url.pathname.includes('/song/')) {
        event.respondWith(songResponse(event.request))
    } else if (url.origin !== self.location.origin) {
        event.respondWith((async () => {
            const root_url = await getSetting('aural_backend_url') || '';
            if (!root_url || !event.request.url.startsWith(root_url)) {
                return fetch(event.request)
            }
            console.log('Fallback fetching', event.request.url, url.pathname)
            // Network only with cache fallback (only works for cached resources)
            try {
                // Try network fetch with auth
                const networkResponse = await fetchWithAuth(event.request);
                // Cache successful responses for offline fallback
                if (networkResponse && networkResponse.ok) {
                    const cache = await caches.open('runtime');
                    cache.put(event.request, networkResponse.clone()).catch(() => {});
                }
                return networkResponse;
            } catch (err) {
                // Network failed — fall back to cache (only works for previously cached resources)
                const cached = await caches.match(event.request);
                if (cached) return cached;
                return new Response('Offline', { status: 504, statusText: 'Gateway Timeout' });
            }
        })());
    }
});


// Songs and album art: serve the whole file from the cache, downloading and caching it first
// if needed. Only successful downloads are cached, so an error can't get stuck in the cache.
const songDownloads = new Map()

async function cachedSong(url) {
    const cache = await caches.open('song')
    const cached = await cache.match(url)
    if (cached) return cached

    // The player often makes several range requests at once; download the file only once
    if (!songDownloads.has(url)) {
        songDownloads.set(url, (async () => {
            bc.postMessage(`Fetch ${decodeURIComponent(new URL(url).pathname.replace(/.*\/song\//, ''))}`)
            try {
                const response = await fetchWithAuth(url)
                if (response.status === 200) {
                    await cache.put(url, response.clone())
                    notifyClients({ type: 'cache_update', song: url })
                }
                return response
            } finally {
                bc.postMessage(``)
                songDownloads.delete(url)
            }
        })())
    }
    return (await songDownloads.get(url)).clone()
}

async function songResponse(request) {
    const response = await cachedSong(request.url)

    const range = request.headers.get('range')
    if (!range || !response.ok) return response

    const arrayBuffer = await response.arrayBuffer();
    const size = arrayBuffer.byteLength
    const bytes = /^bytes=(\d+)-(\d+)?$/.exec(range);
    const start = bytes ? Number(bytes[1]) : 0
    const end = bytes && bytes[2] ? Math.min(Number(bytes[2]), size - 1) : size - 1
    if (!bytes || start > end) {
        return new Response(null, {
            status: 416,
            statusText: 'Range Not Satisfiable',
            headers: [
                ['Content-Range', `bytes */${size}`]
            ]
        });
    }
    return new Response(arrayBuffer.slice(start, end + 1), {
        status: 206,
        statusText: 'Partial Content',
        headers: [
            ['Content-Type', response.headers.get('Content-Type') || ''],
            ['Content-Length', `${end - start + 1}`],
            ['Content-Range', `bytes ${start}-${end}/${size}`]
        ]
    });
}

function notifyClients(message) {
    return self.clients.matchAll().then(clients => clients.forEach(client => client.postMessage(message)))
}



self.addEventListener('message', event => {
    // waitUntil keeps the service worker alive until the work is done (e.g. a long sync)
    event.waitUntil(handleMessage(event).catch(err => console.error('[SW]', event.data.action, err)))
})

async function handleMessage(event) {
    console.info('[SW]', event.data.action)
    switch (event.data.action) {
        case 'sync_tracks': {
            // sync_tracks tells every client when it's done
            await sync_tracks()
            break;
        }
        case 'get_artists': {
            const artists = await list_artists()
            event.source.postMessage({
                type: 'artists',
                artists: artists
            })
            break;
        }
        case 'get_artist_albums': {
            const albums = await list_artist_albums(event.data.artist)
            event.source.postMessage({
                type: 'artist_albums',
                artist: event.data.artist,
                albums: albums
            })
            break;
        }
        case 'get_artist_album': {
            const tracks = await get_artist_album(event.data.artist, event.data.album)
            event.source.postMessage({
                type: 'artist_album',
                artist: event.data.artist,
                album: event.data.album,
                tracks: tracks
            })
            break;
        }
        case 'delete_track': {
            const root_url = await getSetting('aural_backend_url') || '';
            const track = event.data.track
            console.log('SW delete from cache', track)
            await caches.open('song').then(cache => cache.delete(songUrl(root_url, track.path)))
            event.source.postMessage({
                type: 'cache_update',
            })
            break;
        }
    }
}

async function list_artists() {
    const db = await initDatabase()

    return new Promise((resolve, reject) => {
        const results = {}

        const request = db.transaction('tracks', 'readonly').objectStore('tracks').index('artist').openCursor()
        request.onsuccess = (event) => {
            const cursor = event.target.result
            if(cursor) {
                if(!results[cursor.value.artist]) {
                    results[cursor.value.artist] = {}
                }
                cursor.continue()
            } else {
                resolve(Object.keys(results))
            }
        }
        request.onerror = reject
    })
}

async function list_artist_albums(artist) {
    const db = await initDatabase()

    return new Promise((resolve, reject) => {
        const results = {}

        const range = IDBKeyRange.bound(artist, artist)
        const request = db.transaction('tracks', 'readonly').objectStore('tracks').index('artist').openCursor(range)
        request.onsuccess = (event) => {
            const cursor = event.target.result
            if(cursor) {
                if(!results[cursor.value.album]) {
                    results[cursor.value.album] = cursor.value
                }
                cursor.continue()
            } else {
                resolve(results)
            }
        }
        request.onerror = reject
    })
}

// Utility to get a setting from the settings object store
async function getSetting(key) {
    const db = await initDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('settings', 'readonly');
        const store = tx.objectStore('settings');
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : '');
        req.onerror = reject;
    });
}

// Utility to fetch with Bearer token
async function fetchWithAuth(url, options = {}) {
    const token = await getSetting('security_token');
    const headers = new Headers(options.headers || {});
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(url, { ...options, headers });
}

async function get_artist_album(artist, album) {
    const db = wrap(await initDatabase())
    const root_url = await getSetting('aural_backend_url') || '';

    const tracks = await db.getAllFromIndex('tracks', 'artist_album', [artist, album])
    tracks.sort((a, b) => parseInt(a.track) - parseInt(b.track))

    const cache = await caches.open('song')
    return Promise.all(tracks.map(async track => {
        const url = songUrl(root_url, track.path)
        const cached = await cache.match(url)
        const length = cached?.headers.get('Content-Length')
        // The file changed on the server since it was cached, so drop the old copy
        if (cached && length !== null && length != track.size) {
            console.log('Clearing cache due to unmatching sizes', track.path)
            await cache.delete(url)
            track.available_offline = false
        } else {
            track.available_offline = Boolean(cached)
        }
        return track
    }))
}

// Sync the local track list with the backend. If a sync is already running, wait for that one.
let syncInProgress = null

function sync_tracks() {
    if (!syncInProgress) {
        syncInProgress = run_sync().finally(() => { syncInProgress = null })
    }
    return syncInProgress
}

async function run_sync() {
    try {
        bc.postMessage('Fetching Data')
        const root_url = await getSetting('aural_backend_url') || '';

        const response = await fetchWithAuth(`${root_url}/artists?time=${Date.now()}`)
        if (!response.ok) {
            throw new Error(`Backend returned ${response.status} ${response.statusText}`)
        }
        const data = await response.json()
        if (!Array.isArray(data)) {
            throw new Error('Unexpected response from backend')
        }

        bc.postMessage('Processing Artists')

        // What the local track list should look like after the sync
        const wanted = new Map()
        for (const artist of data) {
            for (const album of artist.albums) {
                const cover_art = album.cover_art ? `${root_url}/${album.cover_art}` : ''
                for (const track of album.tracks) {
                    const path = `${artist.artist}/${album.album}/${track.track}`
                    wanted.set(path, {
                        path,
                        artist: artist.artist,
                        album: album.album,
                        track: track.track,
                        size: track.size,
                        cover_art
                    })
                }
            }
        }

        const db = wrap(await initDatabase())
        const existing = new Map((await db.getAll('tracks')).map(track => [track.path, track]))

        const puts = [...wanted.values()].filter(track => {
            const old = existing.get(track.path)
            return !old || old.size !== track.size || old.cover_art !== track.cover_art
        })
        const deletes = [...existing.keys()].filter(path => !wanted.has(path))

        // Cached copies of removed or changed files are out of date
        const stale = [...deletes, ...puts.filter(track => existing.has(track.path) && existing.get(track.path).size !== track.size).map(track => track.path)]

        bc.postMessage(`Saving ${puts.length} changed, removing ${deletes.length} old tracks`)

        // Apply every change in one transaction, so the list is never left half-updated
        const tx = db.transaction('tracks', 'readwrite')
        for (const track of puts) tx.store.put(track)
        for (const path of deletes) tx.store.delete(path)
        await tx.done

        const cache = await caches.open('song')
        await Promise.all(stale.map(path => cache.delete(songUrl(root_url, path))))

        console.log('Sync complete', { added_or_changed: puts.length, removed: deletes.length })
        bc.postMessage('Sync Complete')
        await notifyClients({ type: 'sync_complete' })
    } catch (err) {
        console.error('Sync failed', err)
        bc.postMessage(`Sync failed: ${err.message}`)
        await notifyClients({ type: 'sync_complete', error: err.message })
    }
}



function initDatabase() {
    return new Promise((resolve, reject) => {
        const DB_VERSION = 2 // Incremented version

        let db = null;

        const openRequest = indexedDB.open("musicapp-idb", DB_VERSION);

        openRequest.onerror = (event) => {
            console.error("Error loading IndexedDB", event)
            reject(new Error('Error loading IndexedDB'))
        }

        openRequest.onsuccess = (event) => {
            db = event.target.result
            console.info('IndexedDB loaded')
            resolve(db)
        }

        openRequest.onupgradeneeded = (event) => {
            db = event.target.result
            console.info(`Upgrading IndexedDB from ${event.oldVersion} to ${DB_VERSION}`)

            // Upgrade based on the current db version, put em in order, dont use break statements, 
            // and that last entry should be 1 number lower than the current version defined above
            // also start at zero for the first version (v = 1)
            switch(event.oldVersion) {
                case 0: {
                    const tracks = db.createObjectStore("tracks", {
                        keyPath: "path"
                    })
                    tracks.createIndex("artist", "artist", {
                        unique: false
                    });
                    tracks.createIndex("album", "album", {
                        unique: false
                    });
                    tracks.createIndex("artist_album", ['artist', 'album'], {
                        unique: false
                    });
                    tracks.createIndex("track", "track", {
                        unique: false
                    });
                    // falls through to next case for further upgrades
                }
                case 1: {
                    // Add settings store: key => value
                    if (!db.objectStoreNames.contains("settings")) {
                        db.createObjectStore("settings", { keyPath: "key" });
                    }
                }
            }
            // Don't resolve here: the upgrade transaction is still running, so the database can't
            // be used yet. onsuccess fires once the upgrade has finished.
            console.info(`IndexedDB upgrade completed`)
        }
    })
}