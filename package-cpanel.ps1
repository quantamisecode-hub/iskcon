# =============================================================
# Package production build for Namecheap cPanel
# =============================================================

Write-Host "1. Building Backend and Frontend..." -ForegroundColor Cyan
npm run build

$deployDir = Join-Path $PSScriptRoot "cpanel-deploy"
$zipPath = Join-Path $PSScriptRoot "cpanel-deploy.zip"

if (Test-Path $deployDir) {
    Remove-Item -Recurse -Force $deployDir
}
if (Test-Path $zipPath) {
    Remove-Item -Force $zipPath
}

Write-Host "2. Creating staging directory: $deployDir" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $deployDir | Out-Null
New-Item -ItemType Directory -Path "$deployDir\public" | Out-Null

Write-Host "3. Copying compiled backend..." -ForegroundColor Cyan
Copy-Item -Recurse "backend\dist" "$deployDir\dist"
Copy-Item -Recurse "backend\prisma" "$deployDir\prisma"
Copy-Item "backend\app.js" "$deployDir\"

Write-Host "4. Generating clean production package.json (no devDependencies, no Windows lockfile)..." -ForegroundColor Cyan
@'
{
  "name": "food-inventory-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "app.js",
  "scripts": {
    "start": "node app.js",
    "prisma:generate": "prisma generate",
    "prisma:deploy": "prisma migrate deploy"
  },
  "dependencies": {
    "@node-rs/argon2": "^2.2.2",
    "@prisma/client": "^6.16.0",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.5",
    "dotenv": "^17.2.0",
    "express": "^5.1.0",
    "express-rate-limit": "^8.1.0",
    "helmet": "^8.1.0",
    "pino": "^9.10.0",
    "prisma": "^6.16.0",
    "socket.io": "^4.8.4",
    "zod": "^4.1.0"
  }
}
'@ | Out-File -FilePath "$deployDir\package.json" -Encoding utf8

Write-Host "5. Copying built frontend into public directory..." -ForegroundColor Cyan
Copy-Item -Recurse "frontend\dist\*" "$deployDir\public\"

Write-Host "6. Creating production .env template..." -ForegroundColor Cyan
@'
NODE_ENV=production
PORT=5000

# MySQL (local on the cPanel server)
DATABASE_URL="mysql://quanusse_iskon:4zMbeG!s[_YVTyR$@localhost:3306/quanusse_iskon"

# Allowed browser origin (your production domain with https://)
CORS_ORIGIN=https://YOUR_DOMAIN.COM

# Security & Cookies
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
SESSION_COOKIE_NAME=fis_session
SESSION_EXPIRES_DAYS=7

# Body & Rate limits
REQUEST_BODY_LIMIT=100kb
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=300
AUTH_RATE_LIMIT_MAX=10

LOG_LEVEL=info
'@ | Out-File -FilePath "$deployDir\.env.example" -Encoding utf8

Write-Host "7. Compressing to $zipPath..." -ForegroundColor Cyan
Compress-Archive -Path "$deployDir\*" -DestinationPath $zipPath -Force

Write-Host "`nReady! Upload cpanel-deploy.zip to cPanel." -ForegroundColor Green
