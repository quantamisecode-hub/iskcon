# Deploying to Hostinger VPS (Ubuntu) — ISKCON Food Inventory

Everything on one VPS: Nginx → Node/Express (PM2) → MySQL. One origin, one
domain, HTTPS via certbot. No CORS/cookie headaches.

## Prerequisites (you do these in Hostinger hPanel)
1. **Buy/choose a VPS plan** (KVM 1 or higher — 1 vCPU / 4 GB RAM is plenty).
   Note the VPS IP address and the `root` (or sudo) password / SSH key.
2. **Domain** (optional to start): point an A record for `yourdomain.com` at the VPS IP.
   You can deploy on the bare IP first and add the domain later.

## 1. Local prep (done — this repo now contains)
- `frontend/dist/` after `npm run build` (same-origin serving via Express)
- `backend/` — Express + Prisma (migration-controlled via `prisma migrate deploy`)
- Deploy kit in `deploy/`:
  - `ecosystem.config.cjs` — PM2 process definition
  - `nginx.conf` — Nginx reverse proxy (HTTP → later HTTPS via certbot)
  - `push.sh` — syncs source to the VPS over SSH and builds + restarts there
- `.env.production.example` — template for the VPS `.env`
- `backend/scripts/create-admin.ts` — creates a production ADMIN (no weak seeds)

## 2. One-time server setup (run on the VPS via SSH)
```bash
# Node.js 22 LTS (NodeSource) — or use your preferred install method
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs mysql-server nginx certbot python3-certbot-nginx

# MySQL: create a dedicated user + database (replace CHANGE_ME)
sudo mysql -e "CREATE DATABASE iskcon CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mysql -e "CREATE USER 'iskcon_app'@'localhost' IDENTIFIED BY 'CHANGE_ME_STRONG_PASSWORD';"
sudo mysql -e "GRANT ALL PRIVILEGES ON iskcon.* TO 'iskcon_app'@'localhost'; FLUSH PRIVILEGES;"

# PM2
sudo npm i -g pm2
sudo pm2 startup systemd -u $USER --hp $HOME  # follow printed instructions
```

Create `/var/www/iskcon` and write the production env to `/var/www/iskcon/backend/.env`:
```bash
sudo mkdir -p /var/www/iskcon && sudo chown -R $USER /var/www/iskcon
# copy .env.production.example content with real values (DATABASE_URL, CORS_ORIGIN, COOKIE_SECURE=true)
```

## 3. First deploy (from your local machine)
From the repo root in Git Bash / WSL:
```bash
VPS_USER=root VPS_HOST=1.2.3.4 SSH_KEY=~/.ssh/id_rsa ./deploy/push.sh
```
`push.sh` rsyncs the source, installs, builds backend + frontend, applies
migrations (`prisma migrate deploy`), (re)starts PM2.

Create the production admin (once):
```bash
ssh user@1.2.3.4 "cd /var/www/iskcon/backend && npx tsx scripts/create-admin.ts admin@yourdomain.com 'StrongPass#1'"
```

## 4. Nginx + HTTPS
```bash
sudo cp /var/www/iskcon/deploy/nginx.conf /etc/nginx/sites-available/iskcon
sudo ln -s /etc/nginx/sites-available/iskcon /etc/nginx/sites-enabled/iskcon
sudo nginx -t && sudo systemctl reload nginx
```
Point `server_name` at your domain first, then:
```bash
sudo certbot --nginx -d yourdomain.com
```

## 5. Verify
- `https://yourdomain.com/` → loads the app (same-origin — no CORS involved)
- Login as the production admin, check dashboard / events / inventory
- `pm2 status`, `pm2 logs iskcon-api` for logs

## Notes
- Never commit real `.env` files. The VPS `.env` holds secrets; keep `chmod 600`.
- Back up MySQL: `mysqldump iskcon > iskcon-$(date +%F).sql` (schedule it).
- Updates = re-run `./deploy/push.sh`. Migrations apply automatically on deploy.
