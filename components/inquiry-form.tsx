'use client';
import { useState, type FormHTMLAttributes, type ReactNode } from 'react';
export function InquiryForm({ attributes, children }: { attributes: Record<string, unknown>; children: ReactNode }) {
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(false);
  return <form {...attributes as FormHTMLAttributes<HTMLFormElement>} onSubmit={async event => {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    setPending(true); setStatus('Sending…');
    const data = new FormData(form);
    data.set('source', window.location.pathname);
    try {
      const response = await fetch('/api/inquiry', { method: 'POST', body: data });
      const result = await response.json();
      setStatus(result.message || 'Unable to send. Please contact us by email.');
      if (response.ok) form.reset();
    } catch { setStatus('Unable to send your inquiry. Please contact response@biznest.co.in directly.'); }
    finally { setPending(false); }
  }} aria-busy={pending}>
    <fieldset disabled={pending} className="tw:[border:0]! tw:p-0! tw:m-0! tw:min-w-0!">{children}</fieldset>
    {status && <div role="status" className="form-status tw:box-border tw:p-[12px] tw:mt-[12px] tw:bg-white tw:text-[#272727] tw:border-l-[3px] tw:border-l-solid tw:border-l-[#ffc732]">{status} {!pending && <a className="tw:underline! tw:text-[#3d3d3d] tw:hover:text-[#ffc732]" href="mailto:response@biznest.co.in">Email BIZ Nest</a>}</div>}
  </form>;
}
