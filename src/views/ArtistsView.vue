<template>
    <div class="artists">
        <template v-for="artist in state.artists">
            <RouterLink class="artist" :to="{ name: 'artist', params: { artist: artist }}">{{ artist }}</RouterLink>
        </template>
    </div>
</template>

<script setup>
import { reactive, onBeforeMount, onBeforeUnmount, onActivated } from 'vue'
import { defineOptions } from 'vue'

defineOptions({ name: 'ArtistsView' })

const state = reactive({
    artists: []
});


function onArtistUpdate(event) {
    console.info('From SW', event.data)
    if(event.data.type === 'artists') {
        state.artists = event.data.artists
    }
    if(event.data.type === 'sync_complete') {
        navigator.serviceWorker.ready.then( registration => {
            registration.active.postMessage({
                action: 'get_artists'
            });
        })
    }
}

onBeforeMount(() => {
    navigator.serviceWorker.addEventListener('message', onArtistUpdate)
    navigator.serviceWorker.ready.then( registration => {
        registration.active.postMessage({
            action: 'get_artists'
        });
    })
});

onBeforeUnmount(() => {
    navigator.serviceWorker.removeEventListener('message', onArtistUpdate)
});

onActivated(() => {
    navigator.serviceWorker.ready.then( registration => {
        registration.active.postMessage({
            action: 'get_artists'
        });
    })
});

</script>

<style scoped>
.artists {
    display:flex;
    flex-direction: column;
    gap:0.25rem;
    padding:2rem min(2rem, 2vw);
}


a.artist {
    background-color: #0000;
    border:none;
    font-size:1rem;
    padding:0.5rem 1rem;
    color:#fff;
    text-align:left;
    border-bottom:solid 1px #fff1;
    text-decoration: none;
}
</style>