# 10 — Operations runbook

Every command the owner needs, in one place. `<worker-host>` is your own `*.workers.dev` (or custom) host;
it is never committed. Commands with `--remote` or against `https://<worker-host>` touch production.
Scripts that need a token ask for it without echo, so it never lands in the shell history.

## 1. Prerequisites

- Node ≥ 22.18, npm, git, [gitleaks](https://github.com/gitleaks/gitleaks#installing) (the pre-commit hook
  refuses commits without it).
- A Cloudflare account (Workers free plan) and `npx wrangler login`.
- The tablet prepared as in doc 02 §3 (ISRG Root X1 user CA, Chrome, PIN lock screen).

## 2. First deployment

```sh
npm install                                   # also enables .githooks (gitleaks pre-commit)
cp wrangler.example.jsonc wrangler.jsonc      # git-ignored
npx wrangler d1 create personal-dashboard     # put the printed id into wrangler.jsonc → database_id
npm run db:migrate:remote
npm run deploy                                # prints the Worker URL = <worker-host>
npm run token:create -- --role admin --label "owner pc" --remote   # printed once: keep it in a password manager
npm run smoke -- https://<worker-host>        # read-only check of the deployment
```

Keep the `ratelimits` block from the template in `wrangler.jsonc` (doc 06 §6).

## 3. Pairing a display

1. On the tablet open `https://<worker-host>/display/` (explicitly with `https://`).
2. On the PC: `npm run pair -- --label "kitchen tablet" --remote`.
3. Type the printed code on the tablet within 10 minutes. The display stores its own device token.
4. Chrome menu → *Add to Home screen*; start the dashboard from that shortcut (fullscreen).

## 4. Configuration (until the admin app, Phase 4)

```sh
npm run settings -- https://<worker-host>                                    # show
npm run settings -- https://<worker-host> --location "My city" --lat 50 --lon 10
npm run settings -- https://<worker-host> --locale sk --timezone Europe/Prague
```

### 4.1 Provider secrets (once, before connecting accounts)

Create the OAuth client and the app registration first (doc 05 §1.1 and §2.1), then store their secrets in the
Worker. `TOKEN_ENC_KEY` seals every provider token and every cached calendar or task payload (doc 06 §8).

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # a new TOKEN_ENC_KEY
npx wrangler secret put TOKEN_ENC_KEY
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put MS_CLIENT_ID
npx wrangler secret put MS_CLIENT_SECRET
npm run db:migrate:remote                     # migrations 0004 and 0005 of Phase 3
npm run deploy
```

Keep `TOKEN_ENC_KEY` in the password manager: without it the stored tokens cannot be read and every account has
to be connected again (a rotation script arrives in Phase 7). For `wrangler dev` the same names go into
`.dev.vars`.

### 4.2 Connect accounts and choose calendars and lists

```sh
npm run accounts -- https://<worker-host> --connect google       # prints a URL: open it in a browser, sign in, allow
npm run accounts -- https://<worker-host> --connect microsoft
npm run accounts -- https://<worker-host>                        # accounts (acc_…) and their sources (src_…)
npm run accounts -- https://<worker-host> --discover acc_…       # the calendars / lists of an account
npm run accounts -- https://<worker-host> --add acc_… --remote-id <id> [--label "Family"] [--color "#4f9dff"]
npm run accounts -- https://<worker-host> --source src_… --color "#ff8a4f" [--label …] [--disable]
```

Repeat `--connect` for every account. The browser ends on `/admin/#/accounts?connected=…`, a page that arrives with
the admin app (Phase 4): `connected=google|microsoft` means it worked, `error=denied|invalid_state|failed` that it
did not (`failed` is explained in `wrangler tail`). Connecting the same account again renews it in place and keeps
its sources.

Tiles refer to sources by id. Add them to your own layout in `layouts-export/` and import it as above:

```json
{ "id": "cal", "type": "calendar", "x": 0, "y": 0, "w": 5, "h": 6, "config": { "sourceIds": ["src_…"], "showLocation": true } },
{ "id": "todo", "type": "tasks", "x": 5, "y": 0, "w": 4, "h": 5, "config": { "sourceIds": ["src_…"] } },
{ "id": "next", "type": "countdown", "x": 9, "y": 0, "w": 3, "h": 3, "config": { "source": "calendar", "sourceIds": ["src_…"], "maxEvents": 4 } }
```

Layouts: copy an example to `layouts-export/` (git-ignored), edit it there, then

```sh
npm run layout:import -- layouts-export/my-layout.json https://<worker-host> --default
```

Never put your own layout into `examples/`: labels such as countdowns are personal data (doc 06 §4).
The display switches within 15 s.

## 5. Shipping a change

```sh
npm run check                  # lint, format, typecheck, tests (the hook adds gitleaks on commit)
npm run db:migrate:remote      # only when migrations/ gained a file; run it before the deploy
npm run deploy                 # the tablet reloads itself when the build id changes
git push
```

## 6. Tokens

```sh
npm run token:list -- --remote
npm run token:revoke -- tok_abcdefghijklmnop --remote
```

Rotation and a lost device: doc 06 §7. A revoked display shows the pairing screen and drops its cached data.

## 7. Local development

```sh
npm run db:migrate:local
npm run token:create -- --role admin --label dev     # local database
npm run dev                                          # build + wrangler dev on http://localhost:8787
```

Local tokens and data live in `.wrangler/` (git-ignored). Secrets for later phases go into `.dev.vars` (template:
`.dev.vars.example`).

## 8. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `wrangler` error `7403` "account is not valid or not authorized" | Usually transient or an expiring OAuth login. Check `npx wrangler whoami`; retry; if it persists, `npx wrangler logout` and `login` |
| Display shows "Offline since hh:mm" (SK: "Offline od …") | The state poll has failed for ≥ 5 min (Wi-Fi, Worker). It recovers by itself when the network returns |
| A tile is dimmed with "Updated hh:mm" (SK: "Aktualizované …") | Its data is older than twice its refresh time (provider or network down); cached data is shown up to 24 h |
| Tile says "Set a location in the admin settings" (SK: "Nastavte polohu …") | No location yet: `npm run settings -- … --location …` |
| Display asks for a pairing code | Its token was revoked or rejected: pair again (§3) |
| Chrome error page on the tablet | The page was (re)loaded without a network (no service worker). Reload once the Wi-Fi is back |
| HTTPS error / Chrome falls back to `http://` | The ISRG Root X1 user CA is missing (doc 02 §3 step 0) |
| `429 rate_limited` from the API | Per-IP limit (doc 06 §6); wait a minute |
| Tile says "Reconnect the account in the admin app" (SK: "Znova pripojte účet …") | The provider no longer accepts the stored grant (revoked, password change, long unused): `npm run accounts -- … --connect <provider>` again |
| `500 not_configured` from `/accounts`, `/data/calendar`, `/data/tasks` or `--connect` | A Worker secret is missing or malformed: `TOKEN_ENC_KEY` must be 32 bytes in base64 (§4.1) |
| Google: `Error 400: redirect_uri_mismatch` | The authorised redirect URI in the Cloud console must be exactly `https://<worker-host>/oauth/google/callback` (doc 05 §1.1) |
| Microsoft: sign-in refuses the redirect URI | The web redirect URI of the app registration must be exactly `https://<worker-host>/oauth/microsoft/callback` (doc 05 §2.1) |
| Tasks tile shows "Could not save the change." | The Worker or Microsoft was unreachable when a checkbox was tapped; the row springs back. Tap again |
