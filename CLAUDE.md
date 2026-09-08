# Trading Engineers — Factory Employee Management & DPR System (Phase 1)

This file briefs any Claude session opened in this repository. Read it fully before making changes.

## What this project is

A production web app for **Trading Engineers**, a pole manufacturing factory (~70-80 employees), replacing
their manual Google Sheets DPR (Daily Production Report) process. This is **Phase 1** of a larger planned
system — Production and Material modules are deliberately deferred, but the architecture must stay modular
enough to add them later without rework. Do not build those modules unless explicitly asked.

The client relationship: the developer (Garvit) is building this for the factory owner. Business rules below
came directly from the client's real workflow and were confirmed turn-by-turn — treat them as firm
requirements, not suggestions, unless the developer explicitly says a rule is changing.

## Stack

- Backend: Node.js + Express + Mongoose, MongoDB (Atlas in production)
- Frontend: React 18 + Vite, react-router-dom v6, Recharts, axios
- Auth: JWT + bcrypt; permissions enforced **server-side only** — the frontend only hides controls
- Sensitive fields (Aadhar, bank account) encrypted at rest with AES-256-GCM
- Testing: Jest + Supertest + mongodb-memory-server (backend), Playwright used for manual E2E verification
- Docs: OpenAPI/Swagger served at `/api/docs`

## Project structure

```
backend/src/
  config/       env, db connection, swagger spec
  models/       Mongoose schemas (User, Employee, Department, Team, Shift, Holiday, DprEntry, AuditLog, Settings)
  services/     timeCalculation, encryption, employeeIdService, auditService, attendanceService, emailService
  middleware/   auth, permissions, errorHandler, validate
  modules/      one folder per domain: auth, employees, masters, dpr, dashboard, reports, operators, audit, system
  utils/        ApiError, dates, permissions (the PERMISSIONS catalogue), validators
  app.js        Express app assembly — comment marks where future Production/Material modules mount
  server.js     entry point
backend/scripts/seed.js   creates admin, shifts, departments; --demo adds sample employees/DPR entries; --reset wipes data
backend/tests/            Jest suites: timeCalculation, auth, dpr (core), permissions, attendance, employees

frontend/src/
  api/client.js         axios instance + full endpoints map
  context/               AuthContext (login/logout/can()), ToastContext
  components/            ui.jsx (shared component library), Layout.jsx (sidebar/header)
  hooks/useApi.js
  utils/format.js
  pages/                 23 page components — see README for the full list
  styles/theme.css, app.css   brand colors: --navy-900:#05054a, --orange-500:#e28431 (from the client logo)

docs/BUSINESS-RULES.md   the authoritative rule reference — read this before changing any DPR/attendance logic
docs/DEPLOYMENT.md       Render/Railway/VPS deployment guides
README.md                setup, running locally, env vars, default logins
```

## Core business rules (see docs/BUSINESS-RULES.md for full detail)

1. **Admin is unrestricted.** Operators start with zero permissions; admin grants each one individually via a
   permission checklist (`utils/permissions.js` is the single source of truth — drives DB schema, backend
   middleware, and frontend checklist UI). Permissions are enforced server-side on every request, not just hidden
   in the UI.

2. **Progressive lock-on-save (the most important rule in the system).** A DPR entry has three independent
   field-groups: `inTime`, `outTime`, `workQty`. Each group **locks the instant it is saved**, independently,
   in any order, any number of times per day. A locked group can only be changed by an admin or an operator with
   `canEditDpr`. Every override is written to the entry's `editHistory` AND the global `AuditLog` with
   before/after values, who, when, and why. Bulk entry goes through the exact same engine
   (`modules/dpr/dpr.service.js`) — never bypass it with a separate write path.

3. **Attendance is always inferred, never manually entered.** Status per employee per day: Present (has a DPR
   entry), Holiday (declared holiday or configured weekly-off day), Not Joined (before joining date), Left
   (after being marked Inactive — never counted absent), Upcoming (future date), otherwise Absent. See
   `services/attendanceService.js`.

4. **Holidays are explicit only.** `Settings.attendance.weeklyOffDays` defaults to `[]` and
   `treatWeeklyOffAsHoliday` defaults to `false` — **no day is ever automatically a holiday**. A day becomes a
   holiday only if the admin (a) adds a specific date on the Holidays screen, or (b) deliberately configures a
   weekly-off day in Settings → Attendance. (This was fixed on 2026-09-06 — it previously defaulted Sunday to
   an automatic holiday, which the client did not want.)

5. **Time/shifts:** Overtime and short-time are calculated only for Permanent employees (`worked − scheduled
   shift duration`). Contract employees have no shift, no OT, no short-time — total hours only. Shift timings
   are versioned (`effectiveFrom`), so changing a shift's hours never rewrites the math on historical DPR
   entries. Midnight-crossing shifts (e.g. 18:10 → 02:22) compute correctly as ~8h12m, not negative.

6. **Employees:** unique ID = `YYMM` + 3 random digits, unique within that month. Registration must precede
   department assignment. Department changes never rewrite history — each DPR entry stores the department it
   was recorded against. Teams are optional per department. "Helper" pool employees can be logged against any
   department for a given day; non-helpers cannot. Active/Inactive toggle preserves all history — nothing is
   ever hard-deleted (employees, departments — archived only).

7. **Sensitive data:** Aadhar and bank account numbers are encrypted at rest, masked by default, and only
   unmasked for users with `canViewSensitive`. Never appear decrypted in audit logs.

8. **"Missing information" views** (My Workspace / Incomplete DPR): an employee with no IN time at all is
   Absent, never "incomplete". Missing OUT time is only flagged after the shift's expected end time has passed.
   Missing work+qty is never flagged for employees with `requiresWorkQty: false` (guards, cooks, etc). My
   Workspace = only entries the logged-in user personally recorded. Incomplete DPR = factory-wide, all
   operators, with a "Recorded By" column — this is the admin/supervisor view.

## What's been verified

112 backend Jest tests passing (time math, auth, the full DPR lock-on-save/override/bulk/validation suite,
permissions, attendance inference, employees). Full Playwright-driven UI walkthrough of all 23 routes with zero
console/network errors, plus a dedicated flow test of the lock → override → audit-log chain as both a
restricted operator and admin.

## Default local logins (seeded data — change before going live)

- Admin: `admin` / `Admin@12345`
- Demo operators (only with `--demo` seed flag): `operator1` / `operator2`, both `Operator@123`

## Rules for working in this repo

- Never weaken a rule above without the developer explicitly asking for the change — these came from the real
  factory's workflow, confirmed over many rounds of discussion.
- Any change to DPR/attendance/lock logic needs a matching update to the Jest tests in `backend/tests/` and,
  ideally, to `docs/BUSINESS-RULES.md` if the rule itself changed.
- Permission checks belong in `utils/permissions.js` + backend middleware — never trust a frontend-only check.
- Don't hard-delete employees, departments, or DPR history — archive/deactivate instead.
- This is being built for a non-technical developer client relationship — prioritize correctness and
  maintainability over speed, and keep explanations in plain language when responding in chat.
