# Submission Contents

Included files:

- `.gitignore`, `.env.example`
- `index.html`, `server.js`, `vite.config.js`, `render.yaml`
- `package.json`, `package-lock.json`
- `src/App.jsx`, `src/main.jsx`, `src/styles.css`
- `test/server.test.js`
- `README.md`, `ARCHITECTURE.md`, `AI_WORKFLOW.md`, `SUBMISSION.md`
- `WALKTHROUGH_URL.txt`

Generated dependencies, build output, and local document data are excluded (`node_modules/`, `dist/`, `data/`).

## Review Access

Demo accounts are Alice Chen (`alice@ajaia.test`) and Marco Ruiz (`marco@ajaia.test`). Local development uses `alice-demo` and `marco-demo`; production requires unique passwords to be entered as Render secrets. Profile switching requires signing in to the other account.

A live public deployment and Google Drive folder link are not included: this workspace has no deployment-provider or Drive credentials, and no external account action can be performed here. The Render template targets the free plan, without a persistent disk; deployed JSON data may be lost when the instance restarts or redeploys. Protected API routes require password login and a signed cookie, and production fails to start without configured secrets. Please use the local instructions in `README.md` to review the app, where document data persists locally; do not treat `localhost` as a public test URL.

The walkthrough video is also not recorded. `WALKTHROUGH_URL.txt` says what needs to be replaced after recording. These are delivery gaps, not completed features.

## Working and Incomplete

Working locally: document creation, rename/edit/autosave/reopen, bold/italic/underline/headings/lists, `.txt`/`.md` import, owner/editor/viewer sharing, revocation, and file persistence across refresh/server restart.

Incomplete: public hosted URL, Drive folder, recorded walkthrough, full account lifecycle (registration, reset, and recovery), concurrent live editing, and durable hosted storage. With another 2-4 hours, I would verify the Render deployment and secret setup, move documents to a managed database, add an external identity provider, and record the walkthrough; then add optimistic concurrency to protect simultaneous edits.
