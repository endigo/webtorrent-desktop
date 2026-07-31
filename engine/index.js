#!/usr/bin/env node
/**
 * WebTorrent engine sidecar — JSON-lines over stdin/stdout.
 *
 * Request (one JSON object per line):
 *   { "id": 1, "method": "torrent_add", "params": { ... } }
 *
 * Response:
 *   { "id": 1, "ok": true, "result": { ... } }
 *   { "id": 1, "ok": false, "error": "message" }
 *
 * Events (no id):
 *   { "event": "torrent://progress", "payload": { ... } }
 *   { "event": "torrent://metadata", "payload": { ... } }
 *   { "event": "torrent://done", "payload": { ... } }
 *   { "event": "torrent://ready", "payload": { ... } }
 *   { "event": "torrent://error", "payload": { ... } }
 *   { "event": "torrent://server", "payload": { ... } }
 *
 * Methods:
 *   ping, torrent_add, torrent_remove, torrent_create,
 *   torrent_select_files, stream_start, stream_stop, set_global_trackers
 */

'use strict'

const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const readline = require('readline')
const util = require('util')
const WebTorrent = require('webtorrent')

let networkAddress
try {
  networkAddress = require('network-address')
} catch {
  networkAddress = () => '127.0.0.1'
}

const VERSION = '0.25.0'
const VERSION_STR = VERSION.replace(/\d*./g, (v) => `0${v % 100}`.slice(-2)).slice(0, 4)
const VERSION_PREFIX = '-WD' + VERSION_STR + '-'
const PEER_ID = Buffer.from(VERSION_PREFIX + crypto.randomBytes(9).toString('base64'))

const client = new WebTorrent({ peerId: PEER_ID })
let server = null
let prevProgress = null

// ---- I/O helpers -----------------------------------------------------------

function write (obj) {
  try {
    process.stdout.write(JSON.stringify(obj) + '\n')
  } catch (err) {
    process.stderr.write(`engine write error: ${err}\n`)
  }
}

function reply (id, result) {
  write({ id, ok: true, result })
}

function replyError (id, error) {
  write({ id, ok: false, error: String(error && error.message ? error.message : error) })
}

function emit (event, payload) {
  write({ event, payload })
}

// ---- Client events ---------------------------------------------------------

client.on('warning', (err) => emit('torrent://error', { level: 'warning', message: err.message }))
client.on('error', (err) => emit('torrent://error', { level: 'error', message: err.message }))

setInterval(updateTorrentProgress, 1000)

// ---- Methods ---------------------------------------------------------------

const methods = {
  ping () {
    return { pong: true, torrents: client.torrents.length, version: VERSION }
  },

  /**
   * @param {{ torrentKey: number|string, torrentId: string, path?: string, selections?: boolean[] }} params
   */
  torrent_add (params) {
    const { torrentKey, torrentId, path: downloadPath, selections } = params || {}
    if (torrentKey == null || !torrentId) {
      throw new Error('torrent_add requires torrentKey and torrentId')
    }

    const torrent = client.add(torrentId, {
      path: downloadPath || path.join(os.homedir(), 'Downloads')
    })
    torrent.key = torrentKey
    attachTorrentEvents(torrent)
    torrent.once('ready', () => {
      try {
        selectFiles(torrent, selections)
      } catch (err) {
        emit('torrent://error', { torrentKey, message: err.message })
      }
    })

    return { torrentKey, torrentId }
  },

  /**
   * @param {{ infoHash?: string, torrentKey?: number|string }} params
   */
  torrent_remove (params) {
    const torrent = resolveTorrent(params)
    if (!torrent) throw new Error('torrent not found')
    const infoHash = torrent.infoHash
    const torrentKey = torrent.key
    torrent.destroy()
    return { infoHash, torrentKey }
  },

  /**
   * @param {{ torrentKey: number|string, files: string[], options?: object }} params
   */
  torrent_create (params) {
    const { torrentKey, files, options } = params || {}
    if (torrentKey == null) throw new Error('torrent_create requires torrentKey')
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('torrent_create requires files[]')
    }

    // Accept either plain path strings or { path } objects (Electron parity).
    const paths = files.map((f) => (typeof f === 'string' ? f : f.path))
    const seedOpts = Object.assign({}, options || {}, {
      // ensure announce list if provided at top level
    })
    const torrent = client.seed(paths, seedOpts)
    torrent.key = torrentKey
    attachTorrentEvents(torrent)
    emit('torrent://ready', { torrentKey, phase: 'seeding-started' })
    return { torrentKey, files: paths }
  },

  /**
   * @param {{ infoHash?: string, torrentKey?: number|string, selections: boolean[] }} params
   */
  torrent_select_files (params) {
    const torrent = resolveTorrent(params)
    if (!torrent) throw new Error('torrent not found')
    selectFiles(torrent, params.selections)
    return { infoHash: torrent.infoHash, torrentKey: torrent.key }
  },

  /**
   * @param {{ infoHash?: string, torrentKey?: number|string }} params
   */
  async stream_start (params) {
    const torrent = resolveTorrent(params)
    if (!torrent) throw new Error('torrent not found')
    if (!torrent.ready) {
      await new Promise((resolve) => torrent.once('ready', resolve))
    }
    return startServerAsync(torrent)
  },

  stream_stop () {
    stopServer()
    return { stopped: true }
  },

  /**
   * @param {{ trackers: string[] }} params
   */
  set_global_trackers (params) {
    globalThis.WEBTORRENT_ANNOUNCE = (params && params.trackers) || []
    return { count: globalThis.WEBTORRENT_ANNOUNCE.length }
  }
}

// ---- Torrent helpers -------------------------------------------------------

function resolveTorrent (params) {
  if (!params) return null
  if (params.infoHash) return client.get(params.infoHash)
  if (params.torrentKey != null) {
    return client.torrents.find((t) => t.key === params.torrentKey) || null
  }
  return null
}

function attachTorrentEvents (torrent) {
  torrent.on('warning', (err) =>
    emit('torrent://error', { torrentKey: torrent.key, level: 'warning', message: err.message }))
  torrent.on('error', (err) =>
    emit('torrent://error', { torrentKey: torrent.key, level: 'error', message: err.message }))
  torrent.on('infoHash', () =>
    emit('torrent://parsed', {
      torrentKey: torrent.key,
      infoHash: torrent.infoHash,
      magnetURI: torrent.magnetURI
    }))
  torrent.on('metadata', () => {
    const info = getTorrentInfo(torrent)
    emit('torrent://metadata', { torrentKey: torrent.key, info })
    updateTorrentProgress()
  })
  torrent.on('ready', () => {
    const info = getTorrentInfo(torrent)
    emit('torrent://ready', { torrentKey: torrent.key, info })
    updateTorrentProgress()
  })
  torrent.on('done', () => {
    const info = getTorrentInfo(torrent)
    emit('torrent://done', { torrentKey: torrent.key, info })
    updateTorrentProgress()
  })
}

function getTorrentInfo (torrent) {
  return {
    infoHash: torrent.infoHash,
    magnetURI: torrent.magnetURI,
    name: torrent.name,
    path: torrent.path,
    length: torrent.length,
    files: (torrent.files || []).map((file) => ({
      name: file.name,
      length: file.length,
      path: file.path
    })),
    bytesReceived: torrent.received
  }
}

function selectFiles (torrent, selections) {
  if (!torrent.files || torrent.files.length === 0) return

  if (!selections) {
    selections = new Array(torrent.files.length).fill(true)
  }
  if (selections.length !== torrent.files.length) {
    throw new Error(
      `got ${selections.length} file selections, but torrent has ${torrent.files.length} files`
    )
  }

  torrent.deselect(0, torrent.pieces.length - 1, false)
  selections.forEach((selection, i) => {
    const file = torrent.files[i]
    if (selection) file.select()
    else file.deselect()
  })
}

function startServerAsync (torrent) {
  return new Promise((resolve, reject) => {
    if (server) {
      try {
        const port = server.address().port
        const info = serverInfo(torrent, port)
        emit('torrent://server', info)
        return resolve(info)
      } catch {
        stopServer()
      }
    }

    try {
      server = torrent.createServer()
    } catch (err) {
      return reject(err)
    }

    server.listen(0, () => {
      try {
        const port = server.address().port
        const info = serverInfo(torrent, port)
        emit('torrent://server', info)
        resolve(info)
      } catch (err) {
        reject(err)
      }
    })
    server.on('error', reject)
  })
}

function serverInfo (torrent, port) {
  const urlSuffix = ':' + port
  return {
    torrentKey: torrent.key,
    infoHash: torrent.infoHash,
    localURL: 'http://localhost' + urlSuffix,
    networkURL: 'http://' + networkAddress() + urlSuffix,
    networkAddress: networkAddress(),
    port
  }
}

function stopServer () {
  if (!server) return
  try {
    server.destroy()
  } catch {
    /* ignore */
  }
  server = null
}

function updateTorrentProgress () {
  const progress = getTorrentProgress()
  if (prevProgress && util.isDeepStrictEqual(progress, prevProgress)) return
  emit('torrent://progress', progress)
  prevProgress = progress
}

function getTorrentProgress () {
  const progress = client.progress
  const hasActiveTorrents = client.torrents.some((t) => t.progress !== 1)
  const torrents = client.torrents.map((torrent) => {
    const fileProg =
      torrent.files &&
      torrent.files.map((file) => {
        const numPieces = file._endPiece - file._startPiece + 1
        let numPiecesPresent = 0
        for (let piece = file._startPiece; piece <= file._endPiece; piece++) {
          if (torrent.bitfield && torrent.bitfield.get(piece)) numPiecesPresent++
        }
        return {
          startPiece: file._startPiece,
          endPiece: file._endPiece,
          numPieces,
          numPiecesPresent
        }
      })
    return {
      torrentKey: torrent.key,
      infoHash: torrent.infoHash,
      name: torrent.name,
      ready: torrent.ready,
      progress: torrent.progress,
      downloaded: torrent.downloaded,
      downloadSpeed: torrent.downloadSpeed,
      uploadSpeed: torrent.uploadSpeed,
      numPeers: torrent.numPeers,
      length: torrent.length,
      files: fileProg
    }
  })
  return { torrents, progress, hasActiveTorrents }
}

// ---- Request loop ----------------------------------------------------------

async function handleLine (line) {
  line = line.trim()
  if (!line) return

  let msg
  try {
    msg = JSON.parse(line)
  } catch (err) {
    emit('torrent://error', { level: 'error', message: `invalid JSON: ${err.message}` })
    return
  }

  const { id, method, params } = msg
  if (!method) {
    if (id != null) replyError(id, 'missing method')
    return
  }

  const fn = methods[method]
  if (!fn) {
    if (id != null) replyError(id, `unknown method: ${method}`)
    return
  }

  try {
    const result = await fn(params || {})
    if (id != null) reply(id, result)
  } catch (err) {
    if (id != null) replyError(id, err)
    else emit('torrent://error', { level: 'error', message: err.message, method })
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', (line) => {
  handleLine(line).catch((err) => {
    emit('torrent://error', { level: 'error', message: err.message })
  })
})

rl.on('close', () => {
  stopServer()
  try {
    client.destroy(() => process.exit(0))
  } catch {
    process.exit(0)
  }
})

// Ready signal so Rust knows the process is listening.
emit('engine://ready', { version: VERSION, pid: process.pid })

process.stderr.write(`webtorrent-engine ready pid=${process.pid}\n`)
