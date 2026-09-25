<script setup>
import { reactive, watch, ref, computed, onMounted, provide, nextTick } from 'vue';
import { usePlaylistStore } from '../stores/playlist';
import { RouterLink, RouterView, useRoute, onBeforeRouteUpdate, onBeforeRouteLeave } from 'vue-router'
import logoURL from '@/assets/logo.webp'
import { setSetting, getSetting } from '../indexeddb';
import { songUrl } from '../song_url';

const playlistStore = usePlaylistStore()

// Remember each page's scroll position, so going back to a list returns to the same place.
// Kept in sessionStorage so it also survives the reload after an app update.
const pageContent = ref()
const route = useRoute()
const SCROLL_KEY = 'scroll_positions'
let scrollPositions = {}
try { scrollPositions = JSON.parse(sessionStorage.getItem(SCROLL_KEY)) || {} } catch {}

function saveScroll(path) {
  if (!pageContent.value) return
  scrollPositions[path] = pageContent.value.scrollTop
  try { sessionStorage.setItem(SCROLL_KEY, JSON.stringify(scrollPositions)) } catch {}
}
onBeforeRouteUpdate((to, from) => saveScroll(from.fullPath))
onBeforeRouteLeave((to, from) => saveScroll(from.fullPath))

// Pages load their lists asynchronously, so they call this once the list has rendered
provide('restoreScroll', async () => {
  await nextTick()
  if (pageContent.value) pageContent.value.scrollTop = scrollPositions[route.fullPath] || 0
})

const playlist = computed(() => playlistStore.playlist)

const audio = ref()

const mounted = ref(false)

const song = ref(false)
const status = ref('')
const art = ref(logoURL)

const current_track_status = ref(null)


watch(playlist.value, async () => {
  art.value = playlist.value.current.cover_art
  
  const root_url = await getSetting('aural_backend_url') || '';
  audio.value.querySelector('source').src = songUrl(root_url, playlist.value.current.path)
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
  audio.value.addEventListener("ended", () => {
    current_track_status.value = 'stopped'
      navigator.mediaSession.playbackState = 'none'
    playlistStore.nextSong()
  });
    audio.value.addEventListener("playing", async () => {
      // Update page title
      current_track_status.value = 'playing'
      navigator.mediaSession.playbackState = 'playing'
      document.title = `🎵 ${playlist.value.current.path} - Music`;

      if(playlist.value.list.length > 1) {
        // Prefetch the next track so it's cached; failures don't matter here
        const root_url = await getSetting('aural_backend_url') || '';
        fetch(songUrl(root_url, playlist.value.list[1].path)).catch(() => {})
      }


      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: playlist.value.current.path.replace(/.*\/.*\/[0-9]+ ?(.*)\..+/, '$1'),
        artist: playlist.value.current.path.replace(/(.*)\/.*\/[0-9]+ ?.*\..+/, '$1'),
        album: playlist.value.current.path.replace(/.*\/(.*)\/[0-9]+ ?.*\..+/, '$1'),
        artwork: [
          {
            src: playlist.value.current.cover_art,
          },
        ],
      });
    });

    navigator.mediaSession.setActionHandler("play", () => {
      audio.value.play();
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      audio.value.pause();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      // this.$store.commit('prevPlaylist')
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      // this.$store.commit('continuePlaylist')
    });
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
    <section class="page-content" ref="pageContent">
      <!-- Keyed so each artist/album gets a fresh page that loads its own data -->
      <RouterView v-if="mounted" :key="route.fullPath" :current_track_status="current_track_status" />
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
  /* Lets pages size things (like the artist A–Z index) to the visible area with cqh */
  container-type:size;
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