# RosterWash development
Use Node 24 and npm. Install with `npm ci`; run `npm run dev`. Local development persists PGlite under `.data/`; production requires Railway PostgreSQL (`DATABASE_URL`) and `npm run db:migrate`. Never enable public intake until a real metro, reviewed partners, coverage, signed agreements and end-to-end checks are configured. Billing is test-only and gated. Keep secrets in environment settings. The logo artwork must remain exact; put supplied original at `public/brand/rosterwash.png` when available. No worktrees are needed; continue in this checkout. Before production: security and legal review, test Stripe workflows, mail setup and Playwright browser validation.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
