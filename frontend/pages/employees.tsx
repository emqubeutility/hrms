import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import { getEmployees, getSites, getParameters, Employee } from '../lib/api';
import Select from '../components/Select';
import Pagination from '../components/Pagination';

/** The server pages employees in these sizes only. */
const SERVER_PAGE_SIZES = [25, 50, 100];

type SortKey = 'name' | 'employeeCode' | 'dateOfJoining';
type Option = { id: number; label: string };

const selectClass =
  'px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none';

function fmtDate(d?: string) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function EmployeesPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [siteId, setSiteId] = useState('');
  const [employeeTypeId, setEmployeeTypeId] = useState('');
  const [status, setStatus] = useState<'' | 'true' | 'false'>('');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [departments, setDepartments] = useState<Option[]>([]);
  const [sites, setSites] = useState<Option[]>([]);
  const [employeeTypes, setEmployeeTypes] = useState<Option[]>([]);

  // The top-bar search sends ?search=… here.
  useEffect(() => {
    const q = router.query.search;
    if (typeof q === 'string') {
      setSearchInput(q);
      setSearch(q);
      setPage(1);
    }
  }, [router.query.search]);

  // Debounce typing so we don't query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch((prev) => {
        const next = searchInput.trim();
        if (prev !== next) setPage(1);
        return next;
      });
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Filter dropdown options. A failed lookup just leaves that dropdown empty.
  useEffect(() => {
    if (!isAuthenticated) return;
    getParameters('Department')
      .then((r) => setDepartments(r.data.map((d: any) => ({ id: d.id, label: d.text }))))
      .catch(() => {});
    getSites({ pageSize: 100 })
      .then((r) => setSites(r.data.map((s) => ({ id: s.id, label: s.name }))))
      .catch(() => {});
    getParameters('Employee Type')
      .then((r) => setEmployeeTypes(r.data.map((p: any) => ({ id: p.id, label: p.text }))))
      .catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const params: Record<string, string | number | boolean> = { page, pageSize, sortBy, sortOrder };
        if (search) params.search = search;
        if (department) params.department = department;
        if (siteId) params.siteId = siteId;
        if (employeeTypeId) params.employeeTypeId = employeeTypeId;
        if (status) params.isActive = status;
        const res = await getEmployees(params);
        if (cancelled) return;
        setEmployees(res.data);
        setPagination(res.pagination);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load employees');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, page, pageSize, search, department, siteId, employeeTypeId, status, sortBy, sortOrder]);

  const hasFilters = !!(search || department || siteId || employeeTypeId || status);

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setDepartment('');
    setSiteId('');
    setEmployeeTypeId('');
    setStatus('');
    setPage(1);
    if (router.query.search) router.replace('/employees', undefined, { shallow: true });
  };

  const onFilter = (setter: (v: any) => void) => (e: { target: { value: string } }) => {
    setter(e.target.value);
    setPage(1);
  };

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else {
      setSortBy(key);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const SortHeader = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th className="px-6 py-3 font-semibold text-gray-700" aria-sort={sortBy === k ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-blue-700">
        {children}
        <span className="text-xs text-gray-400">{sortBy === k ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Employees</h2>
          <p className="text-gray-500 mt-1">Manage employee profiles, work details, documents and dependents.</p>
        </div>
        <Link href="/employee-profile/new" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition">
          + Add Employee
        </Link>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by name, code or email..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="flex-1 min-w-[220px] max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <Select aria-label="Department" value={department} onChange={onFilter(setDepartment)} className={selectClass}>
          <option value="">All departments</option>
          {departments.map((o) => <option key={o.id} value={o.label}>{o.label}</option>)}
        </Select>
        <Select aria-label="Site" value={siteId} onChange={onFilter(setSiteId)} className={selectClass}>
          <option value="">All sites</option>
          {sites.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </Select>
        <Select aria-label="Employee type" value={employeeTypeId} onChange={onFilter(setEmployeeTypeId)} className={selectClass}>
          <option value="">All types</option>
          {employeeTypes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </Select>
        <Select aria-label="Status" value={status} onChange={onFilter(setStatus)} className={selectClass}>
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </Select>
        {hasFilters && (
          <button onClick={clearFilters} className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800">
            Clear filters
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <SortHeader k="employeeCode">Code</SortHeader>
              <SortHeader k="name">Name</SortHeader>
              <th className="px-6 py-3 font-semibold text-gray-700">Designation</th>
              <th className="px-6 py-3 font-semibold text-gray-700">Email</th>
              <th className="px-6 py-3 font-semibold text-gray-700">Branch</th>
              <th className="px-6 py-3 font-semibold text-gray-700">Site</th>
              <th className="px-6 py-3 font-semibold text-gray-700">Shift</th>
              <SortHeader k="dateOfJoining">Joined</SortHeader>
              <th className="px-6 py-3 font-semibold text-gray-700">Status</th>
              <th className="px-6 py-3 font-semibold text-gray-700 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={10} className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : employees.length === 0 ? (
              <tr><td colSpan={10} className="px-6 py-8 text-center text-gray-400">{hasFilters ? 'No employees match these filters.' : 'No employees found.'}</td></tr>
            ) : (
              employees.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{e.employeeCode}</td>
                  <td className="px-6 py-4">
                    <Link href={`/employee-profile/${e.id}`} className="font-medium text-gray-900 hover:text-blue-700">
                      {e.profile?.name} {e.profile?.lastName}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{e.designation || '—'}</td>
                  <td className="px-6 py-4 text-gray-600">{e.profile?.email || e.workEmail || '—'}</td>
                  <td className="px-6 py-4 text-gray-600">{e.branch?.name || '—'}</td>
                  <td className="px-6 py-4 text-gray-600">{e.site?.name || '—'}</td>
                  <td className="px-6 py-4 text-gray-600">{e.shift?.name || '—'}</td>
                  <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{fmtDate(e.dateOfJoining)}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${e.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {e.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link href={`/employee-profile/${e.id}`} className="text-blue-600 hover:text-blue-800 text-xs font-medium">View profile</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <Pagination page={page} pageSize={pageSize} total={pagination.totalItems} pageSizes={SERVER_PAGE_SIZES} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
        </div>
      )}
    </div>
  );
}
