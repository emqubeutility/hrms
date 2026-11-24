import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import EmployeePhoto from '../../components/EmployeePhoto';
import EmployeeDocuments from '../../components/EmployeeDocuments';
import EmployeeDependants from '../../components/EmployeeDependants';
import {
  EmployeeProfileResponse,
  FieldErrorItem,
  ProfileFieldDef,
  ProfileGroupDef,
  ProfileSectionDef,
  createEmployee,
  getBlankProfile,
  getEmployeeProfile,
  saveEmployeeProfileSection,
  createEmployeeLogin,
  sendEmployeeLoginDetails,
  uploadEmployeePhoto,
  validateNewProfile,
} from '../../lib/api';
import Select from '../../components/Select';

type Values = Record<string, any>;

const ADDRESS_KEY: Record<string, string> = { present: 'presentAddress', permanent: 'permanentAddress' };

function cloneJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? {}));
}

function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'neutral' | 'info'; children: React.ReactNode }) {
  const cls = {
    ok: 'bg-green-50 text-green-700 border-green-200',
    warn: 'bg-amber-50 text-amber-700 border-amber-200',
    bad: 'bg-red-50 text-red-700 border-red-200',
    neutral: 'bg-gray-100 text-gray-600 border-gray-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
  }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

function inputClass(disabled: boolean, error: boolean, mono?: boolean) {
  return [
    'w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2',
    error ? 'border-red-300 focus:ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500/30',
    disabled ? 'bg-gray-100 text-gray-500' : '',
    mono ? 'font-mono text-[13px]' : '',
  ].join(' ');
}

/** Multi-select: chosen values as removable chips, plus a dropdown of the remaining options. */
function MultiSelect({
  id, options, value, onChange, disabled, error, label,
}: {
  id: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  disabled: boolean;
  error: boolean;
  label: string;
}) {
  const remaining = options.filter((o) => !value.includes(o));
  return (
    <div
      className={`flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 shadow-sm ${
        error ? 'border-red-300' : 'border-gray-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30'
      } ${disabled ? 'bg-gray-100' : ''}`}
    >
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-blue-700">
          {v}
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== v))}
              className="flex h-4 w-4 items-center justify-center rounded-full text-blue-500 hover:bg-blue-100 hover:text-blue-800"
              aria-label={`Remove ${v}`}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <Select
          id={id}
          value=""
          onChange={(e) => e.target.value && onChange([...value, e.target.value])}
          disabled={remaining.length === 0}
          aria-label={`Add to ${label}`}
          className="min-w-[160px] flex-1 border-0 bg-transparent py-1 text-sm text-gray-700 focus:outline-none focus:ring-0"
        >
          <option value="">{options.length === 0 ? 'No options yet (add in Masters)' : remaining.length ? (value.length ? 'Add another…' : 'Select…') : 'All selected'}</option>
          {remaining.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
      )}
      {disabled && value.length === 0 && <span className="px-1 text-sm text-gray-400">—</span>}
    </div>
  );
}

/** Older records stored "English, Hindi" as text; turn it into a list of known options. */
function normalizeMultiselects(r: EmployeeProfileResponse, values: Record<string, Values>) {
  for (const s of r.sections) {
    for (const f of s.groups.flatMap((g) => g.fields ?? [])) {
      if (f.type !== 'multiselect') continue;
      const v = values[s.key]?.[f.key];
      if (typeof v === 'string') {
        const byLower = new Map((f.options ?? []).map((o) => [o.toLowerCase(), o]));
        values[s.key][f.key] = v.split(',').map((x) => byLower.get(x.trim().toLowerCase())).filter((x): x is string => !!x);
      }
    }
  }
  return values;
}

/** Keys a section may send: its fields, repeatable lists, addresses and salary keys. Older stored keys are dropped. */
function allowedKeys(section: ProfileSectionDef): Set<string> {
  const keys = new Set<string>();
  for (const g of section.groups) {
    for (const f of g.fields ?? []) keys.add(f.key);
    if (g.rows) keys.add(g.rows.key);
    if (g.addressLevels) keys.add(ADDRESS_KEY[g.addressLevels]);
    if (g.salaryComponents) { keys.add('salaryTemplateId'); keys.add('componentAmounts'); }
  }
  return keys;
}

function pickKeys(section: ProfileSectionDef, v: Values | undefined): Values {
  const keys = allowedKeys(section);
  return Object.fromEntries(Object.entries(v ?? {}).filter(([k]) => keys.has(k)));
}

function hasContent(v: Values): boolean {
  return Object.values(v).some((x) => (Array.isArray(x) ? x.length > 0 : x && typeof x === 'object' ? Object.values(x).some((y) => y !== '' && y !== null && y !== undefined) : x !== '' && x !== null && x !== undefined));
}

/** Admin-defined field type (planning/system_application_module.md §E) -> Control's internal type. */
const CUSTOM_FIELD_TYPE_MAP: Record<string, string> = {
  Text: 'text',
  Textarea: 'textarea',
  Number: 'number',
  Decimal: 'decimal',
  Date: 'date',
  Dropdown: 'select',
  'Multi-select': 'multiselect',
  Radio: 'radio',
  Checkbox: 'checkbox',
  Email: 'email',
  Phone: 'tel',
  URL: 'url',
  'Yes/No': 'yn',
};

function Control({
  def, value, onChange, disabled, error, id,
}: {
  def: { type: string; options?: string[]; items?: { value: string; label: string }[]; mono?: boolean; maxLength?: number; label: string; placeholder?: string };
  value: any;
  onChange: (v: any) => void;
  disabled: boolean;
  error: boolean;
  id: string;
}) {
  const common = { id, disabled, className: inputClass(disabled, error, def.mono), placeholder: def.placeholder };
  if (def.type === 'multiselect') {
    return <MultiSelect id={id} options={def.options ?? []} value={Array.isArray(value) ? value : []} onChange={onChange} disabled={disabled} error={error} label={def.label} />;
  }
  if (def.type === 'select') {
    return (
      <Select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{(def.items ?? def.options ?? []).length ? 'Select' : 'No options yet'}</option>
        {def.items
          ? def.items.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)
          : (def.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </Select>
    );
  }
  if (def.type === 'yn') {
    return (
      <Select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </Select>
    );
  }
  if (def.type === 'textarea') {
    return <textarea {...common} rows={3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
  if (def.type === 'radio') {
    return (
      <div className="flex flex-wrap gap-4 pt-1.5">
        {(def.options ?? []).map((o) => (
          <label key={o} className="flex items-center gap-1.5 text-sm text-gray-700">
            <input type="radio" name={id} disabled={disabled} checked={value === o} onChange={() => onChange(o)} />
            {o}
          </label>
        ))}
      </div>
    );
  }
  if (def.type === 'checkbox') {
    return (
      <input
        id={id}
        type="checkbox"
        disabled={disabled}
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
    );
  }
  const isNumeric = def.type === 'number' || def.type === 'decimal';
  const type = def.type === 'date' ? 'date' : isNumeric ? 'number' : def.type === 'email' ? 'email' : def.type === 'tel' ? 'tel' : def.type === 'url' ? 'url' : 'text';
  return (
    <input
      {...common}
      type={type}
      value={value ?? ''}
      min={isNumeric ? 0 : undefined}
      step={def.type === 'decimal' ? 'any' : undefined}
      onChange={(e) => onChange(isNumeric ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
    />
  );
}

function FieldBox({
  label, required, hint, wide, error, children,
}: { label: string; required?: boolean; hint?: string; wide?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className={wide ? 'col-span-full' : ''}>
      <label className="mb-1.5 block text-xs font-medium text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function EmployeeProfilePage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const isNew = router.query.id === 'new';
  const empId = isNew ? 0 : Number(router.query.id);

  const [data, setData] = useState<EmployeeProfileResponse | null>(null);
  const [values, setValues] = useState<Record<string, Values>>({});
  const [saved, setSaved] = useState<Record<string, Values>>({});
  const [custom, setCustom] = useState<Values>({});
  const [savedCustom, setSavedCustom] = useState<Values>({});
  const [section, setSection] = useState('personal');
  const [errors, setErrors] = useState<FieldErrorItem[]>([]);
  const [notice, setNotice] = useState('');
  // Login (System Access): the result of the last create or send, and the temporary password shown once.
  const [loginNote, setLoginNote] = useState<{ tone: 'ok' | 'info' | 'warn'; text: string; password?: string | null } | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const toast = useToast();
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Record<string, string>>({});
  // Add Employee mode
  const [newCountry, setNewCountry] = useState('IN');
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [sectionErrors, setSectionErrors] = useState<Record<string, FieldErrorItem[]>>({});
  const [creating, setCreating] = useState(false);

  // New employee: a blank nine-section form for the chosen country.
  useEffect(() => {
    if (!isAuthenticated || !isNew) return;
    getBlankProfile(newCountry)
      .then((res) => {
        const b = res.data;
        setData({
          employee: { id: 0, employeeCode: '', name: '', isActive: true, hasPhoto: false, country: b.country, currency: b.currency, addressLevels: b.addressLevels },
          canEdit: true,
          sections: b.sections,
          values: {},
          customFields: b.customFields,
          custom: {},
          salaryTemplates: b.salaryTemplates,
        });
        setValues((prev) => {
          const next = { ...prev };
          next.organization = { ...(prev.organization ?? {}), legalEntityCountry: b.country };
          return next;
        });
      })
      .catch((err) => setLoadError(err.message || 'Failed to load the employee form'));
  }, [isAuthenticated, isNew, newCountry]);

  // Changing "Country of employment" reloads the form for that country (address, bank, statutory fields).
  const chosenCountry = values.organization?.legalEntityCountry;
  useEffect(() => {
    if (isNew && chosenCountry && chosenCountry !== newCountry) setNewCountry(chosenCountry);
  }, [isNew, chosenCountry, newCountry]);

  useEffect(() => {
    if (!isAuthenticated || !empId) return;
    getEmployeeProfile(empId)
      .then((res) => {
        const r = res.data;
        setData(r);
        const v = normalizeMultiselects(r, cloneJson(r.values));
        setValues(v);
        setSaved(cloneJson(v));
        setCustom(cloneJson(r.custom));
        setSavedCustom(cloneJson(r.custom));
      })
      .catch((err) => setLoadError(err.message || 'Failed to load profile'));
  }, [isAuthenticated, empId]);

  // Dependents live outside the schema-driven sections (own endpoints, saved inline), so add it here.
  const sections: ProfileSectionDef[] = [
    ...(data?.sections ?? []),
    ...(data && !isNew
      ? [{ key: 'dependents', title: 'Dependents', group: 'Records', hrOnly: false, description: 'Spouse, children and other family members.', groups: [] } as ProfileSectionDef]
      : []),
  ];
  const current = sections.find((s) => s.key === section) ?? sections[0];
  const canEdit = !!data?.canEdit;
  // Country options come from the Organization schema; currency follows the country (same mapping as the server).
  const headerCountryOptions = (sections
    .find((s) => s.key === 'organization')?.groups.flatMap((g) => g.fields ?? [])
    .find((f) => f.key === 'legalEntityCountry')?.options ?? []) as string[];
  const CURRENCY_BY_COUNTRY: Record<string, string> = { IN: 'INR', AE: 'AED', GB: 'GBP', US: 'USD' };

  const sectionCustom = (key: string) => (data?.customFields ?? []).filter((c) => c.tabKey === key);
  const isDirty = (key: string) => {
    const v = JSON.stringify(values[key] ?? {}) !== JSON.stringify(saved[key] ?? {});
    const c = sectionCustom(key).some((f) => JSON.stringify(custom[f.code]) !== JSON.stringify(savedCustom[f.code]));
    return v || c;
  };
  const dirtyCount = sections.filter((s) => isDirty(s.key)).length;

  const setField = (key: string, field: string, value: any) => {
    setValues((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [field]: value } }));
    // Editing a field clears that field's "create employee" error so the red marker goes away.
    setSectionErrors((prev) => {
      const list = prev[key]?.filter((e) => e.field !== field && !e.field.startsWith(`${field}[`));
      if (!prev[key] || list?.length === prev[key].length) return prev;
      const next = { ...prev };
      if (list && list.length) next[key] = list;
      else delete next[key];
      return next;
    });
  };

  const fieldError = (name: string) =>
    errors.find((e) => e.field === name)?.message ?? (current ? sectionErrors[current.key]?.find((e) => e.field === name)?.message : undefined);

  const save = async () => {
    if (!current || !data) return;
    setSaving(true);
    setErrors([]);
    setNotice('');
    const customForSection = Object.fromEntries(sectionCustom(current.key).map((f) => [f.code, custom[f.code] ?? '']));
    try {
      const res = await saveEmployeeProfileSection(data.employee.id, current.key, pickKeys(current, values[current.key]), customForSection);
      const newValues = { ...values, [current.key]: res.data.values };
      setValues(newValues);
      setSaved((prev) => ({ ...prev, [current.key]: cloneJson(res.data.values) }));
      setSavedCustom((prev) => ({ ...prev, ...cloneJson(customForSection) }));
      setSavedAt((prev) => ({ ...prev, [current.key]: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }));
      toast.success(`${current.title} saved`);
      if (data.employee.country && current.key === 'organization') {
        getEmployeeProfile(data.employee.id).then((r) => setData(r.data));
      }
      // Login enabled on System Access: create the login now, with a temporary password.
      if (current.key === 'access' && res.data.values.loginEnabled === 'Yes') {
        await createLogin(data.employee.id, true);
      }
    } catch (err: any) {
      setErrors((err.errors as FieldErrorItem[]) ?? []);
      setNotice(err.message || 'Could not save this section');
      toast.error(err.message || 'Could not save this section');
    } finally {
      setSaving(false);
    }
  };

  /** Creates the login for an employee (System Access). Shows the temporary password once. */
  const createLogin = async (employeeId: number, automatic = false) => {
    setLoginBusy(true);
    try {
      const r = await createEmployeeLogin(employeeId);
      const d = r.data;
      if (d.created) toast.success(`Login created for ${d.username}. Copy the temporary password now.`);
      else toast.info(`This employee already has a login (${d.username}).`);
      setLoginNote(
        d.created
          ? { tone: 'ok', text: `Login created. Username: ${d.username}. Share the temporary password below, or email it. The employee must choose a new password at first sign-in.`, password: d.temporaryPassword }
          : { tone: 'info', text: `This employee already has a login (username ${d.username}).` },
      );
    } catch (e: any) {
      // Automatic creation after a save: say why it did not happen; the Create login button is still there.
      setLoginNote({ tone: 'warn', text: automatic ? `Saved, but the login was not created: ${e.message}` : e.message || 'Could not create the login' });
      toast.error(automatic ? `Saved, but the login was not created: ${e.message}` : e.message || 'Could not create the login');
    } finally {
      setLoginBusy(false);
    }
  };

  const sendLogin = async () => {
    if (!data) return;
    setLoginBusy(true);
    try {
      const r = await sendEmployeeLoginDetails(data.employee.id);
      setLoginNote({ tone: 'ok', text: `Login details emailed to ${r.data.sentTo}. The temporary password was changed, so an earlier one no longer works.` });
      toast.success(`Login details emailed to ${r.data.sentTo}`);
    } catch (e: any) {
      setLoginNote({ tone: 'warn', text: e.message || 'Could not send the login details' });
      toast.error(e.message || 'Could not send the login details');
    } finally {
      setLoginBusy(false);
    }
  };

  /** Add Employee: check every section, create the employee, then save each filled section. */
  const createAll = async () => {
    if (!data) return;
    setErrors([]);
    setNotice('');
    const personal = values.personal ?? {};
    const employment = values.employment ?? {};
    if (!String(employment.employmentType ?? '').trim()) {
      setNotice('Choose an employment type in the Employment section: the employee code is generated from it.');
      setSection('employment');
      return;
    }
    const payload: Record<string, { data: Values; custom: Values }> = {};
    for (const s of data.sections) {
      payload[s.key] = {
        data: pickKeys(s, values[s.key]),
        custom: Object.fromEntries(
          sectionCustom(s.key)
            .filter((c) => custom[c.code] !== undefined && custom[c.code] !== '')
            .map((c) => [c.code, custom[c.code]]),
        ),
      };
    }
    setCreating(true);
    try {
      const check = await validateNewProfile(data.employee.country, payload);
      if (!check.data.valid) {
        setSectionErrors(check.data.errors);
        const first = data.sections.find((s) => check.data.errors[s.key]?.length);
        if (first) setSection(first.key);
        const n = Object.keys(check.data.errors).length;
        setNotice(`Please fix the highlighted fields in ${n} section${n > 1 ? 's' : ''} (marked red) before creating the employee.`);
        return;
      }
      setSectionErrors({});
      const created = await createEmployee({
        firstName: personal.firstName,
        middleName: personal.middleName || undefined,
        lastName: personal.lastName || undefined,
        email: personal.personalEmail || undefined,
        employmentType: String(employment.employmentType),
        dateOfJoining: employment.dateOfJoining || undefined,
        designation: values.organization?.designation || undefined,
        workEmail: personal.officialEmail || undefined,
        // The branch chosen in Organization: a branch with a code prefix numbers its own employees.
        branchId: Number(values.organization?.branch) || undefined,
      } as any);
      const id = created.data.id;
      const failed: string[] = [];
      for (const s of data.sections) {
        const body = payload[s.key];
        if (!hasContent(body.data) && !hasContent(body.custom)) continue;
        try {
          await saveEmployeeProfileSection(id, s.key, body.data, body.custom);
        } catch {
          failed.push(s.title);
        }
      }
      let photoFailed = false;
      if (pendingPhoto) {
        try {
          await uploadEmployeePhoto(id, pendingPhoto);
        } catch {
          photoFailed = true;
        }
      }
      const q = new URLSearchParams();
      if (photoFailed) q.set('photoError', '1');
      if (failed.length) q.set('unsaved', failed.join(', '));
      const qs = q.toString();
      router.replace(`/employee-profile/${id}${qs ? `?${qs}` : ''}`);
    } catch (err: any) {
      setErrors((err.errors as FieldErrorItem[]) ?? []);
      setNotice(err.message || 'Could not create the employee');
    } finally {
      setCreating(false);
    }
  };

  /** Leaves the profile and goes back to the employee list. Unsaved changes in any section are discarded, after a warning. */
  const cancel = () => {
    if (dirtyCount > 0 && !window.confirm('Discard the unsaved changes and go back to the employee list?')) return;
    router.push('/employees');
  };

  const renderField = (sec: string, f: ProfileFieldDef, value: any, onChange: (v: any) => void, keyName: string, idx?: number) => (
    <FieldBox key={keyName} label={f.label} required={f.required} hint={f.hint} wide={f.wide} error={fieldError(keyName)}>
      <Control
        id={`${sec}-${keyName}-${idx ?? ''}`}
        def={{ type: f.type, options: f.options, items: f.optionItems, mono: f.mono, maxLength: f.maxLength, label: f.label }}
        value={value}
        onChange={onChange}
        disabled={!canEdit}
        error={!!fieldError(keyName)}
      />
    </FieldBox>
  );

  /** Address card: country-specific levels; the permanent card has a "same as present" checkbox. */
  const renderAddressCard = (sec: string, g: ProfileGroupDef) => {
    const v = values[sec] ?? {};
    const key = ADDRESS_KEY[g.addressLevels as string];
    const levels = data?.employee.addressLevels ?? [];
    const list: string[] = Array.isArray(v[key]) ? v[key] : [];
    const sameKey = g.sameAsKey;
    const same = !!sameKey && v[sameKey] === 'Yes';
    return (
      <div className="min-w-0 rounded-lg border border-gray-200 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h5 className="text-sm font-semibold text-gray-900">{g.title}</h5>
          {sameKey && (
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={same}
                disabled={!canEdit}
                onChange={(e) => setField(sec, sameKey, e.target.checked ? 'Yes' : 'No')}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Same as present address
            </label>
          )}
        </div>
        {same ? (
          <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-500">Uses the present address.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {levels.map((label, i) => (
              <FieldBox key={i} label={label}>
                <Control
                  id={`${sec}-${key}-${i}`}
                  def={{ type: 'text', label }}
                  value={list[i] ?? ''}
                  onChange={(val) => {
                    const next = [...list];
                    next[i] = val;
                    setField(sec, key, next);
                  }}
                  disabled={!canEdit}
                  error={false}
                />
              </FieldBox>
            ))}
          </div>
        )}
      </div>
    );
  };

  const gridCols = (n?: number) =>
    n === 2 ? 'md:grid-cols-2' : n === 4 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-2 xl:grid-cols-3';

  const renderGroup = (sec: string, g: ProfileGroupDef, gi: number) => {
    const v = values[sec] ?? {};
    if (g.showWhen && v[g.showWhen.key] !== g.showWhen.equals) return null;

    if (g.addressLevels) return <div key={gi}>{renderAddressCard(sec, g)}</div>;

    if (g.rows) {
      const rows: Values[] = Array.isArray(v[g.rows.key]) ? v[g.rows.key] : [];
      const updateRows = (next: Values[]) => setField(sec, g.rows!.key, next);
      return (
        <div key={gi} className="space-y-3">
          {rows.length === 0 && <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">No records yet.</div>}
          {rows.map((row, i) => (
            <div key={i} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between text-sm font-medium text-gray-700">
                <span>{g.rows!.label} {i + 1}</span>
                {canEdit && (
                  <button type="button" className="text-xs font-medium text-red-600 hover:text-red-800" onClick={() => updateRows(rows.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {g.rows!.fields.map((f) => {
                  const name = `${g.rows!.key}[${i}].${f.key}`;
                  return (
                    <FieldBox key={f.key} label={f.label} required={f.required} error={fieldError(name)} wide={false}>
                      <Control
                        id={`${sec}-${g.rows!.key}-${i}-${f.key}`}
                        def={{ type: f.type, options: f.options, mono: f.mono, label: f.label }}
                        value={row[f.key]}
                        onChange={(val) => {
                          const next = rows.map((r, j) => (j === i ? { ...r, [f.key]: val } : r));
                          updateRows(next);
                        }}
                        disabled={!canEdit}
                        error={!!fieldError(name)}
                      />
                    </FieldBox>
                  );
                })}
              </div>
            </div>
          ))}
          {canEdit && rows.length < g.rows.max && (
            <button
              type="button"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              onClick={() => updateRows([...rows, Object.fromEntries(g.rows!.fields.map((f) => [f.key, f.type === 'select' && f.key === 'documentType' ? '' : '']))])}
            >
              + {g.rows.addLabel}
            </button>
          )}
        </div>
      );
    }

    return (
      <div key={gi} className={`grid grid-cols-1 gap-4 ${gridCols(g.columns)}`}>
        {(g.fields ?? [])
          // Country of employment is shown and changed in the header, not on the Organization tab.
          .filter((f) => !(sec === 'organization' && f.key === 'legalEntityCountry'))
          .filter((f) => !f.showWhen || String(v[f.showWhen.key] ?? '') === f.showWhen.equals)
          .map((f) => renderField(sec, f, v[f.key], (val) => setField(sec, f.key, val), f.key))}
      </div>
    );
  };

  if (loadError) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>;
  if (!data || !current) return <div className="text-sm text-gray-500">Loading employee profile…</div>;

  const orgv = values.organization ?? {};
  const emp = data.employee;
  const personalV = values.personal ?? {};
  const typedName = [personalV.firstName, personalV.middleName, personalV.lastName].filter(Boolean).join(' ');
  const displayName = isNew ? typedName || 'New employee' : emp.name;
  const initials = isNew && !typedName ? '+' : displayName.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase();
  const managerField = sections.flatMap((s) => s.groups.flatMap((g) => g.fields ?? [])).find((f) => f.key === 'reportingManager');
  const managerLabel =
    managerField?.optionItems?.find((o) => o.value === String(values.employment?.reportingManager ?? ''))?.label ?? (values.employment?.reportingManager || '');
  const branchField = sections.flatMap((s) => s.groups.flatMap((g) => g.fields ?? [])).find((f) => f.key === 'branch');
  const branchLabel = branchField?.optionItems?.find((o) => o.value === String(orgv.branch ?? ''))?.label ?? '';
  const groupsByName = sections.reduce<Record<string, ProfileSectionDef[]>>((acc, s) => {
    (acc[s.group] = acc[s.group] || []).push(s);
    return acc;
  }, {});
  const sectionNumber = (key: string) => sections.findIndex((s) => s.key === key) + 1;

  return (
    <div className="space-y-6">
      {router.query.photoError && (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The employee was created, but the photo could not be uploaded. Use “Upload photo” to try again.
        </div>
      )}

      {router.query.unsaved && (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The employee was created, but these sections could not be saved: {String(router.query.unsaved)}. Open them and save again.
        </div>
      )}

      {/* Header card */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start gap-5">
          <EmployeePhoto
            key={isNew ? 'new' : emp.id}
            employeeId={isNew ? undefined : emp.id}
            initials={initials}
            canEdit={canEdit}
            hasPhoto={emp.hasPhoto}
            onStage={setPendingPhoto}
          />
          <div className="min-w-[220px] flex-1">
            <h2 className="text-xl font-semibold text-gray-900">{displayName}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              {isNew ? (
                <span className="inline-flex items-center gap-2 text-xs text-gray-600">
                  Employee code
                  <span className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-2 py-1 font-mono text-[12px] text-gray-500">
                    Generated on save from the employment type
                  </span>
                </span>
              ) : (
                <span className="font-mono">{emp.employeeCode}</span>
              )}
              <span>·</span>
              <span>{orgv.designation || '—'}{orgv.department ? `, ${orgv.department}` : ''}</span>
              {isNew ? <Pill tone="info">New</Pill> : <Pill tone={emp.isActive ? 'ok' : 'warn'}>{emp.isActive ? 'Active' : 'Inactive'}</Pill>}
              {!isNew && dirtyCount > 0 && <Pill tone="warn">{dirtyCount} unsaved section{dirtyCount > 1 ? 's' : ''}</Pill>}
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-gray-200 pt-4 md:grid-cols-5">
          <div><p className="text-xs text-gray-500">Branch</p><p className="text-sm font-medium text-gray-900">{branchLabel || '—'}</p></div>
          <div><p className="text-xs text-gray-500">Employment type</p><p className="text-sm font-medium text-gray-900">{values.employment?.employmentType || '—'}</p></div>
          <div><p className="text-xs text-gray-500">Joining date</p><p className="text-sm font-medium text-gray-900">{values.employment?.dateOfJoining || '—'}</p></div>
          <div><p className="text-xs text-gray-500">Reporting manager</p><p className="text-sm font-medium text-gray-900">{managerLabel || '—'}</p></div>
          <div>
            <p className="text-xs text-gray-500">Country · currency</p>
            {canEdit ? (
              <div className="mt-0.5 flex items-center gap-2">
                <select
                  aria-label="Country of employment"
                  className="rounded-md border border-gray-300 px-2 py-1 text-sm font-medium text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  value={chosenCountry || emp.country}
                  onChange={(e) => setField('organization', 'legalEntityCountry', e.target.value)}
                >
                  {headerCountryOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <span className="text-sm font-medium text-gray-900">· {CURRENCY_BY_COUNTRY[chosenCountry || emp.country] ?? emp.currency}</span>
              </div>
            ) : (
              <p className="text-sm font-medium text-gray-900">{emp.country} · {emp.currency}</p>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Section navigation */}
        <nav aria-label="Profile sections" className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm lg:sticky lg:top-6 lg:col-span-3 lg:self-start">
          {Object.entries(groupsByName).map(([group, items]) => (
            <div key={group}>
              <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{group}</p>
              {items.map((s) => {
                const active = s.key === current.key;
                const dirty = isDirty(s.key);
                return (
                  <button
                    key={s.key}
                    type="button"
                    aria-current={active ? 'true' : undefined}
                    onClick={() => { setSection(s.key); setErrors([]); setNotice(''); }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
                  >
                    <span className="w-5 text-xs text-gray-400">{String(sectionNumber(s.key)).padStart(2, '0')}</span>
                    <span className="flex-1">{s.title}</span>
                    {sectionErrors[s.key]?.length ? (
                      <span className="h-2 w-2 rounded-full bg-red-500" title="Has errors" />
                    ) : !isNew && dirty ? (
                      <span className="h-2 w-2 rounded-full bg-amber-500" title="Unsaved changes" />
                    ) : !isNew && savedAt[s.key] ? (
                      <span className="text-xs text-green-600">✓</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Section content */}
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-9">
          <div className="mb-5 flex flex-wrap items-start gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{current.title}</h3>
              <p className="mt-1 text-sm text-gray-500">{current.description}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {current.hrOnly && <Pill tone="info">HR only</Pill>}
              {isNew ? null : isDirty(current.key) ? <Pill tone="warn">Unsaved changes</Pill> : savedAt[current.key] ? <Pill tone="ok">Saved {savedAt[current.key]}</Pill> : null}
            </div>
          </div>

          {!canEdit && (
            <div className="mb-5 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">Read-only for your role. Contact HR to change this information.</div>
          )}
          {notice && (
            <div className={`mb-5 rounded-lg px-4 py-3 text-sm ${errors.length || Object.keys(sectionErrors).length ? 'border border-red-200 bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>
              {notice}
              {errors.length > 0 && (
                <ul className="mt-2 list-disc pl-5">
                  {errors.map((e, i) => <li key={i}>{e.message}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="space-y-8">
            {current.key === 'documents' && (
              isNew ? (
                <p className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">Save the employee first, then add documents and upload files from this section.</p>
              ) : (
                <EmployeeDocuments employeeId={empId} canEdit={canEdit} />
              )
            )}
            {current.key === 'dependents' && !isNew && <EmployeeDependants employeeId={empId} canEdit={canEdit} />}
            {current.key === 'access' && !isNew && (
              <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">Login</p>
                    <p className="mt-0.5 text-xs text-gray-500">Saving with Login enabled creates the login with a temporary password. You can also email the login details to the employee.</p>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button type="button" onClick={() => createLogin(data.employee.id)} disabled={loginBusy} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Create login</button>
                      <button type="button" onClick={sendLogin} disabled={loginBusy} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">Send login details by email</button>
                    </div>
                  )}
                </div>
                {loginNote && (
                  <div className={`mt-3 rounded-lg border px-3.5 py-2.5 text-sm ${loginNote.tone === 'ok' ? 'border-green-200 bg-green-50 text-green-800' : loginNote.tone === 'warn' ? 'border-red-200 bg-red-50 text-red-700' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
                    <p>{loginNote.text}</p>
                    {loginNote.password && (
                      <p className="mt-2 flex flex-wrap items-center gap-3">
                        <span>Temporary password:</span>
                        <code className="rounded bg-white px-2 py-1 font-mono text-[13px] text-gray-900">{loginNote.password}</code>
                        <button type="button" onClick={() => navigator.clipboard?.writeText(loginNote.password!).catch(() => undefined)} className="text-xs font-medium text-blue-700 hover:text-blue-900">Copy</button>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            {current.key !== 'documents' && current.key !== 'dependents' && current.groups.map((g, gi) => {
              // Hide conditional groups before rendering their heading.
              if (g.showWhen && (values[current.key] ?? {})[g.showWhen.key] !== g.showWhen.equals) return null;
              const headingClass =
                'mb-3 flex items-center gap-2 border-t border-gray-100 pt-5 text-xs font-semibold uppercase tracking-wider text-gray-500';
              // Present + permanent address render together, side by side, under one "Addresses" heading.
              if (g.addressLevels === 'permanent' && current.groups[gi - 1]?.addressLevels === 'present') return null;
              if (g.addressLevels === 'present') {
                const next = current.groups[gi + 1];
                return (
                  <div key={gi}>
                    <h4 className={headingClass}>
                      Addresses <Pill tone="info">{emp.country} address format</Pill>
                    </h4>
                    {/* Side by side only on wide screens; stacked otherwise so address fields keep a usable width */}
                    <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                      {renderAddressCard(current.key, g)}
                      {next?.addressLevels === 'permanent' && renderAddressCard(current.key, next)}
                    </div>
                  </div>
                );
              }
              return (
                <div key={gi}>
                  <h4 className={`${headingClass} ${gi === 0 ? 'border-t-0 pt-0' : ''}`}>{g.title}</h4>
                  {renderGroup(current.key, g, gi)}
                </div>
              );
            })}

            {sectionCustom(current.key).length > 0 && (
              <div className="border-t border-gray-100 pt-5">
                {/* Admin-defined fields appear as ordinary fields of the section (no separate heading). */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {sectionCustom(current.key).map((f) => (
                    <FieldBox key={f.code} label={f.label} required={f.isRequired} hint={f.helpText ?? undefined} error={fieldError(f.code)}>
                      <Control
                        id={`custom-${f.code}`}
                        def={{
                          type: CUSTOM_FIELD_TYPE_MAP[f.fieldType] ?? 'text',
                          options: f.options,
                          label: f.label,
                          placeholder: f.placeholder ?? undefined,
                        }}
                        value={custom[f.code]}
                        onChange={(val) => setCustom((prev) => ({ ...prev, [f.code]: val }))}
                        disabled={!canEdit}
                        error={!!fieldError(f.code)}
                      />
                    </FieldBox>
                  ))}
                </div>
              </div>
            )}
          </div>

          {isNew && (
            <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-gray-200 pt-5">
              <p className="text-sm text-gray-500">Fill in the sections you need, then create the employee. Sections with required fields are checked together.</p>
              <div className="ml-auto flex gap-2">
                <button type="button" onClick={() => router.push('/employees')} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                  Cancel
                </button>
                <button type="button" onClick={createAll} disabled={creating} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60">
                  {creating ? 'Creating…' : 'Create employee'}
                </button>
              </div>
            </div>
          )}
          {canEdit && !isNew && current.key !== 'documents' && current.key !== 'dependents' && (
            <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-gray-200 pt-5">
              <p className="text-sm text-gray-500">{isDirty(current.key) ? 'You have changes in this section. Save to keep them.' : 'No unsaved changes.'}</p>
              <div className="ml-auto flex gap-2">
                <button type="button" onClick={cancel}  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                  Cancel
                </button>
                <button type="button" onClick={save} disabled={!isDirty(current.key) || saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Saving…' : `Save ${current.title.toLowerCase()}`}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
