/**
 * Creates the UAE leave types and the UAE statutory leave policy (safe to run again: it updates by code).
 *   npm run build ; node tools/uae-setup/leave-types.js
 * Source: the company's list + https://u.ae (types of leave, private sector).
 */
require('dotenv/config');
const path = require('path');
const { NestFactory } = require('@nestjs/core');

// code, name, [paid, balance, days, doc, sandwich, maxPerRequest, approval, carry]
const T = (code, name, o = {}) => ({ code, name, isPaid: true, balanceTracking: true, annualDays: 0, requiresDocument: false, isSandwichEligible: false, allowHalfDay: false, carry: false, ...o });
const LOP = { isPaid: false, balanceTracking: false, isSandwichEligible: true };
const TYPES = [
  T('AL', 'Annual Leave', { allowHalfDay: true, carry: true, annualDays: 30 }),
  // Where a blue collar employee's carried-forward annual leave goes (unpaid).
  T('AL-CF-UNPAID', 'Annual Leave Carried Forward (Unpaid)', { isPaid: false }),
  T('ML-CERT', 'Medical Leave With Certificate', { annualDays: 8, requiresDocument: true }),
  T('ML-NOCERT', 'Medical Leave Without Certificate', { annualDays: 7 }),
  T('ML-HALF', 'Medical Leave Half Pay', { annualDays: 30, requiresDocument: true }),
  T('ML-UNPAID', 'Medical Leave Unpaid', { annualDays: 45, requiresDocument: true, isPaid: false }),
  T('HDL', 'Half Day Leave', { ...LOP, allowHalfDay: true }),
  T('LOP', 'LOP', { ...LOP, allowHalfDay: true }),
  T('EL', 'Emergency Leave', { ...LOP, allowHalfDay: true }),
  T('MAT', 'Maternity Paid', { annualDays: 45 }),
  T('MAT-HALF', 'Maternity Half Paid', { annualDays: 15 }),
  T('MAT-UNPAID', 'Maternity Unpaid', { annualDays: 45, isPaid: false }),
  T('MAT-SICK-PAID', 'Maternity Baby Sick Paid', { annualDays: 30, requiresDocument: true }),
  T('MAT-SICK-UNPAID', 'Maternity Baby Sick Unpaid', { annualDays: 30, requiresDocument: true, isPaid: false }),
  T('PAR', 'Parental Leave', { annualDays: 5 }),
  T('STUDY', 'Study Leave', { annualDays: 10 }),
  T('HAJJ', 'Hajj Leave Unpaid', { ...LOP, maxDaysPerRequest: 30 }),
  T('UMRAH', 'Umrah Leave Unpaid', { ...LOP }),
  T('BRV-SPOUSE', 'Bereavement Leave (Spouse)', { annualDays: 5 }),
  T('BRV-FAMILY', 'Bereavement Leave (Parent, Child, Sibling, Grandparent)', { annualDays: 3 }),
  T('COMPOFF', 'Comp Off', { isCompOff: true, allowHalfDay: true }),
];
// Conditions and share of pay, by code.
const EXTRA = {
  MAT: { genderRestriction: 'Female' }, 'MAT-HALF': { genderRestriction: 'Female', payPercent: 50 }, 'MAT-UNPAID': { genderRestriction: 'Female' },
  'MAT-SICK-PAID': { genderRestriction: 'Female' }, 'MAT-SICK-UNPAID': { genderRestriction: 'Female' },
  PAR: { eventWindowMonths: 6, eventLabel: "Child's date of birth" },
  HAJJ: { maxTimesInService: 1 },
  'ML-HALF': { payPercent: 50 },
};
// Policy rule per type: how it is credited.
const RULES = {
  AL: { serviceBasis: 'REJOINING_DATE', creditMethod: 'MONTHLY', annualDays: 30, slabTiming: 'IMMEDIATE', proration: 'EXACT_DAYS', formula: 'workdays * annualDays / yearDays', slabs: [{ fromMonths: 0, toMonths: 6, annualDays: 0 }, { fromMonths: 6, toMonths: 12, annualDays: 24 }, { fromMonths: 12, toMonths: null, annualDays: 30 }] },
  STUDY: { creditMethod: 'UPFRONT', annualDays: 10, slabTiming: 'IMMEDIATE', proration: 'NONE', slabs: [{ fromMonths: 0, toMonths: 24, annualDays: 0 }, { fromMonths: 24, toMonths: null, annualDays: 10 }] },
  'BRV-SPOUSE': { creditMethod: 'UPFRONT', annualDays: 5, proration: 'NONE' },
  'BRV-FAMILY': { creditMethod: 'UPFRONT', annualDays: 3, proration: 'NONE' },
  'ML-CERT': { creditMethod: 'UPFRONT', annualDays: 8, proration: 'NONE' },
  'ML-NOCERT': { creditMethod: 'UPFRONT', annualDays: 7, proration: 'NONE' },
  'ML-HALF': { creditMethod: 'UPFRONT', annualDays: 30, proration: 'NONE' },
  'ML-UNPAID': { creditMethod: 'UPFRONT', annualDays: 45, proration: 'NONE' },
  // Events (childbirth, baby sickness): credited by HR when it happens.
  MAT: { creditMethod: 'NONE', annualDays: 45 }, 'MAT-HALF': { creditMethod: 'NONE', annualDays: 15 }, 'MAT-UNPAID': { creditMethod: 'NONE', annualDays: 45 },
  'MAT-SICK-PAID': { creditMethod: 'NONE', annualDays: 30 }, 'MAT-SICK-UNPAID': { creditMethod: 'NONE', annualDays: 30 }, PAR: { creditMethod: 'NONE', annualDays: 5 },
};

(async () => {
  const { AppModule } = require(path.join(process.cwd(), 'dist/app.module'));
  const { PrismaService } = require(path.join(process.cwd(), 'dist/prisma/prisma.service'));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const p = app.get(PrismaService);
  const ids = {};
  let order = 10;
  for (const t of TYPES) {
    const { carry, ...rest } = t;
    const data = {
      ...rest, accrual: 'NONE', excludeWeeklyOffs: true, excludeHolidays: true, requiresApproval: true, countryCodes: ['AE'],
      resetBalance: rest.balanceTracking, carryForwardType: carry ? 'CARRY_FORWARD' : 'NONE', calendarStartMonth: rest.balanceTracking ? 1 : null, sortOrder: (order += 10),
    };
    Object.assign(data, { genderRestriction: null, maxTimesInService: null, eventWindowMonths: null, eventLabel: null, payPercent: rest.isPaid ? 100 : 0 }, EXTRA[t.code] ?? {});
    const row = await p.leaveType.upsert({ where: { code: t.code }, create: data, update: data });
    ids[t.code] = row.id;
  }
  const policy = (await p.leavePolicy.findFirst({ where: { name: 'UAE statutory', countryCode: 'AE' } })) ??
    (await p.leavePolicy.create({ data: { name: 'UAE statutory', layer: 'STATUTORY', countryCode: 'AE', effectiveFrom: new Date('2020-01-01'), note: 'UAE Labour Law leave entitlements' } }));
  // The medical steps: half pay only once both full-pay types are used up, unpaid only once half pay is used up.
  await p.leaveType.update({ where: { code: 'ML-HALF' }, data: { unlockAfterTypeIds: [ids['ML-CERT'], ids['ML-NOCERT']] } });
  await p.leaveType.update({ where: { code: 'ML-UNPAID' }, data: { unlockAfterTypeIds: [ids['ML-HALF']] } });
  // Maternity steps: half paid after paid is used up, unpaid after half paid; baby sick unpaid after baby sick paid.
  await p.leaveType.update({ where: { code: 'MAT-HALF' }, data: { unlockAfterTypeIds: [ids['MAT']] } });
  await p.leaveType.update({ where: { code: 'MAT-UNPAID' }, data: { unlockAfterTypeIds: [ids['MAT-HALF']] } });
  await p.leaveType.update({ where: { code: 'MAT-SICK-UNPAID' }, data: { unlockAfterTypeIds: [ids['MAT-SICK-PAID']] } });
  for (const [code, r] of Object.entries(RULES)) {
    const d = { creditMethod: r.creditMethod, annualDays: r.annualDays, slabs: r.slabs ?? [], slabTiming: r.slabTiming ?? 'IMMEDIATE', proration: r.proration ?? 'NONE', serviceBasis: r.serviceBasis ?? 'JOINING_DATE', rounding: 'NONE', formula: r.formula ?? null };
    await p.leavePolicyRule.upsert({ where: { policyId_leaveTypeId: { policyId: policy.id, leaveTypeId: ids[code] } }, create: { policyId: policy.id, leaveTypeId: ids[code], ...d }, update: d });
  }
  // Carry forward: blue collar -> unpaid leave; white collar -> leave salary.
  await p.leaveType.update({ where: { code: 'AL' }, data: { carryForwardRules: [{ category: 'Blue Collar', action: 'UNPAID_LEAVE', targetLeaveTypeId: ids['AL-CF-UNPAID'] }, { category: 'White Collar', action: 'LEAVE_SALARY', targetLeaveTypeId: null }] } });
  console.log(`${TYPES.length} leave types and ${Object.keys(RULES).length} policy rules saved (policy "${policy.name}").`);
  await app.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
