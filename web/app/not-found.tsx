import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="wrap notfound">
        <h1 className="title">Nothing growing here</h1>
        <p className="muted">That link doesn&apos;t match a Sprout page. Ask Sprout in ASI:One for a fresh one.</p>
        <Link className="cta" href="/">Back to Sprout</Link>
      </main>
    </>
  );
}
