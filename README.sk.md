# Personal Dashboard

Vlastný nástenný dashboard pre starší Android tablet (Samsung Galaxy Tab 4 10.1, Android 5.0.2) v kiosk režime.
Vyberieš si dlaždice, rozložíš ich vo webovom editore, uložíš layouty a tablet zobrazí presne ten, ktorý zvolíš.

> English version: [README.md](README.md)

**Stav:** prebieha fáza 2 (runtime displeja + prvé dlaždice). Pozri [docs/08-implementation-plan.md](docs/08-implementation-plan.md).

## Čo už funguje

- Worker na Cloudflare Workers + D1: autentifikácia tokenmi (admin / zariadenie), nastavenia, API layoutov s validáciou
- Displej na tablete: párovanie jednorazovým kódom, pollovanie stavu, vykresľovanie layoutu
- Dlaždice: hodiny, počasie (Open-Meteo, cache na Workeri, záložné staršie dáta)
- CLI skripty: tokeny, párovacie kódy, import layoutu, nastavenia (poloha, jazyk, časové pásmo), smoke test

## Funkcie (plánované)

- Dlaždice: čas a dátum, udalosti z Google Kalendára (viac účtov), úlohy z Microsoft To Do (odškrtnutie dotykom),
  motto dňa, počasie, slnko a mesiac, kvalita ovzdušia a peľ, odpočet do udalosti
- Editor layoutov ťahaním myšou/prstom (telefón/PC), viac uložených layoutov
- Prepínanie layoutov: manuálne, podľa plánu, rotácia, dotykom na tablete
- Napájanie displeja: stále zapnutý, podľa plánu, manuálne zap/vyp
- Slovenské a anglické rozhranie, tmavá téma, orientácia na šírku
- Beží na bezplatnej vrstve Cloudflare Workers + D1; doma netreba server

## Architektúra

```
Tablet (Chrome 95 kiosk) ──▶ Cloudflare Worker (API + statické appky + D1) ──▶ Google / Microsoft / Open-Meteo
Telefón/PC (admin editor)           ──▶ (ten istý Worker, admin token)
```

## Dokumentácia

Začni v [docs/00-overview.md](docs/00-overview.md). Technická dokumentácia je po anglicky.

## Bezpečnosť

Repozitár je verejný. Neobsahuje žiadne tajomstvá, osobné údaje ani skutočné adresy nasadenia. Konfigurácia ide cez
Cloudflare secrets a lokálne súbory mimo gitu (`.dev.vars`, `wrangler.jsonc`). Pred úpravami si prečítaj
[docs/06-security-and-public-repo.md](docs/06-security-and-public-repo.md).

Údaje o počasí a ovzduší: [Open-Meteo.com](https://open-meteo.com) (CC BY 4.0).

## Licencia

[MIT](LICENSE)
