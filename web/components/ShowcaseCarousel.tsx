'use client';

// A feature carousel for the landing page: one short looping-free video per capability, a list to pick
// from, and auto-advance when a clip ends. It pauses when scrolled out of view, has an explicit
// pause button, and doesn't autoplay for people who ask for reduced motion.

import { useCallback, useEffect, useRef, useState } from 'react';

export type Slide = { id: string; title: string; blurb: string; tech: string };

export default function ShowcaseCarousel({ slides }: { slides: Slide[] }) {
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0); // 0..1 through the current clip
  const [playing, setPlaying] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [inView, setInView] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  const go = useCallback((i: number) => {
    setActive((i + slides.length) % slides.length);
    setProgress(0);
  }, [slides.length]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => { setReduced(mq.matches); if (mq.matches) setPlaying(false); };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // One place decides whether the clip should be running.
  const shouldRun = playing && inView;
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (shouldRun) v.play().catch(() => setPlaying(false)); // autoplay refused: show the play button
    else v.pause();
  }, [shouldRun, active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); go(active + 1); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); go(active - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(slides.length - 1); }
    else return;
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus());
  };

  const slide = slides[active];
  return (
    <div
      ref={root} className="sc"
    >
      <div className="sc-stage" role="tabpanel" id="sc-panel" aria-labelledby={`sc-tab-${slide.id}`}>
        <video
          key={slide.id} ref={video} className="sc-video" muted playsInline preload="auto"
          poster={`/showcase/${slide.id}.jpg`} src={`/showcase/${slide.id}.mp4`}
          aria-label={`${slide.title}. ${slide.blurb}`}
          onTimeUpdate={e => setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 6))}
          onEnded={() => { if (!reduced) go(active + 1); }}
        />
        <button className="sc-toggle" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause the demo' : 'Play the demo'}>
          {playing ? (
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1.5" fill="currentColor" /><rect x="14" y="4" width="5" height="16" rx="1.5" fill="currentColor" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>
          )}
        </button>
      </div>

      <div className="sc-list" role="tablist" aria-label="What Sprout does" aria-orientation="vertical" onKeyDown={onKey}>
        {slides.map((s, i) => {
          const on = i === active;
          return (
            <button
              key={s.id} id={`sc-tab-${s.id}`} role="tab" aria-selected={on} aria-controls="sc-panel" tabIndex={on ? 0 : -1}
              className={`sc-item${on ? ' is-active' : ''}`} onClick={() => go(i)}
            >
              <span className="sc-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="sc-body">
                <span className="sc-title">{s.title}</span>
                {on && (
                  <>
                    <span className="sc-blurb">{s.blurb}</span>
                    <span className="chip chip--tag sc-tech">{s.tech}</span>
                  </>
                )}
              </span>
              <span className="sc-bar" aria-hidden="true"><i style={{ width: on ? `${Math.min(100, progress * 100)}%` : '0%' }} /></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
