# REPORT-W5 — Preferences + OS integration polish

**Status:** complete (UI side)  
**Host:** mini-knit  
**Branch:** `feat/tauri-rewrite`  
**Date:** 2026-07-31  

## What landed

Preferences page is wired to the W1a shell command surface:

| Feature | Implementation |
|---------|----------------|
| Load prefs | `prefs_get` on app boot + prefs page mount |
| Save prefs | `prefs_merge` / `prefs_set` via `savePrefs` |
| Download path | text field + Browse → `open_directory` |
| Startup | `draft.startup` + `@tauri-apps/plugin-autostart` enable/disable |
| Playback / sounds / file-handler | local draft → merge on Done |
| Fallbacks | Browser Vite dev keeps mock prefs when invoke missing |

### Key files

- `ui/src/pages/PreferencesPage.tsx` — draft form, browse, autostart hint
- `ui/src/types/prefs.ts` — `AppPrefs` + defaults
- `ui/src/lib/tauri.ts` — `prefsGet` / `prefsSet` / `prefsMerge` / `autostart*`
- `ui/src/store/useAppStore.ts` — `loadPrefs` / `savePrefs`

## Build

```bash
npm run build --prefix ui
```

**Result:** success

## Notes

- Autostart uses the JS plugin (`autostart:default` already in capabilities).
- Full OS file-handler registration still depends on packaging (W6).
- External player path picker deferred (player is W4).
