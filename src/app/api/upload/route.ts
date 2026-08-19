import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxies to ClinicPlus's own existing upload endpoint —
 * `${REACT_APP_IO_SERVER}/upload-file-to-cloud-storage` on
 * clinicplus-server-latest-stable-version (a public, unauthenticated multipart-to-GCS route,
 * see app.post('/upload-file-to-cloud-storage', gcs.upload) in that repo). Resolves Part A #3's
 * open storage decision in favor of (a): reuse ClinicPlus's existing transport rather than a
 * separate account, so the resulting URLs are ones admins already know how to view correctly —
 * this is what actually fixes the "admins can't properly view the files" problem from F.4, not
 * a different third-party storage account.
 */
const CLINICPLUS_UPLOAD_URL = process.env.CLINICPLUS_UPLOAD_URL
  || 'https://api.clinicplusbooking.co.za/upload-file-to-cloud-storage';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const uploadFormData = new FormData();
  uploadFormData.append('file', file, file.name);

  const res = await fetch(CLINICPLUS_UPLOAD_URL, { method: 'POST', body: uploadFormData });

  if (!res.ok) {
    const errorBody = await res.text();
    return NextResponse.json(
      { error: `Upload failed: ${errorBody}` },
      { status: 502 }
    );
  }

  const data = await res.json();
  return NextResponse.json({ publicUrl: data.publicUrl });
}
