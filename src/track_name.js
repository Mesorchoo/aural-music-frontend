// "01 - Song Name.flac" -> { number: '1', title: 'Song Name' }
export function trackParts(track) {
    const match = track.track.match(/^([0-9]+)[\s.\-_]*(.*?)\.[^.]+$/)
    if (match && match[2]) return { number: String(parseInt(match[1], 10)), title: match[2] }
    return { number: '', title: track.track.replace(/\.[^.]+$/, '') }
}
