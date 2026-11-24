import React, { useEffect, useState } from 'react';
import Modal from './Modal';

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

/**
 * Popup that shows one file (PDF or image) with a download button. Other types are download only.
 * `load` returns an object URL for the file; it is called once when the popup opens.
 */
export default function DocumentViewer({
  fileName,
  load,
  onClose,
}: {
  fileName: string;
  load: () => Promise<string>;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const isPdf = ext === 'pdf';
  const isImage = IMAGE_EXT.includes(ext);

  // Fetch once with the signed-in token (the file endpoints are not public), then show it from an object URL.
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    load()
      .then((u) => {
        objectUrl = u;
        if (cancelled) URL.revokeObjectURL(u);
        else setUrl(u);
      })
      .catch((e: any) => !cancelled && setError(e.message || 'Could not open the file'));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const download = () => {
    if (!url) return;
    const a = window.document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  };

  return (
    <Modal
      title={fileName}
      subtitle={isPdf ? 'PDF' : isImage ? 'Image' : 'File'}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={() => url && window.open(url, '_blank')} disabled={!url} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Open in new tab
          </button>
          <button type="button" onClick={download} disabled={!url} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Download
          </button>
          <button type="button" onClick={onClose} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
            Close
          </button>
        </>
      }
    >
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>
      ) : !url ? (
        <p className="py-16 text-center text-sm text-gray-400">Loading…</p>
      ) : isPdf ? (
        <iframe src={url} title={fileName} className="h-[70vh] w-full rounded-lg border border-gray-200" />
      ) : isImage ? (
        <div className="flex max-h-[70vh] justify-center overflow-auto rounded-lg bg-gray-50 p-2">
          <img src={url} alt={fileName} className="max-w-full object-contain" />
        </div>
      ) : (
        <p className="py-16 text-center text-sm text-gray-500">This file type cannot be previewed here. Use Download to open it.</p>
      )}
    </Modal>
  );
}
