import { cleanupOutdatedCaches, precacheAndRoute, matchPrecache, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing';
import {albumArt} from './album_art.js'
import {CacheFirst} from 'workbox-strategies';
import { openDB, deleteDB, wrap, unwrap } from 'idb';

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

registerRoute(
    ({url}) => url.host === 'i.scdn.co',
    new CacheFirst()
  );



const bc = new BroadcastChannel("status");



self.addEventListener('install', async () => {
    bc.postMessage('Installing')
});

self.addEventListener('activate', event => {
    bc.postMessage('Updated')
});


self.addEventListener('fetch', async function (event) {
    const url = new URL(event.request.url)
    if (event.request.url.includes('/song/')) {

        if (event.request.headers.get('range')) {
            event.respondWith(returnRangeRequest(event.request, 'song'));
        } else {
            event.respondWith((async () => {
                // Cache, with fallback to network and cache response
                const cache = await caches.open('song')
                let response = await cache.match(event.request)
                if(!response) {
                    bc.postMessage(`Fetch ${url.pathname.replace('/song/', '')}`)
                    // Use fetchWithAuth here
                    response = await fetchWithAuth(event.request.url)
                    await cache.put(event.request, response.clone())

                    self.clients.matchAll().then(all => all.map(client => client.postMessage({
                        type: 'cache_update',
                        song: event.request.url
                    })))
                    
                    bc.postMessage(``)
                }
                return response
            })())
        } 
        
    } else {
        const root_url = await getSetting('aural_backend_url') || '';
        if (root_url && event.request.url.indexOf(root_url) !== -1) {
            console.log('Fallback fetching', event.request.url, url.pathname)
            // Network only with cache fallback (only works for cached resources)
            event.respondWith((async () => {
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
    }
});


async function returnRangeRequest(request, cacheName) {
    const cache = await caches.open(cacheName)
    let response = await cache.match(request.url);
    if(!response) {
        // Was fetch(request), but we need to cache the entire file, not stream it    
        const url = new URL(request.url)            
        bc.postMessage(`Fetch ${url.pathname.replace('/song/', '')}`)
        // Use fetchWithAuth here
        response = await fetchWithAuth(request.url)
        bc.postMessage(``)
        const clonedRes = response.clone();
        await cache.put(request.url, clonedRes)

        self.clients.matchAll().then(all => all.map(client => client.postMessage({
            type: 'cache_update',
            song: request.url
        })))
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const bytes = /^bytes=(\d+)-(\d+)?$/g.exec( request.headers.get('range') );
    if (bytes) {
        const start = Number(bytes[1]);
        const end = Number(bytes[2]) || arrayBuffer.byteLength - 1;
        return new Response(arrayBuffer.slice(start, end + 1), {
            status: 206,
            statusText: 'Partial Content',
            headers: [
                ['Content-Range', `bytes ${start}-${end}/${arrayBuffer.byteLength}`]
            ]
        });
    } else {
        return new Response(null, {
            status: 416,
            statusText: 'Range Not Satisfiable',
            headers: [
                ['Content-Range', `*/${arrayBuffer.byteLength}`]
            ]
        });
    }
}



self.addEventListener('message', async event => {
    console.info('[SW]', event.data.action)
    switch (event.data.action) {
        case 'sync_tracks': {
            await sync_tracks()
            event.source.postMessage({
                type: 'sync_complete'
            })
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
            const db = await initDatabase()
            const tx = db.transaction('tracks', 'readwrite')
            const store = tx.objectStore('tracks')
            const track = event.data.track
            console.log('SW delete from catch', track)
            caches.open('song').then(cache => cache.delete(`/song/${track.path}`))
            event.source.postMessage({
                type: 'cache_update',
            })
        }
    }
})

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
    const db = await initDatabase()

    const data = await new Promise((resolve, reject) => {

        const results = []
        const promises = []
        const range = IDBKeyRange.bound([artist, album], [artist, album])
        const request = db.transaction('tracks', 'readonly').objectStore('tracks').index('artist_album').openCursor(range)
        request.onsuccess = async (event) => {
            const cursor = event.target.result
            if(cursor) {
                const track = cursor.value
                // Check cached version matches length
                promises.push(caches.match(`/song/${track.path}`).then(async response => {
                    console.log('TTT', response, track.size)
                    if(response && response.headers.get('Content-Length') != track.size){         
                        console.log('Clearing cache due to unmatching sizes', track.path)
                        promises.push(caches.open('song').then(cache => cache.delete(`/song/${track.path}`).then(del => console.log('Deleted:', track.path, del))))
                    }
                }))
                results.push(track)
                cursor.continue()
            } else {
                results.sort((a, b) => parseInt(a.track) - parseInt(b.track))
                console.log('TRACKS', results)
                await Promise.all(promises)
                resolve(results)
            }
        }
        request.onerror = reject
    })

    const root_url = await getSetting('aural_backend_url') || '';

    return Promise.all(data.map(async track => {
        track.available_offline = await caches.match(`${root_url}/song/${artist}/${album}/${track.track}`).then(Boolean)
        return track
    }))
}

async function sync_tracks() {

    bc.postMessage('Init Database')

    const db = wrap(await initDatabase())

    bc.postMessage('Fetching Data')
    const root_url = await getSetting('aural_backend_url') || '';

    // Use fetchWithAuth here
    const response = await fetchWithAuth(`${root_url}/artists?time=${Date.now()}`)
    if (!response.status === 200) {        
        bc.postMessage('Fetch ERROR')
        throw new Error('Error fetching tracks');
    }
    
    bc.postMessage('Fetch Complete')

    const data = await response.json()

    const promises = []

    bc.postMessage('Clearing Database')

    bc.postMessage('Processing Artists')
    for(const artist of data) {
        bc.postMessage(`Processing ${artist.artist}`)
        for (const album of artist.albums) {
            const range = IDBKeyRange.bound([artist.artist, album.album], [artist.artist, album.album])
            let cursor = await db.transaction('tracks').store.index('artist_album').openCursor(range)
            
            const tracks = []
            const existing_album_art = null;
            while(cursor) {
                console.log(cursor.value)
                tracks.push(cursor.value.path)
                existing_album_art = cursor.value.cover_art;
                cursor = await cursor.continue()
            }
                     
            if(JSON.stringify(tracks) == JSON.stringify(album.tracks.map(track => `${artist.artist}/${album.album}/${track.track}`))) {
                // Skip this album
                bc.postMessage(`SKIP ${album.album}`)
                console.log(`SKIP ${album.album}`)
            } else {
                
                bc.postMessage(`Processing ${artist.artist} - ${album.album}`)
                console.log(`ADD ${album.album}`)
                // Delete and add this album?
                let art = '';
                if(album.cover_art){
                    art = `${root_url}/${album.cover_art}`;
                    // Only check spotify if the stored album doesnt already have cover_art
                } else if(!existing_album_art) {
                    try {
                    art = await albumArt(artist.artist, { album: album.album})
                    } catch(e) {
                        console.error('Error fetching album art', e)
                    }
                }

                for (const track of album.tracks) {
                    await db.put('tracks', {
                        path: `${artist.artist}/${album.album}/${track.track}`,
                        artist: artist.artist,
                        album: album.album,
                        track: track.track,
                        size: track.size,
                        cover_art: art
                    })
                }

                // Get tracks from this album, and delete any which are not in the current list
                const range = IDBKeyRange.bound([artist.artist, album.album], [artist.artist, album.album])
                let cursor = await db.transaction('tracks').store.index('artist_album').openCursor(range)
                while(cursor) {
                    if(!album.tracks.find(track => track.track == cursor.value.track)) {
                        console.log('DELETE', cursor.value)
                        await db.delete('tracks', cursor.value.path)
                    }
                    cursor = await cursor.continue()
                }
                

                console.log('Finished adding album')
            }
        }
    }
    bc.postMessage('Sync Complete')

    self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({
            type: 'sync_complete'
        }));
    })
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
            console.info(`IndexedDB upgrade completed`)
            resolve(db)
        }
    })
}