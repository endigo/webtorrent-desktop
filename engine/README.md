# WebTorrent engine sidecar

Node process that owns the WebTorrent client. The Tauri shell spawns
`index.js` and talks JSON-lines over stdin/stdout.

## Setup

```bash
cd engine
npm install
```

## Protocol

One JSON object per line on stdin:

```json
{"id":1,"method":"torrent_add","params":{"torrentKey":1,"torrentId":"magnet:…","path":"/Downloads"}}
```

Stdout responses:

```json
{"id":1,"ok":true,"result":{…}}
{"event":"torrent://progress","payload":{…}}
```

### Methods

| Method | Params |
|--------|--------|
| `ping` | — |
| `torrent_add` | `torrentKey`, `torrentId`, `path?`, `selections?` |
| `torrent_remove` | `infoHash?` or `torrentKey?` |
| `torrent_create` | `torrentKey`, `files[]`, `options?` |
| `torrent_select_files` | `infoHash?`/`torrentKey?`, `selections[]` |
| `stream_start` | `infoHash?`/`torrentKey?` |
| `stream_stop` | — |
| `set_global_trackers` | `trackers[]` |

### Events

- `engine://ready`
- `torrent://progress`
- `torrent://metadata`
- `torrent://ready`
- `torrent://done`
- `torrent://parsed`
- `torrent://error`
- `torrent://server` (HTTP stream URLs)

## Manual smoke test

```bash
printf '%s\n' '{"id":1,"method":"ping","params":{}}' | node index.js
```
