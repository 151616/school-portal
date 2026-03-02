# Local Firebase Dev

Use this repo in local emulator mode when you want to test auth, Realtime Database rules, and callable functions without touching production.

## One-time setup

1. Create `.env.local` in the repo root with the same values as `.env.local.example`.
2. Install dependencies:
   - `npm install`
   - `cd functions && npm install`

## Start local dev

Run the emulators in one terminal:

```powershell
npm run emulators
```

Run the Vite app in a second terminal:

```powershell
npm run dev
```

## Default local endpoints

- Emulator UI: `http://127.0.0.1:4000`
- Auth Emulator: `127.0.0.1:9099`
- Realtime Database Emulator: `127.0.0.1:9000`
- Functions Emulator: `127.0.0.1:5001`
- Vite App: `http://127.0.0.1:5173`

## Notes

- Emulator mode is opt-in. Production Firebase remains the default unless `.env.local` sets `VITE_USE_FIREBASE_EMULATORS=true`.
- The app now routes Auth, Realtime Database, and callable Functions through the shared Firebase client, so local emulator mode applies consistently.
- Google popup sign-in may not mirror production behavior in the Auth emulator. Email/password is the most reliable local path.
