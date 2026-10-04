'use client';

import { useSearchParams, useParams } from 'next/navigation';
import { Suspense } from 'react';
import Arcade from '@/components/play/Arcade';
import { normalizeCode } from '@/lib/algorithms';

function ArcadePage() {
  const code = normalizeCode(decodeURIComponent(useParams<{ code: string }>().code));
  const key = useSearchParams().get('k') ?? null;
  return <Arcade code={code} playKey={key} />;
}

export default function ArcadeRoute() {
  return <Suspense><ArcadePage /></Suspense>;
}
