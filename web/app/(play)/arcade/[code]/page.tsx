'use client';

import { useSearchParams, useParams } from 'next/navigation';
import { Suspense } from 'react';
import Arcade from '@/components/play/Arcade';

function ArcadePage() {
  const { code } = useParams<{ code: string }>();
  const key = useSearchParams().get('k') ?? null;
  return <Arcade code={code} playKey={key} />;
}

export default function ArcadeRoute() {
  return <Suspense><ArcadePage /></Suspense>;
}
