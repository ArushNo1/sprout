'use client';

import { useSearchParams, useParams } from 'next/navigation';
import { Suspense } from 'react';
import Host from '@/components/play/Host';
import { normalizeCode } from '@/lib/algorithms';

function HostPage() {
  const code = normalizeCode(decodeURIComponent(useParams<{ code: string }>().code));
  const key = useSearchParams().get('k') ?? null;
  return <Host code={code} hostKey={key} />;
}

export default function HostRoute() {
  return <Suspense><HostPage /></Suspense>;
}
