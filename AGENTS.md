<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Environment variables

Every `process.env.X` this app reads must be documented in `docs/ENVIRONMENT_VARIABLES.md`. When
a change introduces a new environment variable, add it to that file in the same change — see the
"Rule" section at the bottom of that doc for the exact format. Don't leave a new secret or config
var undocumented for a future session to rediscover.
