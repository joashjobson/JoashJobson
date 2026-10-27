# Joash Jobson's website

Joash's home page (`/`), the World's Greatest Shave pixel-shaving game (`/shave`), the messages wall (`/messages`), the privacy policy (`/privacy`) and his admin page (`/admin`), running on a Cloudflare Worker.

- `dist/` is the website: pages, styles, code and images. Nothing needs building.
- `src/worker.js` answers `/api/...`: it saves the leaderboard and messages, checks messages with Groq, and adds the link preview picture to `/shave`.
- `wrangler.toml` holds the plain settings (Joash's WGS page, Groq model and daily limit). Keys are Secrets in the Cloudflare dashboard, never in a file.

## Setup, once

1. Upload everything in this folder to a GitHub repository, so `wrangler.toml` is at the top.
2. In Cloudflare, Workers & Pages, Create, Import a repository. Pick the repository and name the project `joashjobson`, the same as `name` in `wrangler.toml`. Leave the build command empty and deploy.
3. In the Worker's Settings, Variables and Secrets, add two Secrets: `GROQ_API_KEY` (from console.groq.com, API Keys, used to check messages) and `ADMIN_PASSWORD` (any long password).
   Updating from a version that used Gemini? Add `GROQ_API_KEY`, then delete the old `GEMINI_API_KEY` Secret.
4. The web address joashjobson.me is attached in the dashboard under the Worker's Settings, Domains & Routes. Uploading a new version keeps it.

## The game is free

Since v17 there are no receipts, tokens, Top Donors or top spot: the site never asks how much anyone gave. People donate on Joash's WGS page and play the game as often as they like (up to 300 runs a day each). Old receipt details from earlier versions stay in the saved data and the backup until deleted.

## Messages

Anyone can post on `/messages`, no donation needed. Everyone gets two free goes at the shave game, and each message earns two more (up to 2 messages a day). The banner at the top of the home page shows the message with the most hearts. Messages are checked by Groq before they go up (the same `GROQ_API_KEY`). To take one down, use the Posts tab on the admin page. "Make messages video" on the admin page turns the wall into an MP4 for LinkedIn (use Chrome or Safari on a computer).

## Saved data

Everything people do (names, avatars, best times, messages) is saved in a Durable Object called `Store`, inside Joash's Cloudflare account. It's separate from these files, so uploading a new version never clears it.

Never change `name`, the `[[durable_objects.bindings]]` block or the `[[migrations]]` block in `wrangler.toml`, and never rename the Worker in Cloudflare. Doing any of these starts a new, empty database.

The admin page has a Download backup button. If someone asks for their information to be deleted (the privacy policy says they can), use Delete next to their name under People.

## Third-party code

`dist/assets/vendor/` holds React 18.3.1 and React DOM 18.3.1 (MIT licence, Facebook, Inc. and its affiliates) and htm 3.1.1 (Apache 2.0 licence, Jason Miller). Their licence notices are in `dist/assets/vendor/LICENSES.txt`.
