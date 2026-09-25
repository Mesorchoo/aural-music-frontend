<template>
    <div class="artists">
        <div class="groups">
            <section v-for="group in groups" :key="group.letter" :id="`letter-${group.letter}`">
                <h2 class="letter">{{ group.letter }}</h2>
                <RouterLink v-for="artist in group.artists" :key="artist" class="artist" :to="{ name: 'artist', params: { artist: artist }}">{{ artist }}</RouterLink>
            </section>
            <p v-if="state.loaded && !state.artists.length" class="empty">
                No music yet. Set the backend URL and token in <RouterLink :to="{ name: 'settings' }">settings</RouterLink>, then sync.
            </p>
        </div>

        <!-- A–Z index: tap a letter, or drag along it, to jump to that section -->
        <nav v-if="groups.length > 1" class="index" aria-label="Jump to letter"
            @touchstart.prevent="jump" @touchmove.prevent="jump" @click="jump">
            <span v-for="group in groups" :key="group.letter" :data-letter="group.letter">{{ group.letter }}</span>
        </nav>
    </div>
</template>

<script setup>
import { reactive, computed, inject, onBeforeMount, onBeforeUnmount } from 'vue'

const restoreScroll = inject('restoreScroll', () => {})

const state = reactive({
    artists: [],
    loaded: false,
});

// Group artists by first letter; anything not starting with A–Z goes under #
const groups = computed(() => {
    const byLetter = new Map()
    const sorted = [...state.artists].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    for (const artist of sorted) {
        const first = artist.normalize('NFD')[0]?.toUpperCase()
        const letter = /[A-Z]/.test(first) ? first : '#'
        if (!byLetter.has(letter)) byLetter.set(letter, [])
        byLetter.get(letter).push(artist)
    }
    return [...byLetter]
        .map(([letter, artists]) => ({ letter, artists }))
        .sort((a, b) => a.letter === '#' ? -1 : b.letter === '#' ? 1 : a.letter.localeCompare(b.letter))
})

function jump(event) {
    const point = event.touches ? event.touches[0] : event
    const letter = document.elementFromPoint(point.clientX, point.clientY)?.dataset?.letter
    if (letter) document.getElementById(`letter-${letter}`)?.scrollIntoView({ block: 'start' })
}

function onArtistUpdate(event) {
    console.info('From SW', event.data)
    if(event.data.type === 'artists') {
        const firstLoad = !state.loaded
        state.artists = event.data.artists
        state.loaded = true
        if (firstLoad) restoreScroll()
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

</script>

<style scoped>
.artists {
    display:grid;
    grid-template-columns: 1fr auto;
    padding:1rem 0 2rem min(2rem, 2vw);
}

.letter {
    position:sticky;
    top:0;
    z-index:1;
    margin:0;
    padding:0.75rem 1rem 0.25rem;
    font-size:0.8rem;
    font-weight:600;
    color:#fff8;
    background-color:#111c;
    backdrop-filter:blur(8px);
}

a.artist {
    display:flex;
    align-items:center;
    min-height:3rem;
    padding:0.5rem 1rem;
    font-size:1.05rem;
    color:#fff;
    text-decoration: none;
    border-bottom:solid 1px #fff1;
}
a.artist:active {
    background-color:#fff1;
}

.index {
    position:sticky;
    top:0;
    align-self:start;
    height:100cqh;
    display:flex;
    flex-direction:column;
    justify-content:center;
    padding:0.5rem 0;
    font-size:0.7rem;
    font-weight:600;
    color:#fff9;
    user-select:none;
    touch-action:none;
    cursor:pointer;
}
.index span {
    flex:0 1 1.5rem;
    min-height:0;
    width:2rem;
    display:flex;
    align-items:center;
    justify-content:center;
}

.empty {
    padding:1rem;
    color:#fffa;
}
.empty a {
    color:#fff;
}
</style>
