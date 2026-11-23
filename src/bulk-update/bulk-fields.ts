/**
 * The employee fields that can be changed for many people at once. Only fields where the same value
 * makes sense for a group (branch, department, shift, manager...). Identity, contact, pay, bank, dates and
 * anything unique to one person is deliberately left out.
 */
export type BulkFieldType = 'select' | 'text' | 'yn';

export interface BulkFieldDef {
  key: string;
  label: string;
  /** Profile section the value is stored in. */
  section: 'organization' | 'employment' | 'attendance';
  type: BulkFieldType;
  /** Where the options come from (select fields). */
  source?: 'branches' | 'employees' | 'shifts' | 'weeklyOffs' | 'overtimeConfigurations' | { parameter: string };
  /** The value cannot be cleared (the profile needs it). */
  required?: boolean;
  /** The employee record column that must stay in step with the profile value. */
  column?: 'branchId' | 'shiftId' | 'reportingToId' | 'designation';
  /** Keep the stored employee type (a parameter id) in step with the chosen text. */
  syncEmployeeType?: boolean;
  /** Keep the employee's weekly off assignment in step (the value is a template name). */
  syncWeeklyOff?: boolean;
}

export const BULK_FIELDS: BulkFieldDef[] = [
  { key: 'branch', label: 'Branch', section: 'organization', type: 'select', source: 'branches', required: true, column: 'branchId' },
  { key: 'department', label: 'Department', section: 'organization', type: 'select', source: { parameter: 'Department' }, required: true },
  { key: 'designation', label: 'Designation', section: 'organization', type: 'text', required: true, column: 'designation' },
  { key: 'grade', label: 'Grade', section: 'organization', type: 'select', source: { parameter: 'Grade' } },
  { key: 'reportingManager', label: 'Reporting manager', section: 'employment', type: 'select', source: 'employees', column: 'reportingToId' },
  { key: 'workLocation', label: 'Work location', section: 'organization', type: 'text' },
  { key: 'costCentre', label: 'Cost centre', section: 'organization', type: 'text' },
  { key: 'employeeCategory', label: 'Employee category', section: 'employment', type: 'select', source: { parameter: 'Employee Category' } },
  { key: 'employmentType', label: 'Employment type', section: 'employment', type: 'select', source: { parameter: 'Employee Type' }, required: true, syncEmployeeType: true },
  { key: 'shift', label: 'Shift', section: 'attendance', type: 'select', source: 'shifts', column: 'shiftId' },
  { key: 'attendanceApplicable', label: 'Attendance applicable', section: 'attendance', type: 'yn' },
  { key: 'attendanceProcessing', label: 'Attendance processing', section: 'attendance', type: 'select', source: { parameter: 'Attendance Processing' } },
  { key: 'roster', label: 'Roster group', section: 'attendance', type: 'select', source: { parameter: 'Roster' } },
  { key: 'weeklyOff', label: 'Weekly off', section: 'attendance', type: 'select', source: 'weeklyOffs', syncWeeklyOff: true },
  { key: 'otConfiguration', label: 'OT configuration', section: 'attendance', type: 'select', source: 'overtimeConfigurations' },
];

export const MAX_BULK_EMPLOYEES = 500;
export const MAX_TEXT_LENGTH = 120;

export interface BulkChange {
  field: string;
  /** null clears the value (not allowed for required fields). */
  value: string | null;
}

/** Problems with the requested changes, given the allowed option values per field. Empty = fine. */
export function validateChanges(changes: BulkChange[], options: Record<string, string[]>): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  if (!changes.length) problems.push('Choose at least one field to update');
  for (const c of changes) {
    const def = BULK_FIELDS.find((f) => f.key === c.field);
    if (!def) {
      problems.push(`"${c.field}" cannot be updated in bulk`);
      continue;
    }
    if (seen.has(c.field)) problems.push(`${def.label} appears twice`);
    seen.add(c.field);
    const value = c.value === null ? null : String(c.value).trim();
    if (value === null || value === '') {
      if (def.required) problems.push(`${def.label} is required and cannot be cleared`);
      continue;
    }
    if (def.type === 'text' && value.length > MAX_TEXT_LENGTH) problems.push(`${def.label} is too long (${MAX_TEXT_LENGTH} characters at most)`);
    if (def.type === 'yn' && value !== 'Yes' && value !== 'No') problems.push(`${def.label} must be Yes or No`);
    if (def.type === 'select' && !(options[def.key] ?? []).includes(value)) problems.push(`${def.label}: "${value}" is not one of the available options`);
  }
  return problems;
}
