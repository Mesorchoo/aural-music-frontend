import { ref, computed, reactive, watch } from 'vue'
import { defineStore } from 'pinia'
import logoUrl from '../assets/logo.webp'

export const usePlaylistStore = defineStore('playlist', () => {

  const playlist = ref({
    list: [],
    current: { path: '', artist: '', album: '' },
  })


  function addToPlaylist(...songs){
    playlist.value.list.splice(0, playlist.value.list.length)
    console.log('adding', JSON.stringify(songs), JSON.stringify(arguments))
    playlist.value.list.push(...JSON.parse(JSON.stringify(songs)))
    playlist.value.current = playlist.value.list[0]
  }

  function nextSong(){
    const m = playlist.value.list.shift()
    playlist.value.list.sort()
    playlist.value.list.push(m)
    playlist.value.current = playlist.value.list[0]
  }

  function prevSong(){
    const m = playlist.value.list.pop()
    playlist.value.list.unshift(m)
    playlist.value.list.sort()
    playlist.value.current = playlist.value.list[0]
  }

  return { playlist, addToPlaylist, nextSong, prevSong }
})
