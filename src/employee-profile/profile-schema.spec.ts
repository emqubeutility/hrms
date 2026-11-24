import {
  buildSections,
  checkCustomValue,
  checkValue,
  codeFromLabel,
  validateSection,
  validateComponentAmounts,
  componentCode,
  FieldDef,
  SectionDef,
} from './profile-schema';

const LOOKUPS = { nationalities: ['Indian', 'Emirati'], departments: ['Sales', 'HR'], employeeTypes: ['Permanent', 'On Contract'], relationships: ['Parent', 'Spouse'],
  parameters: {
    Gender: ['Male', 'Female', 'Other'],
    'Marital Status': ['Single', 'Married'],
    BloodGroup: ['A+', 'O+'],
    Roster: ['Fixed', 'Rotational'],
    'Employee Category': ['Staff'],
    'Employment Status': ['Active', 'On Notice', 'Inactive'],
    'Probation Period': ['3 months'],
    'Notice Period': ['1 month', '2 months'],
    Grade: ['G3'],
    'Attendance Processing': ['Automatic'],
    'Skill Proficiency': ['Beginner'],
    'Access Role': ['Employee'],
    'Login Status': ['Active'],
    'Two-Factor Authentication': ['Enabled'],
    'Tax Regime': ['Old Regime', 'New Regime'],
  },
  shifts: [{ value: '1', label: 'General' }], employees: [{ value: '2', label: 'Neha Kulkarni (IN-00002)' }] };
const section = (country: 'IN' | 'AE' | 'GB' | 'US', key: string): SectionDef =>
  buildSections(country, LOOKUPS).find((s) => s.key === key) as SectionDef;

describe('profile schema: sections', () => {
  it('builds the tabs in the current order, with AirFare after Bank', () => {
    const keys = buildSections('IN').map((s) => s.key);
    expect(keys).toEqual(['personal', 'employment', 'organization', 'attendance', 'bank', 'airfare', 'documents', 'education', 'access']);
  });

  it('AirFare: ticket details only when eligible, family members only with family airfare', () => {
    const fields = section('IN', 'airfare').groups[0].fields!;
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.airfareEligible.display).toBe('checkbox');
    expect(byKey.ticketType.options).toEqual(['Airfare', 'Airticket']);
    expect(byKey.eligibilityType.options).toEqual(['12 Month', '24 months']);
    expect(byKey.ticketType.showWhen).toEqual({ key: 'airfareEligible', equals: 'Yes' });
    expect(byKey.familyMembers.required).toBe(true);
    expect(byKey.familyMembers.showWhen).toEqual({ key: 'familyAirfare', equals: 'Yes' });
  });

  it('marks System Access as HR-only', () => {
    expect(section('IN', 'access').hrOnly).toBe(true);
    expect(section('IN', 'personal').hrOnly).toBe(false);
  });

  it('resolves document types from the country', () => {
    const docsOf = (c: 'IN' | 'AE') => {
      const rows = section(c, 'documents').groups[0].rows!;
      return rows.fields.find((f) => f.key === 'documentType')!.options;
    };
    expect(docsOf('IN')).toContain('PAN Card');
    expect(docsOf('AE')).toContain('Emirates ID');
    expect(docsOf('AE')).not.toContain('PAN Card');
  });
});

describe('checkValue', () => {
  const f = (over: Partial<FieldDef>): FieldDef => ({ key: 'x', label: 'X', type: 'text', ...over });

  it('accepts a valid calendar date and rejects impossible ones', () => {
    expect(checkValue(f({ type: 'date' }), '2026-02-28')).toBeNull();
    expect(checkValue(f({ type: 'date' }), '2026-02-30')).not.toBeNull();
    expect(checkValue(f({ type: 'date' }), '28/02/2026')).not.toBeNull();
  });

  it('enforces Yes/No and listed options', () => {
    expect(checkValue(f({ type: 'yn' }), 'Yes')).toBeNull();
    expect(checkValue(f({ type: 'yn' }), 'Maybe')).not.toBeNull();
    expect(checkValue(f({ type: 'select', options: ['A', 'B'] }), 'C')).not.toBeNull();
  });

  it('treats a masked sensitive value as unchanged', () => {
    expect(checkValue(f({ sensitive: true }), '*******1234')).toBeNull();
  });

  it('checks email, phone and text length', () => {
    expect(checkValue(f({ type: 'email' }), 'a@b')).not.toBeNull();
    expect(checkValue(f({ type: 'tel' }), '+91 98220 41877')).toBeNull();
    expect(checkValue(f({ maxLength: 3 }), 'abcd')).not.toBeNull();
  });
});

describe('validateSection', () => {
  it('requires required fields for the section', () => {
    const r = validateSection(section('IN', 'personal'), 'IN', { firstName: 'Rohan' });
    const fields = r.errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['lastName', 'dateOfBirth', 'gender', 'nationality']));
  });

  it('accepts a complete personal section and returns normalized values', () => {
    const r = validateSection(section('IN', 'personal'), 'IN', {
      firstName: 'Rohan', lastName: 'Deshmukh', dateOfBirth: '1991-04-09', gender: 'Male', nationality: 'Indian',
      personalEmail: 'rohan@mail.com', sameAsPresent: 'Yes', presentAddress: ['Maharashtra', 'Pune', 'Baner', 'Pashan Road', 'Sunrise Heights', '411045'],
    });
    expect(r.errors).toEqual([]);
    expect(r.values.firstName).toBe('Rohan');
    expect(r.values.presentAddress).toHaveLength(6);
  });

  it('rejects unknown fields and fields that do not apply to the country', () => {
    const bank = validateSection(section('AE', 'bank'), 'AE', { accountNumber: '123' });
    expect(bank.errors.map((e) => e.field)).toContain('accountNumber');
    const unknown = validateSection(section('IN', 'personal'), 'IN', { nickname: 'x' });
    expect(unknown.errors[0].field).toBe('nickname');
  });

  it('validates repeatable records and their maximum count', () => {
    const edu = section('IN', 'education');
    const ok = validateSection(edu, 'IN', { education: [{ qualification: 'B.E.', completionYear: 2018 }] });
    expect(ok.errors).toEqual([]);
    const missing = validateSection(edu, 'IN', { education: [{ institution: 'Pune University' }] });
    expect(missing.errors.map((e) => e.message).join(' ')).toMatch(/Qualification is required/);
    const tooMany = validateSection(edu, 'IN', { education: Array.from({ length: 11 }, () => ({ qualification: 'x' })) });
    expect(tooMany.errors[0].message).toMatch(/At most 10/);
  });

  it('validates the address list length against the country levels', () => {
    const r = validateSection(section('GB', 'personal'), 'GB', { presentAddress: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] });
    expect(r.errors.map((e) => e.field)).toContain('presentAddress');
  });
});

describe('custom fields (D-023)', () => {
  it('builds the code from the label and keeps it upper snake case', () => {
    expect(codeFromLabel('Shirt Size')).toBe('CUSTOM_SHIRT_SIZE');
    expect(codeFromLabel('  Site clearance (required)!  ')).toBe('CUSTOM_SITE_CLEARANCE_REQUIRED');
  });

  it('checks dropdown options and Yes/No values', () => {
    const dd = { code: 'CUSTOM_SHIRT_SIZE', label: 'Shirt Size', fieldType: 'Dropdown', options: ['S', 'M'], isRequired: false };
    expect(checkCustomValue(dd, 'M')).toBeNull();
    expect(checkCustomValue(dd, 'XXL')).not.toBeNull();
    const yn = { ...dd, fieldType: 'Yes/No', options: [] };
    expect(checkCustomValue(yn, 'No')).toBeNull();
    expect(checkCustomValue({ ...yn, isRequired: true }, '')).toMatch(/required/);
  });
});

describe('Personal section layout', () => {
  it('groups name, details, contact, emergency contact and both addresses', () => {
    const p = section('IN', 'personal');
    expect(p.groups.map((g) => g.title)).toEqual(['Name', 'Personal details', 'Contact', 'Emergency contact', 'Present address', 'Permanent address']);
    const permanent = p.groups.find((g) => g.addressLevels === 'permanent')!;
    expect(permanent.sameAsKey).toBe('sameAsPresent');
    expect(permanent.fields?.map((f) => f.key)).toEqual(['sameAsPresent']);
  });

  it('accepts "same as present" together with a permanent address list', () => {
    const r = validateSection(section('IN', 'personal'), 'IN', {
      firstName: 'Rohan', lastName: 'Deshmukh', dateOfBirth: '1991-04-09', gender: 'Male', nationality: 'Indian',
      sameAsPresent: 'No', permanentAddress: ['Maharashtra', 'Pune'],
    });
    expect(r.errors).toEqual([]);
    expect(r.values.permanentAddress).toEqual(['Maharashtra', 'Pune']);
  });
});

describe('Languages known (multi-select from the Languages master)', () => {
  const langs = ['Arabic', 'English', 'Hindi'];
  const personal = () => buildSections('IN', { ...LOOKUPS, languages: langs }).find((s) => s.key === 'personal')!;
  const base = { firstName: 'Rohan', lastName: 'Deshmukh', dateOfBirth: '1991-04-09', gender: 'Male', nationality: 'Indian' };

  it('is a multi-select whose options come from the master', () => {
    const f = personal().groups.flatMap((g) => g.fields ?? []).find((x) => x.key === 'languages')!;
    expect(f.type).toBe('multiselect');
    expect(f.options).toEqual(langs);
  });

  it('accepts a list of listed languages and an empty list', () => {
    expect(validateSection(personal(), 'IN', { ...base, languages: ['English', 'Hindi'] }).errors).toEqual([]);
    expect(validateSection(personal(), 'IN', { ...base, languages: [] }).errors).toEqual([]);
  });

  it('rejects unlisted languages, duplicates and plain text', () => {
    const msg = (v: unknown) => validateSection(personal(), 'IN', { ...base, languages: v }).errors.map((e) => e.message).join(' ');
    expect(msg(['English', 'Klingon'])).toMatch(/Klingon is not one of the listed options/);
    expect(msg(['English', 'English'])).toMatch(/duplicates/);
    expect(msg('English, Hindi')).toMatch(/must be a list/);
  });
});

describe('Dropdowns from master data', () => {
  const fields = (key: string) => section('IN', key).groups.flatMap((g) => g.fields ?? []);
  it('Nationality is a dropdown of the Nationality catalog', () => {
    const f = fields('personal').find((x) => x.key === 'nationality')!;
    expect(f.type).toBe('select');
    expect(f.options).toEqual(['Indian', 'Emirati']);
  });

  it('Reporting manager is a dropdown of employees, stored by employee id', () => {
    const f = fields('employment').find((x) => x.key === 'reportingManager')!;
    expect(f.type).toBe('select');
    expect(f.optionItems).toEqual([{ value: '2', label: 'Neha Kulkarni (IN-00002)' }]);
    const emp = { employmentType: 'Permanent', employmentStatus: 'Active', dateOfJoining: '2024-01-01' };
    expect(validateSection(section('IN', 'employment'), 'IN', { ...emp, reportingManager: '2' }).errors).toEqual([]);
    expect(validateSection(section('IN', 'employment'), 'IN', { ...emp, reportingManager: '99' }).errors[0].field).toBe('reportingManager');
  });
});

describe('Salary template amounts (D-024)', () => {
  const components = [{ code: 'BASIC', label: 'Basic salary' }, { code: 'HOUSING', label: 'Housing allowance' }];

  it('builds stable component codes from labels', () => {
    expect(componentCode('Housing allowance')).toBe('HOUSING_ALLOWANCE');
  });

  it('accepts amounts for template components and drops empty ones', () => {
    const r = validateComponentAmounts(components, { BASIC: 9000, HOUSING: '' });
    expect(r.errors).toEqual([]);
    expect(r.amounts).toEqual({ BASIC: 9000 });
  });

  it('rejects components outside the template, negatives and more than 2 decimals', () => {
    const r = validateComponentAmounts(components, { BASIC: -1, HOUSING: 10.555, BONUS: 5 });
    expect(r.errors.map((e) => e.field)).toEqual(['componentAmounts.BASIC', 'componentAmounts.HOUSING', 'componentAmounts.BONUS']);
  });
});

describe('country filtering and admin rules', () => {
  const keysOf = (country: 'IN' | 'AE' | 'GB' | 'US', rules: Parameters<typeof buildSections>[2] = []) =>
    (buildSections(country, LOOKUPS, rules).find((s) => s.key === 'bank') as SectionDef).groups.flatMap((g) => (g.fields ?? []).map((f) => f.key));

  it('shows only the statutory fields of the employee country', () => {
    expect(keysOf('IN')).toContain('pan');
    expect(keysOf('IN')).not.toContain('ssn');
    expect(keysOf('US')).toContain('ssn');
    expect(keysOf('US')).not.toContain('pan');
    expect(keysOf('AE')).toContain('emiratesIdNumber');
  });

  it('a rule can hide a field, a group, or a whole tab', () => {
    expect(keysOf('IN', [{ sectionKey: 'bank', groupTitle: 'Statutory & tax', fieldKey: 'pan', isVisible: false, isRequired: null }])).not.toContain('pan');
    const noStatutory = buildSections('IN', LOOKUPS, [{ sectionKey: 'bank', groupTitle: 'Statutory & tax', fieldKey: '', isVisible: false, isRequired: null }]);
    expect((noStatutory.find((s) => s.key === 'bank') as SectionDef).groups.map((g) => g.title)).not.toContain('Statutory & tax');
    const noBank = buildSections('IN', LOOKUPS, [{ sectionKey: 'bank', groupTitle: '', fieldKey: '', isVisible: false, isRequired: null }]);
    expect(noBank.find((s) => s.key === 'bank')).toBeUndefined();
  });

  it('a rule can show a field the country does not have by default, and change required', () => {
    const rules = [{ sectionKey: 'bank', groupTitle: 'Statutory & tax', fieldKey: 'ssn', isVisible: true, isRequired: true }];
    expect(keysOf('IN', rules)).toContain('ssn');
    const f = (buildSections('IN', LOOKUPS, rules).find((s) => s.key === 'bank') as SectionDef).groups.flatMap((g) => g.fields ?? []).find((x) => x.key === 'ssn')!;
    expect(f.required).toBe(true);
    const sec = buildSections('IN', LOOKUPS, rules).find((s) => s.key === 'bank') as SectionDef;
    expect(validateSection(sec, 'IN', {}).errors.map((e) => e.field)).toContain('ssn');
  });

  it('cannot hide Personal, Organization or the fields needed to create an employee', () => {
    const rules = [
      { sectionKey: 'personal', groupTitle: '', fieldKey: '', isVisible: false, isRequired: null },
      { sectionKey: 'personal', groupTitle: 'Name', fieldKey: 'firstName', isVisible: false, isRequired: null },
    ];
    const personal = buildSections('IN', LOOKUPS, rules).find((s) => s.key === 'personal') as SectionDef;
    expect(personal.groups.flatMap((g) => g.fields ?? []).map((f) => f.key)).toContain('firstName');
  });
});

describe('conditional fields', () => {
  const employment = () => buildSections('IN', LOOKUPS).find((s) => s.key === 'employment') as SectionDef;
  const base = { employmentType: 'Permanent', employmentStatus: 'Active', dateOfJoining: '2026-01-01' };

  it('contract dates are only accepted for the On Contract employment type', () => {
    const full = validateSection(employment(), 'IN', { ...base, contractStartDate: '2026-01-01', contractEndDate: '2026-12-31' });
    expect(full.errors).toEqual([]);
    expect(full.values.contractStartDate).toBeUndefined();
    const contract = validateSection(employment(), 'IN', { ...base, employmentType: 'On Contract', contractStartDate: '2026-01-01', contractEndDate: '2026-12-31' });
    expect(contract.values.contractStartDate).toBe('2026-01-01');
    expect(contract.values.contractEndDate).toBe('2026-12-31');
  });
});

describe('notice fields', () => {
  const lookups = { ...LOOKUPS, noticeReasons: ['Resignation', 'Termination'] };
  const employment = () => buildSections('IN', lookups).find((s) => s.key === 'employment') as SectionDef;
  const base = { employmentType: 'Permanent', dateOfJoining: '2026-01-01' };

  it('no longer has an Employment end date', () => {
    expect(employment().groups.flatMap((g) => g.fields ?? []).map((f) => f.key)).not.toContain('employmentEndDate');
  });

  it('notice period, last working date and reason apply only when On Notice', () => {
    const onNotice = validateSection(employment(), 'IN', { ...base, employmentStatus: 'On Notice', noticePeriod: '1 month', lastWorkingDate: '2026-06-30', noticeReason: 'Resignation' });
    expect(onNotice.errors).toEqual([]);
    expect(onNotice.values.noticeReason).toBe('Resignation');
    const active = validateSection(employment(), 'IN', { ...base, employmentStatus: 'Active', noticePeriod: '1 month', lastWorkingDate: '2026-06-30', noticeReason: 'Resignation' });
    expect(active.errors).toEqual([]);
    expect(active.values.noticePeriod).toBeUndefined();
    expect(active.values.noticeReason).toBeUndefined();
  });

  it('the reason must be one of the Notice Reason parameters', () => {
    const r = validateSection(employment(), 'IN', { ...base, employmentStatus: 'On Notice', noticeReason: 'Bored' });
    expect(r.errors.map((e) => e.field)).toContain('noticeReason');
  });
});
