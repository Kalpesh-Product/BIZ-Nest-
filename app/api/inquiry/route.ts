export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({ message: 'Invalid request origin.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 6_000_000) return Response.json({ message: 'Please keep attachments under 5 MB.' }, { status: 413 });
  let data: FormData;
  try { data = await request.formData(); }
  catch { return Response.json({ message: 'Invalid form data.' }, { status: 400 }); }
  const name = String(data.get('name') || '').trim();
  const email = String(data.get('email') || '').trim();
  const mobile = String(data.get('mobile') || '').trim();
  if (!name || name.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !/^[1-9]\d{9}$/.test(mobile)) {
    return Response.json({ message: 'Please enter your name, a valid email and a 10 digit mobile number.' }, { status: 400 });
  }
  for (const [, value] of data) {
    if (typeof value === 'string' && value.length > 10_000) return Response.json({ message: 'A field is too long.' }, { status: 400 });
    if (value instanceof File && value.size && (value.size > 5_000_000 || !/\.(pdf|docx?)$/i.test(value.name))) return Response.json({ message: 'Please upload a PDF or Word resume under 5 MB.' }, { status: 400 });
  }
  const webhook = process.env.INQUIRY_WEBHOOK_URL;
  if (!webhook) return Response.json({ message: 'Online submissions are not configured yet. Please email response@biznest.co.in, attaching your resume if applicable.' }, { status: 503 });
  try {
    const response = await fetch(webhook, { method: 'POST', body: data, signal: AbortSignal.timeout(15_000), headers: process.env.INQUIRY_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.INQUIRY_WEBHOOK_TOKEN}` } : {} });
    if (!response.ok) throw new Error('Delivery failed');
    return Response.json({ message: 'Thank you! Your inquiry has been sent.' });
  } catch { return Response.json({ message: 'We could not deliver your inquiry. Please email response@biznest.co.in.' }, { status: 502 }); }
}
