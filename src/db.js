// Opens the app's IndexedDB. Shared by the page and the service worker so whichever opens it
// first runs the same upgrade and every object store gets created.
const DB_VERSION = 3

export function openDatabase() {
    return new Promise((resolve, reject) => {
        const openRequest = indexedDB.open("musicapp-idb", DB_VERSION);

        openRequest.onerror = (event) => {
            console.error("Error loading IndexedDB", event)
            reject(new Error('Error loading IndexedDB'))
        }

        openRequest.onsuccess = (event) => {
            const db = event.target.result
            // Let a newer version of the app upgrade the database instead of being blocked by us
            db.onversionchange = () => db.close()
            resolve(db)
        }

        openRequest.onupgradeneeded = (event) => {
            const db = event.target.result
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
                case 2: {
                    // Playlists synced with the backend: { id, name, tracks: [path], updated, dirty?, deleted? }
                    if (!db.objectStoreNames.contains("playlists")) {
                        db.createObjectStore("playlists", { keyPath: "id" });
                    }
                }
            }
            // Don't resolve here: the upgrade transaction is still running, so the database can't
            // be used yet. onsuccess fires once the upgrade has finished.
            console.info(`IndexedDB upgrade completed`)
        }
    })
}
