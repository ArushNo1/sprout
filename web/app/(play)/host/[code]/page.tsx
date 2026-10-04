'use client';

import { useSearchParams, useParams } from 'next/navigation';
import { Suspense } from 'react';
import Host from '@/components/play/Host';

function HostPage() {
  const { code } = useParams<{ code: string }>();
  const key = useSearchParams().get('k') ?? null;
  return <Host code={code} hostKey={key} />;
}

export default function HostRoute() {
  return <Suspense><HostPage /></Suspense>;
}
