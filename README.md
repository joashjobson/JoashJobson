# Joash Jobson's website

Joash's home page (`/`), the World's Greatest Shave pixel-shaving game (`/shave`), the messages wall (`/messages`), the privacy policy (`/privacy`) and his admin page (`/admin`), running on a Cloudflare Worker.

- `dist/` is the website: pages, styles, code and images. Nothing needs building.
- `src/worker.js` answers `/api/...`: it checks receipts with Groq, counts tokens, saves the leaderboard, and can email when a donation is added.
- `wrangler.toml` holds the plain settings (token price, Joash's WGS page, Groq model and daily limit). Keys are Secrets in the Cloudflare dashboard, never in a file.

## Setup, once

1. Upload everything in this folder to a GitHub repository, so `wrangler.toml` is at the top.
2. In Cloudflare, Workers & Pages, Create, Import a repository. Pick the repository and name the project `joashjobson`, the same as `name` in `wrangler.toml`. Leave the build command empty and deploy.
3. In the Worker's Settings, Variables and Secrets, add two Secrets: `GROQ_API_KEY` (from console.groq.com, API Keys) and `ADMIN_PASSWORD` (any long password).
   Updating from a version that used Gemini? Add `GROQ_API_KEY`, then delete the old `GEMINI_API_KEY` Secret.
4. Optional, for an email each time a donation is added: add `RESEND_API_KEY` (a Sending access key from resend.com) and `NOTIFY_EMAIL` (the email address you signed up to Resend with) as Secrets too.

## Receipts

Groq checks each receipt and the site decides straight away: added, or turned down with a reason. If Groq is busy (its free plan takes about 2 receipts a minute and 60 a day), the receipt waits in a queue and is checked again automatically a few minutes later. Screenshots are only kept while they wait in the queue.

Receipts must be screenshots (JPG, PNG or WebP). Groq can't read PDFs, so the upload box asks for a screenshot instead.

Groq doesn't use what it's sent for training. For the strictest setting, turn on Zero Data Retention in the Groq console under Settings, Data Controls, so receipts are never logged at Groq either.

## The top spot and messages

The banner at the top of the home page is "the top spot". Anyone who uploads a receipt for one donation of at least `TOP_SPOT_MIN_AUD` (first holder) or `TOP_SPOT_STEP_AUD` more than the donation showing can take it, as a person or a business (name, message, website and logo). Change those two settings in `wrangler.toml` under `[vars]`.

Anyone can post on `/messages`, no donation needed. Messages and top spot posts are checked by Groq before they go up (the same `GROQ_API_KEY`). To take one down, use the Posts tab on the admin page. "Make messages video" on the admin page turns the wall into an MP4 for LinkedIn (use Chrome or Safari on a computer).

## Saved data

Everything people do (donations, tokens, receipts, best times) is saved in a Durable Object called `Store`, inside Joash's Cloudflare account. It's separate from these files, so uploading a new version never clears it.

Never change `name`, the `[[durable_objects.bindings]]` block or the `[[migrations]]` block in `wrangler.toml`, and never rename the Worker in Cloudflare. Doing any of these starts a new, empty database.

The admin page has a Download backup button. If someone asks for their information to be deleted (the privacy policy says they can), use Delete next to their name under People.

## Third-party code

`dist/assets/vendor/` holds React 18.3.1 and React DOM 18.3.1 (MIT licence, Facebook, Inc. and its affiliates) and htm 3.1.1 (Apache 2.0 licence, Jason Miller). Their licence notices are in `dist/assets/vendor/LICENSES.txt`.
