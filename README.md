# RepoMove

Move GitHub repos from **initial `account/repo`** → **target `account/repo`** without losing track. Search, tag, drag to done — local-only, PWA-ready.

![RepoMove](https://img.shields.io/badge/vite-5.x-646CFF) ![PWA](https://img.shields.io/badge/PWA-ready-5eead4)

### Features
- **Account/repo links:** Both Initial and Target validate `owner/repo` (also accepts full `https://github.com/owner/repo` URLs, `*.git` stripped, live GitHub API badge `✓ public/private · ★N` / `○ available` / `✗ not found`)
- **Bulk fetch:** `⇄ Fetch org` pulls up to 30 repos from any org/user via `api.github.com` → creates `planned` moves (deduped)
- **Board + List:** Drag cards `planned → done`, `List` with checkboxes + `Board` kanban
- **Deep-link share:** Filters/search/sort/view sync to URL `?q=&tag=&status=&sort=&view=` — copy to share
- **Checklist template:** `+ checklist template` in notes inserts `- [ ] Transfer` tasks; rendered as interactive `notes-checklist` with per-line toggle
- **Batch bar:** `→ Planned / In progress / Done / Delete shown / Copy cmds` operates on filtered set
- **Undo:** `↩ Undo` (30-deep stack) + `Ctrl+Z` after add/edit/delete/toggle/drag/import
- **Copy cmd:** `⎘` per item copies `gh repo transfer initial target`
- **Responsive:** `980/720/520/380` breakpoints, snap board on tablet, `92dvh` dialog
- **PWA:** `manifest.json` + `sw.js` (Workbox `NetworkFirst` for GH API) — installable, offline shell

### Quick start
```bash
npm install
npm run dev      # vite @ 5173
npm run build    # dist/ with PWA precache
npm run preview  # preview build @ 4173
```
Or open `index.html` directly (zero-build fallback — service worker `sw.js` still works).

### Data
- Stored in `localStorage` `repoMover:moves-v3` (bumped to clear demo), `repoMover:theme`, `repoMover:view2`
- Export/Import JSON, no backend

### Tech
Vanilla ES modules, `Inter` + `JetBrains Mono`, CSS tokens `--accent:#7c6cff`, Vite 5 + `vite-plugin-pwa` (autoUpdate).
