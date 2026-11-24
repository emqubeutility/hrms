import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../lib/toast';
import { useAuth } from '../../lib/auth';
import { LEAVE_STATUS_LABEL, LeaveApplication, LeaveBalance, LeavePreview, LeaveType, REASON_TEXT, applyLeave, cancelLeave, fmtDays, uploadLeaveDocument, updateLeave, getMyLeaveTypes, getMyBalances, getMyLeave, previewLeave } from '../../lib/leave-api';
import { fieldClass } from '../../components/Drawer';
import Select from '../../components/Select';
import Modal from '../../components/Modal';
import LeaveDocumentsModal from '../../components/leave/LeaveDocumentsModal';
import Pagination from '../../components/Pagination';
import { usePagedRows } from '../../lib/usePagedRows';

const today = () => new Date().toISOString().slice(0, 10);
const STATUS_TONE: Record<string, string> = {
  PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
  MANAGER_APPROVED: 'border-blue-200 bg-blue-50 text-blue-700',
  APPROVED: 'border-green-200 bg-green-50 text-green-700',
  REJECTED: 'border-red-200 bg-red-50 text-red-700',
  CANCELLED: 'border-gray-200 bg-gray-100 text-gray-600',
};
const KIND_TONE: Record<string, string> = { LEAVE: 'text-gray-900', HALF_DAY: 'text-gray-900', OFF_NOT_COUNTED: 'text-gray-400', SANDWICH_WEEKLY_OFF: 'text-purple-700', SANDWICH_HOLIDAY: 'text-purple-700' };

/** An employee's balances, a leave form with a live count of the days it will take, and their applications. */
export default function MyLeavePage() {
  const { isAuthenticated } = useAuth();
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [apps, setApps] = useState<LeaveApplication[]>([]);
  const paged = usePagedRows(apps);
  const [form, setForm] = useState({ leaveTypeId: '', fromDate: today(), toDate: today(), half: '' as '' | 'FIRST' | 'SECOND', reason: '', eventDate: '', variant: '' });
  const [preview, setPreview] = useState<LeavePreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [error, setError] = useState('');
  // Leave whose documents are open in the popup (id of the leave application, and a label for the title).
  const [docsFor, setDocsFor] = useState<{ id: number; label: string } | null>(null);
  const toast = useToast();
  /** This page's own messages (more helpful than the default) appear as toasts. */
  const setNotice = (m: string) => {
    if (m) toast.success(m);
  };
  const [busy, setBusy] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [applying, setApplying] = useState(false);
  // Set while a pending leave is being edited (the same form, saved as an update).
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filters, setFilters] = useState({ status: '', leaveTypeId: '', from: '', to: '' });
  const filtered = Object.values(filters).some(Boolean);

  const reload = useCallback(async () => {
    try {
      const [b, a] = await Promise.all([getMyBalances(), getMyLeave(filters)]);
      setBalances(b.data);
      setApps(a.data);
    } catch (e: any) {
      setError(e.message || 'Could not load your leave');
    }
  }, [filters]);

  useEffect(() => {
    if (isAuthenticated) getMyLeaveTypes().then((r) => setTypes(r.data)).catch(() => {});
  }, [isAuthenticated]);

  // Loads again whenever a filter changes.
  useEffect(() => {
    if (isAuthenticated) reload();
  }, [isAuthenticated, reload]);

  const type = types.find((t) => String(t.id) === form.leaveTypeId);
  const single = form.fromDate === form.toDate;
  const docNeeded = !!type?.requiresDocument && !!preview && preview.totalDays > (type?.documentAfterDays ?? 0);

  // Live count of the days: weekly offs, holidays and the sandwich rule are worked out on the server.
  useEffect(() => {
    setPreview(null);
    setPreviewError('');
    if (!form.leaveTypeId || !form.fromDate || !form.toDate || form.toDate < form.fromDate) return;
    const t = setTimeout(() => {
      previewLeave({ leaveTypeId: Number(form.leaveTypeId), fromDate: form.fromDate, toDate: form.toDate, halfDayPart: single && form.half ? form.half : undefined, eventDate: form.eventDate || undefined, variant: form.variant || undefined })
        .then((r) => setPreview(r.data))
        .catch((e) => setPreviewError(e.message || 'Could not work out the days'));
    }, 350);
    return () => clearTimeout(t);
  }, [form.leaveTypeId, form.fromDate, form.toDate, form.half, form.eventDate, form.variant, single]);

  const openApply = () => {
    setError('');
    setNotice('');
    setPreview(null);
    setPreviewError('');
    setForm({ leaveTypeId: '', fromDate: today(), toDate: today(), half: '', reason: '', eventDate: '', variant: '' });
    setDocFile(null);
    setEditingId(null);
    setApplying(true);
  };

  /** Opens the form filled with a leave that is still waiting for a decision. */
  const openEdit = (a: LeaveApplication) => {
    setError('');
    setNotice('');
    setPreview(null);
    setPreviewError('');
    setForm({
      leaveTypeId: String(a.leaveType.id),
      fromDate: a.fromDate,
      toDate: a.toDate,
      half: (a.halfDayPart ?? '') as '' | 'FIRST' | 'SECOND',
      reason: a.reason ?? '',
      eventDate: '',
      variant: a.variant ?? '',
    });
    setDocFile(null);
    setEditingId(a.id);
    setApplying(true);
  };

  const submit = async () => {
    // A leave type that needs a document must have one when the leave is longer than its limit.
    if (docNeeded && !docFile) return setError(`${type?.name} needs a supporting document. Choose the file to attach.`);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = { leaveTypeId: Number(form.leaveTypeId), fromDate: form.fromDate, toDate: form.toDate, halfDayPart: single && form.half ? form.half : undefined, eventDate: form.eventDate || undefined, variant: form.variant || undefined, reason: form.reason.trim() || undefined };
      const saved = editingId !== null ? await updateLeave(editingId, payload) : await applyLeave(payload);
      if (docFile) {
        try {
          await uploadLeaveDocument(saved.data.id, docFile);
        } catch (e: any) {
          setError(`The leave was saved but the document was not attached: ${e.message || 'upload failed'}. Attach it from the list below.`);
        }
      }
      setNotice(editingId !== null ? 'Leave changed. Waiting for approval.' : 'Leave sent for approval');
      setApplying(false);
      await reload();
    } catch (e: any) {
      setError(e.message || 'Could not apply');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (a: LeaveApplication) => {
    if (!window.confirm(`Cancel ${a.leaveType.name} from ${a.fromDate} to ${a.toDate}?`)) return;
    setError('');
    try {
      await cancelLeave(a.id);
      await reload();
    } catch (e: any) {
      setError(e.message || 'Could not cancel');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My leave</h2>
          <p className="mt-1 text-gray-500">Your balance, a leave request with the days counted for you, and what you have asked for.</p>
        </div>
        <button type="button" onClick={openApply} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">Apply for leave</button>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {balances.filter((b) => b.balanceTracking).map((b) => (
          <div key={b.leaveTypeId} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{b.name}</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{fmtDays(b.available)}<span className="ml-1 text-sm font-normal text-gray-400">days</span></p>
            <p className="mt-1 text-xs text-gray-500">{b.pending > 0 ? `${fmtDays(b.pending)} waiting approval` : 'Available to take'}{b.nextExpiry ? ` · some expires ${b.nextExpiry}` : ''}</p>
          </div>
        ))}
      </div>

      {applying && (
        <Modal
          size="lg"
          title={editingId !== null ? 'Edit leave request' : 'Apply for leave'}
          subtitle={editingId !== null ? 'Change the type, dates or reason. It stays waiting for approval.' : 'Choose the type and dates. The days are counted for you before you send it.'}
          busy={busy}
          onClose={() => { setApplying(false); setError(''); }}
          footer={
            <>
              <button type="button" onClick={() => { setApplying(false); setError(''); }} disabled={busy} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={submit} disabled={busy || !preview || !preview.enough} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Saving…' : editingId !== null ? 'Save changes' : preview && preview.requiresApproval === false ? 'Apply' : 'Send for approval'}</button>
            </>
          }
        >
          {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">Leave type
            <Select className={fieldClass} value={form.leaveTypeId} onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })}>
              <option value="">Select…</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-gray-700">From<input type="date" className={fieldClass} value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value, toDate: form.toDate < e.target.value ? e.target.value : form.toDate })} /></label>
            <label className="block text-sm font-medium text-gray-700">To<input type="date" min={form.fromDate} className={fieldClass} value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} /></label>
          </div>
          {type?.variants?.length ? (
            <label className="block text-sm font-medium text-gray-700">{type.variantLabel || 'Choose one'}
              <Select className={fieldClass} value={form.variant} onChange={(e) => setForm({ ...form, variant: e.target.value })}>
                <option value="">Choose…</option>
                {type.variants.map((v) => <option key={v.label} value={v.label}>{v.label} (up to {v.maxDays} days)</option>)}
              </Select>
            </label>
          ) : null}
          {type?.eventWindowMonths ? (
            <label className="block text-sm font-medium text-gray-700">{type.eventLabel || 'Event date'}<input type="date" className={fieldClass} value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
              <span className="mt-1 block text-xs text-gray-500">The leave must be taken within {type.eventWindowMonths} months of this date.</span>
            </label>
          ) : null}
          {single && type?.allowHalfDay && (
            <label className="block text-sm font-medium text-gray-700">Part of the day
              <Select className={fieldClass} value={form.half} onChange={(e) => setForm({ ...form, half: e.target.value as '' | 'FIRST' | 'SECOND' })}>
                <option value="">Full day</option><option value="FIRST">First half</option><option value="SECOND">Second half</option>
              </Select>
            </label>
          )}
          {type?.requiresDocument ? (
            <label className="block text-sm font-medium text-gray-700">Supporting document{docNeeded ? ' (required)' : ' (optional for this length)'}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className={fieldClass} onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} />
              <span className="mt-1 block text-xs text-gray-500">PDF, JPG or PNG, up to 10 MB (for example the medical certificate).</span>
            </label>
          ) : null}
          <label className="block text-sm font-medium text-gray-700">Reason
            <textarea rows={2} maxLength={300} className={fieldClass} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </label>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <h3 className="text-base font-semibold text-gray-900">What this will take</h3>
          {previewError && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{previewError}</p>}
          {!preview && !previewError && <p className="mt-3 text-sm text-gray-500">Choose a leave type and dates to see the days counted.</p>}
          {preview && (
            <div className="mt-3 space-y-3">
              <p className="text-3xl font-semibold text-gray-900">{preview.totalDays} <span className="text-base font-normal text-gray-500">day{preview.totalDays === 1 ? '' : 's'}</span></p>
              {preview.sandwichDays > 0 && <p className="rounded-lg bg-purple-50 px-3 py-2 text-sm text-purple-800">{preview.requestedDays} day(s) you asked for plus {preview.sandwichDays} off day(s) counted by the sandwich leave rule.</p>}
              {preview.available !== null && <p className={`text-sm ${preview.enough ? 'text-gray-600' : 'font-medium text-red-700'}`}>{preview.enough ? `Your available balance is ${fmtDays(preview.available)} day(s).` : `Not enough balance: ${fmtDays(preview.available)} available.`}</p>}
              {preview.warnings.map((w) => <p key={w} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{w}</p>)}
              <div className="max-h-56 overflow-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {preview.days.map((d) => (
                      <tr key={d.date}>
                        <td className="px-3 py-1.5 font-mono text-[13px] text-gray-700">{d.date} <span className="text-gray-400">{new Date(`${d.date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })}</span></td>
                        <td className={`px-3 py-1.5 ${KIND_TONE[d.reason]}`}>{REASON_TEXT[d.reason]}</td>
                        <td className="px-3 py-1.5 text-right text-gray-700">{d.days || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
          </div>
        </Modal>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-gray-600">Status
            <Select className={`${fieldClass} !mt-1 w-40`} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All</option>
              <option value="PENDING">Waiting for approval</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
          </label>
          <label className="text-xs font-medium text-gray-600">Leave type
            <Select className={`${fieldClass} !mt-1 w-48`} value={filters.leaveTypeId} onChange={(e) => setFilters({ ...filters, leaveTypeId: e.target.value })}>
              <option value="">All types</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </label>
          <label className="text-xs font-medium text-gray-600">From
            <input type="date" className={`${fieldClass} !mt-1`} value={filters.from} max={filters.to || undefined} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          </label>
          <label className="text-xs font-medium text-gray-600">To
            <input type="date" className={`${fieldClass} !mt-1`} value={filters.to} min={filters.from || undefined} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          </label>
          {filtered && <button type="button" onClick={() => setFilters({ status: '', leaveTypeId: '', from: '', to: '' })} className="pb-2 text-sm font-medium text-blue-600 hover:text-blue-800">Clear filters</button>}
          <p className="ml-auto pb-2 text-sm text-gray-500">{apps.length} application{apps.length === 1 ? '' : 's'}{filtered ? ' match' : ''}</p>
        </div>
        <p className="mt-1 text-xs text-gray-400">The date filter shows leave that overlaps the dates you choose.</p>
      </section>

      <section className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"><tr><th className="px-4 py-3">Type</th><th className="px-4 py-3">Dates</th><th className="px-4 py-3">Days</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Reason / note</th><th className="px-4 py-3" /></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {apps.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">{filtered ? 'No leave matches these filters.' : 'No leave yet.'}</td></tr>
            ) : (
              paged.pageRows.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{a.leaveType.name}{a.variant && <span className="block text-xs font-normal text-gray-500">{a.variant}</span>}</td>
                  <td className="px-4 py-3 font-mono text-[13px] text-gray-700">{a.fromDate}{a.toDate !== a.fromDate ? ` to ${a.toDate}` : a.halfDayPart ? ` (${a.halfDayPart.toLowerCase()} half)` : ''}</td>
                  <td className="px-4 py-3 text-gray-700">{a.totalDays}{a.sandwichDays > 0 && <span className="ml-1 text-xs text-purple-700">incl. {a.sandwichDays} sandwich</span>}</td>
                  <td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[a.status]}`}>{LEAVE_STATUS_LABEL[a.status]}</span></td>
                  <td className="max-w-xs truncate px-4 py-3 text-xs text-gray-500" title={`${a.reason ?? ''} ${a.decisionNote ?? ''}`}>{a.decisionNote || a.reason}</td>
                  <td className="px-4 py-3 text-right">{(a.hasAttachment || a.status === 'PENDING') && <button type="button" onClick={() => setDocsFor({ id: a.id, label: `${a.leaveType.name}, ${a.fromDate}${a.toDate !== a.fromDate ? ` to ${a.toDate}` : ''}` })} className="mr-3 text-xs font-medium text-blue-600 hover:text-blue-800">Documents{a.attachments?.length ? ` (${a.attachments.length})` : ''}</button>}{docsFor?.id === a.id && <LeaveDocumentsModal applicationId={a.id} title={docsFor.label} canManage={a.status === 'PENDING'} onChanged={reload} onClose={() => setDocsFor(null)} />}{a.status === 'PENDING' && <button type="button" onClick={() => openEdit(a)} className="mr-3 text-xs font-medium text-blue-600 hover:text-blue-800">Edit</button>}{(a.status === 'PENDING' || a.status === 'MANAGER_APPROVED' || (a.status === 'APPROVED' && a.fromDate > today())) && <button type="button" onClick={() => cancel(a)} className="text-xs font-medium text-red-600 hover:text-red-800">Cancel</button>}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {apps.length > 0 && <Pagination page={paged.pagination.page} pageSize={paged.pagination.pageSize} total={paged.pagination.total} onPageChange={paged.pagination.onPageChange} onPageSizeChange={paged.pagination.onPageSizeChange} />}
      </section>
    </div>
  );
}
