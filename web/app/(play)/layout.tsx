import '@/components/play/play.css';
import StdbProvider from '@/components/play/StdbProvider';
import type { ReactNode } from 'react';

export default function PlayLayout({ children }: { children: ReactNode }) {
  return <StdbProvider>{children}</StdbProvider>;
}
