# Working notes for Claude

## Verify visually before handing off (required)

For **every** UI change, do NOT stop at writing code + typechecking. Run the
app, take a screenshot, and compare it against the intended design/prototype
**before** telling the user it's done. Catch the small things yourself
(gaps, overlaps, missing icons, wrong spacing, broken scroll behavior) — the
user should not have to point them out.

- Frontend (customer app): Expo — `frontend/` (run web mode + screenshot for a
  quick visual check; backend at `backend/server.py`).
- Admin/web panel: `web-panel/` (Vite — `npm run dev`).

Order of work for a UI task: implement → typecheck → **run + screenshot +
self-audit against the prototype** → only then hand off.

## Project layout

- `frontend/` — Expo React Native customer app (design system in
  `frontend/utils/theme.ts`: FUEL palette — sand / ink / lime; fonts Anton +
  HankenGrotesk). Canonical goals in `theme.ts` `GOALS` — never hardcode.
- `backend/` — FastAPI (`server.py`), Mongo. Staff auth is login_code +
  password (not PIN).
- `web-panel/` — Vite admin/HQ panel.
