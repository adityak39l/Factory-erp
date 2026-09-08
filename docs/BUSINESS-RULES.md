# Business rules — Phase 1

These are the guarantees the system enforces. They are implemented on the **server**, covered by
automated tests, and must not be weakened by any future feature.

---

## 1. Roles and permissions

| Rule | Detail |
|---|---|
| Administrator is unrestricted | Full access to every screen and action, A to Z |
| Only the administrator manages access | Creates operator logins, ticks their permissions, resets their login ID / name / password |
| Operators start with nothing | Every permission is off by default and granted individually |
| Permissions are enforced server-side | The interface only hides controls; the API refuses the action regardless |
| Permission changes apply instantly | The live user record is read on every request — no re-login needed |
| Operators cannot escalate | Operator accounts cannot reach operator management at all |
| The administrator cannot be restricted or disabled | Attempts are rejected |

### Permission catalogue

| Key | Grants |
|---|---|
| `canRegisterEmployee` | Create employee master records, bulk import |
| `canEditEmployee` | Modify existing employee data |
| `canAssignDepartment` | Change department / team assignment |
| `canChangeEmployeeStatus` | Mark employees Active / Inactive |
| `canViewSensitive` | Unmask Aadhar and bank details (off by default) |
| `canEnterDpr` | Record DPR entries |
| `canEditDpr` | Change a **locked** DPR field (off by default) |
| `canManageMasters` | Departments, teams, shifts, holidays |
| `canViewReports` | Reports, exports and analytics |

---

## 2. Progressive lock-on-save (the core DPR rule)

A DPR entry has **three independent field-groups**:

| Group | Contains |
|---|---|
| `inTime` | IN time |
| `outTime` | OUT time |
| `workQty` | Work description + quantity |

- Each group is saved on its own and **locks the instant it is saved**.
- Saves may happen **in any order, any number of times through the day** — there is no fixed
  morning/evening sequence. An operator saves whatever information they currently have.
- A locked group can only be changed by an administrator, or an operator explicitly granted
  `canEditDpr`. Everyone else receives a clear refusal, and the stored value is untouched.
- Every override records the previous value, the new value, who changed it, when, and the
  reason, in both the entry's change history and the audit log.
- **Bulk entry obeys exactly the same rules** — it writes through the same engine, so locked
  fields are refused there too and reported row by row.
- OUT time cannot be recorded before IN time exists.

---

## 3. Time, shifts, overtime

| Rule | Detail |
|---|---|
| Hours are always computed | Total hours are derived from IN/OUT — never typed |
| Midnight rollover | 18:10 → 02:22 is 8h 12m on one date, not a negative or 15h value |
| Overtime / short time | `worked − scheduled shift duration`; positive is overtime, negative is short time |
| Permanent employees only | Overtime and short time are calculated only for permanent staff |
| Contract employees | No shift, no overtime, no short time — total hours only |
| Per-day shift | A permanent employee's default shift pre-fills the entry but can be changed for that day; the entry's shift, not the default, drives the maths |
| Shift versioning | Changing shift timings creates a new dated version; historical DPRs keep the timings that applied on their own date |

---

## 4. Attendance (inferred, never entered)

For an **active** employee on a given date:

| Condition | Result |
|---|---|
| A DPR entry exists | **Present** (Completed or Incomplete) |
| The date is a declared holiday or a configured weekly off | **Holiday** |
| The date is before their joining date | **Not Joined** |
| The date is after they were marked Inactive | **Left** (never absent) |
| The date is in the future | **Upcoming** |
| Otherwise | **Absent** |

Inactive employees are excluded from absence entirely — they never accumulate absences after
they leave.

---

## 5. "Missing information" rules

The operator's personal list and the factory-wide incomplete view both use these rules:

| Rule | Detail |
|---|---|
| No IN time at all | The employee is **Absent** — never shown as incomplete |
| OUT time missing | Shown **only after** the expected shift end has passed; before that the person is simply still working |
| Work + Quantity missing | Never shown for employees with `requiresWorkQty = false` (guards, cooks, sweepers and other support roles) |
| Personal scope | *My Workspace* shows only entries recorded by the signed-in operator |
| Presentation | Informational only — no popups, no alarms |

---

## 6. Employees

| Rule | Detail |
|---|---|
| Employee ID format | `YYMM` + 3 random digits (e.g. joined August 2026 → `2608001`); year and month are selectable at registration; the suffix is unique inside that month |
| Registration first | An employee must exist before being assigned to a department |
| Department changes | Always allowed, and never rewrite history — each DPR entry stores the department it was recorded against |
| Teams | Optional, and only in departments configured to use them |
| Helper pool | Employees in a helper-pool department can be logged against **any** department for a given day; non-helpers cannot |
| Active / Inactive | Inactive employees disappear from every live screen (search, dropdowns, dashboards, absence) but their full history is preserved and they can be reactivated |
| Nothing is deleted | Employees and departments are archived, never destroyed |

---

## 7. Sensitive data

| Rule | Detail |
|---|---|
| Encrypted at rest | Aadhar numbers and bank account numbers are stored with AES-256-GCM |
| Masked by default | Shown as `XXXX XXXX 9012` / `••••••6789` unless the viewer holds `canViewSensitive` |
| Editing is gated | Modifying these fields also requires `canViewSensitive` |
| Never logged in the clear | Audit snapshots exclude the decrypted values |

---

## 8. Holidays and date limits

| Rule | Detail |
|---|---|
| Holidays block DPR entry | The API refuses entries on declared holidays |
| Holidays never create absence | The day shows as Holiday for everyone |
| A day with entries cannot become a holiday | Existing entries must be removed first |
| Weekly offs | Configured once in System Settings (default: Sunday) |
| Future dates | Blocked unless explicitly enabled in settings |
| Backdating | Limited to a configurable number of days (default 7); the administrator can record older entries |

---

## 9. Audit

Every create, update and delete is written to the audit log with: the user, their role, the
action, the entity, a readable label, before/after snapshots, a note and a timestamp.

Actions recorded: `CREATE`, `UPDATE`, `DELETE`, `LOGIN`, `LOGIN_FAILED`, `PASSWORD_RESET`,
`PERMISSION_CHANGE`, `STATUS_CHANGE`, `LOCK_OVERRIDE`, `BULK_IMPORT`, `EXPORT`.

The audit log is visible to the administrator only.

---

## 10. Account recovery

| Who | How |
|---|---|
| Operator forgets their password | The administrator resets it directly from Operators & Access Control |
| Administrator forgets their password | "Administrator forgot password?" on the sign-in screen sends a 6-digit code to the registered administrator email; it expires in 15 minutes, allows 5 attempts and cannot be replayed |

The forgot-password response never reveals whether an account exists.
