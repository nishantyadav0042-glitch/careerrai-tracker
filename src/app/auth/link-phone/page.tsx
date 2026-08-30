import { Suspense } from 'react';
import { LinkPhoneForm } from './link-phone-form';

// The form reads `dest` from the query string, and useSearchParams() opts a
// component out of prerendering — Next fails the build rather than silently
// shipping a page that renders empty on the server. The boundary is the fix,
// not a `force-dynamic` escape hatch: this screen has a real static shell and
// only the destination is per-request.
export default function LinkPhonePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <LinkPhoneForm />
    </Suspense>
  );
}
