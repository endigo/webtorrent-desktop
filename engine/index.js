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
 *   { "event": "torrent://poster", "payload": { torrentKey, infoHash, dataUrl } }
 *
 * Methods:
 *   ping, torrent_add, torrent_remove, torrent_create,
 *   torrent_select_files, stream_start, stream_stop, set_global_trackers,
 *   generate_poster
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
/** @type {string|null} infoHash the HTTP stream server is bound to */
let serverInfoHash = null
let prevProgress = null

const VIDEO_EXTS = new Set([
  '.mp4', '.m4v', '.webm', '.mkv', '.mov', '.avi', '.wmv', '.flv', '.ts', '.m2ts', '.ogv'
])
const AUDIO_EXTS = new Set([
  '.mp3', '.m4a', '.aac', '.flac', '.ogg', '.wav', '.opus', '.wma'
])
const IMAGE_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'
])
/** infoHashes we've already emitted a poster for */
const posterDone = new Set()

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

    // Resolve ~/… so resume always hits the same folder on disk.
    // WebTorrent verifies existing pieces there and continues (does not start at 0%).
    const resolvedPath = resolveDownloadPath(downloadPath)
    try {
      fs.mkdirSync(resolvedPath, { recursive: true })
    } catch (err) {
      process.stderr.write(`mkdir download path: ${err.message}\n`)
    }

    const torrent = client.add(torrentId, {
      path: resolvedPath
      // default: skipVerify false → hash-check existing files and resume
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

    // path is absolute — UI persists it so the next launch resumes the same folder
    return { torrentKey, torrentId, path: resolvedPath }
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
   * Start (or reuse) the HTTP stream server for progressive playback while
   * the torrent is still downloading. Returns localURL + fileIndex of the
   * first playable media file.
   *
   * @param {{ infoHash?: string, torrentKey?: number|string, fileIndex?: number }} params
   */
  async stream_start (params) {
    const torrent = resolveTorrent(params)
    if (!torrent) {
      throw new Error(
        `torrent not found (infoHash=${params && params.infoHash}, key=${params && params.torrentKey})`
      )
    }
    // Need metadata/files — wait if still fetching (streaming works before full download)
    if (!torrent.ready) {
      await new Promise((resolve, reject) => {
        const onReady = () => {
          cleanup()
          resolve()
        }
        const onError = (err) => {
          cleanup()
          reject(err)
        }
        const cleanup = () => {
          torrent.removeListener('ready', onReady)
          torrent.removeListener('error', onError)
        }
        torrent.once('ready', onReady)
        torrent.once('error', onError)
      })
    }

    const fileIndex =
      params && Number.isInteger(params.fileIndex)
        ? params.fileIndex
        : pickPlayableFileIndex(torrent)
    if (fileIndex < 0) {
      throw new Error('no playable video/audio file in torrent')
    }

    // Prioritize the file being streamed so download focuses on playback
    prioritizeFile(torrent, fileIndex)

    const info = await startServerAsync(torrent)
    info.fileIndex = fileIndex
    info.fileName = torrent.files[fileIndex] && torrent.files[fileIndex].name
    return info
  },

  stream_stop () {
    stopServer()
    return { stopped: true }
  },

  /**
   * Force poster generation for a torrent (image cover or video frame via ffmpeg).
   * @param {{ infoHash?: string, torrentKey?: number|string }} params
   */
  async generate_poster (params) {
    const torrent = resolveTorrent(params)
    if (!torrent) throw new Error('torrent not found')
    posterDone.delete(torrent.infoHash)
    const dataUrl = await tryGeneratePoster(torrent, true)
    if (!dataUrl) throw new Error('no poster available yet')
    return {
      torrentKey: torrent.key,
      infoHash: torrent.infoHash,
      dataUrl
    }
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
  // Prefer real info-hash, but fall back to torrentKey when UI still has pending-*
  if (params.infoHash && typeof params.infoHash === 'string') {
    const hash = params.infoHash
    if (!hash.startsWith('pending-') && hash !== 'undefined') {
      const byHash = client.get(hash)
      if (byHash) return byHash
    }
  }
  if (params.torrentKey != null) {
    const key = params.torrentKey
    const byKey = client.torrents.find(
      (t) => t.key === key || String(t.key) === String(key)
    )
    if (byKey) return byKey
  }
  // Last resort: infoHash lookup even if weird (client.get may still match)
  if (params.infoHash) {
    return client.get(params.infoHash) || null
  }
  return null
}

function extname (name) {
  const i = String(name || '').lastIndexOf('.')
  return i >= 0 ? String(name).slice(i).toLowerCase() : ''
}

/** Expand ~ and default to ~/Downloads (absolute). */
function resolveDownloadPath (p) {
  const home = os.homedir()
  if (!p || typeof p !== 'string' || !p.trim()) {
    return path.join(home, 'Downloads')
  }
  const trimmed = p.trim()
  if (trimmed === '~') return home
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(home, trimmed.slice(2))
  }
  return path.resolve(trimmed)
}

function isPlayableFile (file) {
  const ext = extname(file && file.name)
  return VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext)
}

/** First video, else first audio, else 0 if any files. */
function pickPlayableFileIndex (torrent) {
  if (!torrent.files || torrent.files.length === 0) return -1
  const video = torrent.files.findIndex((f) => VIDEO_EXTS.has(extname(f.name)))
  if (video >= 0) return video
  const audio = torrent.files.findIndex((f) => AUDIO_EXTS.has(extname(f.name)))
  if (audio >= 0) return audio
  // Fallback: largest file (often the main video without a clear extension)
  let best = 0
  for (let i = 1; i < torrent.files.length; i++) {
    if (torrent.files[i].length > torrent.files[best].length) best = i
  }
  return best
}

/**
 * Select the streamed file and give it high priority so pieces arrive in
 * roughly sequential order while the rest of the torrent continues.
 */
function prioritizeFile (torrent, fileIndex) {
  if (!torrent.files || !torrent.files[fileIndex]) return
  try {
    // Keep all previously selected files selected; boost the one we play
    const file = torrent.files[fileIndex]
    file.select()
    // Prefer early pieces for smooth start (WebTorrent supports critical)
    if (typeof file._startPiece === 'number' && typeof torrent.critical === 'function') {
      const start = file._startPiece
      const end = Math.min(file._endPiece, start + 8)
      torrent.critical(start, end)
    }
  } catch (err) {
    process.stderr.write(`prioritizeFile: ${err.message}\n`)
  }
}

// ---- Posters ---------------------------------------------------------------

function throttle (fn, ms) {
  let last = 0
  let pending = null
  return function throttled (...args) {
    const now = Date.now()
    if (now - last >= ms) {
      last = now
      return fn.apply(this, args)
    }
    if (pending) clearTimeout(pending)
    pending = setTimeout(() => {
      last = Date.now()
      pending = null
      fn.apply(this, args)
    }, ms - (now - last))
  }
}

function schedulePoster (torrent, force) {
  if (!torrent || !torrent.infoHash) return
  if (!force && posterDone.has(torrent.infoHash)) return
  tryGeneratePoster(torrent, force).then((dataUrl) => {
    if (!dataUrl) return
    posterDone.add(torrent.infoHash)
    emit('torrent://poster', {
      torrentKey: torrent.key,
      infoHash: torrent.infoHash,
      dataUrl
    })
  }).catch((err) => {
    process.stderr.write(`poster: ${err.message}\n`)
  })
}

/**
 * Prefer poster/cover images in the torrent; else ffmpeg frame from video if done.
 * Returns a data: URL string or null.
 */
async function tryGeneratePoster (torrent, allowVideo) {
  if (!torrent.files || torrent.files.length === 0) return null

  // 1) Explicit poster.* file
  const posterNamed = torrent.files.find((f) =>
    /^poster\.(jpe?g|png|gif|webp)$/i.test(path.basename(f.name))
  )
  if (posterNamed) {
    const url = await fileToDataUrl(posterNamed, torrent)
    if (url) return url
  }

  // 2) Cover / folder / album art style images
  const images = torrent.files.filter((f) => IMAGE_EXTS.has(extname(f.name)))
  if (images.length > 0) {
    const scored = images.map((file) => ({
      file,
      score: scoreCoverName(file.name) + Math.min(file.length / (100 * 1024), 20)
    })).sort((a, b) => b.score - a.score)
    for (const { file } of scored) {
      const url = await fileToDataUrl(file, torrent)
      if (url) return url
    }
  }

  // 3) Video frame via ffmpeg once the file is fully on disk
  if (allowVideo) {
    const videoIdx = pickPlayableFileIndex(torrent)
    if (videoIdx >= 0 && VIDEO_EXTS.has(extname(torrent.files[videoIdx].name))) {
      const url = await videoFrameDataUrl(torrent, videoIdx)
      if (url) return url
    }
  }

  return null
}

function scoreCoverName (name) {
  const base = path.basename(name, path.extname(name)).toLowerCase()
  if (base === 'poster' || base === 'cover' || base === 'folder' || base === 'front') return 100
  if (base.includes('poster') || base.includes('cover') || base.includes('folder')) return 60
  if (base.includes('thumb') || base.includes('artwork')) return 40
  if (base.includes('back') || base.includes('spectrum')) return -20
  return 0
}

/**
 * Read a torrent file into a data URL once enough of it is available.
 */
function fileToDataUrl (file, torrent) {
  return new Promise((resolve) => {
    // Need a reasonable chunk — skip if almost nothing downloaded
    if (file.downloaded != null && file.length > 0 && file.downloaded < Math.min(file.length, 4096)) {
      return resolve(null)
    }

    // Prefer absolute path on disk when fully downloaded
    const diskPath = path.join(torrent.path, file.path)
    if (file.progress >= 0.99 && fs.existsSync(diskPath)) {
      try {
        const buf = fs.readFileSync(diskPath)
        if (buf.length > 0 && buf.length < 8 * 1024 * 1024) {
          return resolve(bufferToDataUrl(buf, extname(file.name)))
        }
      } catch {
        /* fall through to stream */
      }
    }

    // Stream from WebTorrent (works for complete or buffered pieces)
    try {
      const chunks = []
      let total = 0
      const maxBytes = 4 * 1024 * 1024
      const stream = file.createReadStream()
      const timer = setTimeout(() => {
        try { stream.destroy() } catch { /* ignore */ }
        resolve(null)
      }, 8000)

      stream.on('data', (chunk) => {
        total += chunk.length
        if (total <= maxBytes) chunks.push(chunk)
        if (total > maxBytes) {
          try { stream.destroy() } catch { /* ignore */ }
        }
      })
      stream.on('error', () => {
        clearTimeout(timer)
        resolve(null)
      })
      stream.on('end', () => {
        clearTimeout(timer)
        if (chunks.length === 0) return resolve(null)
        const buf = Buffer.concat(chunks)
        resolve(bufferToDataUrl(buf, extname(file.name)))
      })
    } catch {
      resolve(null)
    }
  })
}

function bufferToDataUrl (buf, ext) {
  const mime =
    ext === '.png' ? 'image/png'
      : ext === '.gif' ? 'image/gif'
        : ext === '.webp' ? 'image/webp'
          : 'image/jpeg'
  return `data:${mime};base64,${buf.toString('base64')}`
}

/**
 * Extract one JPEG frame with ffmpeg when available and the video is on disk.
 */
function videoFrameDataUrl (torrent, fileIndex) {
  return new Promise((resolve) => {
    const file = torrent.files[fileIndex]
    if (!file) return resolve(null)
    const diskPath = path.join(torrent.path, file.path)
    if (!fs.existsSync(diskPath)) return resolve(null)

    const { spawn } = require('child_process')
    const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg'
    const args = [
      '-hide_banner', '-loglevel', 'error',
      '-ss', '5',
      '-i', diskPath,
      '-frames:v', '1',
      '-f', 'image2',
      '-vcodec', 'mjpeg',
      'pipe:1'
    ]
    let proc
    try {
      proc = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch {
      return resolve(null)
    }

    const chunks = []
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch { /* ignore */ }
      resolve(null)
    }, 12000)

    proc.stdout.on('data', (c) => chunks.push(c))
    proc.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0 || chunks.length === 0) return resolve(null)
      const buf = Buffer.concat(chunks)
      if (buf.length < 100) return resolve(null)
      resolve(bufferToDataUrl(buf, '.jpg'))
    })
  })
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
    schedulePoster(torrent)
  })
  torrent.on('ready', () => {
    const info = getTorrentInfo(torrent)
    emit('torrent://ready', { torrentKey: torrent.key, info })
    updateTorrentProgress()
    schedulePoster(torrent)
  })
  torrent.on('done', () => {
    const info = getTorrentInfo(torrent)
    emit('torrent://done', { torrentKey: torrent.key, info })
    updateTorrentProgress()
    schedulePoster(torrent, true)
  })
  // Retry poster as pieces land (images/video frames may become readable)
  torrent.on('download', throttle(() => schedulePoster(torrent), 5000))
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
    // Reuse only if the server already belongs to this torrent
    if (server && serverInfoHash === torrent.infoHash) {
      try {
        const port = server.address().port
        const info = serverInfo(torrent, port)
        emit('torrent://server', info)
        return resolve(info)
      } catch {
        stopServer()
      }
    }

    // Different torrent (or broken server) — tear down and recreate
    if (server) stopServer()

    try {
      // createServer enables range requests → progressive play while downloading
      server = torrent.createServer()
    } catch (err) {
      return reject(err)
    }

    serverInfoHash = torrent.infoHash
    server.listen(0, '127.0.0.1', () => {
      try {
        const port = server.address().port
        const info = serverInfo(torrent, port)
        emit('torrent://server', info)
        resolve(info)
      } catch (err) {
        reject(err)
      }
    })
    server.on('error', (err) => {
      stopServer()
      reject(err)
    })
  })
}

function serverInfo (torrent, port) {
  const urlSuffix = ':' + port
  return {
    torrentKey: torrent.key,
    infoHash: torrent.infoHash,
    localURL: 'http://127.0.0.1' + urlSuffix,
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
  serverInfoHash = null
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
