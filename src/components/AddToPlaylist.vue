<template>
    <Teleport to="body">
        <div v-if="props.tracks.length" class="backdrop" @click.self="emit('close')">
            <div class="sheet" role="dialog" aria-label="Add to playlist">
                <h2>Add {{ props.tracks.length === 1 ? 'track' : `${props.tracks.length} tracks` }} to playlist</h2>
                <button type="button" class="new" @click="addToNew">+ New playlist</button>
                <button v-for="playlist in state.playlists" :key="playlist.id" type="button" @click="add(playlist)">
                    <span class="name">{{ playlist.name }}</span>
                    <span class="count">{{ playlist.count }}</span>
                </button>
                <button type="button" class="cancel" @click="emit('close')">Cancel</button>
            </div>
        </div>
    </Teleport>
</template>

<script setup>
import { reactive, watch, onBeforeMount, onBeforeUnmount } from 'vue'
import { requestPlaylists, createPlaylist, addToPlaylist } from '../playlists'

// Shown while tracks (a list of track paths) is non-empty
const props = defineProps({
    tracks: { type: Array, default: () => [] },
})
const emit = defineEmits(['close'])

const state = reactive({
    playlists: [],
})

async function addToNew() {
    const name = prompt('Playlist name')?.trim()
    if (!name) return
    await createPlaylist(name, props.tracks)
    emit('close')
}

async function add(playlist) {
    await addToPlaylist(playlist.id, props.tracks)
    emit('close')
}

function onMessage(event) {
    if (event.data.type === 'playlists') state.playlists = event.data.playlists
}

watch(() => props.tracks.length, length => {
    if (length) requestPlaylists()
})

onBeforeMount(() => navigator.serviceWorker.addEventListener('message', onMessage))
onBeforeUnmount(() => navigator.serviceWorker.removeEventListener('message', onMessage))
</script>

<style scoped>
.backdrop {
    position:fixed;
    inset:0;
    z-index:100;
    background-color:#0008;
    display:flex;
    align-items:flex-end;
    justify-content:center;
}
.sheet {
    width:min(100%, 30rem);
    max-height:70vh;
    overflow-y:auto;
    box-sizing:border-box;
    padding:1rem 1rem calc(1rem + env(safe-area-inset-bottom));
    border-radius:1rem 1rem 0 0;
    background-color:#222;
    box-shadow:0 -0.5rem 2rem #0008;
    color:#fff;
    display:flex;
    flex-direction:column;
}
h2 {
    margin:0 0 0.5rem;
    font-size:1rem;
    font-weight:600;
    color:#fffa;
}
button {
    background-color:#0000;
    border:none;
    border-bottom:solid 1px #fff1;
    color:#fff;
    font-size:1rem;
    min-height:3rem;
    padding:0.5rem;
    text-align:left;
    display:flex;
    align-items:center;
    gap:0.5rem;
}
button:active {
    background-color:#fff1;
}
.name {
    flex:1;
    min-width:0;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
}
.count {
    color:#fff8;
    font-variant-numeric:tabular-nums;
}
.new {
    color:dodgerblue;
}
.cancel {
    justify-content:center;
    border-bottom:none;
    color:#fff8;
}
</style>
