# Project Handoff — Trading Engineers Factory Management & DPR System

Paste this whole file into a new Claude Code chat in VS Code so it understands everything that has
happened on this project so far, before you assign it any new task. (There is also a `CLAUDE.md` in this
same folder that Claude Code reads automatically — this file is the fuller story behind it, written so a
human or an AI picking this up cold understands the "why," not just the "what.")

---

## 1. Who this is for and what problem it solves

The client is **Trading Engineers**, a pole manufacturing factory with roughly 70-80 workers. Before this
project, their entire DPR (Daily Production Report) process — who came in, IN time, OUT time, overtime,
short time, what work was done, how much quantity was produced — was tracked manually on a **Google Sheet**.

The core problem the client wanted solved: **only one person had access to that sheet, and they could
freely go back and change any past entry with no record of what changed.** There was no accountability, no
audit trail, no structure, and no way to reliably pull historical reports. The client wanted a real,
production-grade web application to replace it entirely — not a toy, a system they can actually run their
factory on and eventually hand to other people to operate.

This project (**Phase 1**) covers Employee Management + DPR + Attendance. The client and developer agreed
this is the foundation of a larger planned system — **Production and Material tracking modules are planned
for later phases** and were deliberately NOT built now, but the architecture was built to be modular enough
that those modules can be bolted on later without reworking what exists.

---

## 2. How this project was run

The developer (Garvit) insisted on a strict **"discuss first, build later"** process. Over many conversation
turns, the client's exact requirements were extracted piece by piece — department structure, employee
lifecycle, the DPR lock-on-save mechanic, shifts, contractor rules, permissions, account recovery, and a long
list of extra features. Nothing was built or written into a design document until the developer explicitly
said "build this project." Requirements gathering included the developer sharing a PDF of the actual factory
Google Sheet so the format of real historical data was understood before any schema was designed.

Once the developer gave the go-ahead, along with the real company logo and name (**Trading Engineers**,
navy/orange branding), the full application was built, tested, and delivered as a working local project.

That full build is what now lives in this folder. The rest of this document describes exactly what was
decided and what was built, so a fresh AI session (or a new developer) doesn't have to re-derive any of it.

---

## 3. The business rules, in full (the actual requirements)

### 3.1 Roles and permissions
- There is one **Admin** account with unrestricted access to everything — nothing is ever locked or hidden
  from admin.
- Admin creates **Operator** logins. Operators start with **zero permissions** — every capability is off by
  default and must be explicitly granted by admin, one by one, via a permission checklist.
- Example from the client's own words: one operator should only be able to register new employees and
  assign them to departments (not edit anything after); a different operator should only be able to enter
  DPR data (IN/OUT time, work done) for existing employees, and NOT be able to edit locked entries unless
  admin explicitly grants that power too.
- All permission checks are enforced **on the backend**, not just hidden in the UI — an operator who
  disables JavaScript or calls the API directly still cannot exceed their granted permissions.
- The permission catalogue (9 keys): `canRegisterEmployee`, `canEditEmployee`, `canAssignDepartment`,
  `canChangeEmployeeStatus`, `canViewSensitive`, `canEnterDpr`, `canEditDpr`, `canManageMasters`,
  `canViewReports`.

### 3.2 Employees (master data)
- Admin registers all employees first, with full master data: name, mobile, email, father's name, address,
  Aadhar number, bank details (bank name, account no, IFSC).
- Every employee gets a **unique auto-generated employee ID** in the format `YYMM` + 3 random digits (e.g.
  an employee joining August 2026 might get `2608001`). This lets admin/owner look someone up by number
  alone and immediately see all their details.
- An employee must be registered before being assigned to any department — registration always comes first.
- **Active / Inactive** status: if an employee leaves the company, admin marks them Inactive. Their data is
  fully preserved (nothing is ever deleted), but they disappear from all live screens, dropdowns, dashboards
  and — critically — they **stop accumulating absences**. They can be reactivated later and their full
  history is intact.
- **Permanent vs Contract** employee type: Contract workers do not participate in the shift system at all —
  no shift assignment, no overtime, no short-time calculation. They just log total hours worked. Permanent
  employees get the full shift/OT/short-time treatment.

### 3.3 Departments, teams, and the Helper pool
- The factory has 10+ departments (Store, Office, Logistics, LED Section, Welding, Paint Shop, Galvanization,
  etc. — the real list mirrors the client's actual sheet).
- **Teams are optional** — only some departments need internal teams. Example: Welding is split into Team A,
  Team B, Team C; most other departments have no teams at all.
- A special **Helper department** exists whose employees can be assigned to work in *any* other department on
  a given day (e.g. if a Paint Shop worker is absent, a Helper is sent to cover). Only Helper-pool employees
  can float between departments like this — everyone else is a fixed member of one department.
- Department changes are always allowed and are never destructive to history — every past DPR entry keeps
  the department it was actually recorded against, even if the employee later moves departments.

### 3.4 Shifts, time, and overtime
- Two shifts: **Day** and **Night**. Default timings (9:15 AM–6:15 PM day-shift style) are admin-configurable
  from the start — the exact start/end times can be changed at any time from Settings.
- Changing a shift's timings does **not** rewrite history — it creates a new *versioned* record with an
  effective-from date, so historical DPR entries keep using the shift timings that were actually in effect on
  that date.
- Total hours are always **computed** from IN/OUT time, never manually typed. Overtime and short-time are
  `worked time − scheduled shift duration` — positive is OT, negative is short-time — and this calculation
  applies **only to Permanent employees**. A shift crossing midnight (e.g. 18:10 → 02:22) computes correctly
  as roughly 8h12m, not as a negative number or an inflated value.

### 3.5 The DPR "progressive lock-on-save" rule — the most important mechanic in the system
This came directly from the client describing exactly how their manual process should have worked but
didn't, because of the Google Sheet's total lack of structure:

- A DPR entry for one employee on one day has **three independent field-groups**: IN time, OUT time, and
  Work+Quantity (work done description + quantity produced).
- Each group is saved **on its own**, and the moment it is saved, **it locks**. It cannot silently be
  overwritten later.
- These three groups can be filled in **any order, any number of times through the day** — there is no fixed
  "morning then evening" sequence enforced. An operator saves whatever information is available to them right
  now (e.g. IN time in the morning locks immediately; hours later, OUT time and work-done get filled in and
  lock independently).
- Once a group is locked, it can only be changed by **Admin**, or by an Operator who has been explicitly
  granted the `canEditDpr` permission. Anyone else attempting to change a locked field is refused outright —
  the stored value is never silently touched.
- **Every override is fully audited**: the previous value, the new value, who changed it, exactly when, and a
  required reason, recorded both in that DPR entry's own change history and in the system-wide Audit Log.
- **Bulk DPR entry follows the exact same rule** — it is not a separate, looser code path; it writes through
  the identical lock engine, so a locked field refuses a bulk-import overwrite too, reported row by row.
- OUT time can never be recorded before an IN time exists for that entry.

### 3.6 Attendance — always inferred, never manually entered
The client explicitly did not want a "mark present/absent" button anywhere — attendance status is a
*conclusion*, computed automatically from other data, for every active employee on every date:
- A DPR entry exists → **Present**
- The date is a declared holiday or a configured weekly-off day → **Holiday**
- The date is before the employee's joining date → **Not Joined**
- The date is after the employee was marked Inactive → **Left** (this is important — a former employee never
  accumulates "Absent" days after they've left)
- The date is in the future → **Upcoming**
- None of the above → **Absent**

### 3.7 Holidays — explicit only (fixed 2026-09-06)
Originally the system defaulted Sunday as an automatic weekly-off/holiday. Testing revealed this was
**not** what the client wanted — the rule is: **nothing is ever a holiday unless admin explicitly says so**.
This was fixed by changing `Settings.attendance.weeklyOffDays` to default to an empty list and
`treatWeeklyOffAsHoliday` to default to `false`. A day only becomes a holiday if admin either (a) adds that
specific date on the Holidays screen, or (b) deliberately ticks a weekly-off day in Settings → Attendance.
Every day is a normal working day by default.

### 3.8 The "Missing Information" features (added late in requirements gathering, finalized rules)
Two related screens exist to help operators/admin see who still needs DPR data filled in, **without** ever
guessing or nagging incorrectly:
- An employee with **no IN time at all** is simply Absent — they never show up as "incomplete." Only
  employees who have *started* an entry but not finished it appear here.
- A missing **OUT time** is only shown once the employee's shift would reasonably have ended already — before
  that point, they're just still working, not "incomplete."
- Missing **work description + quantity** is never flagged for employees whose department/role doesn't
  require it (`requiresWorkQty: false` — guards, cooks, sweepers, and other support roles who don't produce a
  countable output).
- **My Workspace**: shows only the entries the *currently logged-in* operator personally recorded — a
  personal to-do list, purely informational, no popups or alarms.
- **Incomplete DPR**: the factory-wide version of the same list, visible to admin/permitted roles, including a
  "Recorded By" column so responsibility for each pending entry is clear. This is the supervisor's view.
- Also added: the **DPR Control Center**, a single dashboard screen where a supervisor can instantly see
  who's present, whose DPR is complete, whose OUT time is pending, and who's absent, factory-wide, at a
  glance.

### 3.9 Sensitive data
- Aadhar numbers and bank account details are encrypted at rest (AES-256-GCM) and masked by default in the
  UI (e.g. `XXXX XXXX 9012`). They are only shown unmasked to users with the `canViewSensitive` permission,
  and editing them requires the same permission. They never appear decrypted in any audit log entry.

### 3.10 Account recovery
- Admin can reset any operator's password directly, and can change an operator's username too, at any time.
- If **admin** forgets their own password, there's a "Forgot password" flow on the login screen that emails a
  6-digit one-time code to the registered admin recovery email (expires in 15 minutes, limited attempts,
  cannot be replayed).

### 3.11 Audit logging
Every create, update, delete, login, failed login, password reset, permission change, status change, lock
override, bulk import, and export is written to a system-wide Audit Log (visible to admin only), capturing
who did it, their role, before/after values, a note, and a timestamp.

---

## 4. What has actually been built (Phase 1 — complete)

- **Backend**: Node.js + Express + Mongoose, with modules for auth, employees (+ bulk import), masters
  (departments/teams/shifts/holidays), DPR (including the full lock-on-save engine and bulk entry sharing the
  same engine), dashboard, reports (Excel/CSV/PDF export), operator management, audit log, and system
  health/settings. JWT auth with bcrypt password hashing. Swagger/OpenAPI docs served at `/api/docs`.
- **Frontend**: React 18 + Vite, 23 pages covering everything above — dashboard, analytics (charts), DPR
  entry (the actual lock UI, showing 🔒 Locked / ⏳ Pending per field group), bulk DPR entry, My Workspace,
  Incomplete DPR, the DPR Control Center, employee list/profile/import, departments/teams/shifts/holidays
  configuration, reports & export, operator management with the permission checklist, audit log, settings,
  system health, and account management. Built with the real Trading Engineers logo and brand colors
  (navy `#05054a` / orange `#e28431`), designed to look like a professional enterprise product, fully
  responsive.
- **Testing**: 112 passing backend Jest tests covering time math, auth, the full DPR lock/override/bulk/
  validation suite, permissions, attendance inference, and employees. A full Playwright-driven browser
  walkthrough of all 23 routes was also run with zero console or network errors, plus a dedicated end-to-end
  test that clicks through the actual lock → override → audit-log chain as both a restricted operator and as
  admin, confirming the restricted operator cannot see an override option and that overrides are correctly
  logged.
- **Docs included in this repo**: `README.md` (setup + how to run locally in VS Code + env vars + default
  logins), `docs/BUSINESS-RULES.md` (the rules above in reference-table form), `docs/DEPLOYMENT.md`
  (Render/Railway/VPS hosting guides for when this goes live), and `CLAUDE.md` (a shorter machine-readable
  brief for any AI coding assistant working in this repo).
- **Default seeded logins** (local/demo data only — must be changed before going live):
  - Admin: `admin` / `Admin@12345`
  - Demo operators (only when seeded with `--demo`): `operator1` / `operator2`, both `Operator@123`

---

## 5. What is deliberately NOT built yet

Production tracking and Material/inventory tracking modules — these are planned for a future phase. The
codebase was structured (see the comment in `backend/src/app.js` marking where future modules mount) so they
can be added later without reworking Phase 1.

---

## 6. Current state of testing / where we are right now

The developer has been testing the delivered build locally (running the backend and frontend from VS Code,
against a real MongoDB). One real bug was found and fixed during this testing phase: Sunday was showing as an
automatic holiday in the Bulk DPR Entry screen even though admin never declared it — this was because of a
default setting (`weeklyOffDays` defaulting to `[0]` for Sunday), not a logic bug in the DPR engine itself.
That default has been changed so **no day is ever a holiday unless admin explicitly configures it**, exactly
as described in section 3.7 above. If the developer's local database still shows Sunday as a holiday, it's
because that specific setting document was already saved before the fix — it needs updating once via
Settings → Attendance (untick Sunday) or a fresh `npm run seed -- --demo --reset`.

The developer also asked and was told the difference between **My Workspace** and **Incomplete DPR** (see
section 3.8) — they look similar right now only because, in the current test data, every entry happens to
have been recorded under the admin login itself.

---

## 7. How work will proceed from here

From this point forward, the developer will be doing further work — bug fixes, refinements, new
requests — **directly in this repository from VS Code**, using Claude Code (the local coding assistant),
rather than in the cloud chat this handoff document came from. This document plus `CLAUDE.md` in the project
root are meant to bring that VS Code session fully up to speed, so it does not need anything re-explained
before it can act.

**Instruction to whichever Claude session reads this next:** Do not treat anything above as historical
trivia — these are live, binding product requirements. Before changing any DPR, attendance, holiday,
permission, or shift-related logic, re-read the relevant rule above (and the fuller version in
`docs/BUSINESS-RULES.md`) and make sure the change is consistent with it. If a requested change seems to
conflict with a rule above, say so and ask, rather than silently reinterpreting the rule.
