<template>
    <div class="playlists-page">
        <header>
            <h1>Playlists</h1>
            <button type="button" class="new" @click="newPlaylist">+ New</button>
        </header>

        <RouterLink v-for="playlist in state.playlists" :key="playlist.id" class="playlist" :to="{ name: 'playlist', params: { id: playlist.id } }">
            <div class="cover">
                <img v-if="playlist.cover_art && !state.brokenArt[playlist.id]" :src="playlist.cover_art" alt=""
                    loading="lazy" decoding="async" @error="state.brokenArt[playlist.id] = true">
                <span v-else class="placeholder" aria-hidden="true">{{ playlist.name[0] }}</span>
            </div>
            <span class="name">{{ playlist.name }}</span>
            <span class="count">{{ playlist.count }} {{ playlist.count === 1 ? 'track' : 'tracks' }}</span>
        </RouterLink>

        <p v-if="state.loaded && !state.playlists.length" class="empty">
            No playlists yet. Create one here, or add tracks from an album.
        </p>
    </div>

    <Teleport to="#page-footer">
        <div class="footer-controls">
            <RouterLink :to="{ name: 'artists' }">Artists</RouterLink>
        </div>
    </Teleport>
</template>

<script setup>
import { reactive, inject, onBeforeMount, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { requestPlaylists, syncPlaylists, createPlaylist } from '../playlists'

const restoreScroll = inject('restoreScroll', () => {})
const router = useRouter()

const state = reactive({
    playlists: [],
    brokenArt: {},
    loaded: false,
});

async function newPlaylist() {
    const name = prompt('Playlist name')?.trim()
    if (!name) return
    const id = await createPlaylist(name)
    router.push({ name: 'playlist', params: { id } })
}

function onMessage(event) {
    if (event.data.type === 'playlists') {
        const firstLoad = !state.loaded
        state.playlists = event.data.playlists
        state.loaded = true
        if (firstLoad) restoreScroll()
    }
    if (event.data.type === 'playlists_update' || event.data.type === 'sync_complete') {
        requestPlaylists()
    }
}

onBeforeMount(() => {
    navigator.serviceWorker.addEventListener('message', onMessage)
    requestPlaylists()
    // Pick up changes made on other devices
    syncPlaylists()
});

onBeforeUnmount(() => {
    navigator.serviceWorker.removeEventListener('message', onMessage)
});
</script>

<style scoped>
.playlists-page {
    padding:1.5rem min(2rem, 4vw) 2rem;
    color:#fff;
}

header {
    display:flex;
    align-items:center;
    justify-content:space-between;
    margin-bottom:1rem;
}
h1 {
    margin:0;
    font-size:1.6rem;
    font-weight:600;
}
.new {
    background-color:#fff2;
    border:none;
    border-radius:0.5rem;
    color:#fff;
    font-size:0.95rem;
    padding:0.5rem 1rem;
}

a.playlist {
    display:grid;
    grid-template-columns:3rem 1fr auto;
    align-items:center;
    gap:0.75rem;
    min-height:3.5rem;
    padding:0.25rem 0;
    color:#fff;
    text-decoration:none;
    border-bottom:solid 1px #fff1;
}
a.playlist:active {
    background-color:#fff1;
}

.cover {
    width:3rem;
    aspect-ratio:1;
    border-radius:0.35rem;
    overflow:hidden;
    background-color:#fff1;
}
.cover img {
    width:100%;
    height:100%;
    object-fit:cover;
    display:block;
}
.placeholder {
    width:100%;
    height:100%;
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:1.25rem;
    font-weight:600;
    color:#fff5;
    background-image:linear-gradient(135deg, #fff2, #fff0);
}
.name {
    min-width:0;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    font-size:1.05rem;
}
.count {
    font-size:0.85rem;
    color:#fff9;
}

.empty {
    color:#fffa;
}
</style>
