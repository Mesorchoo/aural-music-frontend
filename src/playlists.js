// Playlist changes go through the service worker, which saves them locally and pushes them to the backend

function postToWorker(message) {
    return navigator.serviceWorker.ready.then(registration => registration.active.postMessage(message))
}

export function requestPlaylists() {
    return postToWorker({ action: 'get_playlists' })
}

export function requestPlaylist(id) {
    return postToWorker({ action: 'get_playlist', id })
}

export function syncPlaylists() {
    return postToWorker({ action: 'sync_playlists' })
}

// tracks is a list of track paths ("Artist/Album/01 Track.opus")
export function savePlaylist({ id, name, tracks }) {
    return postToWorker({ action: 'save_playlist', playlist: { id, name, tracks: [...tracks] } })
}

export function createPlaylist(name, tracks = []) {
    const id = crypto.randomUUID()
    return savePlaylist({ id, name, tracks }).then(() => id)
}

export function deletePlaylist(id) {
    return postToWorker({ action: 'delete_playlist', id })
}

export function addToPlaylist(id, tracks) {
    return postToWorker({ action: 'add_to_playlist', id, tracks: [...tracks] })
}
