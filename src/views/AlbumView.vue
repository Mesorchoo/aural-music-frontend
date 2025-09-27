<template>
    <div class="album">
        <template v-for="track in state.tracks">
            <button type="button" @click="play(track)" @touchstart="touchstart(track)" @touchend="touchend(track)" :class="{ playing: playlist.current.path == track.path }">
                {{ track.path.replace(/.*\/.*\/([0-9]+).? ?(.*)\..+/, '$1 $2') }}
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
import { reactive, computed, onBeforeMount, onBeforeUnmount } from 'vue'
import { usePlaylistStore } from '../stores/playlist';
import { setSetting, getSetting } from '../indexeddb';

const playlistStore = usePlaylistStore()

const playlist = computed(() => playlistStore.playlist)

const props = defineProps({
    artist: {},
    album: {},
    current_track_status: null
});

const state = reactive({
    tracks: [],
    touch: {
        start: 0,
        end: 0,
        track: null,
    }
});

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
            
            caches.open('song').then(cache => cache.match(`${root_url}/song/${track.path}`)).then((req, key) => {
                console.log('req', req, key)
                // delete it
                caches.open('song').then(cache => cache.delete(`${root_url}/song/${track.path}`));
                
                navigator.serviceWorker.ready.then( registration => {
                    registration.active.postMessage({
                        action: 'get_artist_album',
                        artist: props.artist,
                        album: props.album,
                    });
                })

            });
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
        state.tracks = event.data.tracks
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
    padding:2rem min(2rem, 2vw);
}


button {
    background-color: #0000;
    border:none;
    font-size:min(1rem, 4vw);
    padding:0.75rem 1rem;
    color:#fff;
    text-align:left;
    border-bottom:solid 1px #fff1;
    display:flex;
    justify-content: space-between;
    align-items: center;
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