# Leave types and their rules

These are the rules for each leave type in the `leave_types` table, as set up for UAE (hrms_uae). The values can be changed in Leave setup; this file records what they were on 24 November 2026.

## Rules that apply to every type

- **Days counted:** weekly offs and holidays inside a request do not use up leave days (all types exclude both).
- **Sandwich rule:** only types marked "sandwich eligible" take part (today: Hajj), and only when the company switch is on. Weekends and holidays between leave days then count as leave.
- **Overlap:** a request cannot overlap another leave that is waiting for approval or approved.
- **Balance:** days come from the balance only for types that track one. The balance can never go negative (no type allows it).
- **Which days are used first:** the credit that expires first.
- **Approval:** types that need approval use two steps. The manager approves first (status "Waiting for HR"), then HR confirms. Only HR's confirmation takes the days from the balance and marks attendance. Types marked "Auto" are approved as soon as they are sent.

## Types

| Type | Code | Paid | Balance | Days a year | Half day | Approval | Document | Other rules |
|---|---|---|---|---|---|---|---|---|
| Annual Leave | AL | 100% | Yes | 30 | Yes | Manager, then HR | No | Carry forward: Blue Collar → unpaid (AL-CF-UNPAID); White Collar → leave salary |
| Annual Leave Carried Forward (Unpaid) | AL-CF-UNPAID | 0% | Yes | 0 | No | Manager, then HR | No | Carried-forward days taken unpaid |
| Medical Leave With Certificate | ML-CERT | 100% | Yes | 8 | No | Auto | Always | |
| Medical Leave Without Certificate | ML-NOCERT | 100% | Yes | 7 | No | Auto | No | |
| Medical Leave Half Pay | ML-HALF | 50% | Yes | 30 | No | Auto | Always | Only after ML-CERT and ML-NOCERT are used up |
| Medical Leave Unpaid | ML-UNPAID | 0% | Yes | 45 | No | Auto | Always | Only after ML-HALF is used up |
| Half Day Leave | HDL | Unpaid | No | — | Yes | Manager, then HR | No | |
| LOP | LOP | Unpaid | No | — | Yes | Manager, then HR | No | Loss of pay |
| Emergency Leave | EL | Unpaid | No | — | Yes | Manager, then HR | No | |
| Maternity Paid | MAT | 100% | Yes | 45 | No | Auto | No | Female only |
| Maternity Half Paid | MAT-HALF | 50% | Yes | 15 | No | Auto | No | Female; only after MAT is used up |
| Maternity Unpaid | MAT-UNPAID | 0% | Yes | 45 | No | Auto | No | Female; only after MAT-HALF is used up |
| Maternity Baby Sick Paid | MAT-SICK-PAID | 100% | Yes | 30 | No | Auto | Always | Female |
| Maternity Baby Sick Unpaid | MAT-SICK-UNPAID | 0% | Yes | 30 | No | Auto | Always | Female; only after MAT-SICK-PAID is used up |
| Parental Leave | PAR | 100% | Yes | 5 | No | Auto | No | Starts after the child's date of birth and ends within 6 months of it |
| Study Leave | STUDY | 100% | Yes | 10 | No | Auto | No | |
| Hajj Leave Unpaid | HAJJ | Unpaid | No | — | No | Manager, then HR | No | Once in a whole employment; at most 30 days a request; takes part in the sandwich rule |
| Umrah Leave Unpaid | UMRAH | Unpaid | No | — | No | Manager, then HR | No | |
| Bereavement Leave | BRV | 100% | No | — | No | Auto | No | Spouse: up to 5 days. Parent, child, sibling, grandchild or grandparent: up to 3 days |
| Comp Off | COMPOFF | 100% | Yes | 0 (earned) | Yes | Auto | No | |

## Known gap

For the types marked "Document: Always" (ML-CERT, ML-HALF, ML-UNPAID, MAT-SICK-PAID, MAT-SICK-UNPAID), the server does not require the document when the leave is sent. These types are auto-approved, and the document check runs only at manager or HR approval, which auto-approved leave never reaches. The screen asks for the file, but the server accepts the leave without it.
