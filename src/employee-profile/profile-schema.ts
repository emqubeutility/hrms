/**
 * Employee profile field definitions (D-023).
 *
 * Source: "HRMS(1).xlsx" (field list) and "HRMS_Recommended_Employee_Profile_Layout.xlsx"
 * (nine tabs, "Profile Layout" sheet). The schema is country-aware: fields with
 * `countries` apply only to those countries, and address levels, bank and statutory
 * fields, document types and currency are resolved from the employee's country.
 *
 * Pure functions only (no I/O) so they can be unit tested.
 */

export const COUNTRIES = ['IN', 'AE', 'GB', 'US'] as const;
export type CountryCode = (typeof COUNTRIES)[number];

export const SECTION_KEYS = [
  'personal',
  'employment',
  'organization',
  'attendance',
  'bank',
  'documents',
  'education',
  'access',
  'airfare',
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'email' | 'tel' | 'select' | 'multiselect' | 'yn';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  countries?: CountryCode[];
  /** Stored encrypted (PiiService, D-015); returned masked (last 4). */
  sensitive?: boolean;
  mono?: boolean;
  wide?: boolean;
  maxLength?: number;
  hint?: string;
  /** Render a Yes/No field as a checkbox (stored as "Yes" / "No"). */
  display?: 'checkbox';
  /** Options come from a master table at request time (see Lookups). */
  optionsSource?: 'languages' | 'nationalities' | 'employees' | 'noticeReasons' | 'departments' | 'branches' | 'employeeTypes' | 'relationships' | 'shifts' | 'weeklyOffs' | 'overtimeConfigurations';
  /** Options come from the parameter type with this name (Masters > Parameters). */
  optionsParameter?: string;
  /** Show this field only when another field in the same section equals a value; hidden fields are not stored or required. */
  showWhen?: { key: string; equals: string };
  /** Value/label pairs when the stored value differs from the shown label (e.g. employee id → name). */
  optionItems?: OptionItem[];
}

export interface OptionItem {
  value: string;
  label: string;
}

/** Master-data option lists injected into the schema per request. */
export interface Lookups {
  languages?: string[];
  nationalities?: string[];
  /** Parameter type "Notice Reason". */
  noticeReasons?: string[];
  /** Parameter type "Department". */
  departments?: string[];
  /** Parameter type "Employee Type". */
  employeeTypes?: string[];
  /** Parameter type "Emergency Relationship". */
  relationships?: string[];
  /** Options by parameter type name, for fields with `optionsParameter`. */
  parameters?: Record<string, string[]>;
  /** Names of the active weekly off templates (Attendance setup > Weekly off). */
  weeklyOffs?: string[];
  /** Active shifts (value = shift id). */
  shifts?: OptionItem[];
  /** Active branches the account may use (value = branch id). */
  branches?: OptionItem[];
  /** Active employees other than the one being edited (value = employee id). */
  employees?: OptionItem[];
  /** Active overtime configurations (value = configuration id; Attendance setup > Overtime). */
  overtimeConfigurations?: OptionItem[];
}

export interface RowsDef {
  key: string;
  label: string;
  addLabel: string;
  max: number;
  fields: FieldDef[];
  /** Document types etc. depend on country; resolved in buildSections(). */
  countryAware?: boolean;
}

export interface GroupDef {
  title: string;
  fields?: FieldDef[];
  rows?: RowsDef;
  /** Address group: `present` or `permanent` (levels come from the country). */
  addressLevels?: 'present' | 'permanent';
  /** Show this group only when another field in the same section equals a value. */
  showWhen?: { key: string; equals: string };
  /** Grid columns on wide screens (default 3). */
  columns?: 2 | 3 | 4;
  /** Address group: a Yes/No field that, when "Yes", hides the address levels. */
  sameAsKey?: string;
  /** Salary components chosen from an admin-defined salary template (validated by the service). */
  salaryComponents?: boolean;
}

/** Keys of the salary-template group; checked by validateSalary() in the service, not here. */
export const SALARY_KEYS = ['salaryTemplateId', 'componentAmounts'] as const;

export interface SectionDef {
  key: SectionKey;
  title: string;
  group: string;
  description: string;
  /** Only HR and System Admin can see or change this section. */
  hrOnly: boolean;
  groups: GroupDef[];
}

/* ------------------------------------------------------------------ reference data */

export const ADDRESS_LEVELS: Record<CountryCode, string[]> = {
  IN: ['State', 'City', 'Area', 'Street', 'Building', 'PIN Code'],
  AE: ['Emirate', 'City', 'Area', 'Street', 'Building', 'PO Box'],
  GB: ['County', 'Town / City', 'Street', 'Building / Flat', 'Postcode'],
  US: ['State', 'City', 'Street', 'Unit', 'ZIP code'],
};

export const CURRENCY: Record<CountryCode, string> = { IN: 'INR', AE: 'AED', GB: 'GBP', US: 'USD' };

export const DOCUMENT_TYPES: Record<CountryCode, string[]> = {
  IN: ['Passport', 'PAN Card', 'Aadhaar Card', 'UAN / PF Documents', 'Work Permit', 'Driving Licence', 'Educational Certificates', 'Relieving Letter', 'Form 16 (last 3 years)'],
  AE: ['Emirates ID', 'Visa', 'Work Permit', 'Labour Card', 'Passport', 'Driving Licence', 'Educational Certificates', 'Experience Certificate'],
  GB: ['Passport', 'Right to Work (share code)', 'P45', 'Educational Certificates'],
  US: ['I-9 Form', 'W-4 Form', 'Passport', "Driver's License", 'Educational Certificates'],
};

const ORG_COUNTRY_OPTIONS = [...COUNTRIES];

/* ------------------------------------------------------------------ schema builder */

function F(key: string, label: string, type: FieldType = 'text', extra: Partial<FieldDef> = {}): FieldDef {
  return { key, label, type, ...extra };
}

/**
 * Admin override for one tab, group or field in one country (System Admin > Profile field rules).
 * groupTitle "" = the whole tab; fieldKey "" = the whole group. null = keep the code default.
 */
export interface FieldRule {
  sectionKey: string;
  groupTitle: string;
  fieldKey: string;
  isVisible: boolean | null;
  isRequired: boolean | null;
}

/** Needed to create an employee or resolve their country; admins cannot hide or relax these. */
export const LOCKED_FIELDS: readonly string[] = ['firstName', 'lastName', 'legalEntityCountry'];
export const LOCKED_SECTIONS: readonly string[] = ['personal', 'organization'];

const ruleKey = (s: string, g: string, f: string) => `${s}|${g}|${f}`;

/**
 * Keeps only what applies to the country (a field's `countries` list), then applies admin rules.
 * A rule can hide a tab, group or field, show a field that is not a default for the country,
 * or change whether a field is required. Fields come out with `countries` cleared, so the
 * validators treat everything that survives as applicable.
 */
function applyCountryAndRules(sections: SectionDef[], country: CountryCode, rules: FieldRule[]): SectionDef[] {
  const byScope = new Map(rules.map((r) => [ruleKey(r.sectionKey, r.groupTitle, r.fieldKey), r]));
  const out: SectionDef[] = [];
  for (const s of sections) {
    if (byScope.get(ruleKey(s.key, '', ''))?.isVisible === false && !LOCKED_SECTIONS.includes(s.key)) continue;
    const groups: GroupDef[] = [];
    for (const g of s.groups) {
      if (byScope.get(ruleKey(s.key, g.title, ''))?.isVisible === false) continue;
      const shape = (f: FieldDef): FieldDef | null => {
        const r = byScope.get(ruleKey(s.key, g.title, f.key));
        if (LOCKED_FIELDS.includes(f.key)) return { ...f, countries: undefined };
        const visible = r?.isVisible ?? applies(f, country);
        if (!visible) return null;
        return { ...f, countries: undefined, required: r?.isRequired ?? f.required };
      };
      const next: GroupDef = { ...g };
      if (g.fields) next.fields = g.fields.map(shape).filter((f): f is FieldDef => f !== null);
      if (g.rows) next.rows = { ...g.rows, fields: g.rows.fields.map(shape).filter((f): f is FieldDef => f !== null) };
      const emptied = (g.fields && !next.fields!.length && !g.rows && !g.addressLevels && !g.salaryComponents) || (g.rows && !next.rows!.fields.length);
      if (emptied) continue;
      groups.push(next);
    }
    if (groups.length === 0 && s.groups.length > 0) continue;
    out.push({ ...s, groups });
  }
  return out;
}

/** Builds the profile sections for one employee country (country options resolved, country and admin rules applied). */
export function buildSections(country: CountryCode, lookups: Lookups = {}, rules: FieldRule[] = []): SectionDef[] {
  const fill = (f: FieldDef): FieldDef => {
    if (f.optionsParameter) return { ...f, options: lookups.parameters?.[f.optionsParameter] ?? [] };
    if (!f.optionsSource) return f;
    if (f.optionsSource === 'employees' || f.optionsSource === 'branches' || f.optionsSource === 'shifts' || f.optionsSource === 'overtimeConfigurations') {
      const items =
        (f.optionsSource === 'employees' ? lookups.employees
          : f.optionsSource === 'branches' ? lookups.branches
          : f.optionsSource === 'shifts' ? lookups.shifts
          : lookups.overtimeConfigurations) ?? [];
      return { ...f, options: items.map((i) => i.value), optionItems: items };
    }
    return { ...f, options: lookups[f.optionsSource] ?? [] };
  };
  const built = rawSections(country)
    .map((s) => resolveSection(s, country))
    .map((s) => ({ ...s, groups: s.groups.map((g) => (g.fields ? { ...g, fields: g.fields.map(fill) } : g)) }));
  return applyCountryAndRules(built, country, rules);
}

/** Everything an admin can configure for a country, with code defaults (before rules and filtering). */
export interface RuleCatalogSection {
  key: string;
  title: string;
  locked: boolean;
  groups: { title: string; fields: { key: string; label: string; defaultVisible: boolean; defaultRequired: boolean; locked: boolean }[] }[];
}
export function ruleCatalog(country: CountryCode): RuleCatalogSection[] {
  return rawSections(country).map((s) => ({
    key: s.key,
    title: s.title,
    locked: LOCKED_SECTIONS.includes(s.key),
    groups: s.groups.map((g) => ({
      title: g.title,
      fields: [...(g.fields ?? []), ...(g.rows?.fields ?? [])].map((f) => ({
        key: f.key,
        label: f.label,
        defaultVisible: applies(f, country),
        defaultRequired: !!f.required,
        locked: LOCKED_FIELDS.includes(f.key),
      })),
    })),
  }));
}

function rawSections(country: CountryCode): SectionDef[] {
  return [
    {
      key: 'personal', title: 'Personal', group: 'Profile', hrOnly: false,
      description: 'Identity, contact, emergency contact and addresses.',
      groups: [
        { title: 'Name', columns: 4, fields: [
          F('firstName', 'First name', 'text', { required: true }),
          F('middleName', 'Middle name'),
          F('lastName', 'Last name', 'text', { required: true }),
          F('preferredName', 'Preferred name'),
        ] },
        { title: 'Personal details', columns: 3, fields: [
          F('dateOfBirth', 'Date of birth', 'date', { required: true }),
          F('gender', 'Gender', 'select', { optionsParameter: 'Gender', required: true }),
          F('maritalStatus', 'Marital status', 'select', { optionsParameter: 'Marital Status' }),
          F('nationality', 'Nationality', 'select', { required: true, optionsSource: 'nationalities' }),
          F('bloodGroup', 'Blood group', 'select', { optionsParameter: 'BloodGroup' }),
          F('religion', 'Religion'),
          F('languages', 'Languages known', 'multiselect', { wide: true, optionsSource: 'languages', hint: 'Choose all that apply' }),
        ] },
        { title: 'Contact', columns: 2, fields: [
          F('personalMobile', 'Personal mobile', 'tel'),
          F('personalEmail', 'Personal email', 'email'),
          F('officialMobile', 'Official mobile', 'tel'),
          F('officialEmail', 'Official email', 'email'),
        ] },
        { title: 'Emergency contact', columns: 2, fields: [
          F('emergencyName', 'Contact name'),
          F('emergencyRelation', 'Relationship', 'select', { optionsSource: 'relationships' }),
          F('emergencyNumber', 'Phone number', 'tel'),
          F('emergencyEmail', 'Email', 'email'),
        ] },
        { title: 'Present address', addressLevels: 'present' },
        {
          title: 'Permanent address',
          addressLevels: 'permanent',
          sameAsKey: 'sameAsPresent',
          fields: [F('sameAsPresent', 'Same as present address', 'yn', { display: 'checkbox' })],
        },
      ],
    },
    {
      key: 'employment', title: 'Employment', group: 'Employment', hrOnly: false,
      description: 'Status, joining, probation, contract and reporting manager.',
      groups: [
        { title: 'Employment details', fields: [
          F('employeeCategory', 'Employee category', 'select', { optionsParameter: 'Employee Category' }),
          F('employmentType', 'Employment type', 'select', { optionsSource: 'employeeTypes', required: true }),
          F('employmentStatus', 'Employment status', 'select', { optionsParameter: 'Employment Status', required: true }),
          F('dateOfJoining', 'Date of joining', 'date', { required: true }),
          F('confirmationDate', 'Confirmation date', 'date'),
          F('rejoiningDate', 'Date of rejoining', 'date'),
          F('probationPeriod', 'Probation period', 'select', { optionsParameter: 'Probation Period' }),
          F('contractStartDate', 'Contract start date', 'date', { showWhen: { key: 'employmentType', equals: 'On Contract' } }),
          F('contractEndDate', 'Contract end date', 'date', { showWhen: { key: 'employmentType', equals: 'On Contract' } }),
          F('noticePeriod', 'Notice period', 'select', { optionsParameter: 'Notice Period', showWhen: { key: 'employmentStatus', equals: 'On Notice' } }),
          F('lastWorkingDate', 'Last working date', 'date', { showWhen: { key: 'employmentStatus', equals: 'On Notice' } }),
          F('noticeReason', 'Reason', 'select', { optionsSource: 'noticeReasons', showWhen: { key: 'employmentStatus', equals: 'On Notice' } }),
        ] },
        { title: 'Reporting', fields: [
          F('reportingManager', 'Reporting manager', 'select', { optionsSource: 'employees' }),
        ] },
      ],
    },
    {
      key: 'organization', title: 'Organization', group: 'Employment', hrOnly: false,
      description: 'Country of employment, branch, department, designation and grade.',
      groups: [
        { title: 'Assignment', fields: [
          F('legalEntityCountry', 'Country of employment', 'select', { options: ORG_COUNTRY_OPTIONS, required: true, hint: 'Drives address, bank, statutory and document fields' }),
          F('branch', 'Branch', 'select', { optionsSource: 'branches' }),
          F('workLocation', 'Work location'),
          F('payrollSite', 'Payroll site'),
          F('department', 'Department', 'select', { optionsSource: 'departments', required: true }),
          F('designation', 'Designation', 'text', { required: true }),
          F('grade', 'Grade', 'select', { optionsParameter: 'Grade' }),
          F('costCentre', 'Cost centre'),
        ] },
      ],
    },
    {
      key: 'attendance', title: 'Attendance & Leave', group: 'Time & pay', hrOnly: false,
      description: 'Attendance policy, shift, roster, weekly off and OT.',
      groups: [
        { title: 'Attendance', fields: [
          F('attendanceApplicable', 'Attendance applicable', 'yn'),
          F('attendanceProcessing', 'Attendance processing', 'select', { optionsParameter: 'Attendance Processing' }),
          F('shift', 'Shift', 'select', { optionsSource: 'shifts' }),
          F('roster', 'Roster', 'select', { optionsParameter: 'Roster' }),
          F('weeklyOff', 'Weekly off', 'select', { optionsSource: 'weeklyOffs' }),
          F('otConfiguration', 'OT configuration', 'select', { optionsSource: 'overtimeConfigurations', hint: 'Set up under Administration > Attendance setup > Overtime' }),
          F('otAmountOverride', 'OT fixed amount override', 'number', { hint: 'Only for a fixed OT configuration. Leave blank to use the configuration amount.' }),
        ] },
      ],
    },
    {
      key: 'bank', title: 'Bank & Statutory', group: 'Compliance', hrOnly: false,
      description: 'Bank account, tax identifiers, pension and social insurance.',
      groups: [
        { title: 'Bank account', fields: [
          F('bankName', 'Bank name'),
          F('bankBranch', 'Branch'),
          F('accountHolder', 'Account holder'),
          F('accountNumber', 'Account number', 'text', { sensitive: true, mono: true, countries: ['IN', 'GB', 'US'] }),
          F('ifscCode', 'IFSC code', 'text', { mono: true, countries: ['IN'] }),
          F('iban', 'IBAN', 'text', { sensitive: true, mono: true, countries: ['AE'] }),
          F('swiftCode', 'SWIFT code', 'text', { mono: true, countries: ['AE'] }),
          F('sortCode', 'Sort code', 'text', { sensitive: true, mono: true, countries: ['GB'] }),
          F('routingNumber', 'Routing number', 'text', { sensitive: true, mono: true, countries: ['US'] }),
          F('accountType', 'Account type', 'select', { optionsParameter: 'Bank Account Type', countries: ['US'] }),
        ] },
        { title: 'Statutory & tax', fields: [
          F('pan', 'PAN', 'text', { sensitive: true, mono: true, countries: ['IN'] }),
          F('uan', 'UAN', 'text', { sensitive: true, mono: true, countries: ['IN'] }),
          F('pfApplicable', 'PF applicable', 'yn', { countries: ['IN'] }),
          F('pfNumber', 'PF number', 'text', { mono: true, countries: ['IN'] }),
          F('pfWage', 'PF wage', 'number', { countries: ['IN'] }),
          F('esicApplicable', 'ESIC applicable', 'yn', { countries: ['IN'] }),
          F('esicIpNumber', 'ESIC IP number', 'text', { countries: ['IN'] }),
          F('professionalTaxState', 'Professional tax state', 'select', { optionsParameter: 'Professional Tax State', countries: ['IN'] }),
          F('taxRegime', 'Tax regime', 'select', { optionsParameter: 'Tax Regime', countries: ['IN'] }),
          F('labourWelfareFund', 'Labour welfare fund applicable', 'yn', { countries: ['IN'] }),
          F('tdsApplicable', 'TDS applicable', 'yn', { countries: ['IN'] }),
          F('gratuityApplicable', 'Gratuity applicable', 'yn', { countries: ['IN', 'AE'] }),
          F('emiratesIdNumber', 'Emirates ID number', 'text', { sensitive: true, mono: true, countries: ['AE'] }),
          F('labourCardNumber', 'Labour card number', 'text', { mono: true, countries: ['AE'] }),
          F('establishmentId', 'Establishment ID', 'text', { mono: true, countries: ['AE'] }),
          F('nationalInsuranceNumber', 'National Insurance number', 'text', { sensitive: true, mono: true, countries: ['GB'] }),
          F('taxCode', 'Tax code', 'text', { countries: ['GB'] }),
          F('studentLoanPlan', 'Student loan plan', 'select', { optionsParameter: 'Student Loan Plan', countries: ['GB'] }),
          F('autoEnrolmentPension', 'Auto-enrolment pension', 'select', { optionsParameter: 'Pension Auto-Enrolment', countries: ['GB'] }),
          F('statutorySickPayEligible', 'Statutory sick pay eligible', 'yn', { countries: ['GB'] }),
          F('ssn', 'SSN', 'text', { sensitive: true, mono: true, countries: ['US'] }),
          F('w4FilingStatus', 'W-4 filing status', 'select', { optionsParameter: 'W-4 Filing Status', countries: ['US'] }),
          F('stateWithholding', 'State withholding', 'select', { optionsParameter: 'State Withholding', countries: ['US'] }),
          F('flsaClassification', 'FLSA classification', 'select', { optionsParameter: 'FLSA Classification', countries: ['US'] }),
          F('k401Contribution', 'Pre-tax 401(k) contribution %', 'text', { countries: ['US'] }),
        ] },
      ],
    },
    {
      key: 'documents', title: 'Documents', group: 'Compliance', hrOnly: false,
      description: 'Passport, visa, licences and other documents with issue and expiry dates.',
      groups: [
        { title: 'Documents', rows: {
          key: 'documents', label: 'Document', addLabel: 'Add document', max: 30, countryAware: true,
          fields: [
            F('documentType', 'Document type', 'select', { required: true }),
            F('documentNumber', 'Number / detail'),
            F('issueDate', 'Issue date', 'date'),
            F('expiryDate', 'Expiry date', 'date'),
            F('fileName', 'File name', 'text', { hint: 'Upload is added in the next release' }),
          ],
        } },
      ],
    },
    {
      key: 'education', title: 'Education & Experience', group: 'Records', hrOnly: false,
      description: 'Qualifications, skills and certifications.',
      groups: [
        { title: 'Qualifications', rows: {
          key: 'education', label: 'Qualification', addLabel: 'Add qualification', max: 10,
          fields: [F('qualification', 'Qualification', 'text', { required: true }), F('institution', 'Institution'), F('specialization', 'Specialization'), F('country', 'Country'), F('completionYear', 'Completion year', 'number'), F('gradeResult', 'Grade / result')],
        } },
        { title: 'Skills & certifications', rows: {
          key: 'skills', label: 'Skill', addLabel: 'Add skill or certification', max: 30,
          fields: [F('skill', 'Skill', 'text', { required: true }), F('proficiency', 'Proficiency', 'select', { optionsParameter: 'Skill Proficiency' }), F('certification', 'Certification'), F('issuingBody', 'Issuing body'), F('issueDate', 'Issue date', 'date'), F('expiryDate', 'Expiry date', 'date')],
        } },
      ],
    },
    {
      key: 'access', title: 'System Access', group: 'Admin', hrOnly: true,
      description: 'Login, username, role and two-factor authentication. Visible to HR and System Admin only.',
      groups: [
        { title: 'Login & access', fields: [
          F('loginEnabled', 'Login enabled', 'yn'),
          F('username', 'Username', 'text', { mono: true, maxLength: 50 }),
          F('accessRole', 'Role', 'select', { optionsParameter: 'Access Role' }),
          F('loginStatus', 'Login status', 'select', { optionsParameter: 'Login Status' }),
          F('twoFactorAuthentication', 'Two-factor authentication', 'select', { optionsParameter: 'Two-Factor Authentication' }),
        ] },
      ],
    },
    {
      key: 'airfare', title: 'AirFare', group: 'Benefits', hrOnly: false,
      description: 'Air ticket eligibility, ticket type, eligibility period and rate, and family tickets.',
      groups: [
        { title: 'Airfare eligibility', fields: [
          F('airfareEligible', 'Airfare eligibility', 'yn', { display: 'checkbox' }),
          F('ticketType', 'Ticket type', 'select', { required: true, options: ['Airfare', 'Airticket'], showWhen: { key: 'airfareEligible', equals: 'Yes' } }),
          F('eligibilityType', 'Eligibility type', 'select', { required: true, options: ['12 Month', '24 months'], showWhen: { key: 'airfareEligible', equals: 'Yes' } }),
          F('airfareRate', 'Airfare rate', 'number', { showWhen: { key: 'airfareEligible', equals: 'Yes' }, hint: 'Amount per ticket' }),
          F('familyAirfare', 'Family airfare', 'yn', { display: 'checkbox', showWhen: { key: 'airfareEligible', equals: 'Yes' } }),
          F('familyMembers', 'No. of family members', 'number', { required: true, showWhen: { key: 'familyAirfare', equals: 'Yes' } }),
        ] },
      ],
    },
  ];
}

/** Stored key for an address group: `presentAddress` or `permanentAddress`. */
export function addressKeyFor(level: 'present' | 'permanent'): string {
  return level === 'present' ? 'presentAddress' : 'permanentAddress';
}

/** Every stored field key of a section for a country (rows excluded). */
export function fieldsFor(section: SectionDef, country: CountryCode): FieldDef[] {
  const out: FieldDef[] = [];
  for (const g of section.groups) {
    for (const f of g.fields ?? []) if (applies(f, country)) out.push(f);
    if (g.rows) for (const f of g.rows.fields) if (applies(f, country)) out.push(f);
  }
  return out;
}

export function applies(f: FieldDef, country: CountryCode): boolean {
  return !f.countries || f.countries.includes(country);
}

/** Field key → definition, with options resolved for the country (document types). */
export function resolveSection(section: SectionDef, country: CountryCode): SectionDef {
  return {
    ...section,
    groups: section.groups.map((g) => {
      if (!g.rows) return g;
      const rows = g.rows.countryAware
        ? { ...g.rows, fields: g.rows.fields.map((f) => (f.key === 'documentType' ? { ...f, options: DOCUMENT_TYPES[country] } : f)) }
        : g.rows;
      return { ...g, rows };
    }),
  };
}

/* ------------------------------------------------------------------ validation */

export interface FieldError {
  field: string;
  message: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEL_RE = /^[+0-9 ()-]{6,20}$/;

function isValidDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Checks one scalar against its field definition. Returns an error message or null. */
export function checkValue(f: FieldDef, raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (Array.isArray(raw) && raw.length === 0) return null;
  if (f.sensitive && typeof raw === 'string' && raw.startsWith('*')) return null; // masked, keep stored value
  switch (f.type) {
    case 'number':
      return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? null : `${f.label} must be a number of 0 or more`;
    case 'date':
      return typeof raw === 'string' && isValidDate(raw) ? null : `${f.label} must be a date (YYYY-MM-DD)`;
    case 'yn':
      return raw === 'Yes' || raw === 'No' ? null : `${f.label} must be Yes or No`;
    case 'select':
      return typeof raw === 'string' && (f.options ?? []).includes(raw) ? null : `${f.label} must be one of the listed options`;
    case 'multiselect': {
      if (!Array.isArray(raw)) return `${f.label} must be a list`;
      if (raw.length > 30) return `${f.label}: choose at most 30`;
      const opts = f.options ?? [];
      const bad = raw.filter((x) => typeof x !== 'string' || !opts.includes(x));
      if (bad.length) return `${f.label}: ${bad.join(', ')} is not one of the listed options`;
      return new Set(raw).size === raw.length ? null : `${f.label} contains duplicates`;
    }
    case 'email':
      return typeof raw === 'string' && EMAIL_RE.test(raw) ? null : `${f.label} must be a valid email`;
    case 'tel':
      return typeof raw === 'string' && TEL_RE.test(raw) ? null : `${f.label} must be a valid phone number`;
    case 'text':
    case 'textarea': {
      if (typeof raw !== 'string') return `${f.label} must be text`;
      const max = f.maxLength ?? (f.type === 'textarea' ? 2000 : 200);
      return raw.length <= max ? null : `${f.label} must be at most ${max} characters`;
    }
  }
}

export interface ValidationResult {
  values: Record<string, unknown>;
  rows: Record<string, Record<string, unknown>[]>;
  errors: FieldError[];
}

/**
 * Validates one section payload for a country. Unknown keys are rejected; required
 * fields are enforced only when they apply to the country and their group is shown.
 */
export function validateSection(section: SectionDef, country: CountryCode, data: Record<string, unknown>): ValidationResult {
  const errors: FieldError[] = [];
  const values: Record<string, unknown> = {};
  const rows: Record<string, Record<string, unknown>[]> = {};
  const resolved = resolveSection(section, country);
  const fieldMap = new Map<string, FieldDef>();
  const rowMap = new Map<string, RowsDef>();
  for (const g of resolved.groups) {
    for (const f of g.fields ?? []) if (applies(f, country)) fieldMap.set(f.key, f);
    if (g.rows) {
      rowMap.set(g.rows.key, g.rows);
    }
  }
  const fieldShown = (f: FieldDef) => !f.showWhen || String(data[f.showWhen.key] ?? '') === f.showWhen.equals;
  const showGroup = (g: GroupDef) => !g.showWhen || String(values[g.showWhen.key] ?? data[g.showWhen.key] ?? '') === g.showWhen.equals;

  // Address levels are stored as one list per address: presentAddress / permanentAddress.
  const addressKeys = new Set<string>();
  for (const g of resolved.groups) if (g.addressLevels) addressKeys.add(addressKeyFor(g.addressLevels));
  for (const key of addressKeys) {
    const raw = data[key];
    if (raw === undefined) continue;
    if (!Array.isArray(raw) || raw.length > ADDRESS_LEVELS[country].length || raw.some((x) => typeof x !== 'string' || x.length > 200)) {
      errors.push({ field: key, message: 'Address must be a list of text levels' });
      continue;
    }
    values[key] = raw;
  }

  // Salary template keys pass through here; the service checks them against the template.
  const salaryGroup = resolved.groups.some((g) => g.salaryComponents);
  for (const key of SALARY_KEYS) if (salaryGroup && key in data) values[key] = data[key];

  for (const [key, raw] of Object.entries(data)) {
    if (rowMap.has(key) || addressKeys.has(key)) continue;
    if (salaryGroup && (SALARY_KEYS as readonly string[]).includes(key)) continue;
    // Unknown keys are rejected below; known scalar fields are checked here.
    const f = fieldMap.get(key);
    if (!f) { errors.push({ field: key, message: `Unknown or not applicable field: ${key}` }); continue; }
    if (!fieldShown(f)) continue; // condition not met: the value is dropped, not stored
    const err = checkValue(f, raw);
    if (err) errors.push({ field: key, message: err }); else values[key] = raw ?? '';
  }

  for (const g of resolved.groups) {
    if (!g.fields || !showGroup(g)) continue;
    for (const f of g.fields) {
      if (!applies(f, country) || !f.required || !fieldShown(f)) continue;
      const v = values[f.key] ?? data[f.key];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) errors.push({ field: f.key, message: `${f.label} is required` });
    }
  }
  // Address levels are optional in this release (see API_SPECIFICATION §profile).

  // Rows (repeatable records)
  for (const [key, def] of rowMap) {
    const list = data[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) { errors.push({ field: key, message: `${def.label} must be a list` }); continue; }
    if (list.length > def.max) { errors.push({ field: key, message: `At most ${def.max} ${def.label.toLowerCase()} records` }); continue; }
    const cleaned: Record<string, unknown>[] = [];
    list.forEach((row, i) => {
      if (typeof row !== 'object' || row === null || Array.isArray(row)) { errors.push({ field: `${key}[${i}]`, message: 'Each record must be an object' }); return; }
      const out: Record<string, unknown> = {};
      for (const [rk, rv] of Object.entries(row as Record<string, unknown>)) {
        const f = def.fields.find((x) => x.key === rk && applies(x, country));
        if (!f) { errors.push({ field: `${key}[${i}].${rk}`, message: `Unknown field: ${rk}` }); continue; }
        const err = checkValue(f, rv);
        if (err) errors.push({ field: `${key}[${i}].${rk}`, message: `${def.label} ${i + 1}: ${err}` }); else out[rk] = rv ?? '';
      }
      for (const f of def.fields) {
        if (f.required && applies(f, country) && !(out[f.key] as string)) {
          errors.push({ field: `${key}[${i}].${f.key}`, message: `${def.label} ${i + 1}: ${f.label} is required` });
        }
      }
      cleaned.push(out);
    });
    rows[key] = cleaned;
  }

  return { values, rows, errors };
}

/** Custom field value check (definitions are created by System Admin, D-023). */
export interface CustomFieldDefLike {
  code: string;
  label: string;
  fieldType: string;
  options: string[];
  isRequired: boolean;
}

export function checkCustomValue(def: CustomFieldDefLike, raw: unknown): string | null {
  const empty = raw === undefined || raw === null || raw === '';
  if (empty) return def.isRequired ? `${def.label} is required` : null;
  switch (def.fieldType) {
    case 'Dropdown':
    case 'Radio':
      return typeof raw === 'string' && def.options.includes(raw) ? null : `${def.label} must be one of the listed options`;
    case 'Multi-select':
      return Array.isArray(raw) && raw.every((v) => typeof v === 'string' && def.options.includes(v))
        ? null
        : `${def.label} must be one or more of the listed options`;
    case 'Yes/No':
      return raw === 'Yes' || raw === 'No' ? null : `${def.label} must be Yes or No`;
    case 'Checkbox':
      return typeof raw === 'boolean' ? null : `${def.label} must be checked or unchecked`;
    case 'Number':
    case 'Decimal':
      return typeof raw === 'number' && Number.isFinite(raw) ? null : `${def.label} must be a number`;
    case 'Date':
      return typeof raw === 'string' && isValidDate(raw) ? null : `${def.label} must be a date (YYYY-MM-DD)`;
    case 'Textarea':
      return typeof raw === 'string' && raw.length <= 2000 ? null : `${def.label} must be text up to 2000 characters`;
    case 'Email':
      return typeof raw === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? null : `${def.label} must be a valid email address`;
    case 'Phone':
      return typeof raw === 'string' && /^[+\d][\d\s\-()]{4,19}$/.test(raw) ? null : `${def.label} must be a valid phone number`;
    case 'URL':
      return typeof raw === 'string' && /^https?:\/\/.+/.test(raw) ? null : `${def.label} must be a URL starting with http:// or https://`;
    default:
      return typeof raw === 'string' && raw.length <= 500 ? null : `${def.label} must be text up to 500 characters`;
  }
}

export const CUSTOM_FIELD_TYPES = [
  'Text', 'Textarea', 'Number', 'Decimal', 'Date', 'Dropdown', 'Multi-select', 'Radio', 'Checkbox',
  'Email', 'Phone', 'URL', 'Yes/No',
] as const;

/** Types that need an options list (planning/system_application_module.md §E). */
export const CUSTOM_FIELD_OPTIONS_REQUIRED = ['Dropdown', 'Multi-select', 'Radio'] as const;

/** Custom field code from a label. Immutable after creation. */
export function codeFromLabel(label: string): string {
  return 'CUSTOM_' + label.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/* ------------------------------------------------------------------ salary templates */

export interface SalaryComponentDef {
  code: string;
  label: string;
}

/** Component code from its label (UPPER_SNAKE). Kept stable once saved. */
export function componentCode(label: string): string {
  return label.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * Checks amounts entered against a template: only its components, numbers of 0 or more,
 * and at most 2 decimals. Empty values are dropped. Returns cleaned amounts and errors.
 */
export function validateComponentAmounts(
  components: SalaryComponentDef[],
  raw: unknown,
): { amounts: Record<string, number>; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const amounts: Record<string, number> = {};
  if (raw === undefined || raw === null) return { amounts, errors };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { amounts, errors: [{ field: 'componentAmounts', message: 'Salary components must be a list of amounts' }] };
  }
  const byCode = new Map(components.map((c) => [c.code, c]));
  for (const [code, value] of Object.entries(raw as Record<string, unknown>)) {
    const c = byCode.get(code);
    if (!c) { errors.push({ field: `componentAmounts.${code}`, message: `${code} is not part of the selected template` }); continue; }
    if (value === '' || value === null || value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      errors.push({ field: `componentAmounts.${code}`, message: `${c.label} must be an amount of 0 or more` });
      continue;
    }
    if (Math.round(value * 100) !== value * 100) {
      errors.push({ field: `componentAmounts.${code}`, message: `${c.label} can have at most 2 decimals` });
      continue;
    }
    amounts[code] = value;
  }
  return { amounts, errors };
}

/** Parameter type names the schema reads dropdown options from (loaded in one query by the service). */
export function parameterTypesUsed(): string[] {
  const names = new Set<string>();
  for (const s of rawSections('IN')) {
    for (const g of s.groups) {
      for (const f of [...(g.fields ?? []), ...(g.rows?.fields ?? [])]) if (f.optionsParameter) names.add(f.optionsParameter);
    }
  }
  return [...names];
}
