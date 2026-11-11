'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
export function UploadButton({
  scope,
  onUploaded,
}: {
  scope: 'PRODUCT' | 'KYC';
  onUploaded: (value: { id: string; url: string }) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <div>
      <label className="text-link">
        {busy ? 'Uploading securely…' : 'Upload a file'}
        <input
          className="upload-input"
          type="file"
          accept={
            scope === 'KYC'
              ? 'image/jpeg,image/png,image/webp,application/pdf'
              : 'image/jpeg,image/png,image/webp'
          }
          disabled={busy}
          onChange={async (e) => {
            const file = e.currentTarget.files?.[0];
            if (!file) return;
            if (file.size > 10 * 1024 * 1024) {
              setError('Please choose a file under 10 MB');
              return;
            }
            setBusy(true);
            setError('');
            try {
              const body = new FormData();
              body.append('file', file);
              onUploaded(await api(`/uploads?scope=${scope}`, { method: 'POST', body }));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function ProductImageInput({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="form">
      <label>
        Image URL
        <input name="image" required value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <UploadButton scope="PRODUCT" onUploaded={(r) => setValue(r.url)} />
    </div>
  );
}
