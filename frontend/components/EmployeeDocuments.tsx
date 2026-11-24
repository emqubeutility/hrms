import React, { useCallback, useEffect, useState } from 'react';
import {
  Document,
  DocumentTypeItem,
  attachDocumentFile,
  createDocument,
  deactivateDocument,
  downloadDocumentFile,
  getDocumentTypes,
  getDocuments,
  getEmployee,
} from '../lib/api';
import Select from './Select';
import DocumentViewer from './DocumentViewer';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['jpg', 'jpeg', 'png', 'pdf'];

const emptyForm = { documentTypeId: '', identityNo: '', documentTitle: '', issueDate: '', expiryDate: '', remarks: '' };

const field =
  'mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30';

function fmt(d?: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function ExpiryPill({ expiry }: { expiry?: string | null }) {
  if (!expiry) return null;
  const days = Math.floor((new Date(expiry).getTime() - Date.now()) / 86400000);
  if (days < 0) return <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Expired</span>;
  if (days <= 30) return <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Expires in {days}d</span>;
  return null;
}

/** Document list + upload for one employee, backed by the Documents module. */
export default function EmployeeDocuments({ employeeId, canEdit }: { employeeId: number; canEdit: boolean }) {
  const [profileId, setProfileId] = useState<number | null>(null);
  const [types, setTypes] = useState<DocumentTypeItem[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);

  const selectedType = types.find((t) => String(t.id) === form.documentTypeId);
  const needsDates = !!selectedType?.hasExpiry;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const emp = await getEmployee(employeeId);
      const pid = emp.data.profileId;
      setProfileId(pid);
      // Only document types for this employee's own country (plus "ALL") belong in the picker.
      const t = await getDocumentTypes({ pageSize: 100, countryCode: emp.data.country ?? 'IN' });
      setTypes(t.data.filter((x) => x.isActive));
      const d = await getDocuments({ profileId: pid, isActive: true, pageSize: 100, sortBy: 'createdAt', sortOrder: 'desc' });
      setDocs(d.data);
    } catch (e: any) {
      setError(e.message || 'Could not load documents');
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const pickFile = (f: File | null) => {
    if (f) {
      const ext = (f.name.split('.').pop() ?? '').toLowerCase();
      if (!ALLOWED.includes(ext)) {
        setError('Only JPG, PNG or PDF files are allowed');
        setFileKey((k) => k + 1);
        return;
      }
      if (f.size > MAX_BYTES) {
        setError('File must be 10 MB or smaller');
        setFileKey((k) => k + 1);
        return;
      }
    }
    setError('');
    setFile(f);
  };

  const validate = (): string => {
    if (!form.documentTypeId) return 'Choose a document type';
    if (needsDates) {
      if (!form.issueDate || !form.expiryDate) return `${selectedType!.name} requires both an issue date and an expiry date`;
      if (form.expiryDate < form.issueDate) return 'Expiry date cannot be before the issue date';
    }
    return '';
  };

  const reset = () => {
    setForm(emptyForm);
    setFile(null);
    setFileKey((k) => k + 1);
    setAdding(false);
  };

  const save = async () => {
    const problem = validate();
    if (problem || profileId === null) {
      setError(problem || 'Profile not loaded');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const created = await createDocument({
        profileId,
        documentTypeId: Number(form.documentTypeId),
        identityNo: form.identityNo.trim() || undefined,
        documentTitle: form.documentTitle.trim() || undefined,
        remarks: form.remarks.trim() || undefined,
        ...(needsDates ? { issueDate: form.issueDate, expiryDate: form.expiryDate } : {}),
      });
      let fileFailed = '';
      if (file) {
        try {
          await attachDocumentFile(created.data.id, file);
        } catch (e: any) {
          fileFailed = e.message || 'upload failed';
        }
      }
      setNotice(fileFailed ? `Document saved, but the file was not uploaded: ${fileFailed}. Use "Attach file" to retry.` : 'Document saved');
      reset();
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not save document');
    } finally {
      setSaving(false);
    }
  };

  const attach = async (doc: Document, f: File | null) => {
    if (!f) return;
    const ext = (f.name.split('.').pop() ?? '').toLowerCase();
    if (!ALLOWED.includes(ext) || f.size > MAX_BYTES) {
      setError('Only JPG, PNG or PDF files up to 10 MB are allowed');
      return;
    }
    setError('');
    try {
      await attachDocumentFile(doc.id, f);
      setNotice('File attached');
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not attach file');
    }
  };

  // File currently open in the document viewer popup.
  const [viewing, setViewing] = useState<{ documentId: number; fileId: number; fileName: string } | null>(null);

  const remove = async (doc: Document) => {
    if (!window.confirm(`Remove this ${doc.documentType.name} document?`)) return;
    try {
      await deactivateDocument(doc.id);
      setNotice('Document removed');
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not remove document');
    }
  };

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">{notice}</p>}

      {canEdit && !adding && (
        <button type="button" onClick={() => { setAdding(true); setNotice(''); }} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
          + Add document
        </button>
      )}

      {adding && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              Document type <span className="text-red-500">*</span>
              <Select className={field} value={form.documentTypeId} onChange={(e) => setForm({ ...form, documentTypeId: e.target.value })}>
                <option value="">Select…</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
              {types.length === 0 && <span className="mt-1 block text-xs text-gray-500">No document types yet. Add them in Masters → Document Types.</span>}
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Number / detail
              <input className={field} value={form.identityNo} onChange={(e) => setForm({ ...form, identityNo: e.target.value })} />
            </label>
            <label className="block text-sm font-medium text-gray-700 md:col-span-2">
              Title
              <input className={field} maxLength={255} value={form.documentTitle} onChange={(e) => setForm({ ...form, documentTitle: e.target.value })} />
            </label>
            {needsDates && (
              <>
                <label className="block text-sm font-medium text-gray-700">
                  Issue date <span className="text-red-500">*</span>
                  <input type="date" className={field} value={form.issueDate} max={form.expiryDate || undefined} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Expiry date <span className="text-red-500">*</span>
                  <input type="date" className={field} value={form.expiryDate} min={form.issueDate || undefined} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
                </label>
              </>
            )}
            <label className="block text-sm font-medium text-gray-700 md:col-span-2">
              Remarks
              <textarea className={field} rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
            </label>
            <label className="block text-sm font-medium text-gray-700 md:col-span-2">
              File
              <input key={fileKey} type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100" />
              <span className="mt-1 block text-xs text-gray-500">JPG, PNG or PDF, up to 10 MB.</span>
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <button type="button" onClick={() => { reset(); setError(''); }} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save document'}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Number / title</th>
              <th className="px-4 py-3">Issued</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Files</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : docs.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No documents yet.</td></tr>
            ) : (
              docs.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{d.documentType.name}</td>
                  <td className="px-4 py-3 text-gray-700">{d.identityNo || d.documentTitle || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmt(d.issueDate)}</td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {d.expiryDate ? <span className="mr-2">{fmt(d.expiryDate)}</span> : <span className="text-gray-400">No expiry</span>}
                    <ExpiryPill expiry={d.expiryDate} />
                  </td>
                  <td className="px-4 py-3">
                    {(d.files ?? []).length === 0 ? (
                      <span className="text-gray-400">None</span>
                    ) : (
                      (d.files ?? []).map((f) => (
                        <button key={f.file.id} type="button" onClick={() => setViewing({ documentId: d.id, fileId: f.file.id, fileName: f.file.originalName })} className="block max-w-[220px] truncate text-left text-blue-600 hover:text-blue-800" title={f.file.originalName}>
                          {f.file.originalName}
                        </button>
                      ))
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {canEdit && (
                      <>
                        <label className="mr-4 cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-800">
                          Attach file
                          <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden" onChange={(e) => { attach(d, e.target.files?.[0] ?? null); e.target.value = ''; }} />
                        </label>
                        <button type="button" onClick={() => remove(d)} className="text-xs font-medium text-red-600 hover:text-red-800">Remove</button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {viewing && (
        <DocumentViewer
          fileName={viewing.fileName}
          load={() => downloadDocumentFile(viewing.documentId, viewing.fileId)}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
