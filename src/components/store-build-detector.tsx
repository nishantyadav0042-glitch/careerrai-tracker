'use client';

import { useEffect } from 'react';
import { markStoreBuildFromUrl } from '@/lib/store-build';

// Remembers, once per device, that this session launched from a store wrapper
// (?source=twa|ios on the start URL). Renders nothing. See lib/store-build.ts.
export function StoreBuildDetector() {
  useEffect(() => { markStoreBuildFromUrl(); }, []);
  return null;
}
