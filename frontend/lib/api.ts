// Vercel service binding is available at runtime in server functions only.
// Browser requests use the same-origin /api/v1 path that Vercel rewrites to the backend service.
// Under `next dev` there is no Vercel rewrite, so the browser calls the API on port 3000 directly.
const LOCAL_API_BASE_URL = 'http://localhost:3000/api/v1';

export const API_BASE_URL =
  typeof window === 'undefined'
    ? (process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:3000/api/v1')
    : (process.env.NEXT_PUBLIC_API_BASE_URL ||
        (process.env.NODE_ENV === 'development' ? LOCAL_API_BASE_URL : '/api/v1'));

export interface ApiEnvelope<T> {
  data: T;
  message?: { code: string; text: string };
  pagination?: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  mustChangePassword: boolean;
  user: {
    id: number;
    username: string;
    userTypeId: number;
    profileId: number;
  };
}

export interface UserType {
  id: number;
  name: string;
  isActive: boolean;
}

export interface User {
  id: number;
  username: string;
  userTypeId: number;
  profileId: number;
  isActive: boolean;
  allBranches?: boolean;
  branches?: { branchId: number }[];
  userType: { id: number; name: string };
  profile: {
    id: number;
    name: string;
    middleName?: string | null;
    lastName?: string;
    email?: string;
    contactNo?: string;
    isSiteAccess: boolean;
  };
}

export interface CreateUserPayload {
  username: string;
  /** Leave out to have a temporary password generated (returned once). */
  password?: string;
  userTypeId: number;
  /** Used for password reset emails. */
  email?: string;
  /** Make the account for this existing person (employee) instead of a new blank profile. */
  profileId?: number;
  allBranches?: boolean;
  branchIds?: number[];
}

export interface UpdateUserPayload {
  /** Email on the account's profile (password reset emails). An empty text clears it. */
  email?: string;
  userTypeId?: number;
  isActive?: boolean;
  allBranches?: boolean;
  branchIds?: number[];
}

export interface Dependant {
  id: number;
  employeeProfileId: number;
  dependantProfileId: number;
  relationTypeId?: number;
  dependantProfile: {
    id: number;
    name: string;
    lastName?: string;
    email?: string;
    contactNo?: string;
    dateOfBirth?: string;
    genderId?: number;
  };
}

export interface CreateDependantPayload {
  firstName: string;
  lastName?: string;
  email?: string;
  contactNo?: string;
  dateOfBirth?: string;
  genderId?: number;
  relationTypeId?: number;
}

export interface Parameter {
  id: number;
  text: string;
  parameterValue: number;
  code?: string | null;
  parameterTypeId: number;
  parameterType?: { id: number; name: string };
}

export interface Employee {
  id: number;
  employeeCode: string;
  profileId: number;
  branch?: { id: number; name: string } | null;
  reportingToId?: number;
  sourceOfHireId?: number;
  locationId?: number;
  siteId?: number;
  employeeStatusId?: number;
  employeeTypeId?: number;
  contractTypeId?: number;
  workPhone?: string;
  extension?: string;
  workEmail?: string;
  dateOfJoining: string;
  dateOfConfirmation?: string;
  personIdNumber?: string;
  designation?: string;
  shiftId?: number;
  /** The branch the employee joins; a branch with a code prefix numbers its own employees. */
  branchId?: number;
  isActive: boolean;
  /** Country of employment (Organization section). Only present on GET /employees/:id. */
  country?: string;
  profile: {
    id: number;
    name: string;
    middleName?: string;
    lastName?: string;
    email?: string;
    contactNo?: string;
    dateOfBirth?: string;
    maritalStatusId?: number;
    genderId?: number;
    bloodGroupId?: number;
    nationalityId?: number;
    visaTypeId?: number;
    motherTongueId?: number;
    address?: string;
    homeCountryAddress?: string;
    homeCountryPhoneNo?: string;
    qualification?: string;
    dateOfExit?: string;
    exitReasonCode?: number;
    isSiteAccess: boolean;
  };
  site?: { id: number; name: string };
  shift?: { id: number; name: string };
  reportingTo?: {
    id: number;
    employeeCode: string;
    profile: { name: string; lastName?: string };
  };
}

export interface CreateEmployeePayload {
  firstName: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  contactNo?: string;
  dateOfBirth?: string;
  maritalStatusId?: number;
  genderId?: number;
  bloodGroupId?: number;
  nationalityId?: number;
  visaTypeId?: number;
  motherTongueId?: number;
  address?: string;
  homeCountryAddress?: string;
  homeCountryPhoneNo?: string;
  qualification?: string;
  dateOfExit?: string;
  exitReasonCode?: number;
  employeeCode: string;
  reportingToId?: number;
  sourceOfHireId?: number;
  locationId?: number;
  siteId?: number;
  employeeStatusId?: number;
  employeeTypeId?: number;
  contractTypeId?: number;
  workPhone?: string;
  extension?: string;
  workEmail?: string;
  dateOfJoining: string;
  dateOfConfirmation?: string;
  personIdNumber?: string;
  designation?: string;
  shiftId?: number;
  isSiteAccess?: boolean;
}

export interface UpdateEmployeePayload extends Partial<CreateEmployeePayload> {
  isActive?: boolean;
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) {
    localStorage.setItem('accessToken', token);
  } else {
    localStorage.removeItem('accessToken');
  }
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return accessToken || localStorage.getItem('accessToken');
}

export function setRefreshToken(token: string | null) {
  if (token) {
    localStorage.setItem('refreshToken', token);
  } else {
    localStorage.removeItem('refreshToken');
  }
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('refreshToken');
}

export function clearTokens() {
  accessToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }
}

let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

async function doRefresh(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token');

  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message?.text || res.statusText);
  }

  setAccessToken(json.data.accessToken);
  setRefreshToken(json.data.refreshToken);
  return json.data.accessToken as string;
}

async function refreshTokens(): Promise<string> {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshPromise = doRefresh()
      .finally(() => {
        isRefreshing = false;
        refreshPromise = null;
      });
  }
  if (!refreshPromise) throw new Error('Refresh not initialized');
  return refreshPromise;
}

const BRANCH_KEY = 'hrms.branchId';

/** Branch chosen in the header switcher (null = all). Sent with every request as X-Branch-Id. */
export function getSelectedBranchId(): number | null {
  try {
    const v = Number(localStorage.getItem(BRANCH_KEY));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function setSelectedBranchId(id: number | null) {
  try {
    if (id === null) localStorage.removeItem(BRANCH_KEY);
    else localStorage.setItem(BRANCH_KEY, String(id));
  } catch {
    // storage unavailable: the choice just won't persist
  }
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
  isRetry = false,
): Promise<ApiEnvelope<T>> {
  const url = `${API_BASE_URL}${path}`;
  const token = getAccessToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const branchId = typeof window !== 'undefined' ? getSelectedBranchId() : null;
  if (branchId !== null) headers['X-Branch-Id'] = String(branchId);

  const response = await fetch(url, { ...options, headers });
  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && !isRetry && path !== '/auth/refresh' && getRefreshToken()) {
      try {
        await refreshTokens();
      } catch {
        clearTokens();
        throw new Error('Session expired. Please login again.');
      }
      return request<T>(path, options, true);
    }
    const error = new Error(json?.message?.text || response.statusText) as Error & { errors?: FieldErrorItem[] };
    error.errors = json?.errors;
    throw error;
  }

  return json as ApiEnvelope<T>;
}

export async function login(username: string, password: string) {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function logout() {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    await request('/auth/logout', {
      method: 'POST',
      headers: { 'X-Refresh-Token': refreshToken },
    }).catch(() => {
      // ignore
    });
  }
  clearTokens();
}

export async function refreshAccessToken() {
  const accessToken = await doRefresh();
  return { data: { accessToken } } as ApiEnvelope<Pick<LoginResponse, 'accessToken'>>;
}

export async function getUserTypes() {
  return request<UserType[]>('/rbac/user-types');
}

export async function getMyMenu() {
  return request<MenuNode[]>('/rbac/my-menu');
}

export interface MenuFlags {
  isCreate: boolean;
  isEdit: boolean;
  isDelete: boolean;
}

export interface MenuNode {
  id: number;
  name: string;
  pageUrl?: string | null;
  iconClass?: string | null;
  displayOrder: number;
  isMainMenu: boolean;
  isActive: boolean;
  permissions?: MenuFlags;
  children: MenuNode[];
}

export async function getUsers(params?: Record<string, string | number | boolean>) {
  const query = params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : '';
  return request<User[]>(`/users${query}`);
}

export interface LoginCandidate {
  profileId: number;
  employeeId: number;
  code: string;
  name: string;
  branchName: string | null;
  designation: string | null;
  /** From the employee's System Access tab, or the employee code. */
  username: string;
  accessRole: string | null;
}

/** Employees marked "Login enabled" on their System Access tab who have no account yet. */
export async function getLoginCandidates() {
  return request<LoginCandidate[]>('/users/candidates');
}

export async function createUser(payload: CreateUserPayload) {
  return request<User & { temporaryPassword?: string }>('/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateUser(id: number, payload: UpdateUserPayload) {
  return request<User>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deactivateUser(id: number) {
  return request<User>(`/users/${id}`, {
    method: 'DELETE',
  });
}

/** Without a password, one is generated and returned once. */
export async function resetUserPassword(id: number, newPassword?: string) {
  return request<{ temporaryPassword?: string }>(`/users/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify(newPassword ? { newPassword } : {}),
  });
}

export interface Document {
  id: number;
  documentTypeId: number;
  profileId: number;
  issueDate?: string;
  expiryDate?: string;
  identityNo?: string;
  documentTitle?: string;
  remarks?: string;
  isSelf: boolean;
  isActive: boolean;
  documentType: { id: number; name: string };
  profile: { id: number; name: string; lastName?: string };
  files?: { file: { id: number; originalName: string; mimeType: string; sizeBytes: number } }[];
}

export interface CreateDocumentPayload {
  profileId: number;
  documentTypeId: number;
  issueDate?: string;
  expiryDate?: string;
  identityNo?: string;
  documentTitle?: string;
  remarks?: string;
  isSelf?: boolean;
}

export async function getEmployees(params?: Record<string, string | number | boolean>) {
  const query = params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : '';
  return request<Employee[]>(`/employees${query}`);
}

export async function createEmployee(payload: CreateEmployeePayload) {
  return request<Employee>('/employees', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface MasterItem {
  id: number;
  name: string;
  isActive: boolean;
}

export interface DocumentTypeItem extends MasterItem {
  hasExpiry: boolean;
  /** Country.isoCode values this type applies to. Empty = every country. */
  countryCodes: string[];
}

export interface ShiftItem extends MasterItem {
  startTime: string;
  endTime: string;
  lateMinutes: number;
  halfDayMinutes: number;
  altStartTime: string | null;
  altEndTime: string | null;
}

export interface MasterItemPayload {
  name: string;
  isActive?: boolean;
}

export interface ShiftPayload {
  name: string;
  startTime: string;
  endTime: string;
  lateMinutes: number;
  halfDayMinutes: number;
  altStartTime?: string;
  altEndTime?: string;
  isActive?: boolean;
}

function mastersQuery(params?: Record<string, string | number | boolean>) {
  const merged = { pageSize: 100, ...params };
  return '?' + new URLSearchParams(Object.entries(merged).map(([k, v]) => [k, String(v)])).toString();
}

export async function getSites(params?: Record<string, string | number | boolean>) {
  return request<MasterItem[]>(`/masters/sites${mastersQuery(params)}`);
}
export async function createSite(payload: MasterItemPayload) {
  return request<MasterItem>('/masters/sites', { method: 'POST', body: JSON.stringify(payload) });
}
export async function updateSite(id: number, payload: Partial<MasterItemPayload>) {
  return request<MasterItem>(`/masters/sites/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}
/** Permanent delete of a master or dropdown value. Refused by the server while it is in use. */
export async function deleteMaster(kind: 'sites' | 'languages' | 'shifts' | 'document-types' | 'parameters', id: number) {
  return request<null>(`/masters/${kind}/${id}/permanent`, { method: 'DELETE' });
}
export async function deactivateSite(id: number) {
  return request<MasterItem>(`/masters/sites/${id}`, { method: 'DELETE' });
}

export async function getLanguages(params?: Record<string, string | number | boolean>) {
  return request<MasterItem[]>(`/masters/languages${mastersQuery(params)}`);
}
export async function createLanguage(payload: MasterItemPayload) {
  return request<MasterItem>('/masters/languages', { method: 'POST', body: JSON.stringify(payload) });
}
export async function updateLanguage(id: number, payload: Partial<MasterItemPayload>) {
  return request<MasterItem>(`/masters/languages/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}
export async function deactivateLanguage(id: number) {
  return request<MasterItem>(`/masters/languages/${id}`, { method: 'DELETE' });
}

export async function getShifts(params?: Record<string, string | number | boolean>) {
  return request<ShiftItem[]>(`/masters/shifts${mastersQuery(params)}`);
}
export async function createShift(payload: ShiftPayload) {
  return request<ShiftItem>('/masters/shifts', { method: 'POST', body: JSON.stringify(payload) });
}
export async function updateShift(id: number, payload: Partial<ShiftPayload>) {
  return request<ShiftItem>(`/masters/shifts/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}
export async function deactivateShift(id: number) {
  return request<ShiftItem>(`/masters/shifts/${id}`, { method: 'DELETE' });
}

export async function getDocumentTypes(params?: Record<string, string | number | boolean>) {
  return request<DocumentTypeItem[]>(`/masters/document-types${mastersQuery(params)}`);
}
export async function createDocumentType(payload: MasterItemPayload & { hasExpiry?: boolean; countryCodes?: string[] }) {
  return request<DocumentTypeItem>('/masters/document-types', { method: 'POST', body: JSON.stringify(payload) });
}
export async function updateDocumentType(id: number, payload: Partial<MasterItemPayload> & { hasExpiry?: boolean; countryCodes?: string[] }) {
  return request<DocumentTypeItem>(`/masters/document-types/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}
export async function deactivateDocumentType(id: number) {
  return request<MasterItem>(`/masters/document-types/${id}`, { method: 'DELETE' });
}

export async function getDocuments(params?: Record<string, string | number | boolean>) {
  const query = params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : '';
  return request<Document[]>(`/documents${query}`);
}

export async function createDocument(payload: CreateDocumentPayload) {
  return request<Document>('/documents', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function attachDocumentFile(documentId: number, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return request<any>(`/documents/${documentId}/files`, {
    method: 'POST',
    body: formData,
  });
}

export async function getEmployee(id: number) {
  return request<Employee>(`/employees/${id}`);
}

export async function updateEmployee(id: number, payload: UpdateEmployeePayload) {
  return request<Employee>(`/employees/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function getEmployeeDependants(id: number) {
  return request<Dependant[]>(`/employees/${id}/dependants`);
}

export async function createEmployeeDependant(id: number, payload: CreateDependantPayload) {
  return request<Dependant>(`/employees/${id}/dependants`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateEmployeeDependant(
  id: number,
  dependantId: number,
  payload: Partial<CreateDependantPayload>,
) {
  return request<Dependant>(`/employees/${id}/dependants/${dependantId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteEmployeeDependant(id: number, dependantId: number) {
  return request<null>(`/employees/${id}/dependants/${dependantId}`, {
    method: 'DELETE',
  });
}

export async function getParameters(typeCode: string) {
  return request<Parameter[]>(`/masters/parameters?typeCode=${encodeURIComponent(typeCode)}&pageSize=100`);
}

export async function downloadDocumentFile(documentId: number, fileId: number): Promise<string> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE_URL}/documents/${documentId}/files/${fileId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message?.text || res.statusText);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function forgotPassword(email: string) {
  return request<null>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, newPassword: string) {
  return request<null>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}

/* ---------------- Employee profile (D-023) ---------------- */

export interface ProfileFieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'email' | 'tel' | 'select' | 'multiselect' | 'yn';
  options?: string[];
  required?: boolean;
  sensitive?: boolean;
  mono?: boolean;
  wide?: boolean;
  hint?: string;
  maxLength?: number;
  display?: "checkbox";
  /** Only shown when another field in the same section equals this value. */
  showWhen?: { key: string; equals: string };
  /** Value/label pairs (e.g. employee id → name) when the stored value is not the label. */
  optionItems?: { value: string; label: string }[];
}

export interface ProfileRowsDef {
  key: string;
  label: string;
  addLabel: string;
  max: number;
  fields: ProfileFieldDef[];
}

export interface ProfileGroupDef {
  title: string;
  fields?: ProfileFieldDef[];
  rows?: ProfileRowsDef;
  addressLevels?: 'present' | 'permanent';
  showWhen?: { key: string; equals: string };
  columns?: 2 | 3 | 4;
  sameAsKey?: string;
  salaryComponents?: boolean;
}

export interface ProfileSectionDef {
  key: string;
  title: string;
  group: string;
  description: string;
  hrOnly: boolean;
  groups: ProfileGroupDef[];
}

export interface CustomFieldInfo {
  code: string;
  label: string;
  tabKey: string;
  sectionName: string;
  fieldType: string;
  options: string[];
  isRequired: boolean;
  isSensitive: boolean;
  placeholder: string | null;
  helpText: string | null;
}

export interface CustomFieldAdmin extends CustomFieldInfo {
  countryCode: string;
  isActive: boolean;
}

export interface EmployeeProfileResponse {
  employee: {
    id: number;
    employeeCode: string;
    name: string;
    isActive: boolean;
    hasPhoto: boolean;
    country: string;
    currency: string;
    addressLevels: string[];
  };
  canEdit: boolean;
  sections: ProfileSectionDef[];
  values: Record<string, Record<string, any>>;
  customFields: CustomFieldInfo[];
  custom: Record<string, any>;
  salaryTemplates: SalaryTemplate[];
}

export interface FieldErrorItem {
  field: string;
  message: string;
}

export async function getEmployeeProfile(id: number) {
  return request<EmployeeProfileResponse>(`/employees/${id}/profile`);
}

export interface EmployeeLoginResult {
  created: boolean;
  username: string;
  /** Only when the login was just created; shown once. */
  temporaryPassword?: string | null;
}

/** Creates the login from System Access (temporary password). Says so if the employee already has one. */
export async function createEmployeeLogin(id: number) {
  return request<EmployeeLoginResult>(`/employees/${id}/login`, { method: 'POST' });
}

/** Sets a new temporary password and emails the login details to the employee. */
export async function sendEmployeeLoginDetails(id: number) {
  return request<{ sentTo: string }>(`/employees/${id}/login/send`, { method: 'POST' });
}

export async function saveEmployeeProfileSection(
  id: number,
  section: string,
  data: Record<string, any>,
  custom: Record<string, any>,
) {
  return request<{ section: string; values: Record<string, any> }>(`/employees/${id}/profile/${section}`, {
    method: 'PUT',
    body: JSON.stringify({ data, custom }),
  });
}

export async function getCustomFieldDefinitions() {
  return request<CustomFieldAdmin[]>('/custom-fields');
}

export interface CreateCustomFieldPayload {
  label: string;
  tabKey: string;
  sectionName: string;
  fieldType: string;
  options?: string[];
  countryCode?: string;
  isRequired?: boolean;
  isSensitive?: boolean;
  placeholder?: string;
  helpText?: string;
}

export async function createCustomField(payload: CreateCustomFieldPayload) {
  return request<CustomFieldAdmin>('/custom-fields', { method: 'POST', body: JSON.stringify(payload) });
}

export async function deleteCustomField(code: string) {
  return request<null>(`/custom-fields/${code}`, { method: 'DELETE' });
}

export async function updateCustomField(code: string, payload: { isActive?: boolean; label?: string; isRequired?: boolean; placeholder?: string }) {
  return request<CustomFieldAdmin>(`/custom-fields/${code}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

/* ---------------- Employee photo (BR-MD-09: JPEG/PNG, max 10 MB) ---------------- */

export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export async function uploadEmployeePhoto(id: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  return request<{ fileId: string; originalName: string; mimeType: string }>(`/employees/${id}/photo`, { method: "POST", body: form });
}

/** Fetches the photo with the access token and returns an object URL, or null when there is none. */
export async function getEmployeePhotoUrl(id: number): Promise<string | null> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE_URL}/employees/${id}/photo`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(res.statusText);
  return URL.createObjectURL(await res.blob());
}

/* ---------------- Salary templates (D-024) and Add Employee ---------------- */

export interface SalaryTemplate {
  id: number;
  name: string;
  countryCode: string;
  isActive: boolean;
  components: { code: string; label: string }[];
}

export interface BlankProfileResponse {
  country: string;
  currency: string;
  addressLevels: string[];
  sections: ProfileSectionDef[];
  salaryTemplates: SalaryTemplate[];
  customFields: CustomFieldInfo[];
}

export async function getBlankProfile(country: string) {
  return request<BlankProfileResponse>(`/employee-profile/blank?country=${encodeURIComponent(country)}`);
}

export async function validateNewProfile(country: string, sections: Record<string, { data: Record<string, any>; custom: Record<string, any> }>) {
  return request<{ country: string; valid: boolean; errors: Record<string, FieldErrorItem[]> }>('/employee-profile/validate', {
    method: 'POST',
    body: JSON.stringify({ country, sections }),
  });
}

export async function getSalaryTemplates() {
  return request<SalaryTemplate[]>('/salary-templates');
}

export interface SalaryTemplatePayload {
  name?: string;
  countryCode?: string;
  isActive?: boolean;
  components?: { label: string; code?: string }[];
}

export async function createSalaryTemplate(payload: SalaryTemplatePayload) {
  return request<SalaryTemplate>('/salary-templates', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateSalaryTemplate(id: number, payload: SalaryTemplatePayload) {
  return request<SalaryTemplate>(`/salary-templates/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

/* -------------------------------------------------------------- overtime configurations (Attendance setup > Overtime) */

export type OvertimeType = 'FIXED_PER_DAY' | 'FIXED_MONTHLY' | 'HOURLY';

export interface OvertimeConfigurationItem {
  id: number;
  name: string;
  type: OvertimeType;
  fixedAmount: number | null;
  weekdayMultiplier: number | null;
  weekendMultiplier: number | null;
  isActive: boolean;
}

export interface OvertimeConfigurationPayload {
  name?: string;
  type?: OvertimeType;
  fixedAmount?: number | null;
  weekdayMultiplier?: number | null;
  weekendMultiplier?: number | null;
  isActive?: boolean;
}

export async function getOvertimeConfigurations() {
  return request<OvertimeConfigurationItem[]>('/overtime-configurations');
}

export async function createOvertimeConfiguration(payload: OvertimeConfigurationPayload) {
  return request<OvertimeConfigurationItem>('/overtime-configurations', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateOvertimeConfiguration(id: number, payload: OvertimeConfigurationPayload) {
  return request<OvertimeConfigurationItem>(`/overtime-configurations/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

/* -------------------------------------------------------------- system configurations (System Admin only) */

export interface SystemConfigurationItem {
  id: number;
  name: string;
  value: string | null;
  valueDate: string | null;
  valueKind: string;
  description: string | null;
}

export interface SystemConfigurationPayload {
  name?: string;
  value?: string;
  valueKind?: string;
  description?: string;
}

export async function getSystemConfigurations() {
  return request<SystemConfigurationItem[]>('/system-configurations');
}

export interface EmailStatus {
  configured: boolean;
  host: string;
  port: number;
  from: string;
  environment: string;
  /** Set in development: every email goes here instead of the real recipient. */
  redirectedTo: string | null;
}
export async function getEmailStatus() {
  return request<EmailStatus>('/system-configurations/email/status');
}
export async function sendTestEmail(to: string) {
  return request<{ requestedFor: string; deliveredTo: string; redirected: boolean }>('/system-configurations/email/test', { method: 'POST', body: JSON.stringify({ to }) });
}

export async function createSystemConfiguration(payload: SystemConfigurationPayload) {
  return request<SystemConfigurationItem>('/system-configurations', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateSystemConfiguration(id: number, payload: SystemConfigurationPayload) {
  return request<SystemConfigurationItem>(`/system-configurations/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

/* -------------------------------------------------------------- countries (System Admin only) */

export interface CountryItem {
  id: number;
  isoCode: string;
  name: string;
  currencyCode: string;
  defaultTimezone: string;
  defaultLanguage: string;
  dateFormat: string;
  isActive: boolean;
}

export interface CountryPayload {
  isoCode?: string;
  name?: string;
  currencyCode?: string;
  defaultTimezone?: string;
  defaultLanguage?: string;
  dateFormat?: string;
  isActive?: boolean;
}

export async function getCountries() {
  return request<CountryItem[]>('/countries');
}

export async function createCountry(payload: CountryPayload) {
  return request<CountryItem>('/countries', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateCountry(id: number, payload: CountryPayload) {
  return request<CountryItem>(`/countries/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

/* -------------------------------------------------------------- branding (System Admin only) */

export interface BrandingItem {
  id: number;
  appName: string;
  logoFileId: string | null;
  faviconFileId: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  loginBrandingText: string | null;
  footerText: string | null;
}

export interface BrandingPayload {
  appName?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  loginBrandingText?: string;
  footerText?: string;
}

export async function getBranding() {
  return request<BrandingItem>('/branding');
}

export async function updateBranding(payload: BrandingPayload) {
  return request<BrandingItem>('/branding', { method: 'PATCH', body: JSON.stringify(payload) });
}

async function uploadBrandingFile(path: 'logo' | 'favicon', file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return request<BrandingItem>(`/branding/${path}`, { method: 'POST', body: formData });
}

export async function uploadBrandingLogo(file: File) {
  return uploadBrandingFile('logo', file);
}

export async function uploadBrandingFavicon(file: File) {
  return uploadBrandingFile('favicon', file);
}

export function brandingLogoUrl() {
  return `${API_BASE_URL}/branding/logo/file`;
}

export function brandingFaviconUrl() {
  return `${API_BASE_URL}/branding/favicon/file`;
}

/* -------------------------------------------------------------- module configuration (System Admin only) */

export interface ModuleConfigurationItem {
  id: number;
  moduleKey: string;
  name: string;
  isEnabled: boolean;
  isImplemented: boolean;
  dependsOn: string[];
  displayOrder: number;
}

export async function getModuleConfigurations() {
  return request<ModuleConfigurationItem[]>('/module-configurations');
}

export async function updateModuleConfiguration(moduleKey: string, isEnabled: boolean) {
  return request<ModuleConfigurationItem>(`/module-configurations/${moduleKey}`, {
    method: 'PATCH',
    body: JSON.stringify({ isEnabled }),
  });
}

export async function deactivateDocument(id: number) {
  return request<Document>(`/documents/${id}`, { method: 'DELETE' });
}

/* -------------------------------------------------------------- profile field rules (System Admin only) */

export interface ProfileRule {
  sectionKey: string;
  groupTitle: string;
  fieldKey: string;
  isVisible: boolean | null;
  isRequired: boolean | null;
}

export interface ProfileRuleCatalog {
  country: string;
  countries: string[];
  sections: {
    key: string;
    title: string;
    locked: boolean;
    groups: { title: string; fields: { key: string; label: string; defaultVisible: boolean; defaultRequired: boolean; locked: boolean }[] }[];
  }[];
  rules: ProfileRule[];
}

export async function getProfileRules(country: string) {
  return request<ProfileRuleCatalog>(`/profile-rules/${encodeURIComponent(country)}`);
}

export async function saveProfileRules(country: string, rules: ProfileRule[]) {
  return request<ProfileRuleCatalog>(`/profile-rules/${encodeURIComponent(country)}`, { method: 'PUT', body: JSON.stringify({ rules }) });
}

export async function resetProfileRules(country: string) {
  return request<ProfileRuleCatalog>(`/profile-rules/${encodeURIComponent(country)}`, { method: 'DELETE' });
}

/* -------------------------------------------------------------- branches */

export interface BranchOption {
  id: number;
  code: string;
  name: string;
  countryCode: string | null;
  timezone?: string | null;
}

export interface BranchRow extends BranchOption {
  /** Employee codes of this branch start with this (for example EA-). */
  employeeCodePrefix: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  sortOrder: number;
  employeeCount: number;
}
export type BranchPayload = Omit<BranchRow, 'id' | 'employeeCount'>;

/** Every active branch, for giving an account branch access. */
export async function getBranches() {
  return request<BranchOption[]>('/branches');
}
export const getBranchesToManage = () =>
  request<{ branches: BranchRow[]; countries: { isoCode: string; name: string; defaultTimezone: string }[] }>('/branches/manage');
export const createBranch = (p: BranchPayload) => request<BranchRow>('/branches', { method: 'POST', body: JSON.stringify(p) });
export const updateBranch = (id: number, p: BranchPayload) => request<BranchRow>('/branches/' + id, { method: 'PUT', body: JSON.stringify(p) });
export const deleteBranch = (id: number) => request<null>('/branches/' + id, { method: 'DELETE' });
export async function getMyBranches() {
  return request<{ restricted: boolean; branches: BranchOption[] }>('/branches/mine');
}

/* -------------------------------------------------------------- parameters (dropdown options) */

export async function getParameterTypes() {
  return request<{ id: number; name: string }[]>('/masters/parameter-types');
}
export async function listParameters(parameterTypeId: number) {
  return request<(Parameter & { displayOrder: number; isVisible: boolean })[]>(`/masters/parameters?parameterTypeId=${parameterTypeId}&pageSize=100`);
}
export async function createParameter(payload: { parameterTypeId: number; text: string; code?: string }) {
  return request<Parameter>('/masters/parameters', { method: 'POST', body: JSON.stringify(payload) });
}
export async function updateParameter(id: number, payload: { text?: string; code?: string; isVisible?: boolean; displayOrder?: number }) {
  return request<Parameter>(`/masters/parameters/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}
