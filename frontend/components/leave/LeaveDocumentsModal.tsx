import React, { useEffect, useState } from 'react';
import Modal from '../Modal';
import DocumentViewer from '../DocumentViewer';
import { LeaveDocument, leaveDocumentUrl, listLeaveDocuments, removeLeaveDocument, uploadLeaveDocument } from '../../lib/leave-api';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['pdf', 'jpg', 'jpeg', 'png'];

/**
 * Popup listing the supporting documents of one leave. Anyone who can see the leave can view a document.
 * `canManage` (the employee or HR, while the leave is waiting for a decision) adds and removes documents.
 */
export default function LeaveDocumentsModal({
  applicationId,
  title,
  canManage,
  onChanged,
  onClose,
}: {
  applicationId: number;
  title: string;
  canManage: boolean;
  /** Called after a document is added or removed, so the list behind can refresh its counts. */
  onChanged?: () => void;
  onClose: () => void;
}) {
  const [docs, setDocs] = useState<LeaveDocument[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<LeaveDocument | null>(null);

  const load = () =>
    listLeaveDocuments(applicationId)
      .then((r) => setDocs(r.data))
      .catch((e: any) => setError(e.message || 'Could not load the documents'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  const add = async (file: File | null) => {
    if (!file) return;
    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    if (!ALLOWED.includes(ext) || file.size > MAX_BYTES) {
      setError('Only PDF, JPG or PNG files up to 10 MB can be added');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await uploadLeaveDocument(applicationId, file);
      await load();
      onChanged?.();
    } catch (e: any) {
      setError(e.message || 'Could not add the document');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: LeaveDocument) => {
    if (!window.confirm(`Remove "${d.name}" from this leave?`)) return;
    setBusy(true);
    setError('');
    try {
      await removeLeaveDocument(applicationId, d.id);
      await load();
      onChanged?.();
    } catch (e: any) {
      setError(e.message || 'Could not remove the document');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal title="Documents" subtitle={title} size="md" busy={busy} onClose={onClose}>
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}

        {docs === null ? (
          <p className="py-6 text-center text-sm text-gray-400">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">No documents on this leave yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0 truncate text-sm text-gray-800" title={d.name}>{d.name}</span>
                <span className="flex shrink-0 items-center gap-4">
                  <button type="button" onClick={() => setViewing(d)} className="text-xs font-medium text-blue-600 hover:text-blue-800">View</button>
                  {canManage && (
                    <button type="button" onClick={() => remove(d)} disabled={busy} className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50">Remove</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <label className={`mt-5 flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-blue-600 hover:bg-blue-50 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
            {busy ? 'Working…' : '+ Add document (PDF, JPG or PNG, up to 10 MB)'}
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="hidden"
              onChange={(e) => {
                add(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </Modal>

      {viewing && (
        <DocumentViewer
          fileName={viewing.name}
          load={() => leaveDocumentUrl(applicationId, viewing.id)}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}
