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
