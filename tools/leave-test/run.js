/**
 * Runs every UAE leave type through the real leave service (apply, approve, cancel, rules) and prints pass / fail.
 *   npm run build ; node tools/leave-test/run.js
 *
 * It uses these employees: EA-316 (male, white collar, Manager login), EA-317 (female, blue collar), EA-318 (female, HR),
 * and HR Admin EA-315 to confirm. They should have no leave balances of their own (the test adds its own).
 * Everything the test creates (applications, credits, ledger rows, attendance, documents) is deleted at the end.
 * The manager link EA-317 -> EA-316 is set for the two-step test and put back.
 */
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const { NestFactory } = require('@nestjs/core');

(async () => {
  const dist = (p) => require(path.join(process.cwd(), 'dist', p));
  const app = await NestFactory.createApplicationContext(dist('app.module').AppModule, { logger: ['error'] });
  const p = app.get(dist('prisma/prisma.service').PrismaService);
  const L = app.get(dist('leave/leave.service').LeaveService);
  const E = app.get(dist('leave/entitlement.service').EntitlementService);

  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  };
  const fails = async (promise, re) => {
    try {
      await promise;
      return { ok: false, msg: 'was allowed' };
    } catch (e) {
      return { ok: re.test(e.message), msg: e.message };
    }
  };

  // ---- who
  const emp = (code) => p.employee.findUniqueOrThrow({ where: { employeeCode: code } });
  const actor = async (code, username) => {
    const e = await emp(code);
    // A person without a login of their own acts through their profile as an ordinary employee (Executive).
    const u = await p.user.findFirst({ where: { profileId: e.profileId } });
    return { id: e.id, user: { userId: u?.id ?? 0, profileId: e.profileId, userTypeId: u?.userTypeId ?? 1, sessionId: '0', mustChangePassword: false, branchAccess: null, activeBranchIds: null } };
  };
  const male = await actor('EA-316'); // manager login
  const female = await actor('EA-317'); // no login in the system: act as her through her profile (Executive)
  const hr = await actor('EA-315');
  const type = async (code) => (await p.leaveType.findUniqueOrThrow({ where: { code } }));
  const T = {};
  for (const t of await p.leaveType.findMany()) T[t.code] = t;

  // ---- snapshot for cleanup
  const max = async (m) => (await p[m].aggregate({ _max: { id: true } }))._max.id ?? 0;
  const before = { app: await max('leaveApplication'), credit: await max('leaveCredit'), tx: await max('leaveTransaction'), file: await max('storedFile') };
  const eF = await emp('EA-317');
  const mgrBefore = eF.reportingToId;
  // The three test people may already hold real balances from the nightly job: set them aside for the test and put them back.
  const subjects = [male.id, female.id, (await emp('EA-318')).id];
  const saved = await p.leaveCredit.findMany({ where: { employeeId: { in: subjects } }, select: { id: true, remaining: true } });
  await p.leaveCredit.updateMany({ where: { employeeId: { in: subjects } }, data: { remaining: 0 } });

  let week = 0;
  const day = () => {
    // a Tuesday, one new week for every case so cases never overlap
    const d = new Date(Date.UTC(2026, 11, 8 + 7 * week++));
    return d.toISOString().slice(0, 10);
  };
  const plus = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const credit = (who, code, days) => p.leaveCredit.create({ data: { employeeId: who.id, leaveTypeId: T[code].id, quantity: days, remaining: days, creditedOn: new Date('2026-01-01'), expiresOn: new Date('2027-12-31'), source: 'MANUAL', sourceRef: `TEST-${code}-${who.id}-${Date.now()}` } });
  const bal = async (who, code) => (await L.balances(who.id)).find((b) => b.code === code);
  const apply = (who, code, from, to, extra = {}) => L.apply(who.user, { leaveTypeId: T[code].id, fromDate: from, toDate: to, ...extra });
  const finish = async (who, a) => {
    // manager step (if the person has a manager) is tested separately; HR confirms straight away here
    await L.decide(hr.user, a.id, true, undefined);
    return (await p.leaveApplication.findUniqueOrThrow({ where: { id: a.id } })).status;
  };

  try {
    await p.employee.update({ where: { id: eF.id }, data: { reportingToId: male.id } });

    // 1 Annual leave: balance, over-balance, approve, cancel
    {
      const d = day();
      await credit(male, 'AL', 5);
      const a = await apply(male, 'AL', d, plus(d, 1));
      check('AL: apply 2 days is sent for approval', a.status === 'PENDING', a.status);
      check('AL: HR confirms', (await finish(male, a)) === 'APPROVED');
      const b = await bal(male, 'AL');
      check('AL: balance falls to 3', b.balance === 3, `balance ${b.balance}`);
      const over = await fails(apply(male, 'AL', plus(d, 7), plus(d, 11)), /Not enough/);
      check('AL: more than the balance is refused', over.ok, over.msg);
      await L.cancel(hr.user, a.id);
      check('AL: cancel gives the days back', (await bal(male, 'AL')).balance === 5);
    }
    // 2 Reject takes nothing
    {
      const d = day();
      const a = await apply(male, 'AL', d, d);
      await L.decide(hr.user, a.id, false, 'test');
      check('AL: rejected leave takes no days', (await bal(male, 'AL')).balance === 5);
    }
    // 3 Medical with certificate needs a document
    {
      const d = day();
      await credit(male, 'ML-CERT', 8);
      const a = await apply(male, 'ML-CERT', d, d);
      const noDoc = await fails(L.decide(hr.user, a.id, true, undefined), /supporting document/);
      check('ML-CERT: approval without a document is refused', noDoc.ok, noDoc.msg);
      await L.attach(male.user, a.id, { buffer: Buffer.from('%PDF-1.4 test'), originalname: 'cert.pdf', mimetype: 'application/pdf', size: 13 });
      check('ML-CERT: approved once the document is attached', (await finish(male, a)) === 'APPROVED');
    }
    // 4 Medical without certificate
    {
      const d = day();
      await credit(male, 'ML-NOCERT', 7);
      const a = await apply(male, 'ML-NOCERT', d, d);
      check('ML-NOCERT: approved without a document', (await finish(male, a)) === 'APPROVED');
    }
    // 5 Medical steps unlock
    {
      await credit(male, 'ML-HALF', 30);
      await credit(male, 'ML-UNPAID', 45);
      let locked = await L.lockedTypeIds(male.id);
      check('ML-HALF / ML-UNPAID hidden while full-pay days remain', locked.has(T['ML-HALF'].id) && locked.has(T['ML-UNPAID'].id));
      const early = await fails(apply(male, 'ML-HALF', day(), plus(day(), 0)), /only after/);
      check('ML-HALF: applying early is refused', early.ok, early.msg);
      await p.leaveCredit.updateMany({ where: { employeeId: male.id, leaveTypeId: { in: [T['ML-CERT'].id, T['ML-NOCERT'].id] } }, data: { remaining: 0 } });
      locked = await L.lockedTypeIds(male.id);
      check('ML-HALF shows once both full-pay types are used up', !locked.has(T['ML-HALF'].id) && locked.has(T['ML-UNPAID'].id));
      await p.leaveCredit.updateMany({ where: { employeeId: male.id, leaveTypeId: T['ML-HALF'].id }, data: { remaining: 0 } });
      check('ML-UNPAID shows once half pay is used up', !(await L.lockedTypeIds(male.id)).has(T['ML-UNPAID'].id));
    }
    // 5b Medical steps by really using the days (apply + approve), not by editing balances
    {
      const doc = { buffer: Buffer.from('%PDF-1.4 test'), originalname: 'cert.pdf', mimetype: 'application/pdf', size: 13 };
      await credit(female, 'ML-CERT', 2);
      await credit(female, 'ML-NOCERT', 1);
      await credit(female, 'ML-HALF', 3);
      await credit(female, 'ML-UNPAID', 2);
      const take = async (code, needsDoc = true) => {
        const d = day();
        const a = await apply(female, code, d, d);
        if (needsDoc) await L.attach(female.user, a.id, doc);
        await L.decide(hr.user, a.id, true, undefined);
        return a;
      };
      const hidden = async () => [...(await L.lockedTypeIds(female.id))].map((id) => Object.values(T).find((t) => t.id === id).code).filter((c) => c.startsWith('ML-'));
      check('Medical (real use): at the start Half Pay and Unpaid are hidden', (await hidden()).sort().join() === 'ML-HALF,ML-UNPAID', (await hidden()).join());
      await take('ML-CERT');
      check('Medical (real use): With Certificate 2 -> 1 left, still hidden', (await bal(female, 'ML-CERT')).balance === 1 && (await hidden()).includes('ML-HALF'));
      await take('ML-CERT');
      check('Medical (real use): With Certificate used up, Without Certificate still has a day, so Half Pay stays hidden', (await bal(female, 'ML-CERT')).balance === 0 && (await hidden()).includes('ML-HALF'));
      await take('ML-NOCERT', false);
      check('Medical (real use): both used up -> Half Pay appears, Unpaid still hidden', (await bal(female, 'ML-NOCERT')).balance === 0 && !(await hidden()).includes('ML-HALF') && (await hidden()).includes('ML-UNPAID'), (await hidden()).join());
      await take('ML-HALF');
      check('Medical (real use): Half Pay can be taken and takes a day (3 -> 2)', (await bal(female, 'ML-HALF')).balance === 2);
      check('Medical (real use): Unpaid stays hidden while Half Pay has days', (await hidden()).includes('ML-UNPAID'));
      await take('ML-HALF');
      await take('ML-HALF');
      check('Medical (real use): Half Pay used up -> Unpaid appears', (await bal(female, 'ML-HALF')).balance === 0 && !(await hidden()).includes('ML-UNPAID'));
      await take('ML-UNPAID');
      check('Medical (real use): Unpaid can be taken (2 -> 1)', (await bal(female, 'ML-UNPAID')).balance === 1);
      // a pending request already counts as using the day
      const d = day();
      await credit(female, 'ML-NOCERT', 1);
      const stillLocked = (await hidden()).includes('ML-HALF');
      check('Medical (real use): a new Without Certificate day hides Half Pay again', stillLocked);
    }
    // 6 Half day, LOP, emergency
    {
      const d = day();
      const h = await apply(male, 'HDL', d, d, { halfDayPart: 'FIRST' });
      check('HDL: a half day counts 0.5', Number(h.totalDays) === 0.5, `${h.totalDays}`);
      check('HDL: approved', (await finish(male, h)) === 'APPROVED');
      const d2 = day();
      check('LOP: approved with no balance', (await finish(male, await apply(male, 'LOP', d2, d2))) === 'APPROVED');
      const d3 = day();
      check('EL: approved with no balance', (await finish(male, await apply(male, 'EL', d3, d3))) === 'APPROVED');
    }
    // 7 Sandwich on LOP
    {
      const d = day(); // Tuesday
      const to = plus(d, 6); // next Monday: the weekend lies inside the request
      const pv = await L.preview(male.user, { leaveTypeId: T['LOP'].id, fromDate: d, toDate: to });
      if (pv.warnings.some((w) => /no roster/i.test(w))) {
        check('LOP sandwich: SKIPPED - the test employees have no roster / weekly off assigned, so every day counts as a working day', true, 'assign a roster in Attendance setup, then run again');
      } else check('LOP: a weekend inside the request is counted (sandwich)', pv.sandwichDays > 0 && pv.totalDays > pv.requestedDays, `asked ${pv.requestedDays}, sandwich ${pv.sandwichDays}`);
      const ann = await L.preview(male.user, { leaveTypeId: T['AL'].id, fromDate: d, toDate: to });
      check('AL: the same dates do not count the weekend', ann.sandwichDays === 0, `sandwich ${ann.sandwichDays}`);
    }
    // 8 Maternity: female only, steps
    {
      const d = day();
      await credit(female, 'MAT', 3);
      await credit(female, 'MAT-HALF', 15);
      const m = await fails(apply(male, 'MAT', d, d), /only for female/);
      check('MAT: refused for a male employee', m.ok, m.msg);
      check('MAT: hidden from a male employee', (await L.lockedTypeIds(male.id)).has(T['MAT'].id));
      check('MAT: visible to a female employee', !(await L.lockedTypeIds(female.id)).has(T['MAT'].id));
      check('MAT-HALF hidden until MAT is used up', (await L.lockedTypeIds(female.id)).has(T['MAT-HALF'].id));
      const a = await apply(female, 'MAT', d, d);
      check('MAT: female applies and HR confirms', (await finish(female, a)) === 'APPROVED');
      await p.leaveCredit.updateMany({ where: { employeeId: female.id, leaveTypeId: T['MAT'].id }, data: { remaining: 0 } });
      check('MAT-HALF shows after MAT is used up', !(await L.lockedTypeIds(female.id)).has(T['MAT-HALF'].id));
    }
    // 9 Baby sick needs a document
    {
      const d = day();
      await credit(female, 'MAT-SICK-PAID', 30);
      const a = await apply(female, 'MAT-SICK-PAID', d, d);
      const r = await fails(L.decide(hr.user, a.id, true, undefined), /supporting document/);
      check('MAT-SICK-PAID: approval without a document is refused', r.ok, r.msg);
    }
    // 10 Parental window
    {
      const d = day();
      await credit(male, 'PAR', 5);
      const none = await fails(apply(male, 'PAR', d, d), /date of birth/i);
      check('PAR: asks for the child\'s date of birth', none.ok, none.msg);
      const late = await fails(apply(male, 'PAR', d, d, { eventDate: '2026-02-01' }), /within 6 month/);
      check('PAR: refused more than 6 months after the birth', late.ok, late.msg);
      const ok = await apply(male, 'PAR', d, d, { eventDate: '2026-11-01' });
      check('PAR: allowed within 6 months', ok.status === 'PENDING');
    }
    // 11 Study
    {
      const d = day();
      await credit(male, 'STUDY', 10);
      check('STUDY: approved from its balance', (await finish(male, await apply(male, 'STUDY', d, d))) === 'APPROVED');
    }
    // 12 Hajj: at most 30 days, once
    {
      const d = day();
      const long = await fails(apply(male, 'HAJJ', d, plus(d, 40)), /at most 30/);
      check('HAJJ: more than 30 days is refused', long.ok, long.msg);
      const a = await apply(male, 'HAJJ', d, plus(d, 1));
      check('HAJJ: first request approved', (await finish(male, a)) === 'APPROVED');
      const d2 = day();
      const again = await fails(apply(male, 'HAJJ', d2, d2), /only once/);
      check('HAJJ: a second request is refused', again.ok, again.msg);
    }
    // 13 Umrah
    {
      const d = day();
      const a = await apply(male, 'UMRAH', d, d);
      check('UMRAH: goes to approval', a.status === 'PENDING', a.status);
    }
    // 14 Bereavement
    {
      const d = day();
      const none = await fails(apply(male, 'BRV', d, d), /Choose the relationship/);
      check('BRV: asks for the relationship', none.ok, none.msg);
      const six = await fails(apply(male, 'BRV', d, plus(d, 6), { variant: 'Spouse' }), /at most 5/);
      check('BRV: spouse above 5 days is refused', six.ok, six.msg);
      const four = await fails(apply(male, 'BRV', d, plus(d, 4), { variant: 'Parent, child, sibling, grandchild or grandparent' }), /at most 3/);
      check('BRV: parent / child above 3 days is refused', four.ok, four.msg);
      const ok = await apply(male, 'BRV', d, plus(d, 1), { variant: 'Spouse' });
      check('BRV: spouse 2 days is allowed', ok.status === 'PENDING' && ok.variant === 'Spouse');
    }
    // 15 Comp off
    {
      const d = day();
      await credit(male, 'COMPOFF', 1);
      check('COMPOFF: a credited comp off day can be taken', (await finish(male, await apply(male, 'COMPOFF', d, d))) === 'APPROVED');
    }
    // 16 Two-step approval
    {
      const d = day();
      await credit(female, 'AL', 3);
      const a = await apply(female, 'AL', d, d);
      await L.decide(male.user, a.id, true, 'ok');
      let st = (await p.leaveApplication.findUniqueOrThrow({ where: { id: a.id } })).status;
      check('Two-step: manager approval moves it to "waiting for HR"', st === 'MANAGER_APPROVED', st);
      check('Two-step: the balance is not touched yet', (await bal(female, 'AL')).balance === 3);
      const again = await fails(L.decide(male.user, a.id, true, undefined), /Only HR/);
      check('Two-step: the manager cannot confirm it twice', again.ok, again.msg);
      await L.decide(hr.user, a.id, true, undefined);
      st = (await p.leaveApplication.findUniqueOrThrow({ where: { id: a.id } })).status;
      check('Two-step: HR confirms and it is approved', st === 'APPROVED' && (await bal(female, 'AL')).balance === 2, `${st}, balance ${(await bal(female, 'AL')).balance}`);
    }
    // 17 Overlap
    {
      const d = day();
      await credit(male, 'AL', 2);
      await apply(male, 'AL', d, d);
      const o = await fails(apply(male, 'LOP', d, d), /overlaps/);
      check('Overlapping leave is refused', o.ok, o.msg);
    }
    // 18 Annual leave entitlement
    {
      const old = await E.preview(male.id, T['AL'].id, '2026-01-01');
      check('Annual entitlement: a long-serving employee gets 30 days', Math.abs(old.quantity - 30) < 0.01, `${old.quantity}`);
      const newer = await E.preview((await emp('EA-318')).id, T['AL'].id, '2026-01-01');
      check('Annual entitlement: a joiner of 9 Mar 2026 gets nothing for 6 months, then 2 days a month', newer.quantity > 6 && newer.quantity < 9, `${newer.quantity}`);
    }
    // 19 Carry forward by category (only when nothing else is waiting to expire)
    {
      const waiting = await p.leaveCredit.count({ where: { remaining: { gt: 0 }, expiresOn: { lt: new Date() } } });
      if (waiting > 0) check('Carry forward: skipped (other balances are waiting to expire)', true, `${waiting} waiting`);
      else {
        const yest = new Date(Date.now() - 2 * 86400000);
        const mk = (who) => p.leaveCredit.create({ data: { employeeId: who.id, leaveTypeId: T['AL'].id, quantity: 4, remaining: 4, creditedOn: new Date('2025-01-01'), expiresOn: yest, source: 'ACCRUAL', sourceRef: `TEST-CF-${who.id}` } });
        await p.leaveCredit.updateMany({ where: { employeeId: { in: [male.id, female.id] }, leaveTypeId: T['AL'].id }, data: { remaining: 0 } });
        await mk(male);
        await mk(female);
        await L.expireCredits();
        const blue = await bal(female, 'AL-CF-UNPAID');
        check('Carry forward: blue collar days become unpaid leave', blue.balance === 4, `${blue.balance}`);
        const salary = await p.leaveTransaction.count({ where: { employeeId: male.id, kind: 'LEAVE_SALARY' } });
        check('Carry forward: white collar days are recorded as leave salary', salary === 1, `${salary}`);
      }
    }
  } catch (e) {
    check('Test run', false, e.stack || e.message);
  } finally {
    // ---- clean up everything the test created
    const apps = (await p.leaveApplication.findMany({ where: { id: { gt: before.app } }, select: { id: true } })).map((a) => a.id);
    await p.attendance.deleteMany({ where: { leaveApplicationId: { in: apps } } });
    const links = await p.leaveAttachment.findMany({ where: { applicationId: { in: apps } }, select: { fileId: true } });
    await p.leaveAttachment.deleteMany({ where: { applicationId: { in: apps } } });
    await p.leaveApplication.deleteMany({ where: { id: { in: apps } } });
    await p.leaveTransaction.deleteMany({ where: { id: { gt: before.tx } } });
    await p.leaveCredit.deleteMany({ where: { id: { gt: before.credit } } });
    const files = await p.storedFile.findMany({ where: { id: { gt: before.file } } });
    await p.storedFile.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
    for (const f of files) {
      const file = path.join(process.env.DOCUMENTS_PATH || './private-storage/documents', f.storageKey);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    for (const c of saved) await p.leaveCredit.update({ where: { id: c.id }, data: { remaining: c.remaining } });
    await p.employee.update({ where: { id: eF.id }, data: { reportingToId: mgrBefore } });
    void links;
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Test data removed.`);
    await app.close();
    process.exit(failed.length ? 1 : 0);
  }
})();
