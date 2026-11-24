import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { getDocuments, createDocument, attachDocumentFile, getDocumentTypes, getEmployee, getEmployees, Document, DocumentTypeItem, Employee } from '../lib/api';
import Select from '../components/Select';
import Pagination from '../components/Pagination';
import Modal from '../components/Modal';

export default function DocumentsPage() {
  const { isAuthenticated } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeItem[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeCountry, setEmployeeCountry] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [form, setForm] = useState<any>({
    profileId: '',
    documentTypeId: '',
    issueDate: '',
    expiryDate: '',
    identityNo: '',
    documentTitle: '',
    remarks: '',
    isSelf: true,
  });

  useEffect(() => {
    if (!isAuthenticated) return;
    loadDocuments();
  }, [isAuthenticated, page, pageSize]);

  // Document type choices: all of them until an employee is chosen, then just that employee's country (plus "ALL").
  useEffect(() => {
    if (!isAuthenticated) return;
    getDocumentTypes({ pageSize: 100, ...(employeeCountry ? { countryCode: employeeCountry } : {}) }).then((r) => {
      const list = r.data.filter((x) => x.isActive);
      setDocumentTypes(list);
      // Changing employee can narrow the list; drop a choice that no longer applies.
      setForm((f: any) => (f.documentTypeId && !list.some((dt) => String(dt.id) === String(f.documentTypeId)) ? { ...f, documentTypeId: '' } : f));
    });
  }, [isAuthenticated, employeeCountry]);

  // Employee choices for the Add Document form; typing narrows the list.
  useEffect(() => {
    if (!isAuthenticated || !showCreate) return;
    const timer = setTimeout(() => {
      getEmployees({ pageSize: 25, isActive: true, ...(employeeSearch.trim() ? { search: employeeSearch.trim() } : {}) })
        .then((r) => setEmployees(r.data))
        .catch(() => setEmployees([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [isAuthenticated, showCreate, employeeSearch]);

  // Once an employee is picked, look up their country so the document type list narrows to it.
  useEffect(() => {
    if (!form.profileId) { setEmployeeCountry(''); return; }
    const emp = employees.find((e) => String(e.profileId) === String(form.profileId));
    if (!emp) return;
    getEmployee(emp.id).then((r) => setEmployeeCountry(r.data.country ?? 'IN')).catch(() => setEmployeeCountry(''));
  }, [form.profileId, employees]);

  const selectedType = documentTypes.find((dt) => String(dt.id) === String(form.documentTypeId));
  const needsDates = !!selectedType?.hasExpiry;

  const loadDocuments = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getDocuments({ page, pageSize });
      setDocuments(res.data);
      setPagination(res.pagination);
    } catch (err: any) {
      setError(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.profileId) {
      setError('Choose an employee');
      return;
    }
    if (needsDates) {
      if (!form.issueDate || !form.expiryDate) {
        setError(`${selectedType!.name} requires both an issue date and an expiry date`);
        return;
      }
      if (form.expiryDate < form.issueDate) {
        setError('Expiry date cannot be before the issue date');
        return;
      }
    }
    setError('');
    try {
      const payload = {
        profileId: parseInt(form.profileId, 10),
        documentTypeId: parseInt(form.documentTypeId, 10),
        ...(needsDates ? { issueDate: form.issueDate, expiryDate: form.expiryDate } : {}),
        identityNo: form.identityNo || undefined,
        documentTitle: form.documentTitle || undefined,
        remarks: form.remarks || undefined,
        isSelf: form.isSelf,
      };
      const created = await createDocument(payload);

      if (selectedFile && created.data.id) {
        await attachDocumentFile(created.data.id, selectedFile);
      }

      setShowCreate(false);
      setEmployeeSearch('');
      setSelectedFile(null);
      setForm({ profileId: '', documentTypeId: '', issueDate: '', expiryDate: '', identityNo: '', documentTitle: '', remarks: '', isSelf: true });
      loadDocuments();
    } catch (err: any) {
      setError(err.message || 'Failed to create document');
    }
  };

  const formatDate = (date?: string) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Documents</h2>
          <p className="text-gray-500 mt-1">Manage employee documents and expiry tracking.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition"
        >
          + Add Document
        </button>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 font-semibold text-gray-700">Title</th>
              <th className="px-6 py-3 font-semibold text-gray-700">Type</th>
              <th className="px-6 py-3 font-semibold text-gray-700">Employee</th>
              <th className="px-6 py-3 font-semibold text-gray-700">Issue Date</th>
              <th className="px-6 py-3 font-semibold text-gray-700">Expiry Date</th>
              <th className="px-6 py-3 font-semibold text-gray-700">Files</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : documents.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No documents found.</td></tr>
            ) : (
              documents.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{d.documentTitle || d.documentType?.name}</td>
                  <td className="px-6 py-4 text-gray-600">{d.documentType?.name}</td>
                  <td className="px-6 py-4 text-gray-600">{d.profile?.name} {d.profile?.lastName}</td>
                  <td className="px-6 py-4 text-gray-600">{formatDate(d.issueDate)}</td>
                  <td className="px-6 py-4 text-gray-600">{formatDate(d.expiryDate)}</td>
                  <td className="px-6 py-4 text-gray-600">{d.files?.length || 0}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <Pagination page={page} pageSize={pageSize} total={pagination.totalItems} pageSizes={[25, 50, 100]} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
        </div>
      )}

      {showCreate && (
        <Modal title="Create Document" size="md" onClose={() => setShowCreate(false)}>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <input type="search" placeholder="Search employee…" value={employeeSearch} onChange={(e) => setEmployeeSearch(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  <Select required aria-label="Employee" value={form.profileId} onChange={(e) => setForm({ ...form, profileId: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select employee…</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.profileId}>
                        {[emp.profile?.name, emp.profile?.lastName].filter(Boolean).join(' ')} ({emp.employeeCode})
                      </option>
                    ))}
                  </Select>
                </div>
                <Select required aria-label="Document type" value={form.documentTypeId} onChange={(e) => setForm({ ...form, documentTypeId: e.target.value })} className="self-end px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Document Type</option>
                  {documentTypes.map((dt) => <option key={dt.id} value={dt.id}>{dt.name}{dt.hasExpiry ? ' (expires)' : ''}</option>)}
                </Select>
              </div>
              <input placeholder="Document Title" value={form.documentTitle} onChange={(e) => setForm({ ...form, documentTitle: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
              {needsDates && (
                <div className="grid grid-cols-2 gap-4">
                  <label className="block text-sm font-medium text-gray-700">
                    Issue date <span className="text-red-500">*</span>
                    <input required type="date" value={form.issueDate} max={form.expiryDate || undefined} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>
                  <label className="block text-sm font-medium text-gray-700">
                    Expiry date <span className="text-red-500">*</span>
                    <input required type="date" value={form.expiryDate} min={form.issueDate || undefined} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>
                </div>
              )}
              <input placeholder="Identity No" value={form.identityNo} onChange={(e) => setForm({ ...form, identityNo: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
              <textarea placeholder="Remarks" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" rows={3} />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Attachment</label>
                <input
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.isSelf} onChange={(e) => setForm({ ...form, isSelf: e.target.checked })} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                Self-service document
              </label>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">Create</button>
              </div>
            </form>
        </Modal>
      )}
    </div>
  );
}
