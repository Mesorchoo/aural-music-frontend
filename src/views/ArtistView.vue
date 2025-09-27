<template>
    <div class="albums">
        <template v-for="(data, album) in state.albums">
            <RouterLink class="album" :to="{ name: 'album', params: { artist: props.artist, album: album }}">
                <img class="album-thumbnail" :src="data.cover_art" :alt="album">
                {{ album }}
            </RouterLink>
        </template>
    </div>
    
    <Teleport to="#page-footer">
        <div class="footer-controls">
            <RouterLink :to="{ name: 'artists' }">Artists</RouterLink>
        </div>
    </Teleport>
</template>

<script setup>
import { reactive, onBeforeMount, onBeforeUnmount } from 'vue'

const props = defineProps({
    artist: {},
});

const state = reactive({
    albums: []
});

function onArtistUpdate (event) {
    console.info('From SW', event.data)
    if(event.data.type === 'artist_albums' && event.data.artist === props.artist) {
        state.albums = event.data.albums
    }
}


onBeforeMount(() => {
    console.log('ARTIST', props.artist)
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

.albums {
    display:flex;
    flex-direction: column;
    gap:0.25rem;
    flex:1;
    padding:2rem min(2rem, 2vw);
}


a.album {
    background-color: #0000;
    border:none;
    font-size:1rem;
    padding:0.5rem 1rem;
    color:#fff;
    text-align:left;
    border-bottom:solid 1px #fff1;
    text-decoration: none;
    display:flex;
    gap:1.5rem;
    align-items:center;
}

.album-thumbnail {
    width:2rem;
    height:2rem;
    border-radius:0.25rem;
}

</style>