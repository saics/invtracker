# InvTracker

CS2 inventory tracker: prati vrijednost inventoryja kroz vrijeme po izvoru cijena (CSFloat listing, CSFloat buy order, Steam Market) te kupnje/prodaje (gdje, kada, za koliko) i P&L.

## Struktura

```
apps/web        Next.js app (UI + REST API na /api/v1/*)
packages/core   poslovna logika: provideri cijena, Steam inventory sync, CSFloat import, P&L
packages/db     Drizzle ORM shema + migracije (libSQL / SQLite)
```

`core` i `db` nemaju ovisnosti o Next.js-u, pa ih kasnije može koristiti i mobilna aplikacija (npr. Expo, preko istog REST API-ja) ili zasebni worker.

## Pokretanje

Treba Node 22+ i pnpm 10.

```bash
pnpm install
cp .env.example .env   # upiši STEAM_ID i CSFLOAT_API_KEY
pnpm dev               # migrira bazu i pokreće http://localhost:3000
```

1. **Sync** u headeru povlači javni Steam inventory.
2. **Cijene** dohvaća cijene za sve iteme (Steam je spor: ~3.5 s po itemu zbog rate limita).
3. **Transakcije → Uvezi s CSFloata** povlači sve kupnje i prodaje s CSFloata (bez duplikata pri ponovnom uvozu).
4. Kupnje sa Skinswapa / CS.Moneyja / DMarketa unesi ručno ili CSV-om:

```csv
date,type,platform,market_hash_name,price,fee,float,note
2026-03-01,buy,skinswap,"AWP | Asiimov (Field-Tested)",95.50,,0.31,
```

Cijene su u USD; u bazi se spremaju kao centi.

### Automatsko praćenje cijena

```bash
pnpm prices:schedule   # sync + cijene odmah, zatim po PRICE_CRON (zadano svakih 6 h)
pnpm prices:update     # jednokratno
```

## Kako se transakcije povezuju s itemima

Steam mijenja asset id pri svakoj razmjeni, pa se kupnja povezuje s itemom po imenu i floatu (kad je poznat), inače s najstarijim slobodnim itemom tog imena. Ako za transakciju nema itema (npr. davno prodan), stvori se zamjenski item kako bi se P&L i dalje računao.

## Deploy na web (kasnije)

- Baza: napravi Turso bazu i postavi `DATABASE_URL=libsql://…` + `DATABASE_AUTH_TOKEN`; isti kod radi bez izmjena.
- App: Vercel (root `apps/web`), a cron (Vercel Cron ili GitHub Actions) neka zove `POST /api/v1/inventory/sync` i `POST /api/v1/prices/refresh`.
- Prije javnog deploya treba dodati autentikaciju na API.

## Skripte

| | |
|---|---|
| `pnpm dev` | migracije + dev server |
| `pnpm test` | unit testovi (Vitest) |
| `pnpm typecheck` | TypeScript provjera svih paketa |
| `pnpm db:generate` | nova migracija nakon promjene `packages/db/src/schema.ts` |
