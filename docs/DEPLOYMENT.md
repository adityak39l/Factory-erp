# Deployment guide

Take the system from your laptop to a live URL the factory can use from anywhere.

The application is two deployable pieces plus a database:

```
[ React frontend (static files) ]  →  [ Node/Express API ]  →  [ MongoDB Atlas ]
```

---

## Before you deploy — checklist

- [ ] Ran the system locally and the client is happy with it
- [ ] MongoDB Atlas cluster created (see README section 5)
- [ ] `JWT_SECRET` and `ENCRYPTION_KEY` generated fresh for production and stored somewhere safe
- [ ] Seeded the production database **without** `--demo`
- [ ] Changed the default admin password
- [ ] Set a real administrator recovery email
- [ ] Decided the hosting platform (below)

> **Never reuse the development `ENCRYPTION_KEY` values from `.env.example`.** The server
> refuses to start in production if you do. And once real employee data is saved, changing the
> key makes existing Aadhar and bank numbers unreadable.

---

## Option A — Render (simplest, has a free tier)

### 1. Push the project to GitHub

```bash
cd trading-engineers-dpr
git init
git add .
git commit -m "Trading Engineers DPR system — Phase 1"
git branch -M main
git remote add origin https://github.com/<you>/trading-engineers-dpr.git
git push -u origin main
```

`.gitignore` already excludes `node_modules` and `.env`.

### 2. Deploy the backend (Web Service)

- **New → Web Service →** connect the repository
- **Root Directory:** `backend`
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Environment variables:**

```
NODE_ENV=production
MONGO_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/trading_engineers_dpr?retryWrites=true&w=majority
JWT_SECRET=<48-byte hex>
ENCRYPTION_KEY=<32-byte hex>
CLIENT_ORIGIN=https://<your-frontend>.onrender.com
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=<a strong password>
SEED_ADMIN_EMAIL=owner@tradingengineers.com
```

Note the API URL Render gives you, e.g. `https://te-dpr-api.onrender.com`.

### 3. Seed the production database — once

From your own machine, with `backend/.env` temporarily pointing at the production `MONGO_URI`:

```bash
cd backend
npm run seed          # no --demo: admin + departments + shifts only
```

Then put your local `MONGO_URI` back.

### 4. Deploy the frontend (Static Site)

- **New → Static Site →** same repository
- **Root Directory:** `frontend`
- **Build Command:** `npm install && npm run build`
- **Publish Directory:** `dist`
- **Environment variable:**

```
VITE_API_URL=https://te-dpr-api.onrender.com/api
```

- **Redirects/Rewrites** (required for a single-page app — without it, refreshing a page 404s):

| Source | Destination | Action |
|---|---|---|
| `/*` | `/index.html` | Rewrite |

### 5. Close the loop

Set `CLIENT_ORIGIN` on the backend service to the final frontend URL and redeploy it.

> Render's free web services sleep after inactivity, so the first request each morning can take
> ~30 seconds. A paid instance (around $7/month) removes that.

---

## Option B — Railway

Very similar: create a project from the repository, add **two services** with root directories
`backend` and `frontend`, set the same environment variables, and use
`npm install && npm run build` with a static adapter (or serve `dist` via any static host).

---

## Option C — VPS (full control)

On Ubuntu with Node 18+, Nginx and PM2:

```bash
# Backend
cd /var/www/trading-engineers-dpr/backend
npm install --omit=dev
cp .env.example .env && nano .env        # fill in production values
npm run seed                              # once
pm2 start src/server.js --name te-dpr-api
pm2 save && pm2 startup

# Frontend
cd ../frontend
VITE_API_URL=https://yourdomain.com/api npm run build
```

Nginx site configuration:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    root /var/www/trading-engineers-dpr/frontend/dist;
    index index.html;

    # Single-page app: every unknown path serves index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Add HTTPS (free, and required for handling Aadhar/bank data):

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## Email (administrator password recovery)

Without SMTP configured, reset codes are printed to the server log — fine for development, not
for production. For Gmail, create an **App Password** (with 2FA enabled) and set:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=youraccount@gmail.com
SMTP_PASS=<16-character app password>
MAIL_FROM="Trading Engineers DPR <youraccount@gmail.com>"
```

---

## After going live

1. Sign in as `admin` and **change the password immediately** (My Account).
2. Set the administrator recovery email (Operators & Access Control → Edit).
3. Fill in company details under System Settings.
4. Confirm the Day and Night shift timings match the factory.
5. Add the year's holidays and set weekly offs.
6. Create the operator logins with exactly the permissions each person needs.
7. Import the employees (Bulk Import) or register them one by one.
8. Check the System Health screen — database connected, backups understood.
9. Run one real day of DPR alongside the old sheet as a parallel check.

---

## Ongoing maintenance

| Task | How often |
|---|---|
| Verify backups (Atlas snapshots or `mongodump`) | Monthly |
| Review the audit log for unexpected lock overrides | Monthly |
| Update dependencies (`npm outdated`, then test) | Quarterly |
| Rotate operator passwords | As policy requires |

**Never rotate `ENCRYPTION_KEY`** on a live database without first decrypting and re-encrypting
existing values — otherwise the stored Aadhar and bank numbers become unreadable.
