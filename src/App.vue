<script setup>
import { onMounted } from 'vue';
import { RouterView } from 'vue-router'
import { getSetting } from './indexeddb';

const AUTO_SYNC_INTERVAL = 60 * 60 * 1000

// "Sync when the app opens" setting: sync if it's been more than an hour since the last one
onMounted(async () => {
  if (!await getSetting('auto_sync') || !await getSetting('aural_backend_url')) return
  if (Date.now() - (await getSetting('last_sync') || 0) < AUTO_SYNC_INTERVAL) return
  const registration = await navigator.serviceWorker.ready
  registration.active.postMessage({ action: 'sync_tracks' })
})

</script>

<template>
    <RouterView />
</template>

<style>

#app {
  height:100%;
  display:flex;
}

</style>
