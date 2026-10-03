import { cleanupOutdatedCaches, precacheAndRoute, matchPrecache, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { openDB, deleteDB, wrap, unwrap } from 'idb';
import { songUrl } from './song_url.js'
import { openDatabase } from './db.js'

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
        case 'get_playlists': {
            event.source.postMessage({
                type: 'playlists',
                playlists: await list_playlists()
            })
            break;
        }
        case 'get_playlist': {
            event.source.postMessage({
                type: 'playlist',
                id: event.data.id,
                playlist: await get_playlist(event.data.id)
            })
            break;
        }
        case 'save_playlist': {
            await save_playlist(event.data.playlist)
            break;
        }
        case 'add_to_playlist': {
            await add_to_playlist(event.data.id, event.data.tracks)
            break;
        }
        case 'delete_playlist': {
            await delete_playlist(event.data.id)
            break;
        }
        case 'sync_playlists': {
            // Quick sync of just the playlists, e.g. when the playlists page opens. Fails quietly offline.
            await sync_playlists().catch(err => console.info('Playlist sync failed', err.message))
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

async function setSetting(key, value) {
    const db = wrap(await initDatabase());
    await db.put('settings', { key, value });
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

// Playlists are kept in IndexedDB and synced with the backend's playlists folder.
// Changes are saved locally first and marked dirty, then pushed; anything that can't be
// pushed (e.g. offline) stays dirty and is pushed on the next sync.

async function list_playlists() {
    const db = wrap(await initDatabase())
    const playlists = (await db.getAll('playlists')).filter(playlist => !playlist.deleted)
    playlists.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

    const tracks = db.transaction('tracks').store
    return Promise.all(playlists.map(async playlist => {
        // Show the art of the first track that has some
        let cover_art = ''
        for (const path of playlist.tracks) {
            cover_art = (await tracks.get(path))?.cover_art
            if (cover_art) break
        }
        return { id: playlist.id, name: playlist.name, count: playlist.tracks.length, cover_art: cover_art || '' }
    }))
}

// A playlist with its track paths resolved to full track records. Tracks no longer in the
// library are kept (so they come back if the file returns) but marked missing.
async function get_playlist(id) {
    const db = wrap(await initDatabase())
    const playlist = await db.get('playlists', id)
    if (!playlist || playlist.deleted) return null

    const store = db.transaction('tracks').store
    const records = await Promise.all(playlist.tracks.map(path => store.get(path)))

    const root_url = await getSetting('aural_backend_url') || ''
    const cache = await caches.open('song')
    const tracks = await Promise.all(playlist.tracks.map(async (path, index) => {
        const track = records[index]
        if (!track) {
            const [artist, album, ...rest] = path.split('/')
            return { path, artist, album, track: rest.join('/'), missing: true }
        }
        return { ...track, available_offline: Boolean(await cache.match(songUrl(root_url, path))) }
    }))
    return { id: playlist.id, name: playlist.name, tracks }
}

async function save_playlist({ id, name, tracks }) {
    const db = wrap(await initDatabase())
    await db.put('playlists', { id, name, tracks, updated: Date.now(), dirty: true })
    await notifyClients({ type: 'playlists_update', id })
    await push_playlists().catch(err => console.info('Playlist push failed, will retry on sync', err.message))
}

async function add_to_playlist(id, paths) {
    const db = wrap(await initDatabase())
    const playlist = await db.get('playlists', id)
    if (!playlist || playlist.deleted) return
    await save_playlist({ ...playlist, tracks: [...playlist.tracks, ...paths] })
}

async function delete_playlist(id) {
    const db = wrap(await initDatabase())
    const playlist = await db.get('playlists', id)
    if (!playlist) return
    await db.put('playlists', { ...playlist, updated: Date.now(), dirty: true, deleted: true })
    await notifyClients({ type: 'playlists_update', id })
    await push_playlists().catch(err => console.info('Playlist push failed, will retry on sync', err.message))
}

// Send local changes to the backend. Runs one at a time so the same change isn't sent twice.
let pushInProgress = Promise.resolve()

function push_playlists() {
    const push = pushInProgress.then(run_push_playlists)
    pushInProgress = push.catch(() => {})
    return push
}

async function run_push_playlists() {
    const root_url = await getSetting('aural_backend_url') || ''
    if (!root_url) return

    const db = wrap(await initDatabase())
    const dirty = (await db.getAll('playlists')).filter(playlist => playlist.dirty)
    for (const playlist of dirty) {
        const url = `${root_url}/playlists/${encodeURIComponent(playlist.id)}`
        const response = playlist.deleted
            ? await fetchWithAuth(url, { method: 'DELETE' })
            : await fetchWithAuth(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: playlist.name, tracks: playlist.tracks, updated: playlist.updated }),
            })
        if (!response.ok) throw new Error(`Backend returned ${response.status} ${response.statusText}`)

        // Only mark it clean if it wasn't changed again while we were sending it
        const tx = db.transaction('playlists', 'readwrite')
        const current = await tx.store.get(playlist.id)
        if (current && current.updated === playlist.updated) {
            if (current.deleted) {
                tx.store.delete(playlist.id)
            } else {
                tx.store.put({ ...current, dirty: false })
            }
        }
        await tx.done
    }
}

// Push local changes, then replace everything else with the backend's copy
async function sync_playlists() {
    const root_url = await getSetting('aural_backend_url') || ''
    if (!root_url) return

    await push_playlists()

    const response = await fetchWithAuth(`${root_url}/playlists?time=${Date.now()}`)
    if (!response.ok) throw new Error(`Backend returned ${response.status} ${response.statusText}`)
    const remote = await response.json()
    if (!Array.isArray(remote)) throw new Error('Unexpected playlists response from backend')

    const db = wrap(await initDatabase())
    const tx = db.transaction('playlists', 'readwrite')
    const local = new Map((await tx.store.getAll()).map(playlist => [playlist.id, playlist]))
    const remoteIds = new Set(remote.map(playlist => playlist.id))
    for (const playlist of remote) {
        // A local change made since the push wins; it'll be pushed next time
        if (local.get(playlist.id)?.dirty) continue
        tx.store.put({ id: playlist.id, name: playlist.name, tracks: playlist.tracks, updated: playlist.updated, dirty: false })
    }
    for (const playlist of local.values()) {
        // Deleted on another device
        if (!playlist.dirty && !remoteIds.has(playlist.id)) tx.store.delete(playlist.id)
    }
    await tx.done

    await notifyClients({ type: 'playlists_update' })
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

        bc.postMessage('Syncing Playlists')
        await sync_playlists()

        console.log('Sync complete', { added_or_changed: puts.length, removed: deletes.length })
        await setSetting('last_sync', Date.now())
        bc.postMessage('Sync Complete')
        await notifyClients({ type: 'sync_complete' })
    } catch (err) {
        console.error('Sync failed', err)
        bc.postMessage(`Sync failed: ${err.message}`)
        await notifyClients({ type: 'sync_complete', error: err.message })
    }
}



function initDatabase() {
    return openDatabase()
}
