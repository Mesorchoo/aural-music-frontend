import './assets/main.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { registerSW } from 'virtual:pwa-register'

import App from './App.vue'
import router from './router'

const updateSW = registerSW({
  onNeedRefresh() {
      updateSW(true)
  },

  onOfflineReady() {
    alert('Ready for offline')
  },

  onRegistered(registration){
    // console.log('REGISTERED', registration)
  },
  onRegisteredSW(url, registration) {
    // console.log('REGISTEREDSW', url, registration)
  }
})




const app = createApp(App)



app.use(createPinia())
app.use(router)

app.mount('#app')
