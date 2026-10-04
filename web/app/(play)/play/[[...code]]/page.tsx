'use client';

import { useSearchParams, useParams } from 'next/navigation';
import { Suspense } from 'react';
import Player from '@/components/play/Player';
import { normalizeCode } from '@/lib/algorithms';

function PlayPage() {
  // Optional catch-all: `code` is the list of path segments, e.g. ['DDWBNA'].
  const params = useParams<{ code?: string[] }>();
  const searchParams = useSearchParams();
  const raw = params?.code?.[0];
  const code = raw ? normalizeCode(decodeURIComponent(raw)) || null : null;
  const key = searchParams.get('k') ?? null;
  return <Player code={code} playKey={key} />;
}

export default function Play() {
  return <Suspense><PlayPage /></Suspense>;
}
