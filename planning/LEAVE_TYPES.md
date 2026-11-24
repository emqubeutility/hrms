# Leave types and their rules

These are the rules for each leave type in the `leave_types` table, as set up for UAE (`hrms_uae`). The values can be changed in Leave setup; this file records what they were on 25 November 2026. The setup script is `tools/uae-setup/leave-types.js` (safe to run again).

## Rules that apply to every type

- **Approval:** every request needs approval. There is no auto-approval. The manager approves first (status "Waiting for HR"), then HR confirms. Only HR's confirmation takes the days from the balance and marks attendance. HR can also approve a request that is still waiting for the manager.
- **Days counted:** weekly offs and holidays inside a request do not use up leave days (all types exclude both), except where the sandwich rule applies. This relies on the employee having a roster / weekly off; with none assigned, every day counts as a working day.
- **Sandwich rule:** the company switch is on, with "both sides" required. Only types marked sandwich eligible take part: Half Day Leave, LOP, Emergency Leave, Hajj Leave Unpaid and Umrah Leave Unpaid. A weekly off or holiday between two leave days of the same request then counts as leave.
- **Overlap:** a request cannot overlap another leave that is waiting for approval or approved.
- **Balance:** days come from the balance only for types that track one. The balance can never go negative (no type allows it). Days are shown to 2 decimals.
- **Which days are used first:** the credit that expires first.
- **Documents:** a type that needs a document asks for the file on the apply form (PDF, JPG or PNG, up to 10 MB; more than one file can be attached while the leave is waiting). HR cannot confirm the leave until a document is attached.
- **Pay percent:** each type stores the share of salary paid (100, 50 or 0). It is kept for payroll; nothing pays it out yet.
- **Calendar:** balances follow the calendar year (1 January to 31 December) and are reset at its end, except where a carry-forward rule says otherwise.

## How days are credited

A nightly job (02:30) expires old balance and credits new leave. "Credit leave now" on the Leave Configuration page runs the credit step by hand. Running it twice never credits twice.

| Credited | Types |
|---|---|
| **Monthly** from the leave policy, by service | Annual Leave |
| **All at once** on 1 January | Medical Leave (4 types), Study Leave |
| **By HR**, when the event happens | Maternity (5 types), Parental Leave |
| **When a comp off is approved** | Comp Off |
| **No balance kept** (days are only recorded) | Half Day Leave, LOP, Emergency, Hajj, Umrah, Bereavement |

## Annual leave

- **Policy:** "UAE statutory" (country AE), from 1 January 2020.
- **Formula:** `workdays * annualDays / yearDays`, worked out for each month and added up. It can be changed on the policy rule (see "Formula" below).
- **Service slabs** (`annualDays` in the formula):
  - first 6 months: 0
  - 6 to 12 months: 24 a year (2 days a month)
  - after 12 months: 30 a year
- **Service counts from:** the date of joining. If the employee has a **date of rejoining** and the system shows they already took Annual Leave before it, service counts from the rejoining date instead. A new joiner always counts from the joining date.
- **Carry forward** (what happens to days left at the end of the year, by Employee Category):
  - **Blue Collar:** the days become **Annual Leave Carried Forward (Unpaid)**, valid to the end of that calendar year.
  - **White Collar:** the days leave the balance and are recorded as **leave salary due** (a ledger entry of kind `LEAVE_SALARY`). Payroll will pay it when it is built.
  - Anyone with no category: the days stay as Annual Leave and move to the next year.

## Formula (policy rules)

A policy rule can carry an editable formula instead of the "joining part-way" method. It accepts the names `workdays` (days employed in the month, calendar days), `yearDays` (365 or 366), `annualDays` (days a year for the person's service) and `serviceMonths`, with `+ - * /`, brackets and `min() max() round() floor() ceil()`. The formula is checked when the policy is saved and is never run as code.

## Types

| Type | Code | Paid | Balance | Days | Half day | Document | Other rules |
|---|---|---|---|---|---|---|---|
| Annual Leave | AL | 100% | Yes | 30 a year, by formula and slabs | Yes | No | Carry forward by category (above) |
| Annual Leave Carried Forward (Unpaid) | AL-CF-UNPAID | 0% | Yes | 0 (filled by carry forward) | No | No | Where blue collar carried-forward days go |
| Medical Leave With Certificate | ML-CERT | 100% | Yes | 8 a year | No | Always | |
| Medical Leave Without Certificate | ML-NOCERT | 100% | Yes | 7 a year | No | No | |
| Medical Leave Half Pay | ML-HALF | 50% | Yes | 30 a year | No | Always | Appears only after ML-CERT and ML-NOCERT are both used up |
| Medical Leave Unpaid | ML-UNPAID | 0% | Yes | 45 a year | No | Always | Appears only after ML-HALF is used up |
| Half Day Leave | HDL | Unpaid | No | none | Yes | No | Sandwich eligible |
| LOP | LOP | Unpaid | No | none | Yes | No | Loss of pay. Sandwich eligible |
| Emergency Leave | EL | Unpaid | No | none | Yes | No | Sandwich eligible |
| Maternity Paid | MAT | 100% | Yes | 45 (by HR) | No | No | Female only |
| Maternity Half Paid | MAT-HALF | 50% | Yes | 15 (by HR) | No | No | Female only; appears only after MAT is used up |
| Maternity Unpaid | MAT-UNPAID | 0% | Yes | 45 (by HR) | No | No | Female only; appears only after MAT-HALF is used up |
| Maternity Baby Sick Paid | MAT-SICK-PAID | 100% | Yes | 30 (by HR) | No | Always | Female only |
| Maternity Baby Sick Unpaid | MAT-SICK-UNPAID | 0% | Yes | 30 (by HR) | No | Always | Female only; appears only after MAT-SICK-PAID is used up |
| Parental Leave | PAR | 100% | Yes | 5 (by HR) | No | No | The request asks for the child's date of birth; the leave must start on or after it and end within 6 months of it |
| Study Leave | STUDY | 100% | Yes | 10 a year, after 2 years of service | No | No | |
| Hajj Leave Unpaid | HAJJ | Unpaid | No | none | No | No | Once in a whole employment; at most 30 days a request; sandwich eligible |
| Umrah Leave Unpaid | UMRAH | Unpaid | No | none | No | No | Sandwich eligible. The company decides by approving or rejecting |
| Bereavement Leave | BRV | 100% | No | none | No | No | The employee chooses the relationship: Spouse up to 5 days; parent, child, sibling, grandchild or grandparent up to 3 days. Each request is capped by the choice |
| Comp Off | COMPOFF | 100% | Yes | 0 (earned) | Yes | No | Credited when a comp off is approved; comp off is switched on (1 day, expires after 90 days, at least 240 minutes worked) |

## Who sees what

- **Gender:** the five Maternity types are for female employees only (the Gender on the profile). They are hidden from everyone else, and a request is refused. An employee with no gender on the profile does not see them.
- **Steps:** a type that "appears only after" another is hidden from the apply form and balance list until the earlier type has no days left (a day waiting for approval already counts as taken). A type that was never credited to the person does not count as used up, so the next step stays hidden. HR still sees every type when managing balances.
- **Country:** the leave types are set for the UAE (`AE`) only.

## Testing

`node tools/leave-test/run.js` (after `npm run build`) runs every type through apply, approve, cancel and the rules above, and removes its own data. The sandwich check is skipped until the test employees have a roster / weekly off assigned.
