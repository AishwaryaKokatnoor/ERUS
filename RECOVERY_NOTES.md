# ERUS Recovery Audit — 2026-10-11

This branch is reserved for safe diagnosis and targeted fixes. The `main` branch has not been changed by this audit.

## Repository inspection
- Stack: React 19 + TypeScript/Vite frontend; Express + Socket.IO backend; MongoDB/Mongoose persistence; Gemini API integration.
- Current default branch HEAD during audit: `81f86002beee9efbe6f46951219f9a459229f285`.
- Recent commits target: facilitator repetition/speech timing, assessment-report score persistence, recording uploads, slot deletion persistence, portal buttons, and migration from a local state file to MongoDB.
- No GitHub Actions workflow runs were found in the latest runs query, so there is no CI result currently available as validation.

## Highest-priority risk to investigate
The most recent commit migrates persistence to MongoDB and changes `loadPersistentState()` to delete `.erus_backend_state.json` if present. `syncMongoDBWithPersistentState()` now reads colleges and users from MongoDB as the authoritative store, and removes colleges with codes `DIT` / `IITB` and users whose college code is not in the active college set. This can be correct only if the database migration and filters match production data; it risks data loss or missing users/slots if the live MongoDB data is incomplete or uses those codes.

## Safe debugging plan
1. Do not modify `main` directly.
2. Identify the specific failing user flow and reproduce it against staging or a local copy with a safe test database.
3. Inspect runtime logs and database health before changing behavior.
4. Add a regression test for the root cause, make the smallest focused change, then build/typecheck and exercise the flow.
5. Merge only after verification.

## Validation limitation
The GitHub connector can read and write the repository, but this audit did not execute npm install, build, browser tests, or queries against the production MongoDB database. No change should be treated as tested until those checks are run in an executable environment.

## Static findings and changes on this branch
- **Facilitator silence:** `scheduleNextTurn()` treated `micActive` as if the student were currently speaking. In the room model, `micActive` is set when a student joins, so an enabled-but-idle microphone could block the turn scheduler. The guard now checks `isSpeaking` only.
- **Missing transcript turn:** the scheduler previously returned early when no transcript fragment was captured for a completed turn, leaving no next invitation. It now advances to another eligible student and uses a neutral invitation rather than analyzing stale text.
- **Data disappearance risk:** MongoDB sync deleted college records with selected codes, users with unmatched college codes, and sessions whose college was temporarily absent. The sync now preserves these MongoDB records and logs unmatched references. Legacy `.erus_backend_state.json` files are no longer deleted at startup (they are preserved, not automatically imported).
- **Startup purge risk:** `initMongoDBTablesAndSubTables()` contained automatic `deleteMany()` cleanup for legacy users, colleges, sessions, transcripts, bookings, and reports. That cleanup is now opt-in through `ERUS_PURGE_LEGACY_DUMMY_DATA=true`; it is skipped by default.
- **Assessment report persistence:** report persistence previously returned early when `sessionId` was missing and swallowed MongoDB write errors, while the API could still return success. It now fails explicitly if there is no session ID or MongoDB is disconnected, and propagates MongoDB write errors to the API error handler.
- **AI participants remain a separate unresolved issue:** current code explicitly sets `AI_GD_SIMULATION_MODE = false`, clears `room.aiParticipants`, and leaves the client `onAiParticipantSpeech` handler as a no-op. The server live-room scheduler is built around real student peers. I did not flip a flag that would not actually restore the full AI turn/audio path; that needs a dedicated implementation and regression test.
- **Testing warning:** `scripts/test-all-components-and-services.mjs` and `scripts/test-live-ai-gd.mjs` contain a hard-coded Railway production URL and perform write-capable integration actions. They were not executed. The attempted edit to guard these scripts was blocked, so they remain unsafe to run as-is; do not run them against production.

## Verification status
- Reviewed the updated source snippets and confirmed the targeted changes are present on this branch.
- No build, TypeScript check, browser/WebRTC test, live Gemini test, or MongoDB integration test was run. The GitHub connector does not execute the project build, and the repository's available integration scripts can write to production. Treat the changes as **static-analysis fixes pending execution in a disposable local/staging environment**, not as verified fixes.
