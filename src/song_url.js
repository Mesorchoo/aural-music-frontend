// Build the backend URL for a track path like "Artist/Album/01 Track.opus".
// Each part is encoded so names containing ?, # or % still work. Use this everywhere
// (playback, prefetch and cache lookups) so cache keys always match.
export function songUrl(root_url, path) {
    return `${root_url}/song/${path.split('/').map(encodeURIComponent).join('/')}`
}
