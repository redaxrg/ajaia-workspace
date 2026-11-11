# AI Workflow Note

## Tools Used

GitHub Copilot in VS Code was the AI coding assistant used during this exercise.

## Where It Helped

AI helped turn the open-ended prompt into a narrow product slice, scaffold the React/Express boundary, draft the initial API/UI implementation, and produce focused test and documentation starting points. That compressed repetitive wiring so the work could spend more attention on the ownership and share-role behavior.

## What I Changed or Rejected

I replaced the original client-supplied identity header with password login and signed HttpOnly cookies, and made production startup fail unless Render secrets are supplied. This is still seeded demo authentication without account recovery or an external identity provider. I chose a JSON-backed single-process store for frictionless local review and kept the free Render filesystem limitation explicit. I did not add realtime collaboration, comments, or a complex rich-text feature set because they would expand the correctness surface beyond the timebox. Generated deployment scaffolding is treated as a template, not represented as a live deployment.

## Verification

The implementation is checked with Node's API integration tests and a production Vite build. Tests exercise password login, forged-header and tampered-cookie rejection, sharing, viewer write denial, production cookie/security headers, Markdown import, and persistence across a server restart. Browser review checks the login/profile-switch flow and read-only state. Deployment and video remain external tasks requiring account access.
