<template>
    <div class="playlist-page">
        <template v-if="state.playlist">
            <header>
                <div class="cover">
                    <img v-if="coverArt && !state.brokenArt" :src="coverArt" alt="" @error="state.brokenArt = true">
                    <span v-else class="placeholder" aria-hidden="true">{{ state.playlist.name[0] }}</span>
                </div>
                <div class="titles">
                    <h1>{{ state.playlist.name }}</h1>
                    <p class="count">{{ state.playlist.tracks.length }} {{ state.playlist.tracks.length === 1 ? 'track' : 'tracks' }}</p>
                    <div class="actions">
                        <button type="button" @click="rename">Rename</button>
                        <button type="button" @click="remove">Delete</button>
                    </div>
                </div>
            </header>

            <div ref="list" class="tracks" :class="{ dragging: drag.from >= 0 }">
            <div v-for="(track, index) in state.playlist.tracks" :key="index" class="row" :style="rowStyle(index)"
                :class="{ playing: playlist.current.path == track.path, missing: track.missing, dragged: drag.from === index }">
                <!-- Drag to reorder; arrow keys move the track when focused -->
                <button type="button" class="handle" :aria-label="`Move ${trackParts(track).title}`"
                    @pointerdown="dragStart($event, index)" @keydown.up.prevent="keyMove(index, index - 1)" @keydown.down.prevent="keyMove(index, index + 1)">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7,19V17H9V19H7M11,19V17H13V19H11M15,19V17H17V19H15M7,15V13H9V15H7M11,15V13H13V15H11M15,15V13H17V15H15M7,11V9H9V11H7M11,11V9H13V11H11M15,11V9H17V11H15M7,7V5H9V7H7M11,7V5H13V7H11M15,7V5H17V7H15Z" /></svg>
                </button>
                <button type="button" class="play" :disabled="track.missing" @click="play(index)">
                    <span class="number">{{ index + 1 }}</span>
                    <span class="title">{{ trackParts(track).title }}</span>
                    <span class="source">{{ track.artist }} · {{ track.album }}</span>
                </button>
                <span v-if="track.available_offline" class="available_offline"></span>
                <button type="button" class="remove" :aria-label="`Remove ${trackParts(track).title}`" @click="removeTrack(index)">×</button>
            </div>
            </div>

            <p v-if="!state.playlist.tracks.length" class="empty">
                Empty playlist. Add tracks with the + button on an album.
            </p>
        </template>
        <p v-else-if="state.loaded" class="empty">This playlist no longer exists.</p>
    </div>

    <Teleport to="#page-footer">
        <div class="footer-controls">
            <RouterLink :to="{ name: 'artists' }">Artists</RouterLink>
            <RouterLink :to="{ name: 'playlists' }">Playlists</RouterLink>
        </div>
    </Teleport>
</template>

<script setup>
import { ref, reactive, computed, inject, nextTick, onBeforeMount, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { usePlaylistStore } from '../stores/playlist'
import { requestPlaylist, savePlaylist, deletePlaylist } from '../playlists'
import { trackParts } from '../track_name'

const playlistStore = usePlaylistStore()
const playlist = computed(() => playlistStore.playlist)

const restoreScroll = inject('restoreScroll', () => {})
const router = useRouter()

const props = defineProps({
    id: {},
    current_track_status: null
});

const state = reactive({
    playlist: null,
    loaded: false,
    brokenArt: false,
});

const coverArt = computed(() => state.playlist?.tracks.find(track => track.cover_art)?.cover_art)

function paths() {
    return state.playlist.tracks.map(track => track.path)
}

// Play from the chosen track to the end, then wrap round to the start (like an album).
// Tracks missing from the library are skipped.
function play(index) {
    const tracks = state.playlist.tracks
    const ordered = [...tracks.slice(index), ...tracks.slice(0, index)].filter(track => !track.missing)
    playlistStore.addToPlaylist(...ordered)
}

function rename() {
    const name = prompt('Playlist name', state.playlist.name)?.trim()
    if (!name || name === state.playlist.name) return
    savePlaylist({ id: props.id, name, tracks: paths() })
}

async function remove() {
    if (!confirm(`Delete playlist "${state.playlist.name}"?`)) return
    await deletePlaylist(props.id)
    router.replace({ name: 'playlists' })
}

function removeTrack(index) {
    const tracks = paths()
    tracks.splice(index, 1)
    savePlaylist({ id: props.id, name: state.playlist.name, tracks })
}

function moveTrack(from, to) {
    const tracks = [...state.playlist.tracks]
    if (from === to || to < 0 || to >= tracks.length) return
    tracks.splice(to, 0, ...tracks.splice(from, 1))
    // Show the new order straight away rather than waiting for the worker to send it back
    state.playlist.tracks = tracks
    savePlaylist({ id: props.id, name: state.playlist.name, tracks: paths() })
}

// Arrow keys on a focused handle; keep focus on the moved track's handle
async function keyMove(index, to) {
    if (to < 0 || to >= state.playlist.tracks.length) return
    moveTrack(index, to)
    await nextTick()
    list.value.children[to]?.querySelector('.handle')?.focus()
}

// Drag to reorder with pointer events, so it works with touch as well as a mouse.
// While dragging, the dragged row follows the pointer and the rows it passes slide out of
// the way; the playlist is only reordered when it's dropped.
const list = ref()
const drag = reactive({ from: -1, to: -1, offset: 0, height: 0 })
let scroller, mids, startY, lastClientY, frame

// Positions are measured within the scrolling content, so they stay right while it auto-scrolls
function contentY(clientY) {
    return clientY + scroller.scrollTop
}

function dragStart(event, index) {
    if (event.button !== 0) return
    event.preventDefault()
    scroller = list.value.closest('.page-content') || document.scrollingElement
    const rows = [...list.value.children]
    mids = rows.map(row => {
        const rect = row.getBoundingClientRect()
        return contentY(rect.top + rect.height / 2)
    })
    Object.assign(drag, { from: index, to: index, offset: 0, height: rows[index].offsetHeight })
    lastClientY = event.clientY
    startY = contentY(event.clientY)

    window.addEventListener('pointermove', dragMove)
    window.addEventListener('pointerup', dragEnd)
    window.addEventListener('pointercancel', dragCancel)
    frame = requestAnimationFrame(autoScroll)
}

function dragUpdate() {
    drag.offset = contentY(lastClientY) - startY
    const center = mids[drag.from] + drag.offset
    // The new position is the number of other rows whose middle is above the dragged row's middle
    drag.to = mids.filter((mid, i) => i !== drag.from && mid < center).length
}

function dragMove(event) {
    lastClientY = event.clientY
    dragUpdate()
}

// Scroll the list when the pointer is held near its top or bottom edge
function autoScroll() {
    const rect = scroller.getBoundingClientRect()
    const edge = 48
    if (lastClientY < rect.top + edge) scroller.scrollTop -= 8
    else if (lastClientY > rect.bottom - edge) scroller.scrollTop += 8
    dragUpdate()
    frame = requestAnimationFrame(autoScroll)
}

function dragStop() {
    cancelAnimationFrame(frame)
    window.removeEventListener('pointermove', dragMove)
    window.removeEventListener('pointerup', dragEnd)
    window.removeEventListener('pointercancel', dragCancel)
    const { from, to } = drag
    Object.assign(drag, { from: -1, to: -1, offset: 0 })
    return { from, to }
}

function dragEnd() {
    const { from, to } = dragStop()
    if (from !== to) moveTrack(from, to)
    // Pick up any update that arrived (and was ignored) during the drag
    else requestPlaylist(props.id)
}

function dragCancel() {
    dragStop()
    requestPlaylist(props.id)
}

function rowStyle(index) {
    const { from, to, offset, height } = drag
    if (from < 0) return null
    if (index === from) return { transform: `translateY(${offset}px)` }
    if (from < to && index > from && index <= to) return { transform: `translateY(${-height}px)` }
    if (from > to && index >= to && index < from) return { transform: `translateY(${height}px)` }
    return null
}

function onMessage(event) {
    // Don't swap the list out from under a drag; dragEnd asks for it again
    if (event.data.type === 'playlist' && event.data.id === props.id && drag.from < 0) {
        const firstLoad = !state.loaded
        state.playlist = event.data.playlist
        state.loaded = true
        if (firstLoad) restoreScroll()
    }
    if (['playlists_update', 'sync_complete', 'cache_update'].includes(event.data.type)) {
        requestPlaylist(props.id)
    }
}

onBeforeMount(() => {
    navigator.serviceWorker.addEventListener('message', onMessage)
    requestPlaylist(props.id)
});

onBeforeUnmount(() => {
    if (drag.from >= 0) dragStop()
    navigator.serviceWorker.removeEventListener('message', onMessage)
});
</script>

<style scoped>
.playlist-page {
    display:flex;
    flex-direction:column;
    padding:1.5rem min(2rem, 2vw) 2rem;
    color:#fff;
}

header {
    display:flex;
    gap:1rem;
    align-items:flex-end;
    margin:0 0 1rem;
    padding:0 min(1rem, 2vw);
}
.cover {
    flex:0 0 auto;
    width:clamp(5rem, 28vw, 8rem);
    aspect-ratio:1;
    border-radius:0.5rem;
    overflow:hidden;
    background-color:#fff1;
    box-shadow:0 0.5rem 1.5rem #0006;
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
.titles {
    min-width:0;
}
h1 {
    margin:0;
    font-size:1.35rem;
    font-weight:600;
    line-height:1.2;
    overflow-wrap:anywhere;
}
.count {
    margin:0.25rem 0 0;
    font-size:0.85rem;
    color:#fff9;
}
.actions {
    display:flex;
    gap:0.5rem;
    margin-top:0.5rem;
}
.actions button {
    background-color:#fff2;
    border:none;
    border-radius:0.5rem;
    color:#fffc;
    font-size:0.85rem;
    padding:0.35rem 0.75rem;
}

.row {
    display:flex;
    align-items:center;
    gap:0.5rem;
    border-bottom:solid 1px #fff1;
    position:relative;
}
/* Only animate while dragging, so rows don't slide back when the new order is dropped in */
.dragging .row {
    transition:transform 0.15s;
}
.dragging .row.dragged {
    transition:none;
    z-index:1;
    background-color:#333;
    box-shadow:0 0.5rem 1.5rem #0008;
}
.handle {
    flex:0 0 2.5rem;
    height:3rem;
    padding:0.6rem;
    background-color:#0000;
    border:none;
    color:#fff6;
    /* Stop the page scrolling instead of dragging on touch screens */
    touch-action:none;
    user-select:none;
    cursor:grab;
}
.dragging .handle {
    cursor:grabbing;
}
.handle svg {
    width:100%;
    height:100%;
    display:block;
}
.row.playing {
    background-image:linear-gradient(90deg, #fff0, #fff1);
}
.row.missing {
    opacity:0.4;
}
.play {
    flex:1;
    min-width:0;
    background-color:#0000;
    border:none;
    color:#fff;
    font-size:min(1rem, 4vw);
    min-height:3rem;
    padding:0.5rem 0;
    text-align:left;
    display:grid;
    grid-template-columns:1.75rem 1fr;
    column-gap:0.5rem;
    align-items:center;
}
.number {
    grid-row:span 2;
    color:#fff8;
    font-variant-numeric:tabular-nums;
}
.title, .source {
    min-width:0;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
}
.source {
    font-size:0.8rem;
    color:#fff8;
}
.remove {
    flex:0 0 2.5rem;
    height:2.5rem;
    background-color:#0000;
    border:none;
    color:#fff8;
    font-size:1.4rem;
}
.available_offline {
    flex:0 0 auto;
    width:0.5rem;
    height:0.5rem;
    border-radius:50%;
    background-color:dodgerblue;
}

.empty {
    padding:0 1rem;
    color:#fffa;
}
</style>
