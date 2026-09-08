# Trading Engineers — Factory Employee Management & DPR System

**Phase 1 — Employee, Attendance & Daily Production Report foundation**

A production-ready web application that replaces the factory's manual Google Sheet DPR
process with a proper multi-user system: structured employee master data, department and
shift configuration, progressive lock-on-save DPR entry, automatic attendance, full
historical search, reporting with exports, and a complete audit trail.

---

## Table of contents

1. [What is included](#1-what-is-included)
2. [Technology](#2-technology)
3. [Project structure](#3-project-structure)
4. [Running it locally (VS Code)](#4-running-it-locally-vs-code)
5. [Database — MongoDB Atlas](#5-database--mongodb-atlas)
6. [Environment variables](#6-environment-variables)
7. [Default logins](#7-default-logins)
8. [Testing](#8-testing)
9. [Deployment](#9-deployment)
10. [Core business rules](#10-core-business-rules)
11. [API documentation](#11-api-documentation)
12. [Extending to Phase 2](#12-extending-to-phase-2)

---

## 1. What is included

**Daily Production Report**
- DPR Control Center — one screen showing every employee's status for any date, with
  per-field lock indicators (🔒 locked / ⏳ pending / ✅ completed / 🟡 incomplete / 🔴 absent)
- DPR entry with **progressive lock-on-save**: IN time, OUT time and Work + Quantity are three
  independent field-groups; each locks the instant it is saved, in any order, any number of
  times through the day
- Bulk table-style DPR entry for handling 40–50 employees quickly (same locking rules)
- My Workspace — the logged-in operator's own quiet "DPR Missing Information" list
- Factory-wide Incomplete DPR view for supervisors
- Change history on every entry plus a full audit trail of overrides

**Employees**
- Master data with auto-generated employee ID (`YYMM` + 3 random digits, e.g. `2608001`)
- Permanent vs Contract employee types with different DPR maths
- Departments, optional teams, and a cross-assignable Helper pool
- Active / Inactive lifecycle — nothing is ever deleted
- Aadhar and bank details encrypted at rest and permission-gated
- Bulk import from CSV/Excel with row-by-row validation and preview
- Employee profile with monthly attendance calendar and Day/Night shift split

**Configuration**
- Admin-configurable Day and Night shift timings (versioned, so history stays accurate)
- Holiday calendar and weekly-off configuration
- Operator logins with an individual permission checklist per operator
- System settings: company details, attendance, DPR rules, security policy, notifications

**Reporting**
- DPR register, attendance summary and production/quantity reports
- Filters: date range, department, team, employee, employee type, shift, status
- Export to Excel, CSV and PDF
- Monthly analytics dashboard with attendance, overtime, hours and completion trends
- Admin dashboard, per-department dashboards and global search
- Admin-only audit log and system health / backup panel

---

## 2. Technology

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite, React Router, Recharts, custom design system |
| Backend | Node.js + Express (REST API) |
| Database | MongoDB (Mongoose) — MongoDB Atlas in production |
| Auth | JWT, bcrypt password hashing, per-request permission checks |
| Encryption | AES-256-GCM for Aadhar and bank account numbers |
| Exports | ExcelJS (xlsx), PDFKit (pdf), native CSV |
| API docs | OpenAPI / Swagger UI at `/api/docs` |
| Tests | Jest + Supertest + mongodb-memory-server (112 tests) |

---

## 3. Project structure

```
trading-engineers-dpr/
├── backend/
│   ├── src/
│   │   ├── config/            # env validation, database connection, swagger spec
│   │   ├── models/            # Mongoose schemas
│   │   │   ├── User.js            # admin + operators, permission flags
│   │   │   ├── Employee.js        # master data, encrypted sensitive fields
│   │   │   ├── Department.js  Team.js  Shift.js  Holiday.js
│   │   │   ├── DprEntry.js        # one entry per employee per date, per-field locks
│   │   │   ├── AuditLog.js        # every create / update / delete
│   │   │   └── Settings.js        # single configurable settings document
│   │   ├── services/          # business logic, framework-free and unit tested
│   │   │   ├── timeCalculation.js   # hours, OT, short time, midnight rollover
│   │   │   ├── attendanceService.js # absence inference, missing-info rules
│   │   │   ├── employeeIdService.js # YYMM + 3 digit ID generation
│   │   │   ├── encryption.js        # AES-256-GCM field encryption
│   │   │   ├── auditService.js      # audit writer
│   │   │   └── emailService.js      # admin password-reset OTP
│   │   ├── middleware/        # auth, permissions, validation, error handling
│   │   ├── modules/           # one folder per feature area (routes + controllers)
│   │   │   ├── auth/  employees/  masters/  dpr/
│   │   │   ├── dashboard/  reports/  operators/  audit/  system/
│   │   │   └── (Phase 2: production/  material/  mount here)
│   │   ├── utils/             # dates, errors, permission catalogue, validators
│   │   ├── app.js             # express app assembly
│   │   └── server.js          # entry point
│   ├── scripts/seed.js        # admin + departments + shifts (+ optional demo data)
│   ├── tests/                 # 112 automated tests
│   └── .env.example
│
├── frontend/
│   ├── public/logo.png        # Trading Engineers logo
│   ├── src/
│   │   ├── api/client.js      # axios instance + every endpoint in one place
│   │   ├── components/        # Layout (sidebar/header/search/notifications) + UI kit
│   │   ├── context/           # AuthContext, ToastContext
│   │   ├── hooks/useApi.js    # shared loading / error / reload handling
│   │   ├── pages/             # one file per screen (23 screens)
│   │   ├── styles/            # theme.css (design tokens) + app.css (components)
│   │   ├── utils/format.js    # date, hour and number formatting
│   │   ├── App.jsx            # routes + permission guards
│   │   └── main.jsx
│   └── vite.config.js         # dev proxy /api -> localhost:5000
│
└── docs/
    ├── BUSINESS-RULES.md      # the rules the system guarantees
    └── DEPLOYMENT.md          # going live, step by step
```

---

## 4. Running it locally (VS Code)

### Prerequisites

- **Node.js 18 or newer** — <https://nodejs.org>
- **MongoDB** — either a free MongoDB Atlas cluster (recommended, see section 5) or a local
  MongoDB installation
- VS Code with the terminal (`Ctrl + ~`)

### Step 1 — Backend

```bash
cd backend
npm install
cp .env.example .env      # Windows: copy .env.example .env
```

Open `backend/.env` and set at minimum:

```env
MONGO_URI=<your MongoDB connection string>
JWT_SECRET=<a long random string>
ENCRYPTION_KEY=<64 hex characters>
```

Generate the two secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # ENCRYPTION_KEY
```

> **Important:** once employees have been saved, changing `ENCRYPTION_KEY` makes existing
> Aadhar and bank numbers unreadable. Set it once and keep it safe.

Seed the database and start the API:

```bash
npm run seed -- --demo     # admin + departments + shifts + sample employees & DPR
npm run dev                # starts on http://localhost:5000
```

For a clean production database, run `npm run seed` **without** `--demo` — that creates only
the admin account, the factory departments and the shift definitions.

### Step 2 — Frontend

In a **second terminal**:

```bash
cd frontend
npm install
npm run dev                # starts on http://localhost:5173
```

Open <http://localhost:5173> and sign in. The Vite dev server proxies `/api` to the backend
automatically, so there is nothing else to configure.

### Useful URLs

| URL | What it is |
|---|---|
| <http://localhost:5173> | The application |
| <http://localhost:5000/api/docs> | Swagger API documentation |
| <http://localhost:5000/api/system/health> | Health check |

---

## 5. Database — MongoDB Atlas

**You do not need to buy anything to start.** MongoDB Atlas has a permanently free tier that
comfortably covers this factory's workload.

### Free tier (M0) — what you get

- 512 MB storage
- Shared CPU/RAM, no time limit, no credit card required
- Accessible from anywhere over the internet

### Is 512 MB enough?

For 80 employees producing one DPR entry each per working day:

| Data | Approximate size |
|---|---|
| 80 employee records | ~200 KB |
| ~2,000 DPR entries per month | ~2 MB per month |
| Audit log | ~1 MB per month |
| **One full year** | **≈ 40 MB** |

That is roughly **10+ years of operation** inside the free tier. You would only consider a
paid plan (M10, around $9/month at the time of writing — check current pricing) if the client
later wants automated point-in-time backups, a dedicated cluster for performance, or private
network peering.

### Setting up Atlas

1. Create a free account at <https://www.mongodb.com/cloud/atlas/register>
2. **Build a Database → M0 (Free)** → choose a region close to the factory (e.g. Mumbai)
3. **Database Access →** create a user with a strong password (username + password auth)
4. **Network Access →** add an IP address:
   - For local testing: your current IP
   - For a cloud-hosted backend: `0.0.0.0/0` (allow from anywhere) — access is still protected
     by the database username and password
5. **Connect → Drivers → Node.js →** copy the connection string and put it in `.env`:

```env
MONGO_URI=mongodb+srv://myuser:mypassword@cluster0.abcde.mongodb.net/trading_engineers_dpr?retryWrites=true&w=majority
```

Replace `myuser` / `mypassword` with your credentials, and keep the database name
`trading_engineers_dpr` before the `?`.

### Backups

Atlas takes automatic snapshots on the free tier's shared infrastructure; retention is limited.
Before handing over to the client, either:

- upgrade to a paid tier if guaranteed point-in-time restore is required, or
- schedule a periodic `mongodump` (the System Health screen in the app shows the current
  backup status it can detect).

---

## 6. Environment variables

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | no | `development` / `production` |
| `PORT` | no | API port (default 5000) |
| `CLIENT_ORIGIN` | production | Comma-separated allowed frontend origins for CORS |
| `MONGO_URI` | **yes** | MongoDB connection string |
| `JWT_SECRET` | **yes** | Long random string used to sign sessions |
| `JWT_EXPIRES_IN` | no | Session lifetime (default `12h`) |
| `ENCRYPTION_KEY` | **yes** | 64 hex characters — encrypts Aadhar and bank numbers |
| `SEED_ADMIN_USERNAME` | no | Login ID created by `npm run seed` (default `admin`) |
| `SEED_ADMIN_PASSWORD` | no | Password for that account |
| `SEED_ADMIN_EMAIL` | no | Recovery email for administrator password reset |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | no | Email delivery for the admin reset code. Leave `SMTP_HOST` empty in development — the code is printed in the server console instead. |

The server refuses to start in production if `JWT_SECRET` or `ENCRYPTION_KEY` are left at their
example values.

---

## 7. Default logins

Created by `npm run seed` (change the passwords immediately after first sign-in):

| Login ID | Password | Role |
|---|---|---|
| `admin` | `Admin@12345` | Administrator — unrestricted |

With `--demo`, two example operators are added to show the permission model:

| Login ID | Password | Permissions |
|---|---|---|
| `operator1` | `Operator@123` | Register employees, edit, assign departments, view reports |
| `operator2` | `Operator@123` | Enter DPR, view reports (**cannot** edit locked fields) |

---

## 8. Testing

```bash
cd backend
npm test
```

112 automated tests cover the business-critical logic:

- Authentication, password policy and the administrator email-recovery flow
- Operator permissions, unauthorised API access, permission escalation attempts
- Progressive lock-on-save (each field-group independently), lock authorisation, overrides
- Permanent vs Contract DPR calculation
- Day shift, night shift, and **night shifts crossing midnight**
- Overtime and short-time maths against versioned shift timings
- Holiday blocking, automatic absence inference, inactive-employee exclusion
- Helper cross-assignment (and rejection for non-helpers)
- Employee ID generation and uniqueness
- Aadhar/bank encryption at rest and masking by permission
- Bulk import validation, shift versioning, reports and exports
- Audit logging on every mutation

The suite uses an in-memory MongoDB and downloads a small binary on first run. If your network
blocks that download, point the tests at any throwaway database instead:

```bash
MONGO_TEST_URI=mongodb://127.0.0.1:27017/dpr_test npm test
```

---

## 9. Deployment

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for the full step-by-step guide (Render,
Railway, or a VPS), including build commands, environment variables and the production
checklist.

Quick summary:

```bash
# Backend  — any Node host
npm install && npm start          # reads .env / platform environment variables

# Frontend — any static host
npm run build                     # outputs frontend/dist
```

Set `VITE_API_URL` at build time to the deployed API base URL (for example
`https://api.yourdomain.com/api`), and set `CLIENT_ORIGIN` on the backend to the deployed
frontend origin.

---

## 10. Core business rules

The full list lives in **[docs/BUSINESS-RULES.md](docs/BUSINESS-RULES.md)**. The essentials:

1. **Progressive lock-on-save** — IN time, OUT time and Work + Quantity lock independently the
   moment each is saved. Only an administrator, or an operator explicitly granted
   *Edit locked DPR fields*, can change a locked value, and every override is recorded.
2. **Absence is inferred, never entered** — an active employee with no DPR entry on a
   non-holiday working day is absent.
3. **Permanent vs Contract** — overtime and short time are calculated only for permanent
   employees against their shift. Contract workers get total hours only.
4. **Night shifts crossing midnight** (18:10 → 02:22) are one continuous shift on one date.
5. **Holidays block DPR entry** and never count as absence.
6. **Helpers can be cross-assigned** to any department for a given day.
7. **Nothing is deleted** — employees and departments are archived, and history is preserved.
8. **Every permission is enforced on the server**; the interface only mirrors it.
9. **Aadhar and bank account numbers are encrypted at rest** and masked unless permitted.
10. **Every create, update and delete is written to the audit log.**

---

## 11. API documentation

Interactive Swagger UI: <http://localhost:5000/api/docs> (raw spec at `/api/docs.json`).

Documented areas: Authentication, Employees, Configuration (departments, teams, shifts,
holidays), DPR, Dashboard, Reports, Operators & Permissions, Audit, System.

To try authenticated calls in Swagger: `POST /api/auth/login`, copy the `token`, click
**Authorize** and paste it.

---

## 12. Extending to Phase 2

Phase 1 is deliberately self-contained and modular so **Production** and **Material** modules
can be added without touching what already works:

- **Backend** — create `backend/src/modules/production/` with its own `*.routes.js` and
  `*.controller.js`, add the models it needs under `src/models/`, and mount one line in
  `src/app.js`. Nothing else changes.
- **Frontend** — add pages under `src/pages/`, endpoints under `src/api/client.js`, and a nav
  group in `src/components/Layout.jsx`.
- **Permissions** — add the new keys to `src/utils/permissions.js`; the operator checklist UI,
  the backend guard and the account screen all pick them up automatically.
- **Shared foundations already in place** — audit logging, encryption, validation, the
  date/time engine, exports and the design system are all reusable as-is.

No Production or Material code exists yet, by design.

---

© Trading Engineers · Factory Management System · Phase 1 · v1.0.0
