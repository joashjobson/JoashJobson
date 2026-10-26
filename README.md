# Joash Jobson's website

Joash's home page (`/`), the World's Greatest Shave pixel-shaving game (`/shave`) and his admin page (`/admin`), running on a Cloudflare Worker.

- `dist/` is the website: pages, styles, code and images. Nothing needs building.
- `src/worker.js` answers `/api/...`: it checks receipts with Gemini, counts tokens, and saves the leaderboard.
- `wrangler.toml` holds the plain settings (token price, Joash's WGS page, Gemini limits). Keys are Secrets in the Cloudflare dashboard, never in a file.

## Setup, once

1. Upload everything in this folder to a GitHub repository, so `wrangler.toml` is at the top.
2. In Cloudflare, Workers & Pages, Create, Import a repository. Pick the repository and name the project `joash-site`. Leave the build command empty and deploy.
3. In the Worker's Settings, Variables and Secrets, add two Secrets: `GEMINI_API_KEY` (from aistudio.google.com) and `ADMIN_PASSWORD` (any long password).

## Saved data

Everything people do (donations, tokens, receipts, best times) is saved in a Durable Object called `Store`, inside Joash's Cloudflare account. It's separate from these files, so uploading a new version never clears it.

Never change `name`, the `[[durable_objects.bindings]]` block or the `[[migrations]]` block in `wrangler.toml`, and never rename the Worker in Cloudflare. Doing any of these starts a new, empty database.

The admin page has a Download backup button.

## Third-party code

`dist/assets/vendor/` holds React 18.3.1 and React DOM 18.3.1 (MIT licence, Facebook, Inc. and its affiliates) and htm 3.1.1 (Apache 2.0 licence, Jason Miller). Their licence notices are in `dist/assets/vendor/LICENSES.txt`.
