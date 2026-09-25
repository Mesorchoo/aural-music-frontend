<template>
    <div class="album">
        <header>
            <div class="cover">
                <img v-if="coverArt && !state.brokenArt" :src="coverArt" alt="" @error="state.brokenArt = true">
                <span v-else class="placeholder" aria-hidden="true">{{ props.album[0] }}</span>
            </div>
            <div class="titles">
                <h1>{{ props.album }}</h1>
                <RouterLink class="artist-link" :to="{ name: 'artist', params: { artist: props.artist } }">{{ props.artist }}</RouterLink>
                <p v-if="state.loaded" class="count">{{ state.tracks.length }} {{ state.tracks.length === 1 ? 'track' : 'tracks' }}</p>
            </div>
        </header>

        <template v-for="track in state.tracks" :key="track.path">
            <button type="button" @click="play(track)" @touchstart="touchstart(track)" @touchend="touchend(track)" :class="{ playing: playlist.current.path == track.path }">
                <span class="number">{{ trackParts(track).number }}</span>
                <span class="title">{{ trackParts(track).title }}</span>
                <template v-if="playlist.current.path == track.path">
                    <span v-if="props.current_track_status === 'playing'" class="playing_indicator"></span>
                    <span v-else-if="props.current_track_status === 'paused'" class="paused_indicator"></span>
                    <span v-else-if="props.current_track_status === 'waiting'" class="waiting_indicator"></span>
                    <span v-else-if="props.current_track_status === 'stalled'" class="stalled_indicator"></span>
                    <span v-else-if="props.current_track_status === 'stopped'" class="stopped_indicator"></span>
                    <span v-else class="unknown_indicator"></span>
                </template>
                <span v-else-if="track.available_offline" class="available_offline"></span>
            </button>
        </template>
    </div>
    <Teleport to="#page-footer">
        <div class="footer-controls">
            <RouterLink :to="{ name: 'artists' }">Artists</RouterLink>
            <RouterLink :to="{ name: 'artist', params: { artist: props.artist } }">{{ props.artist }}</RouterLink>
        </div>
    </Teleport>
</template>

<script setup>
import { reactive, computed, inject, onBeforeMount, onBeforeUnmount } from 'vue'
import { usePlaylistStore } from '../stores/playlist';
import { setSetting, getSetting } from '../indexeddb';
import { songUrl } from '../song_url';

const playlistStore = usePlaylistStore()

const playlist = computed(() => playlistStore.playlist)

const props = defineProps({
    artist: {},
    album: {},
    current_track_status: null
});

const restoreScroll = inject('restoreScroll', () => {})

const state = reactive({
    tracks: [],
    loaded: false,
    brokenArt: false,
    touch: {
        start: 0,
        end: 0,
        track: null,
    }
});

const coverArt = computed(() => state.tracks[0]?.cover_art)

// "01 - Song Name.flac" -> { number: '1', title: 'Song Name' }
function trackParts(track) {
    const match = track.track.match(/^([0-9]+)[\s.\-_]*(.*?)\.[^.]+$/)
    if (match && match[2]) return { number: String(parseInt(match[1], 10)), title: match[2] }
    return { number: '', title: track.track.replace(/\.[^.]+$/, '') }
}

function touchstart(track) {
    state.touch.start = Date.now()
    state.touch.track = track
}

async function touchend(track) {
    state.touch.end = Date.now()
    console.log('touchend', track)
    if(state.touch.track === track && state.touch.end - state.touch.start > 3000) {
        if(confirm('Delete cached track?')){

            const root_url = await getSetting('aural_backend_url') || '';
            
            await caches.open('song').then(cache => cache.delete(songUrl(root_url, track.path)));

            navigator.serviceWorker.ready.then( registration => {
                registration.active.postMessage({
                    action: 'get_artist_album',
                    artist: props.artist,
                    album: props.album,
                });
            })
        }
    }
}


function play(track) {
    console.log('play', track)
    playlistStore.addToPlaylist(...state.tracks.slice(state.tracks.indexOf(track)), ...state.tracks.slice(0, state.tracks.indexOf(track)))
}


function onAlbumUpdate(event){
    console.info('From SW', event.data)
    if(event.data.type === 'artist_album' && event.data.artist === props.artist && event.data.album === props.album) {
        const firstLoad = !state.loaded
        state.tracks = event.data.tracks
        state.loaded = true
        if (firstLoad) restoreScroll()
    }
    if(event.data.type === 'cache_update') {
        navigator.serviceWorker.ready.then( registration => {
            registration.active.postMessage({
                action: 'get_artist_album',
                artist: props.artist,
                album: props.album,
            });
        })
    }
}

onBeforeMount(() => {
    navigator.serviceWorker.addEventListener('message', onAlbumUpdate)
    navigator.serviceWorker.ready.then( registration => {
        registration.active.postMessage({
            action: 'get_artist_album',
            artist: props.artist,
            album: props.album,
        });
    })
});

onBeforeUnmount(() => {
    navigator.serviceWorker.removeEventListener('message', onAlbumUpdate)
});

</script>

<style scoped>

.album {
    display:flex;
    flex-direction: column;
    /* gap:0.25rem; */
    padding:1.5rem min(2rem, 2vw) 2rem;
}

header {
    display:flex;
    gap:1rem;
    align-items:flex-end;
    margin:0 0 1rem;
    padding:0 min(1rem, 2vw);
    color:#fff;
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
.artist-link {
    display:inline-block;
    margin-top:0.25rem;
    color:#fffc;
    text-decoration:none;
}
.count {
    margin:0.25rem 0 0;
    font-size:0.85rem;
    color:#fff9;
}


button {
    background-color: #0000;
    border:none;
    font-size:min(1rem, 4vw);
    min-height:3rem;
    padding:0.5rem 1rem;
    color:#fff;
    text-align:left;
    border-bottom:solid 1px #fff1;
    display:grid;
    grid-template-columns:1.75rem 1fr auto;
    gap:0.5rem;
    align-items: center;
}
.number {
    color:#fff8;
    font-variant-numeric:tabular-nums;
}
.title {
    min-width:0;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
}

.playing {
    background-image:linear-gradient(90deg, #fff0, #fff1);
}
/* .playing_indicator {
    width:1rem;
    height:1rem;
    background:transparent;
    border-radius:50%;
    border:solid 3px transparent;
    border-top:solid 3px white;
    animation:spin 1s linear infinite;
} */

@keyframes playing {
    0% {
        height:1rem;
        /* transform:scale(1, 1); */
    }
    25% {
        height:0.2rem;
        /* transform:scale(1, 0.2) */
    }
    50% {
        height:0.8rem;
        /* transform:scale(1, 0.8) */
    }
    75% {
        height:0.1rem;
        /* transform:scale(1, 0.1) */
    }
    100% {
        height:1rem;
        /* transform:scale(1, 1) */
    }
}

.playing_indicator {
    width:0.25rem;
    height:1rem;
    background:white;
    position:relative;
    animation:playing 1s linear infinite;
    align-self:flex-end;
}
.playing_indicator::after {
    content:'';
    position:absolute;
    right:0.5rem;
    bottom:0;
    background-color:white;
    width:0.25rem;
    height:0.25rem;
    animation:playing 1.2s 0.5s linear forwards infinite;
}
.playing_indicator::before {
    content:'';
    position:absolute;
    right:1rem;
    bottom:0;
    background-color:white;
    width:0.25rem;
    height:0.25rem;
    animation:playing 1.6s 0.75s linear forwards infinite;
}






.paused_indicator {
    width:0.25rem;
    height:1rem;
    background:white;
    box-shadow:-0.5rem 0 0 0 #fff;
}
.waiting_indicator {
    width:0.5rem;
    height:0.5rem;
    border-radius:50%;
    background:gold;
    box-shadow:-0.75rem 0 0 0 gold;
}
.stalled_indicator {
    width:0.5rem;
    height:0.5rem;
    border-radius:50%;
    background:firebrick;
    box-shadow:-0.75rem 0 0 0 firebrick;
}
.stopped_indicator {
    width:0.5rem;
    height:0.5rem;
    border-radius:50%;
    background:white;
}




@keyframes spin {
    0% {
        transform:rotate(0);
    } 
    100% {
        transform:rotate(360deg);
    }
}

.available_offline {
    width:0.5rem;
    height:0.5rem;
    border-radius:50%;
    background-color:dodgerblue;
}

</style>