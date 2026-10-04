import Link from 'next/link';

/** Wordmark plus navigation. With a learner id it links to their garden and the join-a-game page. */
export default function SiteHeader({ userId, current }: { userId?: string; current?: 'garden' | 'play' }) {
  const id = userId ? encodeURIComponent(userId) : null;
  return (
    <header className="site-header">
      <Link href={id ? `/${id}` : '/'} className="site-brand" aria-label="Sprout home">
        sprout
        <svg viewBox="0 0 70 70" aria-hidden="true"><path d="M5 62 C5 28 30 6 66 4 C66 38 44 64 5 62Z" fill="currentColor" /><path d="M12 56 L52 18" stroke="#a4d7a2" strokeWidth="5" strokeLinecap="round" /></svg>
      </Link>
      {id && (
        <nav className="site-nav" aria-label="Sprout">
          <Link href={`/${id}/garden`} aria-current={current === 'garden' ? 'page' : undefined}>Garden</Link>
          <Link href="/play" aria-current={current === 'play' ? 'page' : undefined}>Play</Link>
        </nav>
      )}
    </header>
  );
}
