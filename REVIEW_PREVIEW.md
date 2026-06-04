# Cafe Software Quick Check & Preview Notes

## Preview
- Web admin panel launches successfully with Vite on `http://localhost:3000`.
- Login screen renders correctly for both Admin and Staff PIN tabs.
- Screenshot captured for your reference: `browser:/tmp/codex_browser_invocations/a6d6d8edf268f33c/artifacts/artifacts/cafe-login-preview.png`

## What I Checked
1. Frontend build health (`web-panel`)
   - Installed dependencies and produced a production build successfully.
2. Backend test health (`backend`)
   - Attempted to run pytest, but Python dependencies are currently unavailable in this environment due package index/proxy restrictions.
3. Basic code review for immediate improvement opportunities.

## High-Priority Improvements You Should Make Next
1. **Move JWT secret to environment variables**
   - `backend/server.py` currently uses a hardcoded JWT secret (`JWT_SECRET = "dietcafe_secret_key_2024"`).
   - Replace with `os.environ[...]` and rotate the secret.

2. **Add API URL configuration per environment**
   - `web-panel/src/utils/api.ts` uses a fixed `BASE = '/api'`.
   - Add `VITE_API_BASE_URL` support to avoid issues in staging/production deployments.

3. **Avoid exposing demo admin credentials in production UI**
   - `web-panel/src/pages/Login.tsx` has a “Use demo credentials” button.
   - Hide this behind a dev-only environment flag.

4. **Set up CI checks for backend + frontend**
   - Add pipeline steps for frontend build and backend tests to catch regressions early.

## Medium-Priority Improvements
1. Add request timeout and retry handling in frontend API helper.
2. Add loading/empty/error states consistently across admin pages.
3. Add role-based e2e smoke tests for Admin, Kitchen, Cashier routes.

## Suggested Change Plan
1. Security hardening (JWT/env/config split).
2. Deployment config cleanup (frontend API base URLs).
3. UX polishing (error handling, skeleton states).
4. Automated quality gates (CI + tests).

