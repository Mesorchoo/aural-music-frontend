import { createRouter, createWebHistory } from 'vue-router'
import SettingsView from '../views/SettingsView.vue'
import HomeView from '../views/HomeView.vue'
import AlbumView from '../views/AlbumView.vue'
import ArtistsView from '../views/ArtistsView.vue'
import ArtistView from '../views/ArtistView.vue'
import PlaylistsView from '../views/PlaylistsView.vue'
import PlaylistView from '../views/PlaylistView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: '',
      component: HomeView,
      children: [
        {
          path:'',
          name: 'artists',
          component: ArtistsView,
          props: true,
        },
        {
          path:'artist/:artist',
          name: 'artist',
          component: ArtistView,
          props: true,
        },
        {
          path:'artist/:artist/:album',
          name: 'album',
          component: AlbumView,
          props: true,
        },
        {
          path:'playlists',
          name: 'playlists',
          component: PlaylistsView,
        },
        {
          path:'playlist/:id',
          name: 'playlist',
          component: PlaylistView,
          props: true,
        }
      ]
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
    },
    {
      path: '/.*',
      redirect: '/'
    },
  ]
})

export default router
