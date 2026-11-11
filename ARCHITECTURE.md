# Architecture and Priorities

## Product Slice

The main workflow is one page from draft to shared work: create or import, edit with familiar formatting, watch autosave, and grant a teammate editor or viewer access. I chose a deliberately small workspace with two seeded accounts instead of building signup and password recovery. That makes sharing demonstrable without suggesting the mock identity layer is production authentication.

## System Shape

- React and TipTap provide the browser editor and formatting controls.
- Express serves the built frontend and the JSON API from one Node process.
- Password login creates a signed, eight-hour, HttpOnly/SameSite cookie. The API derives identity from that cookie and checks ownership or explicit shares before returning or mutating a document; client-supplied identity headers are ignored.
- A JSON file under `DATA_DIR` stores TipTap document JSON, ownership, share roles, and timestamps. Writes use a temporary file followed by rename to avoid exposing a partially written document.
- Markdown/text import is parsed on the server into basic TipTap paragraphs, headings, and lists. Upload size is capped at 2 MB.

The Render template targets the free web-service plan without a persistent disk. Its deployed JSON file is ephemeral and can be lost when the service restarts or redeploys; durable hosted persistence would require an external database or a paid persistent disk.

Production requires a generated `SESSION_SECRET` plus unique 16-character-minimum `DEMO_ALICE_PASSWORD` and `DEMO_MARCO_PASSWORD` secrets. Login is rate-limited, password comparison uses scrypt-derived hashes with timing-safe comparison, and production responses include security headers. Signed cookies avoid an in-memory server session store, but this remains seeded demo authentication rather than a full identity provider. Credentials cannot be recovered or reset in-app.

## Tradeoffs

A file-backed store keeps setup and local review friction low, but this design assumes one app process and does not provide transactional concurrency or multi-instance safety. Signed cookies protect the selected seeded identity, but the two shared demo accounts are not a substitute for individual accounts, password recovery, or an external identity provider. Autosave is debounced and pending edits are flushed before switching documents; simultaneous collaborators can still overwrite one another because there is no operational transform or CRDT.

I prioritized end-to-end editing, access enforcement, import, persistence, and one meaningful API integration test over realtime cursors, comments, version history, DOCX, and broad account management. The editor uses a small core set of TipTap extensions to keep the writing surface understandable.

## Next 2-4 Hours

1. Add revision numbers and optimistic concurrency so concurrent updates fail visibly instead of overwriting newer work.
2. Add a real identity provider and verify permissions against authenticated server-side sessions.
3. Add a deploy target with a managed persistent database and a public smoke-test URL.
4. Improve Markdown import coverage and add export after defining the expected round-trip behavior.
