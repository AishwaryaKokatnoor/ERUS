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
