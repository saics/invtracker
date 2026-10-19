# InvTracker

CS2 inventory tracker: prati tržišnu vrijednost inventoryja kroz vrijeme (CSFloat + Skinport) te kupnje/prodaje (gdje, kada, za koliko) i P&L.

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
2. **Cijene** odmah osvježava cijene (inače se to radi automatski, vidi niže).
3. **Transakcije → Uvezi s CSFloata** povlači sve kupnje i prodaje s CSFloata (bez duplikata pri ponovnom uvozu).
4. Kupnje sa Skinswapa / CS.Moneyja / DMarketa unesi ručno ili CSV-om:

```csv
date,type,platform,market_hash_name,price,fee,float,note
2026-03-01,buy,skinswap,"AWP | Asiimov (Field-Tested)",95.50,,0.31,
```

Cijene su u USD; u bazi se spremaju kao centi.

### Automatsko praćenje cijena

Dok `pnpm dev` / `pnpm start` radi, server sam osvježava inventory i cijene po `PRICE_CRON` (zadano svaka 2 h), a pri pokretanju odmah ako su cijene starije od sat vremena. Gumb **Cijene** samo pokreće osvježavanje odmah. Isključi s `AUTO_REFRESH=0` (npr. kad cron radi negdje drugdje).

```bash
pnpm prices:schedule   # isto, ali bez weba (samostalni proces)
pnpm prices:update     # jednokratno
```

### Izvori cijena i tržišna vrijednost

Sve cijene se spremaju kao **jedna točka po itemu, izvoru i danu** (tablica `daily_prices`, UTC dan); ponovno osvježavanje istog dana prepiše tu točku.

| Izvor | Što | Kako |
|---|---|---|
| CSFloat prodaje | prosjek prodaja po danu + broj prodaja | 365 dana unazad, po imenu itema |
| CSFloat listing / buy order | kupi odmah / prodaj odmah | po imenu itema |
| Skinport listing | najniža cijena + broj listinga | jedan poziv za sve iteme |
| Skinport prodaje | medijan prodaja zadnjih 7 dana + volumen | jedan poziv za sve iteme |

**Tržišna vrijednost** (`packages/core/src/market.ts`) je jedna cijena po itemu i danu, na kojoj se računaju vrijednost inventoryja, P&L i grafovi. Uzima prvo što postoji:

1. CSFloat prodaje zadnjih 7 dana (barem 3 prodaje), inače zadnjih 30 dana, kao medijan ponderiran brojem prodaja, pa jedna čudna prodaja (rijedak float, stickeri) ne pomiče vrijednost;
2. Skinport medijan prodaja za 7 dana;
3. CSFloat najniži listing;
4. Skinport najniži listing.

Uz vrijednost se pamti izvor (`basis`). Izvori 2–4 vrijede najviše 3 dana. Za iteme vrijedne 20 $ ili više dodatno se traži najjeftiniji CSFloat listing sa sličnim floatom (±0.01), kao orijentacija za taj konkretni item. Medalje, značke i ostali itemi koji se ne mogu prodati se preskaču.

Graf vrijednosti broji item od datuma kupnje (ili od prvog synca, ako je bio tu od početka) do prodaje, pa P&L kroz vrijeme uključuje i kasnije prodane iteme dok su bili tvoji.

## Kako se transakcije povezuju s itemima

Float, pattern i stickeri/charmovi (sa scrapeom svakog stickera) čitaju se pri svakom syncu iz Steam inventoryja (`asset_properties` i inspect certifikat), pa ih ne treba unositi pri uvozu; transakcije bez floata ga preuzmu od povezanog itema.

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
