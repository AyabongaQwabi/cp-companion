'use client';

import { useState } from 'react';
import { Download, Eye, LoaderCircle, Paperclip, Trash2, Upload } from 'lucide-react';

async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Upload failed');
  }
  const data = await res.json();
  return data.publicUrl;
}

function fileNameFromUrl(url: string): string {
  try {
    return decodeURIComponent(url.split('/').pop() || url);
  } catch {
    return url;
  }
}

/** One uploaded file's status/view/download row — shared by single- and multi-file fields. */
function UploadedFileRow({ url, onRemove }: { url: string; onRemove?: () => void }) {
  return (
    <div className="flex items-center justify-between border border-gray-200 rounded-input px-2 py-1 text-xs bg-white">
      <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 mr-2 text-gray-700" title={fileNameFromUrl(url)}>
        <Paperclip className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
        <span className="truncate">{fileNameFromUrl(url)}</span>
      </span>
      <div className="flex gap-2 items-center shrink-0">
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline text-gray-600 hover:text-red-500 transition-colors">
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          View
        </a>
        <a href={url} download className="inline-flex items-center gap-1 underline text-gray-600 hover:text-red-500 transition-colors">
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Download
        </a>
        {onRemove && (
          <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 transition-colors">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

interface SingleFileUploadFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  multiple?: false;
}

interface MultiFileUploadFieldProps {
  label: string;
  value: string[];
  onChange: (urls: string[]) => void;
  multiple: true;
}

type FileUploadFieldProps = SingleFileUploadFieldProps | MultiFileUploadFieldProps;

/**
 * Shared upload status/view/download UI (Part F.4) — used for job spec files, extra job spec
 * files, and (via the single-file mode) can back the NDA PDF display too. After a successful
 * upload the file must visibly show as uploaded, with a way to view or download it, rather than
 * silently resetting — this component is the fix for that missing feedback.
 */
export default function FileUploadField(props: FileUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError('');
    setUploading(true);
    try {
      const urls = await Promise.all(Array.from(files).map(uploadFile));
      if (props.multiple) {
        props.onChange([...props.value, ...urls]);
      } else {
        props.onChange(urls[0]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 mb-1">
        <Upload className="h-3.5 w-3.5" aria-hidden="true" />
        {props.label}
      </label>

      {!props.multiple && props.value && (
        <div className="mb-2">
          <UploadedFileRow url={props.value} onRemove={() => props.onChange('')} />
        </div>
      )}
      {props.multiple && props.value.length > 0 && (
        <div className="mb-2 flex flex-col gap-1">
          {props.value.map((url, i) => (
            <UploadedFileRow
              key={url}
              url={url}
              onRemove={() => props.onChange(props.value.filter((_, idx) => idx !== i))}
            />
          ))}
        </div>
      )}

      <input
        type="file"
        multiple={props.multiple}
        onChange={(e) => handleFiles(e.target.files)}
        className="text-sm"
        disabled={uploading}
      />
      {uploading && (
        <p className="inline-flex items-center gap-1.5 text-xs text-gray-500 mt-1">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin text-red-500" aria-hidden="true" />
          Uploading...
        </p>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
