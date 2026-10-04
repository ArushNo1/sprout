import SiteHeader from '@/components/SiteHeader';

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="hero">
          <h1 className="title">sprout</h1>
          <p className="eyebrow">It grows with you</p>
          <p className="lead">A study partner that remembers what you know. Paste a syllabus in ASI:One and watch your course grow into a garden you can explore here.</p>
          <div className="actions">
            <a className="cta" href="https://asi1.ai">Open Sprout in ASI:One</a>
            <a className="cta cta--ghost" href="/play">Join a game</a>
          </div>
        </div>
      </main>
    </>
  );
}
