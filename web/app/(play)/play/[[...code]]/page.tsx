'use client';

import { useSearchParams, useParams } from 'next/navigation';
import { Suspense } from 'react';
import Player from '@/components/play/Player';

function PlayPage() {
  const params = useParams<{ code?: string }>();
  const searchParams = useSearchParams();
  const code = params?.code ?? null;
  const key = searchParams.get('k') ?? null;
  return <Player code={code} playKey={key} />;
}

export default function Play() {
  return <Suspense><PlayPage /></Suspense>;
}
