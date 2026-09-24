# Personal Dashboard

Vlastný nástenný dashboard pre starší Android tablet (Samsung Galaxy Tab 4 10.1, Android 5.0.2) v kiosk režime.
Vyberieš si dlaždice, rozložíš ich vo webovom editore, uložíš layouty a tablet zobrazí presne ten, ktorý zvolíš.

> English version: [README.md](README.md)

**Stav:** fázy 0–2 hotové (jadro backendu, runtime displeja, prvé dlaždice, správanie offline); ďalej nasleduje
fáza 3 (Google Kalendár a Microsoft To Do). Pozri [docs/08-implementation-plan.md](docs/08-implementation-plan.md).

## Čo už funguje

- Worker na Cloudflare Workers + D1: autentifikácia tokenmi (admin / zariadenie), nastavenia, API layoutov s validáciou
- Displej na tablete: párovanie jednorazovým kódom, pollovanie stavu, vykresľovanie layoutu, Screen Wake Lock
  (obrazovka nezhasne)
- Dlaždice: hodiny a dátum, počasie (Open-Meteo, cache na Workeri, záložné staršie dáta), slnko a mesiac (suncalc), kvalita ovzdušia, citát dňa (70 voľných citátov, SK + EN), odpočet
- Slovenské a anglické rozhranie, tmavá téma, kiosk na celú obrazovku v orientácii na šírku
- Odolnosť voči výpadkom: posledný layout a dáta dlaždíc z `localStorage`, označenie starých dát, odznak
  offline, nočný reload len keď server odpovedá
- Zabezpečenie: limity požiadaviek na IP adresu, prísna Content-Security-Policy, gitleaks (pre-commit + CI),
  `npm audit` v CI, Dependabot, GitHub Actions pripnuté na SHA commitu
- CLI skripty: tokeny, párovacie kódy, import layoutu, nastavenia (poloha, jazyk, časové pásmo), smoke test
- Beží na bezplatnej vrstve Cloudflare Workers + D1; doma netreba server

## Plánované

- Dlaždice: udalosti z Google Kalendára (viac účtov), úlohy z Microsoft To Do (odškrtnutie dotykom), odpočet do
  najbližších udalostí z kalendára (fáza 3)
- Editor layoutov ťahaním myšou/prstom (telefón/PC) a správa uložených layoutov (fáza 4)
- Prepínanie layoutov: manuálne, podľa plánu, rotácia, dotykom na tablete (fáza 5)
- Napájanie displeja: stále zapnutý, podľa plánu, manuálne zap/vyp (fáza 5)

## Architektúra

```
Tablet (Chrome 95 kiosk) ──▶ Cloudflare Worker (API + statické appky + D1) ──▶ Google / Microsoft / Open-Meteo
Telefón/PC (admin editor)           ──▶ (ten istý Worker, admin token)
```

## Ako začať

Predpoklady, prvé nasadenie, spárovanie tabletu, nastavenia, layouty a riešenie problémov sú v
[prevádzkovom runbooku](docs/10-operations.md) (po anglicky). Príprava samotného tabletu je v
[docs/02-tablet-and-kiosk.md](docs/02-tablet-and-kiosk.md) §3.

## Dokumentácia

Začni v [docs/00-overview.md](docs/00-overview.md). Technická dokumentácia je po anglicky.

## Bezpečnosť

Repozitár je verejný. Neobsahuje žiadne tajomstvá, osobné údaje ani skutočné adresy nasadenia. Konfigurácia ide cez
Cloudflare secrets a lokálne súbory mimo gitu (`.dev.vars`, `wrangler.jsonc`). Pred úpravami si prečítaj
[docs/06-security-and-public-repo.md](docs/06-security-and-public-repo.md).

Údaje o počasí a ovzduší: [Open-Meteo.com](https://open-meteo.com) (CC BY 4.0); kvalita ovzdušia zo služby
Copernicus Atmosphere Monitoring Service (CAMS).

## Licencia

[MIT](LICENSE)
