<script setup>
import { onMounted } from 'vue';
import { reactive, ref, watch } from 'vue';
import { setSetting, getSetting } from '../indexeddb';

const state = reactive({
  security_token: '',
  aural_backend_url: '',
})

const status = ref('')

function loadArtists() {
  // Keep the screen on during a long sync where supported; the sync works without it
  navigator.wakeLock?.request('screen').catch(() => {})
  navigator.serviceWorker.ready.then( registration => {
    registration.active.postMessage({
        action: 'sync_tracks'
    })
  })
}

// Watch and store settings in IndexedDB
watch(() => state.security_token, (newToken) => {
  setSetting('security_token', newToken)
});

watch(() => state.aural_backend_url, (newUrl) => {
  setSetting('aural_backend_url', newUrl)
});

onMounted(async () => {
  // Load settings from IndexedDB
  state.security_token = await getSetting('security_token') || '';
  state.aural_backend_url = await getSetting('aural_backend_url') || '';

  const bc = new BroadcastChannel("status");
  bc.addEventListener('message', event => {
    status.value = event.data
  })
})

</script>

<template>
  <main>
    <section class="page-content">
      <div class="settings">
        <p>{{ status }}</p> 
        <fieldset>
          <label>Backend URL</label>
          <input type="text" v-model="state.aural_backend_url">
        </fieldset>       
        <fieldset>
          <label>Security Token</label>
          <input type="text" v-model="state.security_token">
        </fieldset>     

        <button type="button" style="width:6rem;margin-left:auto;opacity:0.5;padding-block:0.5rem;" @click="loadArtists()">Sync Music</button>

      </div>
      <div class="footer-controls">
          <RouterLink :to="{ name: 'artists' }">Artists</RouterLink>
      </div>
    </section>
    
  </main>
</template>

<style scoped>

main {
  height:100%;
  display:grid;
  grid-template-rows: 1fr;
  grid-template-columns: 1fr;

  background-size:200%;
  background-position: center;
  position:relative;
  overflow:hidden;
  color:#fff;
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
  flex:1;
}
.settings {
  flex:1;
}
</style>