<script setup>
import { watch, ref, computed, onMounted, onUnmounted } from 'vue';
import { usePlaylistStore } from '../stores/playlist';
import { RouterLink, RouterView } from 'vue-router'
import logoURL from '@/assets/logo.webp'
import { getSetting } from '../indexeddb';

const playlistStore = usePlaylistStore()

const playlist = computed(() => playlistStore.playlist)

const audio = ref()

const mounted = ref(false)

const song = ref(false)
const status = ref('')
const art = ref(logoURL)

const current_track_status = ref(null)

let positionStateTimer = null

function setMediaMetadata() {
  const track = playlist.value.current
  if (!track || !track.path) return
  const title = track.path.replace(/.*\/.*\/[0-9]+ ?(.*)\..+/, '$1')
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist: track.artist || title,
    album: track.album || '',
    artwork: track.cover_art ? [
      { src: track.cover_art, sizes: '300x300', type: 'image/jpeg' },
    ] : [],
  })
}

function updatePositionState() {
  if ('setPositionState' in navigator.mediaSession && audio.value) {
    navigator.mediaSession.setPositionState({
      duration: audio.value.duration || 0,
      playbackRate: audio.value.playbackRate || 1,
      position: audio.value.currentTime || 0,
    })
  }
}

function songTitle(path) {
  return path.replace(/.*\/.*\/[0-9]+ ?(.*)\..+/, '$1')
}

watch(playlist.value, async () => {
  art.value = playlist.value.current.cover_art
  setMediaMetadata()
  
  const root_url = await getSetting('aural_backend_url') || '';
  audio.value.querySelector('source').src = `${root_url}/song/${playlist.value.current.path}`
  audio.value.load()
  audio.value.play()
});



onMounted(() => {

  setTimeout(() => {
    mounted.value = true
  })

  const bc = new BroadcastChannel("status");
  bc.addEventListener('message', event => {
    status.value = event.data
  })

  audio.value.addEventListener("stalled", () => {
      current_track_status.value = 'stalled'
  });
  audio.value.addEventListener("waiting", () => {
      current_track_status.value = 'waiting'
  });
  audio.value.addEventListener("pause", () => {
      current_track_status.value = 'paused'
      navigator.mediaSession.playbackState = 'paused'
  });
  audio.value.addEventListener("error", (error) => {
    console.error("Audio playback error:", error);
  });
  audio.value.addEventListener("ended", () => {
    current_track_status.value = 'stopped'
      navigator.mediaSession.playbackState = 'none'
    playlistStore.nextSong()
  });
  audio.value.addEventListener("loadedmetadata", () => {
    updatePositionState()
  });
  audio.value.addEventListener("timeupdate", () => {
    if (!positionStateTimer) {
      positionStateTimer = setTimeout(() => {
        positionStateTimer = null
        updatePositionState()
      }, 1000)
    }
  });
    audio.value.addEventListener("playing", async () => {
      // Update page title
      current_track_status.value = 'playing'
      navigator.mediaSession.playbackState = 'playing'
      document.title = `\u{1F3B5} ${songTitle(playlist.value.current.path)} - Music`;

      setMediaMetadata()
      updatePositionState()

      if(playlist.value.list.length > 1) {
        try {
            const root_url = await getSetting('aural_backend_url') || '';
          fetch(`${root_url}/song/${playlist.value.list[1].path}`)
        } catch (error) {

        }
      }
    });

    navigator.mediaSession.setActionHandler("play", () => {
      audio.value.play();
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      audio.value.pause();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      playlistStore.prevSong()
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      playlistStore.nextSong()
    });
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      audio.value.currentTime = details.seekTime
    });
    navigator.mediaSession.setActionHandler('seekbackward', () => {
      audio.value.currentTime = Math.max(0, audio.value.currentTime - 10)
    });
    navigator.mediaSession.setActionHandler('seekforward', () => {
      audio.value.currentTime = Math.min(audio.value.duration || 0, audio.value.currentTime + 10)
    });
})

onUnmounted(() => {
  if (positionStateTimer) {
    clearTimeout(positionStateTimer)
    positionStateTimer = null
  }
})

</script>

<template>
  <main :style="{'--bg': `url(${art})` }">
    <section class="current">

      <div style="display:flex;gap:0.5rem;align-items: center;padding-left:0.5rem;">
        <p style="white-space: nowrap;overflow:hidden;text-overflow: ellipsis;margin:0;">{{ status }}</p>
        <RouterLink :to="{name: 'settings'}" style="width:2rem;margin-left:auto;flex:0 0 2rem;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>dots-vertical</title><path fill="white" d="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z" /></svg>
        </RouterLink>  
      </div>

      <div style="align-self:center;width:env(safe-area-inset-top);height:env(safe-area-inset-bottom);background-color:green;"></div>

      
      
      <div>
        <div style="display:flex;flex-wrap:wrap;justify-content: space-between;margin-bottom:0.5rem;">
          <span class="artist">{{ playlist.current.path.replace(/(.*)\/(.*)\/[0-9]+ ?.*\..+/, '$1') }}</span> 
          <span class="album">{{ playlist.current.path.replace(/.*\/(.*)\/[0-9]+ ?.*\..+/, '$1') }}</span> 
        </div>
        <audio controls autoplay ref="audio" id="audio_player_element">
          <source @error="playerError" type="audio/mpeg" />
          Audio not supported
        </audio>
        <p class="now-playing">          
          <span class="number">{{ playlist.current.path.replace(/.*\/.*\/([0-9]+) ?.*\..+/, '$1') }}</span>
          <span class="song">{{ playlist.current.path.replace(/.*\/.*\/[0-9\ \-]+\.? ?(.*)\..+/, '$1') }}</span>
        </p>
      </div>
    </section>
    <section class="page-content">      
      <RouterView v-if="mounted">
        <template #default="{ Component }">
          <KeepAlive include="ArtistsView">
            <component :is="Component" :current_track_status="current_track_status" />
          </KeepAlive>
        </template>
      </RouterView>
    </section>
    <section id="page-footer">
      <!--BLANK-->
    </section>
  </main>
</template>

<style scoped>

main {
  flex:1;
  display:grid;
  grid-template-rows: 1fr 2fr;
  grid-template-columns: 1fr;

  background-size:200%;
  background-position: center;
  position:relative;
  overflow:hidden;
}
main::before {
  content:'';
  background-image:var(--bg);
  background-size:200%;
  background-position: center;
  filter:blur(10rem) brightness(0.5);
  position:absolute;
  z-index:-1;
  inset:0;
}
main>section {
  overflow-y:auto;
  overflow-x:hidden;
}
.page-content {
  display:flex;
  flex-direction:column;
}
.page-content>:first-child {
  flex:1;
}
.current {
  background-image:radial-gradient(#1110, #1111, #111e), linear-gradient(#1110, #111e), var(--bg);
  background-size:cover;
  background-position:center;
  border-radius:0 0 2rem 2rem;
  box-shadow:0 2rem 2rem #0005;
  padding:0.5rem min(2rem, 2vw) 0.5rem;
  display:flex;
  flex-direction:column;
  justify-content: space-between;
  color:#fff;
  max-width:100vw;
  box-sizing: border-box;
  z-index:20;
}

audio {
  width:100%;
}

.now-playing {
  box-sizing: border-box;
  margin:0.5rem;
  font-size:1.4rem;
  color:#fff;
  text-align:center;
  white-space: nowrap;
  overflow:hidden;
  text-overflow: ellipsis;
  display:flex;
  align-items: center;
  justify-content: center;
  gap:0.5rem;
  justify-content: space-between;
  overflow-x:auto;
  /* grid-template-columns: min-content 1fr; */
}
.now-playing .number {
  opacity:0.5;
}
.artist {
  font-size:1rem;
  color:#bbb;
}
.album {
  font-size:1rem;
}

.song {
  display:block;
  font-size:min(5cqw, 2rem);
  text-align:right;
  width:unset;
}
</style>