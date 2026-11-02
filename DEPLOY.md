# Hosting krush.casino for free (with automatic backups)

This puts the casino on a free Google Cloud server (works with a **debit card**), with HTTPS and hourly
encrypted backups copied to free Backblaze B2 storage. Allow about 30 minutes.

> **Before real money:** check the host's terms. Many cloud providers restrict gambling sites, and a suspended
> server holding player funds is a serious problem. Free tiers are fine for testing; for real money consider a
> paid VPS from a host that allows gambling. The same setup script works on any Ubuntu server.

---

## 1. Create the free server (Google Cloud)

1. Go to **console.cloud.google.com**, sign in with a Google account and start the free trial / billing account
   (a debit card works; the free-tier server costs $0).
2. **Set a budget alert** so you are never surprised: *Billing → Budgets & alerts → Create budget*, amount **$1**.
   (Google may charge a few cents for an external IP address or for traffic above the free 1 GB/month.)
3. *Compute Engine → VM instances → Create instance*:
   - **Region:** `us-west1`, `us-central1` or `us-east1` (only these are free)
   - **Machine type:** `e2-micro`
   - **Boot disk:** *Change* → **Ubuntu 24.04 LTS**, **Standard persistent disk**, **30 GB**
   - **Firewall:** tick **Allow HTTP traffic** and **Allow HTTPS traffic**
   - Click **Create**.
4. Give it a fixed address: *VPC network → IP addresses* → on your VM's external IP click **Reserve / promote to static**.

## 2. (Optional) Point your domain at it

At your domain registrar, add an **A record**: `@` → the server's external IP (and `www` if you want it).
Without a domain the site still works on `http://<IP>`, but **use a domain with HTTPS before real money**.

## 3. Install the casino (one command)

On the VM's row click **SSH** (opens a terminal in your browser) and paste:

```bash
git clone https://github.com/ygnh9jv5mw-hue/Casino.git casino && cd casino && git checkout royal-edge-casino && sudo bash tools/setup-server.sh
```

It asks for your domain (or leave empty), an admin username and password, then:
- creates a **MASTER_SEED** and shows it **once**. **Write it down and keep it offline.** It controls every wallet
  and is needed to restore backups.
- installs Docker, builds the casino and starts it with Caddy (automatic HTTPS certificate for your domain).

Open the address it prints and log in with your admin account. Settings live in `~/casino/.env`.

## 4. Backups

Backups run **every hour automatically**: a consistent snapshot of the database, compressed and encrypted, kept on
the server (newest 48) in `~/casino/data/backups/`. Staff Panel → **Treasury → Backups** shows the status and has a
**Back up now** button.

A copy that only lives on the server is lost with the server, so copy them off-site (free):

1. Sign up at **backblaze.com → B2 Cloud Storage** (10 GB free).
2. *Buckets → Create a Bucket*: a unique name, **Private**. Note its **Endpoint**, e.g. `s3.us-west-004.backblazeb2.com`.
3. On the bucket, *Lifecycle Settings → Use custom lifecycle rules*: hide files **30 days** after upload and delete
   them **1 day** after hiding. That keeps a month of history inside the free 10 GB.
4. *Application Keys → Add a New Application Key*: access to that bucket only, **Read and Write**. Copy the
   **keyID** and **applicationKey** (shown once).
5. On the server: `cd ~/casino && nano .env`, fill in (region = the part after `s3.` in the endpoint):
   ```
   BACKUP_S3_ENDPOINT=https://s3.us-west-004.backblazeb2.com
   BACKUP_S3_REGION=us-west-004
   BACKUP_S3_BUCKET=your-bucket-name
   BACKUP_S3_KEY_ID=your-keyID
   BACKUP_S3_SECRET=your-applicationKey
   ```
   Save (Ctrl+O, Enter, Ctrl+X) and run `sudo bash tools/setup-server.sh` to apply.
6. Staff Panel → Treasury → **Back up now**: it should say *copied off-site*, and the file appears in your bucket.

Cloudflare R2 works too (`BACKUP_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`, `BACKUP_S3_REGION=auto`).

### Restoring a backup

```bash
cd ~/casino
# pick a file from data/backups/ (or download one from your bucket into data/backups/)
sudo docker compose -f deploy/docker-compose.yml --project-directory deploy exec casino \
  node tools/restore-backup.js /data/backups/casino-YYYYMMDDTHHMMSSZ.db.gz.enc /data/restored.db
sudo docker compose -f deploy/docker-compose.yml --project-directory deploy stop casino
sudo mv data/casino.db data/casino.db.old && sudo rm -f data/casino.db-wal data/casino.db-shm
sudo mv data/restored.db data/casino.db
sudo bash tools/setup-server.sh
```

On a **new** server: install as in step 3, but before running the script put your old `.env` (with the same
MASTER_SEED) in `~/casino/`, then restore as above.

## 5. Updating to new code

```bash
cd ~/casino && git pull && sudo bash tools/setup-server.sh
```

Your data, backups and settings are kept.

## 6. Going live (real money)

Only once your licence and terms are in place. In `.env` set:

```
SOLANA_CLUSTER=mainnet-beta
REAL_MONEY_ACKNOWLEDGED=yes
LICENSE_TEXT=Operated by <Company>, licensed by the Anjouan Offshore Finance Authority, licence no. <number>.
TREASURY_ADDRESS=<your Solana cold wallet>
TREASURY_ETH=<your Ethereum cold wallet>
TREASURY_LTC=<your Litecoin cold wallet>
RPC_URL=<paid Solana RPC, e.g. Helius>
ETH_RPC_URL=<paid Ethereum RPC, e.g. Alchemy>
```

Run `sudo bash tools/setup-server.sh`, fund the hot wallets (Staff Panel → Treasury), make sure off-site backups
work, and test a small real deposit and withdrawal in every coin before opening to players.

## Handy commands

```bash
cd ~/casino
sudo docker compose -f deploy/docker-compose.yml --project-directory deploy logs -f casino   # live logs
sudo docker compose -f deploy/docker-compose.yml --project-directory deploy restart casino   # restart
sudo docker compose -f deploy/docker-compose.yml --project-directory deploy ps               # status
```
