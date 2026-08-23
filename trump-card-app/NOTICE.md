# Third-party assets

All 52 playing-card illustrations embedded in `index.html` (the
`<symbol id="{suit}_{rank}">` defs, e.g. `heart_king`, `spade_5`) are
from **SVG-cards** by David Bellot, forked and maintained by
Hendrik te Bekke:

- https://github.com/htdebeer/SVG-cards
- Original: https://web.archive.org/web/2015/http://svg-cards.sourceforge.net/
- License: GNU Lesser General Public License v2.1 (LGPL-2.1)

`qrcode.lib.js` is **qrcode-generator** by Kazuhiko Arase, used to draw
the share-link QR code entirely on-device (no network calls):

- https://github.com/kazuhikoarase/qrcode-generator
- License: MIT

The multiplayer "watch together" room uses **PeerJS** (loaded from
https://unpkg.com/peerjs), a wrapper around WebRTC that also brokers
the initial peer-to-peer handshake through PeerJS's free public cloud
server (no account or API key involved). Once a room's participants are
connected, game data flows directly device-to-device — the host phone
holds the game state, no backend server of ours is involved.

- https://github.com/peers/peerjs
- License: MIT

Everything else in this app is original.
