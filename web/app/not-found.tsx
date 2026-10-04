import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="empty">
      <h1>Nothing growing here</h1>
      <p className="muted">That link doesn&apos;t match a Sprout page. Ask Sprout in ASI:One for a fresh one.</p>
      <Link href="/">Back to Sprout</Link>
    </div>
  );
}
