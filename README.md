# Aural Music Frontend

Aural Music is a PWA (Progressive Web App) so it behaves similarly to a native App,
but doesn't require all the rigid installation and App Store setup procedures.
Once deployed to a static web server it can be accessed and configured to connect to your backend server.
By default it sets up offline access, and automatically caches any songs played for future offline use.


Should be paired with aural-music-backend.

Use with BunJS (Tested with Version 1.2.13)


## Dev server

bun run dev



## Production Build

bun run build


## Deploy to Cloudflare pages

* note requires Cloudflare Wrangler CLI (Could also deploy via git)

bun run deploy