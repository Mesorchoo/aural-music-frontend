<template>
    <div class="artist-page">
        <header>
            <h1>{{ props.artist }}</h1>
            <p v-if="state.loaded" class="count">{{ albumNames.length }} {{ albumNames.length === 1 ? 'album' : 'albums' }}</p>
        </header>

        <div class="albums">
            <RouterLink v-for="album in albumNames" :key="album" class="album" :to="{ name: 'album', params: { artist: props.artist, album: album }}">
                <div class="cover">
                    <img v-if="state.albums[album].cover_art && !state.brokenArt[album]" :src="state.albums[album].cover_art" alt=""
                        loading="lazy" decoding="async" @error="state.brokenArt[album] = true">
                    <span v-else class="placeholder" aria-hidden="true">{{ album[0] }}</span>
                </div>
                <span class="name">{{ album }}</span>
            </RouterLink>
        </div>
    </div>

    <Teleport to="#page-footer">
        <div class="footer-controls">
            <RouterLink :to="{ name: 'artists' }">Artists</RouterLink>
        </div>
    </Teleport>
</template>

<script setup>
import { reactive, computed, inject, onBeforeMount, onBeforeUnmount } from 'vue'

const restoreScroll = inject('restoreScroll', () => {})

const props = defineProps({
    artist: {},
});

const state = reactive({
    albums: {},
    brokenArt: {},
    loaded: false,
});

const albumNames = computed(() => Object.keys(state.albums))

function onArtistUpdate (event) {
    console.info('From SW', event.data)
    if(event.data.type === 'artist_albums' && event.data.artist === props.artist) {
        const firstLoad = !state.loaded
        state.albums = event.data.albums
        state.loaded = true
        if (firstLoad) restoreScroll()
    }
}


onBeforeMount(() => {
    navigator.serviceWorker.addEventListener('message', onArtistUpdate)
    navigator.serviceWorker.ready.then( registration => {
        registration.active.postMessage({
            action: 'get_artist_albums',
            artist: props.artist
        });
    })
});

onBeforeUnmount(() => {
    navigator.serviceWorker.removeEventListener('message', onArtistUpdate)
});

</script>

<style scoped>

.artist-page {
    padding:1.5rem min(2rem, 4vw) 2rem;
    color:#fff;
}

header {
    margin-bottom:1.25rem;
}
h1 {
    margin:0;
    font-size:1.6rem;
    font-weight:600;
    line-height:1.2;
}
.count {
    margin:0.25rem 0 0;
    font-size:0.85rem;
    color:#fff9;
}

.albums {
    display:grid;
    grid-template-columns: repeat(auto-fill, minmax(min(9rem, 40vw), 1fr));
    gap:1.25rem 1rem;
}

a.album {
    display:flex;
    flex-direction:column;
    gap:0.5rem;
    color:#fff;
    text-decoration: none;
    min-width:0;
}

.cover {
    aspect-ratio:1;
    border-radius:0.5rem;
    overflow:hidden;
    background-color:#fff1;
    box-shadow:0 0.5rem 1.5rem #0006;
    transition:transform 0.1s;
}
a.album:active .cover {
    transform:scale(0.97);
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
    font-size:2.5rem;
    font-weight:600;
    color:#fff5;
    background-image:linear-gradient(135deg, #fff2, #fff0);
}

.name {
    font-size:0.9rem;
    line-height:1.3;
    display:-webkit-box;
    -webkit-line-clamp:2;
    -webkit-box-orient:vertical;
    overflow:hidden;
}

</style>
