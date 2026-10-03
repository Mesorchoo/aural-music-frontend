<script setup>
import { onMounted, onBeforeUnmount, reactive, ref, computed, watch } from 'vue';
import { setSetting, getSetting, getLibraryStats } from '../indexeddb';
import logoURL from '@/assets/logo.webp'

const state = reactive({
  security_token: '',
  aural_backend_url: '',
  auto_sync: false,
})

const status = ref('')
const showToken = ref(false)
const syncing = ref(false)
const syncError = ref('')
const lastSync = ref(0)
const stats = ref(null)
const connection = reactive({ state: '', message: '' })
const storage = reactive({ used: 0, quota: 0, songs: 0, songBytes: 0, persisted: null })

// Stored without a trailing slash, since request URLs are built as `${url}/song/...`
const backendUrl = computed(() => state.aural_backend_url.trim().replace(/\/+$/, ''))

function syncMusic() {
  syncing.value = true
  syncError.value = ''
  // Keep the screen on during a long sync where supported; the sync works without it
  navigator.wakeLock?.request('screen').catch(() => {})
  navigator.serviceWorker.ready.then( registration => {
    registration.active.postMessage({
        action: 'sync_tracks'
    })
  })
}

async function testConnection() {
  connection.state = 'testing'
  connection.message = 'Testing…'
  const fail = message => Object.assign(connection, { state: 'error', message })

  if (!backendUrl.value) return fail('Enter the backend URL first')
  if (location.protocol === 'https:' && backendUrl.value.startsWith('http:')) {
    return fail('This app is on HTTPS, so the backend must use HTTPS too')
  }
  try {
    // Cheap request that needs the token, unlike /artists which scans the whole library
    const response = await fetch(`${backendUrl.value}/playlists?time=${Date.now()}`, {
      headers: { Authorization: `Bearer ${state.security_token}` },
    })
    if (response.ok) return Object.assign(connection, { state: 'ok', message: 'Connected' })
    if (response.status === 401) return fail('Connected, but the security token is wrong')
    if (response.status === 404) return fail('Connected, but the backend needs updating for playlists')
    if (response.status === 504) return fail("Can't reach the backend")
    fail(`Backend returned ${response.status} ${response.statusText}`)
  } catch {
    fail("Can't reach the backend")
  }
}

async function loadStats() {
  stats.value = await getLibraryStats().catch(() => null)
  lastSync.value = await getSetting('last_sync') || 0
}

async function loadStorage() {
  const estimate = await navigator.storage?.estimate?.().catch(() => null)
  storage.used = estimate?.usage || 0
  storage.quota = estimate?.quota || 0
  storage.persisted = await navigator.storage?.persisted?.().catch(() => null) ?? null

  // Downloaded songs and album art live in the 'song' cache
  const cache = await caches.open('song')
  const keys = await cache.keys()
  let bytes = 0
  for (const request of keys) {
    const response = await cache.match(request)
    bytes += Number(response?.headers.get('Content-Length')) || 0
  }
  storage.songs = keys.filter(request => !/\/album_art\.[^/]+$/i.test(request.url)).length
  storage.songBytes = bytes
}

async function keepDownloads() {
  storage.persisted = await navigator.storage.persist()
  if (!storage.persisted) {
    alert("The browser didn't allow it. Installing the app to your home screen usually helps.")
  }
}

async function clearDownloads() {
  if (!confirm(`Delete ${storage.songs} downloaded ${storage.songs === 1 ? 'song' : 'songs'}? They'll download again when played.`)) return
  await caches.delete('song')
  await loadStorage()
}

function formatBytes(bytes) {
  if (!bytes) return '0 MB'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i >= 3 ? 1 : 0)} ${units[i]}`
}

function timeAgo(time) {
  if (!time) return 'never'
  const seconds = (time - Date.now()) / 1000
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

const storagePercent = computed(() => storage.quota ? Math.min(100, storage.used / storage.quota * 100) : 0)

// Watch and store settings in IndexedDB
watch(() => state.security_token, (newToken) => {
  setSetting('security_token', newToken)
  connection.state = ''
});

watch(backendUrl, (newUrl) => {
  setSetting('aural_backend_url', newUrl)
  connection.state = ''
});

watch(() => state.auto_sync, (enabled) => {
  setSetting('auto_sync', enabled)
});

const bc = new BroadcastChannel("status");
bc.addEventListener('message', event => {
  status.value = event.data
})

function onWorkerMessage(event) {
  if (event.data.type === 'sync_complete') {
    syncing.value = false
    syncError.value = event.data.error || ''
    loadStats()
    loadStorage()
  }
  if (event.data.type === 'cache_update') loadStorage()
}

onMounted(async () => {
  navigator.serviceWorker.addEventListener('message', onWorkerMessage)

  // Load settings from IndexedDB
  state.security_token = await getSetting('security_token') || '';
  state.aural_backend_url = await getSetting('aural_backend_url') || '';
  state.auto_sync = Boolean(await getSetting('auto_sync'));

  loadStats()
  loadStorage()
})

onBeforeUnmount(() => {
  bc.close()
  navigator.serviceWorker.removeEventListener('message', onWorkerMessage)
})

</script>

<template>
  <main :style="{ '--bg': `url(${logoURL})` }">
    <section class="page-content">
      <div class="settings">
        <header class="hero">
          <img :src="logoURL" alt="" class="logo">
          <div>
            <h1>Settings</h1>
            <p class="tagline">Aural Music</p>
          </div>
        </header>

        <section class="card">
          <h2>Connection</h2>
          <label class="field">
            <span>Backend URL</span>
            <input type="url" v-model="state.aural_backend_url" placeholder="https://music.example.com"
              inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false">
          </label>
          <label class="field">
            <span>Security token</span>
            <div class="with-button">
              <input :type="showToken ? 'text' : 'password'" v-model="state.security_token"
                autocapitalize="off" autocomplete="off" spellcheck="false">
              <button type="button" class="ghost" @click="showToken = !showToken">{{ showToken ? 'Hide' : 'Show' }}</button>
            </div>
          </label>
          <div class="row">
            <button type="button" class="secondary" :disabled="connection.state === 'testing'" @click="testConnection">Test connection</button>
            <span v-if="connection.state" class="pill" :class="connection.state">{{ connection.message }}</span>
          </div>
        </section>

        <section class="card">
          <h2>Library</h2>
          <div class="stats">
            <div><strong>{{ stats?.artists ?? '–' }}</strong><span>Artists</span></div>
            <div><strong>{{ stats?.albums ?? '–' }}</strong><span>Albums</span></div>
            <div><strong>{{ stats?.tracks ?? '–' }}</strong><span>Tracks</span></div>
            <div><strong>{{ stats?.playlists ?? '–' }}</strong><span>Playlists</span></div>
          </div>
          <div class="row">
            <button type="button" class="primary" :disabled="syncing || !backendUrl" @click="syncMusic">
              <span v-if="syncing" class="spinner" aria-hidden="true"></span>
              {{ syncing ? 'Syncing…' : 'Sync now' }}
            </button>
            <span class="muted">Last synced {{ timeAgo(lastSync) }}</span>
          </div>
          <p v-if="syncing && status" class="status">{{ status }}</p>
          <p v-if="syncError" class="status error">Sync failed: {{ syncError }}</p>
          <label class="toggle">
            <span>
              Sync when the app opens
              <small>Keeps this device up to date with your library and playlists. At most once an hour.</small>
            </span>
            <input type="checkbox" v-model="state.auto_sync">
            <span class="switch" aria-hidden="true"></span>
          </label>
        </section>

        <section class="card">
          <h2>Offline storage</h2>
          <div v-if="storage.quota" class="meter">
            <div class="bar"><div :style="{ width: `${storagePercent}%` }"></div></div>
            <p class="muted">{{ formatBytes(storage.used) }} used of {{ formatBytes(storage.quota) }} available</p>
          </div>
          <p class="line">
            <span>Downloaded songs</span>
            <span class="muted">{{ storage.songs }} · {{ formatBytes(storage.songBytes) }}</span>
          </p>
          <div v-if="storage.persisted !== null" class="line">
            <span>
              Keep downloads
              <small v-if="!storage.persisted">The browser may delete downloaded songs when space runs low.</small>
            </span>
            <span v-if="storage.persisted" class="pill ok">On</span>
            <button v-else type="button" class="secondary" @click="keepDownloads">Turn on</button>
          </div>
          <div class="row">
            <button type="button" class="danger" :disabled="!storage.songs" @click="clearDownloads">Clear downloaded songs</button>
          </div>
        </section>

        <p class="footnote">This is not the greatest music app in the world. This is just a tribute.</p>
      </div>
      <div class="footer-controls">
          <RouterLink :to="{ name: 'artists' }">Artists</RouterLink>
          <RouterLink :to="{ name: 'playlists' }">Playlists</RouterLink>
      </div>
    </section>

  </main>
</template>

<style scoped>

main {
  height:100%;
  flex:1;
  display:grid;
  grid-template-rows: 1fr;
  grid-template-columns: 1fr;
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
  width:100%;
  max-width:36rem;
  margin:0 auto;
  padding:calc(1.5rem + env(safe-area-inset-top)) 1rem 2rem;
  display:flex;
  flex-direction:column;
  gap:1rem;
}

.hero {
  display:flex;
  align-items:center;
  gap:1rem;
  padding:0 0.25rem 0.5rem;
}
.logo {
  width:4rem;
  height:4rem;
  border-radius:1rem;
  object-fit:cover;
  box-shadow:0 0.5rem 1.5rem #0008;
}
h1 {
  margin:0;
  font-size:1.6rem;
  font-weight:600;
}
.tagline {
  margin:0.15rem 0 0;
  color:#fff9;
  font-size:0.9rem;
}

.card {
  background-color:#0005;
  border:solid 1px #fff1;
  border-radius:1rem;
  padding:1rem;
  backdrop-filter:blur(1rem);
  display:flex;
  flex-direction:column;
  gap:0.85rem;
}
h2 {
  margin:0;
  font-size:0.8rem;
  font-weight:600;
  letter-spacing:0.08em;
  text-transform:uppercase;
  color:#fff9;
}

.field {
  display:flex;
  flex-direction:column;
  gap:0.35rem;
  font-size:0.85rem;
  color:#fffc;
}
input[type=url], input[type=text], input[type=password] {
  width:100%;
  min-width:0;
  background-color:#fff1;
  border:solid 1px #fff2;
  border-radius:0.6rem;
  color:#fff;
  font:inherit;
  font-size:1rem;
  padding:0.65rem 0.75rem;
}
input:focus {
  outline:none;
  border-color:dodgerblue;
  background-color:#fff2;
}
input::placeholder {
  color:#fff5;
}
.with-button {
  display:flex;
  gap:0.5rem;
}

.row {
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  gap:0.75rem;
}
.line {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:1rem;
  margin:0;
}
small {
  display:block;
  margin-top:0.15rem;
  font-size:0.8rem;
  color:#fff8;
}
.muted {
  color:#fff9;
  font-size:0.85rem;
}

button {
  font:inherit;
  font-size:0.9rem;
  border:none;
  border-radius:0.6rem;
  padding:0.6rem 1rem;
  color:#fff;
  display:inline-flex;
  align-items:center;
  gap:0.5rem;
  flex-shrink:0;
  white-space:nowrap;
  cursor:pointer;
}
button:disabled {
  opacity:0.45;
  cursor:default;
}
.primary {
  background-color:dodgerblue;
  font-weight:600;
}
.secondary, .ghost {
  background-color:#fff2;
}
.ghost {
  flex:0 0 auto;
}
.danger {
  background-color:#b2222233;
  color:#ff8a8a;
}

.pill {
  font-size:0.8rem;
  padding:0.25rem 0.65rem;
  border-radius:1rem;
  background-color:#fff2;
}
.pill.ok {
  background-color:#2e8b5733;
  color:#7dffb0;
}
.pill.error {
  background-color:#b2222233;
  color:#ff8a8a;
}

.stats {
  display:grid;
  grid-template-columns:repeat(4, 1fr);
  gap:0.5rem;
}
.stats div {
  display:flex;
  flex-direction:column;
  align-items:center;
  padding:0.6rem 0.25rem;
  border-radius:0.6rem;
  background-color:#fff1;
}
.stats strong {
  font-size:1.3rem;
  font-variant-numeric:tabular-nums;
}
.stats span {
  font-size:0.75rem;
  color:#fff9;
}

.status {
  margin:0;
  font-size:0.85rem;
  color:#fffb;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.status.error {
  color:#ff8a8a;
  white-space:normal;
}

.spinner {
  width:0.9rem;
  height:0.9rem;
  border-radius:50%;
  border:solid 2px #fff5;
  border-top-color:#fff;
  animation:spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform:rotate(360deg); }
}

.toggle {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:1rem;
  cursor:pointer;
}
.toggle input {
  position:absolute;
  opacity:0;
  pointer-events:none;
}
.switch {
  flex:0 0 auto;
  width:2.75rem;
  height:1.6rem;
  border-radius:1rem;
  background-color:#fff3;
  position:relative;
  transition:background-color 0.2s;
}
.switch::after {
  content:'';
  position:absolute;
  top:0.2rem;
  left:0.2rem;
  width:1.2rem;
  height:1.2rem;
  border-radius:50%;
  background-color:#fff;
  transition:transform 0.2s;
}
.toggle input:checked + .switch {
  background-color:dodgerblue;
}
.toggle input:checked + .switch::after {
  transform:translateX(1.15rem);
}
.toggle input:focus-visible + .switch {
  outline:solid 2px #fff;
  outline-offset:2px;
}

.meter .bar {
  height:0.5rem;
  border-radius:0.25rem;
  background-color:#fff1;
  overflow:hidden;
}
.meter .bar div {
  height:100%;
  background-image:linear-gradient(90deg, dodgerblue, mediumorchid);
}
.meter p {
  margin:0.4rem 0 0;
}

.footnote {
  margin:0.5rem 0 0;
  text-align:center;
  font-size:0.8rem;
  font-style:italic;
  color:#fff6;
}
</style>
