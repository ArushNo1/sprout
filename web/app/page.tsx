import ShowcaseCarousel, { type Slide } from '@/components/ShowcaseCarousel';
import SiteHeader from '@/components/SiteHeader';

// One clip per capability, in /public/showcase. The tech line is the part worth showing off.
const SLIDES: Slide[] = [
  {
    id: 'syllabus', title: 'Syllabus in, study map out',
    blurb: 'Paste your syllabus and Sprout builds the map of your course: every concept, and what has to come first.',
    tech: 'LLM extraction → cycle-free prerequisite graph',
  },
  {
    id: 'mastery', title: 'Knows what you actually know',
    blurb: 'Every answer updates a live estimate of how well you know each concept, not just a right or wrong.',
    tech: 'Bayesian knowledge tracing per concept',
  },
  {
    id: 'unlock', title: 'Teaches what you’re ready for',
    blurb: 'It picks the weakest concept whose foundations are solid, and unlocks the next ones as you grow.',
    tech: 'Prerequisite-gated next-step selection',
  },
  {
    id: 'formats', title: 'Learns how you learn',
    blurb: 'It tries worked examples, flashcards, diagrams and analogies, then keeps whatever raises your scores.',
    tech: 'Thompson sampling over Beta posteriors',
  },
  {
    id: 'review', title: 'Reviews before you forget',
    blurb: 'Each review lands just before you would forget, and never later than the day before your exam.',
    tech: 'SM-2 spaced repetition, capped at the exam date',
  },
  {
    id: 'games', title: 'Play it with friends',
    blurb: 'Turn studying into a live game. Every answer still counts toward your own mastery.',
    tech: 'Realtime rooms on SpacetimeDB',
  },
  {
    id: 'memory', title: 'A new chat already knows you',
    blurb: 'Open ASI:One tomorrow and say “let’s keep going.” Sprout picks up exactly where you left off.',
    tech: 'Three Agentverse agents, one shared database',
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="wrap wrap--wide">
        <div className="hero">
          <h1 className="title">sprout</h1>
          <p className="eyebrow">Learning that grows with you</p>
          <p className="lead">A study partner in ASI:One that remembers what you know, teaches what you are ready for, and brings you back before you forget.</p>
          <div className="actions">
            <a className="cta" href="https://asi1.ai">Open Sprout in ASI:One</a>
            <a className="cta cta--ghost" href="#showcase">See how it works</a>
          </div>
        </div>

        <section id="showcase" className="showcase" aria-labelledby="showcase-h">
          <h2 id="showcase-h" className="showcase-h">What makes it different</h2>
          <ShowcaseCarousel slides={SLIDES} />
        </section>

        <section className="closing">
          <h2>Your course, as a garden.</h2>
          <p className="muted">Paste a syllabus to Sprout in ASI:One. It will send you a link to your garden when it is ready.</p>
          <a className="cta" href="https://asi1.ai">Open Sprout in ASI:One</a>
        </section>
      </main>
    </>
  );
}
