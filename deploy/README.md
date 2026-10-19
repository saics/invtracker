# Deploy (Hetzner + Cloudflare)

Kako radi:

```
GitHub (push na main)
  └─ Actions: typecheck + testovi → Docker image (ghcr.io) → SSH na server → docker compose up
Server (/opt/invtracker)
  ├─ app          Next.js + automatsko osvježavanje cijena (PRICE_CRON)
  ├─ litestream   stalni backup SQLite baze na Cloudflare R2
  ├─ restore      na novom serveru vrati bazu iz R2 prije pokretanja appa
  └─ cloudflared  tunnel do Cloudflarea (server nema otvorenih portova osim SSH-a)
Cloudflare
  ├─ domena + DNS
  ├─ Tunnel → http://app:3000
  └─ Access: login samo za tvoj email
```

Postavlja se jednom, otprilike sat vremena. Redom:

## 1. Domena (Cloudflare)

1. Napravi račun na [dash.cloudflare.com](https://dash.cloudflare.com).
2. **Domain Registration → Register Domains**, kupi domenu (npr. `mojinventory.com`). DNS je odmah na Cloudflareu.

## 2. Server (Hetzner)

1. Na računalu napravi SSH ključ za sebe (ako ga nemaš) i jedan za GitHub deploy:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/invtracker_deploy -C github-deploy -N ""
   ```
2. U [Hetzner Cloud Console](https://console.hetzner.cloud) napravi projekt i server:
   - **Location**: Falkenstein ili Nuremberg
   - **Image**: Ubuntu 24.04
   - **Type**: najmanji **x86** (CX/CPX serija, ne ARM/CAX, jer se image builda za x86)
   - **SSH key**: dodaj svoj osobni javni ključ
   - Uključi **Backups** ako želiš i snapshot cijelog servera (dodatno ~20 %); baza se ionako backupira na R2.
3. Pokreni skriptu na serveru (zamijeni IP; drugi argument je sadržaj `~/.ssh/invtracker_deploy.pub`):
   ```bash
   scp deploy/setup-server.sh root@SERVER_IP:/root/
   ssh root@SERVER_IP 'bash /root/setup-server.sh "$(cat)"' < ~/.ssh/invtracker_deploy.pub
   ```

## 3. Backup baze (Cloudflare R2)

1. Cloudflare → **R2 Object Storage** → kreiraj bucket `invtracker-backup` (besplatno do 10 GB).
2. **R2 → Manage API tokens → Create API token**: dozvola *Object Read & Write*, samo za taj bucket.
3. Zapiši *Access Key ID*, *Secret Access Key* i endpoint (`https://<account-id>.r2.cloudflarestorage.com`).

## 4. Tunnel i login (Cloudflare Zero Trust, besplatno)

1. Cloudflare → **Zero Trust** (prvi put traži odabir free plana).
2. **Networks → Tunnels → Create a tunnel** → *Cloudflared* → ime `invtracker`. Kopiraj **token** (dugi string iz naredbe za instalaciju); ništa ne instaliraj, to radi Docker.
3. U istom tunnelu **Public Hostname**: domena (ili poddomena npr. `inv.`) → Service `HTTP` → URL `app:3000`.
4. **Access → Applications → Add an application → Self-hosted**: ista domena; policy *Allow* → *Emails* → tvoj email. Login ide jednokratnim kodom na email.

## 5. Postavke na serveru

```bash
ssh root@SERVER_IP
nano /opt/invtracker/.env      # sadržaj iz deploy/env.example, popuni vrijednosti
chown deploy:deploy /opt/invtracker/.env && chmod 600 /opt/invtracker/.env
```

**Prijenos postojeće baze** (transakcije, povijest): na računalu prvo ugasi `pnpm dev`, pa:

```bash
scp data/invtracker.db root@SERVER_IP:/opt/invtracker/data/
ssh root@SERVER_IP chown deploy:deploy /opt/invtracker/data/invtracker.db
```

## 6. GitHub

Repo → **Settings → Secrets and variables → Actions**:

| Vrsta | Ime | Vrijednost |
|---|---|---|
| Secret | `SSH_HOST` | IP servera |
| Secret | `SSH_USER` | `deploy` |
| Secret | `SSH_KEY` | sadržaj `~/.ssh/invtracker_deploy` (privatni ključ) |
| Variable | `DEPLOY_ENABLED` | `true` |

Zatim **Actions → Deploy → Run workflow** (ili push na `main`). Prvi build traje nekoliko minuta. Nakon toga otvori domenu, prijavi se emailom i to je to.

## Svakodnevno

- **Nova verzija**: push na `main`, deploy ide sam.
- **Logovi**: `ssh deploy@SERVER_IP 'cd /opt/invtracker && docker compose logs -f app'`
- **Restart**: `docker compose restart app` u `/opt/invtracker`.

## Povrat baze

Backup je stalan (Litestream šalje promjene na R2 svakih par sekundi, snapshot dnevno, čuva 30 dana).

- **Novi server**: prođi korake 2 i 5 bez kopiranja baze; servis `restore` je sam vrati iz R2.
- **Vraćanje na neki trenutak** (npr. nakon greške):
  ```bash
  cd /opt/invtracker
  docker compose stop app litestream
  mv data/invtracker.db data/invtracker.broken.db && rm -f data/invtracker.db-wal data/invtracker.db-shm
  docker compose run --rm restore restore -timestamp 2026-10-19T08:00:00Z /data/invtracker.db
  docker compose up -d
  ```
