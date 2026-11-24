import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { STARTER_OVERTIME_CONFIGURATIONS } from '../src/overtime/overtime-rules';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL_UNPOOLED });
const prisma = new PrismaClient({ adapter });

async function main() {
  await seedParameterTypesAndParameters();
  await seedMessages();
  await seedSystemConfigurations();
  await seedCompanyProfile();
  await seedUserTypes();
  await seedSystemAdmin();
  await seedRoles();
  await seedMenuItems();
  await seedModuleConfigurations();
}

async function seedParameterTypesAndParameters() {
  // Extracted from planning/discovery/system_parameters.csv
  const groups: Record<number, { name: string; parameters: Array<{ id: number; text: string; value: number; order: number; visible: boolean; code?: string }> }> = {
    1: { name: 'User Type', parameters: [
      { id: 2, text: 'Internal', value: 1, order: 1, visible: true, code: 'internal' },
      { id: 3, text: 'External', value: 2, order: 2, visible: true, code: 'external' },
    ]},
    2: { name: 'User Status', parameters: [
      { id: 4, text: 'Active', value: 1, order: 1, visible: true, code: 'active' },
      { id: 5, text: 'Inactive', value: 2, order: 2, visible: true, code: 'inactive' },
    ]},
    3: { name: 'Log Type', parameters: [
      { id: 6, text: 'Login', value: 1, order: 1, visible: true, code: 'login' },
    ]},
    4: { name: 'Message Type', parameters: [
      { id: 7, text: 'Error', value: 1, order: 1, visible: true, code: 'error' },
      { id: 8, text: 'Warning', value: 2, order: 2, visible: true, code: 'warning' },
      { id: 9, text: 'Success', value: 3, order: 3, visible: true, code: 'success' },
    ]},
    5: { name: 'Data Type', parameters: [
      { id: 99, text: 'int', value: 1, order: 1, visible: true },
      { id: 100, text: 'range', value: 2, order: 2, visible: true },
      { id: 101, text: 'multiselect', value: 3, order: 3, visible: true },
      { id: 102, text: 'singleselect', value: 4, order: 4, visible: true },
      { id: 103, text: 'string', value: 5, order: 5, visible: true },
      { id: 173, text: 'Year', value: 6, order: 6, visible: true },
      { id: 174, text: 'Month', value: 7, order: 7, visible: true },
    ]},
    6: { name: 'Field Data Type', parameters: [
      { id: 14, text: 'string', value: 1, order: 1, visible: true },
      { id: 15, text: 'password', value: 2, order: 2, visible: true },
      { id: 16, text: 'bit', value: 3, order: 3, visible: true },
      { id: 17, text: 'date', value: 4, order: 4, visible: true },
      { id: 19, text: 'byte', value: 5, order: 5, visible: true },
      { id: 20, text: 'int', value: 6, order: 6, visible: true },
      { id: 23, text: 'upload', value: 7, order: 7, visible: true },
      { id: 26, text: 'singleselect', value: 8, order: 8, visible: true },
      { id: 30, text: 'multiselect', value: 9, order: 9, visible: true },
      { id: 31, text: 'Text', value: 10, order: 10, visible: true },
    ]},
    8: { name: 'Passport Type', parameters: [
      { id: 27, text: 'Regular', value: 1, order: 1, visible: true },
      { id: 28, text: 'Emergency', value: 2, order: 2, visible: false },
      { id: 29, text: 'Diplomatic', value: 3, order: 3, visible: false },
    ]},
    9: { name: 'Marital Status', parameters: [
      { id: 24, text: 'Single', value: 1, order: 1, visible: true },
      { id: 25, text: 'Married', value: 2, order: 2, visible: true },
    ]},
    10: { name: 'Gender', parameters: [
      { id: 33, text: 'Female', value: 1, order: 1, visible: true },
      { id: 34, text: 'Male', value: 2, order: 2, visible: true },
      { id: 35, text: 'Other', value: 3, order: 3, visible: true },
    ]},
    11: { name: 'BloodGroup', parameters: [
      { id: 37, text: 'A+', value: 1, order: 1, visible: true },
      { id: 38, text: 'A-', value: 2, order: 2, visible: true },
      { id: 39, text: 'B+', value: 3, order: 3, visible: true },
      { id: 40, text: 'B-', value: 4, order: 4, visible: true },
      { id: 42, text: 'O+', value: 5, order: 5, visible: true },
      { id: 43, text: 'O-', value: 6, order: 6, visible: true },
      { id: 44, text: 'AB+', value: 7, order: 7, visible: true },
      { id: 45, text: 'AB-', value: 8, order: 8, visible: true },
    ]},
    12: { name: 'Source of hire', parameters: [
      { id: 46, text: 'Direct', value: 1, order: 1, visible: true },
      { id: 47, text: 'Referral', value: 2, order: 2, visible: true },
      { id: 48, text: 'Web', value: 3, order: 3, visible: true },
      { id: 49, text: 'Newspaper', value: 4, order: 4, visible: true },
      { id: 50, text: 'Advertisement', value: 5, order: 5, visible: true },
    ]},
    13: { name: 'Location', parameters: [
      { id: 51, text: 'Dubai', value: 1, order: 1, visible: true },
      { id: 53, text: 'AbuDhabi', value: 2, order: 2, visible: true },
      { id: 192, text: 'Nepal', value: 3, order: 3, visible: true },
      { id: 191, text: 'India', value: 4, order: 4, visible: true },
    ]},
    14: { name: 'Employee Type', parameters: [
      { id: 55, text: 'Permanent', value: 1, order: 1, visible: true },
      { id: 57, text: 'On Contract', value: 2, order: 2, visible: true },
      { id: 58, text: 'Temporary', value: 3, order: 3, visible: true },
      { id: 59, text: 'Intern', value: 4, order: 4, visible: true },
    ]},
    15: { name: 'Dependant Relation', parameters: [
      { id: 62, text: 'Wife', value: 1, order: 1, visible: true },
      { id: 63, text: 'Son', value: 2, order: 2, visible: true },
      { id: 64, text: 'Daughter', value: 3, order: 3, visible: true },
      { id: 66, text: 'Parent', value: 4, order: 4, visible: true },
      { id: 129, text: 'Husband', value: 5, order: 5, visible: true },
    ]},
    17: { name: 'ExitReason', parameters: [
      { id: 69, text: 'Terminated', value: 1, order: 1, visible: true },
      { id: 70, text: 'Resigned', value: 2, order: 2, visible: true },
      { id: 71, text: 'Absconded', value: 3, order: 3, visible: true },
      { id: 98, text: 'Other', value: 4, order: 4, visible: false },
    ]},
    18: { name: 'Date Range', parameters: [
      { id: 73, text: '7 Days', value: 7, order: 1, visible: true },
      { id: 74, text: '14 days', value: 14, order: 2, visible: true },
      { id: 75, text: '30 Days', value: 30, order: 3, visible: true },
      { id: 76, text: '60 Days', value: 60, order: 4, visible: true },
      { id: 137, text: '90 Days', value: 90, order: 5, visible: true },
      { id: 138, text: 'More than 90 Days', value: 91, order: 6, visible: true },
    ]},
    19: { name: 'Nationality', parameters: [
      { id: 200, text: 'Indian', value: 1, order: 1, visible: true },
      { id: 201, text: 'Pakistani', value: 2, order: 2, visible: true },
      { id: 202, text: 'Filipino', value: 3, order: 3, visible: true },
      { id: 203, text: 'Emirati', value: 4, order: 4, visible: true },
      { id: 204, text: 'Other', value: 5, order: 5, visible: true },
    ]},
    20: { name: 'Employee Status', parameters: [
      { id: 210, text: 'Active', value: 1, order: 1, visible: true },
      { id: 211, text: 'On Leave', value: 2, order: 2, visible: true },
      { id: 212, text: 'Suspended', value: 3, order: 3, visible: true },
      { id: 213, text: 'Terminated', value: 4, order: 4, visible: true },
    ]},
    21: { name: 'Contract Type', parameters: [
      { id: 220, text: 'Full Time', value: 1, order: 1, visible: true },
      { id: 221, text: 'Part Time', value: 2, order: 2, visible: true },
      { id: 222, text: 'Contract', value: 3, order: 3, visible: true },
      { id: 223, text: 'Internship', value: 4, order: 4, visible: true },
    ]},
    22: { name: 'Visa Type', parameters: [
      { id: 230, text: 'Employment', value: 1, order: 1, visible: true },
      { id: 231, text: 'Residence', value: 2, order: 2, visible: true },
      { id: 232, text: 'Visit', value: 3, order: 3, visible: true },
      { id: 233, text: 'Tourist', value: 4, order: 4, visible: true },
    ]},
    // System Access tab of the employee profile. The role names match the user types (users.service), so keep them in step.
    31: { name: 'Access Role', parameters: [
      { id: 1001, text: 'Executive', value: 1, order: 1, visible: true },
      { id: 1002, text: 'Manager', value: 2, order: 2, visible: true },
      { id: 1003, text: 'SystemAdmin', value: 3, order: 3, visible: true },
      { id: 1004, text: 'HRAdmin', value: 4, order: 4, visible: true },
    ]},
    32: { name: 'Login Status', parameters: [
      { id: 1011, text: 'Active', value: 1, order: 1, visible: true },
      { id: 1012, text: 'Locked', value: 2, order: 2, visible: true },
      { id: 1013, text: 'Disabled', value: 3, order: 3, visible: true },
    ]},
    // Option lists for the profile dropdowns that had none. Lists marked "starter" are minimal and can be extended in System settings.
    33: { name: 'Attendance Processing', parameters: [
      { id: 2001, text: 'Automatic', value: 1, order: 1, visible: true },
      { id: 2002, text: 'Manual', value: 2, order: 2, visible: true },
    ]},
    35: { name: 'Skill Proficiency', parameters: [ // starter
      { id: 2003, text: 'Beginner', value: 1, order: 1, visible: true },
    ]},
    36: { name: 'Notice Period', parameters: [
      { id: 2004, text: '1 month', value: 1, order: 1, visible: true },
      { id: 2005, text: '2 months', value: 2, order: 2, visible: true },
    ]},
    37: { name: 'Probation Period', parameters: [
      { id: 2006, text: '3 months', value: 1, order: 1, visible: true },
    ]},
    38: { name: 'Roster', parameters: [
      { id: 2007, text: 'Fixed', value: 1, order: 1, visible: true },
      { id: 2008, text: 'Rotational', value: 2, order: 2, visible: true },
    ]},
    39: { name: 'Tax Regime', parameters: [
      { id: 2009, text: 'Old Regime', value: 1, order: 1, visible: true },
      { id: 2010, text: 'New Regime', value: 2, order: 2, visible: true },
    ]},
    40: { name: 'Bank Account Type', parameters: [
      { id: 2011, text: 'Checking', value: 1, order: 1, visible: true },
      { id: 2012, text: 'Savings', value: 2, order: 2, visible: true },
    ]},
    41: { name: 'Pension Auto-Enrolment', parameters: [
      { id: 2013, text: 'Opted in', value: 1, order: 1, visible: true },
      { id: 2014, text: 'Opted out', value: 2, order: 2, visible: true },
    ]},
    42: { name: 'Student Loan Plan', parameters: [
      { id: 2015, text: 'Plan 1', value: 1, order: 1, visible: true },
      { id: 2016, text: 'Plan 2', value: 2, order: 2, visible: true },
      { id: 2017, text: 'Plan 4', value: 3, order: 3, visible: true },
      { id: 2018, text: 'Plan 5', value: 4, order: 4, visible: true },
      { id: 2019, text: 'Postgraduate loan', value: 5, order: 5, visible: true },
    ]},
    43: { name: 'State Withholding', parameters: [
      ...['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming']
        .map((text, i) => ({ id: 2100 + i, text, value: i + 1, order: i + 1, visible: true })),
    ]},
  };

  // Rows written with explicit ids do not advance the id sequence, so move it past the largest id first.
  await prisma.$executeRaw`SELECT setval(pg_get_serial_sequence('parameters', 'id'), COALESCE((SELECT MAX(id) FROM parameters), 1))`;

  for (const [typeId, group] of Object.entries(groups)) {
    await prisma.parameterType.upsert({
      where: { id: Number(typeId) },
      create: { id: Number(typeId), name: group.name },
      update: { name: group.name },
    });

    for (const p of group.parameters) {
      // Match on the natural key (type + text), which the database enforces as unique.
      // Some migrations insert parameters with auto-assigned ids, which can already hold
      // a seed id for another parameter, so a seed id is used only when it is free.
      const values = {
        parameterValue: p.value,
        displayOrder: p.order,
        isVisible: p.visible,
        code: p.code ?? null,
      };
      const existing = await prisma.parameter.findUnique({
        where: { parameterTypeId_text: { parameterTypeId: Number(typeId), text: p.text } },
      });
      if (existing) {
        await prisma.parameter.update({ where: { id: existing.id }, data: values });
        continue;
      }
      const idTaken = await prisma.parameter.findUnique({ where: { id: p.id } });
      await prisma.parameter.create({
        data: { ...(idTaken ? {} : { id: p.id }), parameterTypeId: Number(typeId), text: p.text, ...values },
      });
    }
  }
}

async function seedMessages() {
  const messages: Array<{ id: number; code: string; text: string; shortDesc: string; messageTypeId: number; order: number }> = [
    { id: 2, code: 'INVALID_CREDENTIALS', text: 'Incorrect username and/or password. Please try again or click on Forgot Password to create a new password', shortDesc: 'Invalid Login', messageTypeId: 7, order: 1 },
    { id: 4, code: 'OK', text: 'Data retrieved successfully', shortDesc: 'Success Message', messageTypeId: 9, order: 2 },
    { id: 5, code: 'UPDATED', text: 'Data Updated Successfully', shortDesc: 'Records Update successfully', messageTypeId: 9, order: 3 },
    { id: 6, code: 'EMAIL_EXISTS', text: 'EmailId already exists', shortDesc: 'User Setup', messageTypeId: 7, order: 4 },
    { id: 7, code: 'EMPLOYEE_CODE_EXISTS', text: 'Employee code already exists.', shortDesc: 'Employee code', messageTypeId: 7, order: 5 },
    { id: 8, code: 'EMAIL_SENT', text: 'Email send Succesfully', shortDesc: 'Email Send', messageTypeId: 9, order: 6 },
    { id: 9, code: 'FILE_DOWNLOADED', text: 'File downloaded Successfully', shortDesc: 'File Download', messageTypeId: 9, order: 7 },
    { id: 10, code: 'HOLIDAY_EXISTS', text: 'Holiday Detail Already Exist', shortDesc: 'Holiday Details', messageTypeId: 7, order: 8 },
    { id: 11, code: 'WEEKLY_OFF_EXISTS', text: 'WOF List Already Exist', shortDesc: 'WeekilyConfig', messageTypeId: 7, order: 9 },
    { id: 12, code: 'SITE_YEAR_EXISTS', text: 'Site Already Exist for this year', shortDesc: 'WeekilyConfig', messageTypeId: 7, order: 10 },
    { id: 19, code: 'FILE_UPLOADED', text: 'File upload successfully', shortDesc: 'File Upload', messageTypeId: 9, order: 11 },
    { id: 20, code: 'MANDATORY_FIELDS_MISSING', text: 'Mandatory fields are not present', shortDesc: 'File Upload', messageTypeId: 7, order: 12 },
    { id: 23, code: 'COLUMN_MISSING', text: 'Column is missing {{0}}', shortDesc: 'Column Missing', messageTypeId: 7, order: 13 },
    { id: 24, code: 'INVALID_DATA', text: 'Invalid data', shortDesc: 'Invalid data', messageTypeId: 7, order: 14 },
    { id: 25, code: 'MANDATORY_MISSING', text: 'Mandatory fields missing', shortDesc: 'Mandatory', messageTypeId: 7, order: 15 },
    { id: 28, code: 'SHIFT_EXISTS', text: 'Shift Name Already Exists', shortDesc: 'Shift Master', messageTypeId: 7, order: 16 },
    { id: 30, code: 'INCORRECT_PASSWORD', text: 'Incorrect password', shortDesc: 'Payroll', messageTypeId: 7, order: 17 },
  ];

  for (const m of messages) {
    await prisma.message.upsert({
      where: { id: m.id },
      create: {
        id: m.id,
        code: m.code,
        text: m.text,
        shortDesc: m.shortDesc,
        messageTypeId: m.messageTypeId,
        displayOrder: m.order,
      },
      update: {
        code: m.code,
        text: m.text,
        shortDesc: m.shortDesc,
        messageTypeId: m.messageTypeId,
        displayOrder: m.order,
      },
    });
  }
}

async function seedSystemConfigurations() {
  const configs: Array<{ id: number; name: string; value?: string; valueDate?: Date; valueKind: string; description?: string }> = [
    // 26+ are NEW (System Admin > Regional Settings, planning/system_application_module.md §B) —
    // not legacy rows. Values are placeholders; System Admin sets them via /system-configurations.
    { id: 26, name: 'Default Country', value: 'AE', valueKind: 'string', description: 'Default country for new employees/organizations' },
    { id: 30, name: 'Default Time Format', value: '24', valueKind: 'string', description: 'Default time display format: 12 or 24' },
    { id: 32, name: 'Number Format', value: '1,234.56', valueKind: 'string', description: 'Default number formatting example' },
    // 33+ are NEW (System Admin > Security Configuration, planning/system_application_module.md §I).
    // These back SecurityConfigService; the values here match the previous env-var defaults
    // (MAX_LOGIN_ATTEMPTS, LOCKOUT_MINUTES, SESSION_IDLE_MINUTES in config/app.config.ts), which
    // remain the fallback if a row is ever missing.
    { id: 33, name: 'Max Failed Login Attempts', value: '5', valueKind: 'number', description: 'Failed logins before an account is locked' },
    { id: 34, name: 'Account Lockout Minutes', value: '30', valueKind: 'number', description: 'How long a locked account stays locked' },
    { id: 35, name: 'Session Timeout Minutes', value: '180', valueKind: 'number', description: 'Idle minutes before a login session expires' },
  ];

  for (const c of configs) {
    await prisma.systemConfiguration.upsert({
      where: { id: c.id },
      create: {
        id: c.id,
        name: c.name,
        value: c.value ?? null,
        valueDate: c.valueDate ?? null,
        valueKind: c.valueKind,
        description: c.description ?? null,
      },
      update: {
        name: c.name,
        value: c.value ?? null,
        valueDate: c.valueDate ?? null,
        valueKind: c.valueKind,
        description: c.description ?? null,
      },
    });
  }
}

/**
 * NEW — System Admin > Company: the company's own details. Created empty; the seed never overwrites
 * what an administrator has typed in (only the description is refreshed).
 */
async function seedCompanyProfile() {
  const rows: Array<{ id: number; name: string; valueKind: string; description: string }> = [
    { id: 36, name: 'Company Name', valueKind: 'string', description: 'The name the company trades under' },
    { id: 37, name: 'Legal Name', valueKind: 'string', description: 'Registered legal name, if different' },
    { id: 38, name: 'Trade Licence Number', valueKind: 'string', description: 'Trade or business licence number' },
    { id: 39, name: 'Trade Licence Issuing Authority', valueKind: 'string', description: 'Authority that issued the licence' },
    { id: 40, name: 'Trade Licence Expiry Date', valueKind: 'date', description: 'System Admin is reminded before this date' },
    { id: 41, name: 'Company Registration Number', valueKind: 'string', description: 'Company registration or incorporation number' },
    { id: 42, name: 'Tax Registration Number', valueKind: 'string', description: 'Tax, VAT or GST registration number' },
    { id: 43, name: 'Company Address', valueKind: 'string', description: 'Registered office address' },
    { id: 44, name: 'Company Phone', valueKind: 'string', description: 'Main company phone number' },
    { id: 45, name: 'Company Email', valueKind: 'string', description: 'Main company email address' },
    { id: 46, name: 'Company Website', valueKind: 'string', description: 'Company website' },
  ];
  for (const r of rows) {
    await prisma.systemConfiguration.upsert({
      where: { id: r.id },
      create: { id: r.id, name: r.name, value: null, valueKind: r.valueKind, description: r.description },
      update: { description: r.description },
    });
  }
}

async function seedUserTypes() {
  const types = [
    { id: 1, name: 'Executive', order: 1 },
    { id: 2, name: 'Manager', order: 2 },
    { id: 3, name: 'SystemAdmin', order: 3 },
    { id: 4, name: 'HRAdmin', order: 4 },
  ];

  for (const t of types) {
    await prisma.userType.upsert({
      where: { id: t.id },
      create: { id: t.id, name: t.name, displayOrder: t.order },
      update: { name: t.name, displayOrder: t.order },
    });
  }
}

/**
 * The first System Administrator. A fresh database has no users and the app has no self-registration.
 * Username: ADMIN_USERNAME (default "admin"). Password: ADMIN_PASSWORD, or a random one printed once
 * (and the user must change it at first login). Existing users are left alone.
 */
async function seedSystemAdmin() {
  const username = (process.env.ADMIN_USERNAME ?? 'admin').trim().toLowerCase();
  if (username.length < 3 || username.length > 50) throw new Error('ADMIN_USERNAME must be 3-50 characters');
  if (await prisma.user.findUnique({ where: { username } })) {
    console.log(`System admin "${username}" already exists, left unchanged.`);
    return;
  }
  const given = process.env.ADMIN_PASSWORD ?? '';
  if (given && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,128}$/.test(given)) {
    throw new Error('ADMIN_PASSWORD must be 8-128 characters with upper, lower, digit and special characters');
  }
  const password = given || `${randomBytes(9).toString('base64url')}aA1!`;
  const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10));
  await prisma.$transaction(async (tx) => {
    const profile = await tx.profile.create({ data: { name: process.env.ADMIN_NAME?.trim() || 'System Admin', email: process.env.ADMIN_EMAIL?.trim() || null, isSiteAccess: true } });
    await tx.user.create({ data: { username, passwordHash, userTypeId: 3, profileId: profile.id, isActive: true, mustChangePassword: !given } });
  });
  console.log(`Created System Admin "${username}".${given ? '' : ` Temporary password (shown once, must be changed at first login): ${password}`}`);
}

async function seedRoles() {
  // D-016: legacy duplicate "Admin" rows are deduplicated here.
  const roles = [
    { id: 1, name: 'Admin' },
    { id: 2, name: 'Manager' },
    { id: 3, name: 'Employee' },
  ];

  for (const r of roles) {
    await prisma.role.upsert({
      where: { id: r.id },
      create: { id: r.id, name: r.name },
      update: { name: r.name },
    });
  }
}

/**
 * The real navigation tree (BR-UM-29/30): the sidebar is built entirely from this table plus
 * each role's rights below, via GET /rbac/my-menu. Replaces the legacy Phase-1 subset, which only
 * pointed at pages that were never built (/profilelist, /documentlist, /myprofile, Master Setup's
 * Language/Role/Department/Site/Document Type stubs, and the old flat Profile(155) sub-tabs since
 * replaced by the nine-section profile). Those dead rows, and any rights/overrides on them, are
 * removed below so Menus & Rights only ever shows pages that exist.
 */
// 542 (Branches) now lives inside Masters.
const LEGACY_MENU_ITEM_IDS = [1, 2, 3, 4, 6, 7, 12, 21, 37, 146, 147, 151, 155, 156, 542];

interface MenuItemSeed {
  id: number;
  name: string;
  parentId?: number;
  pageUrl?: string;
  iconClass?: string;
  displayOrder: number;
  isMainMenu: boolean;
  isActive: boolean;
  /** Roles granted this item by default. Omitted (or empty) for a group heading, which has no rights of its own. */
  roles?: number[];
}

const MENU_ITEMS: MenuItemSeed[] = [
  { id: 500, name: 'Dashboard', pageUrl: '/', iconClass: 'fa fa-home', displayOrder: 1, isMainMenu: true, isActive: true, roles: [1, 2, 3, 4] },
  { id: 501, name: 'Employees', iconClass: 'fa fa-users', displayOrder: 2, isMainMenu: true, isActive: true },
  { id: 510, name: 'Employee list', parentId: 501, pageUrl: '/employees', displayOrder: 1, isMainMenu: true, isActive: true, roles: [2, 3, 4] },
  { id: 511, name: 'Documents', parentId: 501, pageUrl: '/documents', displayOrder: 2, isMainMenu: true, isActive: true, roles: [1, 2, 3, 4] },
  { id: 502, name: 'Time & Attendance', iconClass: 'fa fa-clock-o', displayOrder: 3, isMainMenu: true, isActive: true },
  { id: 520, name: 'Mark attendance', parentId: 502, pageUrl: '/attendance/mark', displayOrder: 1, isMainMenu: true, isActive: true, roles: [1, 2, 3, 4] },
  { id: 521, name: 'My attendance', parentId: 502, pageUrl: '/attendance/my', displayOrder: 2, isMainMenu: true, isActive: true, roles: [1, 2, 3, 4] },
  { id: 522, name: 'Team attendance', parentId: 502, pageUrl: '/attendance/team', displayOrder: 3, isMainMenu: true, isActive: true, roles: [2, 3, 4] },
  { id: 523, name: 'Correction requests', parentId: 502, pageUrl: '/attendance/corrections', displayOrder: 4, isMainMenu: true, isActive: true, roles: [2, 3, 4] },
  { id: 524, name: 'Reports', parentId: 502, pageUrl: '/attendance/reports', displayOrder: 5, isMainMenu: true, isActive: true, roles: [2, 3, 4] },
  { id: 503, name: 'Leave Management', iconClass: 'fa fa-calendar', displayOrder: 4, isMainMenu: true, isActive: true },
  { id: 530, name: 'My leave', parentId: 503, pageUrl: '/leave/my', displayOrder: 1, isMainMenu: true, isActive: true, roles: [1, 2, 3, 4] },
  { id: 532, name: 'My comp off', parentId: 503, pageUrl: '/leave/comp-off', displayOrder: 2, isMainMenu: true, isActive: true, roles: [1, 2, 3, 4] },
  { id: 531, name: 'Team leave', parentId: 503, pageUrl: '/leave/team', displayOrder: 3, isMainMenu: true, isActive: true, roles: [2, 3, 4] },
  { id: 504, name: 'Administration', iconClass: 'fa fa-cogs', displayOrder: 5, isMainMenu: true, isActive: true },
  { id: 540, name: 'Attendance setup', parentId: 504, pageUrl: '/attendance-setup', displayOrder: 1, isMainMenu: true, isActive: true, roles: [3, 4] },
  { id: 541, name: 'Bulk update', parentId: 504, pageUrl: '/bulk-update', displayOrder: 2, isMainMenu: true, isActive: true, roles: [3, 4] },
  { id: 543, name: 'Masters', parentId: 504, pageUrl: '/masters', displayOrder: 4, isMainMenu: true, isActive: true, roles: [3, 4] },
  { id: 544, name: 'Users', parentId: 504, pageUrl: '/users', displayOrder: 5, isMainMenu: true, isActive: true, roles: [3, 4] },
  { id: 545, name: 'Menus & rights', parentId: 504, pageUrl: '/access-control', displayOrder: 6, isMainMenu: true, isActive: true, roles: [3, 4] },
  { id: 546, name: 'Leave balances', parentId: 504, pageUrl: '/leave-setup', displayOrder: 7, isMainMenu: true, isActive: true, roles: [3, 4] },
  { id: 547, name: 'Salary templates', parentId: 504, pageUrl: '/salary-templates', displayOrder: 8, isMainMenu: true, isActive: true, roles: [3, 4] },
  { id: 548, name: 'Modules', parentId: 504, pageUrl: '/modules', displayOrder: 9, isMainMenu: true, isActive: true, roles: [3] },
  { id: 505, name: 'System Settings', iconClass: 'fa fa-sliders', displayOrder: 6, isMainMenu: true, isActive: true },
  { id: 550, name: 'General settings', parentId: 505, pageUrl: '/system-settings', displayOrder: 1, isMainMenu: true, isActive: true, roles: [3] },
  { id: 551, name: 'Custom fields', parentId: 505, pageUrl: '/custom-fields', displayOrder: 2, isMainMenu: true, isActive: true, roles: [3] },
  { id: 552, name: 'Profile rules', parentId: 505, pageUrl: '/profile-rules', displayOrder: 3, isMainMenu: true, isActive: true, roles: [3] },
];

async function seedMenuItems() {
  // Retire the dead legacy rows (and any rights/overrides pointing at them) before seeding the real tree.
  // One extra level covers any custom item a System Admin may since have added under one of the old groups.
  const extra = await prisma.menuItem.findMany({ where: { parentId: { in: LEGACY_MENU_ITEM_IDS } }, select: { id: true } });
  const toRemove = [...new Set([...LEGACY_MENU_ITEM_IDS, ...extra.map((e) => e.id)])];
  await prisma.menuUserTypePermission.deleteMany({ where: { menuItemId: { in: toRemove } } });
  await prisma.menuUserOverride.deleteMany({ where: { menuItemId: { in: toRemove } } });
  await prisma.menuItem.deleteMany({ where: { id: { in: toRemove } } });

  for (const { roles: _roles, ...item } of MENU_ITEMS) {
    await prisma.menuItem.upsert({ where: { id: item.id }, create: item, update: item });
  }

  // Default rights per role, matching what the app granted in code before this was data-driven.
  // Only fills in what is missing, so a System Admin's own changes in Menus & Rights are never overwritten.
  for (const item of MENU_ITEMS) {
    for (const userTypeId of item.roles ?? []) {
      await prisma.menuUserTypePermission.upsert({
        where: { userTypeId_menuItemId: { userTypeId, menuItemId: item.id } },
        create: { userTypeId, menuItemId: item.id },
        update: {},
      });
    }
  }
}

/**
 * NEW — System Admin > Module Configuration (planning/system_application_module.md §G).
 * User, employee, document, leave and attendance management are built (isImplemented: true);
 * the rest are placeholders for modules not yet implemented.
 */
async function seedModuleConfigurations() {
  const modules = [
    { moduleKey: 'user-management', name: 'User Management', isEnabled: true, isImplemented: true, dependsOn: [], order: 1 },
    { moduleKey: 'employee-management', name: 'Employee Management', isEnabled: true, isImplemented: true, dependsOn: ['user-management'], order: 2 },
    { moduleKey: 'document-management', name: 'Document Management', isEnabled: true, isImplemented: true, dependsOn: ['employee-management'], order: 3 },
    { moduleKey: 'leave-management', name: 'Leave Management', isEnabled: true, isImplemented: true, dependsOn: ['employee-management'], order: 4 },
    { moduleKey: 'attendance-management', name: 'Attendance Management', isEnabled: true, isImplemented: true, dependsOn: ['employee-management'], order: 5 },
    { moduleKey: 'payroll-management', name: 'Payroll Management', isEnabled: false, isImplemented: false, dependsOn: ['employee-management', 'attendance-management'], order: 6 },
    { moduleKey: 'leave-salary', name: 'Leave Salary', isEnabled: false, isImplemented: false, dependsOn: ['leave-management', 'payroll-management'], order: 7 },
    { moduleKey: 'full-final-settlement', name: 'Full & Final Settlement', isEnabled: false, isImplemented: false, dependsOn: ['payroll-management'], order: 8 },
    { moduleKey: 'onboarding', name: 'Onboarding', isEnabled: false, isImplemented: false, dependsOn: ['employee-management'], order: 9 },
    { moduleKey: 'performance-management', name: 'Performance Management', isEnabled: false, isImplemented: false, dependsOn: ['employee-management'], order: 10 },
  ];

  for (const m of modules) {
    await prisma.moduleConfiguration.upsert({
      where: { moduleKey: m.moduleKey },
      create: {
        moduleKey: m.moduleKey,
        name: m.name,
        isEnabled: m.isEnabled,
        isImplemented: m.isImplemented,
        dependsOn: m.dependsOn,
        displayOrder: m.order,
      },
      update: {
        name: m.name,
        isImplemented: m.isImplemented,
        dependsOn: m.dependsOn,
        displayOrder: m.order,
      },
    });
  }
}


/**
 * Reference masters for local development (owner approved, 2026-11-11).
 * Sites: the four legacy master.Site names recorded in planning/DATABASE_DISCOVERY.md §3.
 * Languages and shifts: starter values only — the legacy rows (20 languages, shifts) were
 * not extracted; replace them with the migrated legacy data (DATA_MIGRATION_PLAN WS-3).
 * Idempotent: upserts by unique name, never deletes.
 */
async function seedReferenceMasters() {
  const sites = ["Dubai Head Office", "Abudhabi", "Nepal", "India"];
  for (const name of sites) {
    await prisma.site.upsert({ where: { name }, create: { name }, update: {} });
  }

  const languages = [
    "English", "Arabic", "Hindi", "Urdu", "Malayalam", "Tamil", "Telugu", "Kannada", "Marathi", "Bengali",
    "Punjabi", "Gujarati", "Tagalog", "Nepali", "Sinhala", "French", "Persian", "Pashto", "Russian", "Spanish",
  ];
  for (const name of languages) {
    await prisma.language.upsert({ where: { name }, create: { name }, update: {} });
  }

  const t = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);
  const shifts = [
    { name: "General", start: "09:00", end: "18:00", late: 15, halfDay: 240 },
    { name: "Morning", start: "06:00", end: "15:00", late: 15, halfDay: 240 },
    { name: "Evening", start: "14:00", end: "23:00", late: 15, halfDay: 240 },
    { name: "Night", start: "22:00", end: "07:00", late: 15, halfDay: 240 },
  ];
  for (const sh of shifts) {
    await prisma.shift.upsert({
      where: { name: sh.name },
      create: { name: sh.name, startTime: t(sh.start), endTime: t(sh.end), lateMinutes: sh.late, halfDayMinutes: sh.halfDay },
      update: {},
    });
  }

  // Nationality catalog (parameter type 19). Legacy seeded 5 values (ids 200–204, "Other" last);
  // these extra starter values use ids 1900+ so they never collide with legacy ids.
  const nationalities = [
    "Afghan", "American", "Australian", "Bahraini", "Bangladeshi", "British", "Canadian", "Chinese", "Egyptian",
    "Ethiopian", "French", "German", "Iranian", "Iraqi", "Italian", "Jordanian", "Kenyan", "Kuwaiti", "Lebanese",
    "Moroccan", "Nepali", "Nigerian", "Omani", "Qatari", "Russian", "Saudi", "South African", "Sri Lankan",
    "Sudanese", "Syrian", "Tunisian", "Ugandan", "Yemeni",
  ];
  for (const [i, text] of nationalities.entries()) {
    const id = 1900 + i;
    await prisma.parameter.upsert({
      where: { id },
      create: { id, parameterTypeId: 19, text, parameterValue: 100 + i, displayOrder: 10 + i, isVisible: true },
      update: {},
    });
  }
  // Keep "Other" at the end of the list.
  await prisma.parameter.updateMany({ where: { id: 204 }, data: { displayOrder: 999 } });
  // Overtime configurations (Attendance setup > Overtime): starter rules, by name; existing rules are never changed.
  for (const s of STARTER_OVERTIME_CONFIGURATIONS) {
    await prisma.overtimeConfiguration.upsert({
      where: { name: s.name },
      create: { name: s.name, type: s.type, fixedAmount: s.fixedAmount ?? null, weekdayMultiplier: s.weekdayMultiplier ?? null, weekendMultiplier: s.weekendMultiplier ?? null },
      update: {},
    });
  }
  console.log(`Reference masters: ${sites.length} sites, ${languages.length} languages, ${shifts.length} shifts, ${STARTER_OVERTIME_CONFIGURATIONS.length} overtime configurations`);
}

main()
  // SKIP_REFERENCE_MASTERS=1: used by scripts/provision-company.ts — a new company's DB
  // should not inherit Emove's own demo sites/languages/shifts.
  .then(() => (process.env.SKIP_REFERENCE_MASTERS === '1' ? undefined : seedReferenceMasters()))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
