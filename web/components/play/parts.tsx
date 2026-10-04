import type { CSSProperties, ReactNode } from 'react';
import { ordinal } from '@/components/play/route';
import { pct, type GameState, type Growth, type Move } from '@/components/play/useGame';

// U+FE0E keeps these as text glyphs; some phones draw ◆ as a pink emoji.
export const SHAPES = ['▲', '◆', '●', '■'].map(s => s + '\uFE0E');

export function Frame({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'play play--wide' : 'play'}>
      <a className="play__brand" href="/play">
        sprout <span>live</span>
      </a>
      {children}
    </div>
  );
}

export function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="notice">
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </section>
  );
}

/** Loading, connection and missing-game states shared by both screens. */
export function gate(g: GameState, code: string): ReactNode | null {
  if (!g.ready) {
    if ((g.connectionError && !g.isActive) || g.stalled)
      return (
        <Notice title="Can't reach the game">
          Check your connection and reload the page. If it keeps happening, ask
          Sprout for a new game.
        </Notice>
      );
    return <p className="play__loading">Finding game {code}…</p>;
  }
  if (!g.game)
    return (
      <Notice title={`No game with code ${code}`}>
        Check the code with whoever is hosting. Games are cleared a day after
        they're made.
      </Notice>
    );
  return null;
}

export function Timer({ left, total }: { left: number; total: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className={left <= 5 ? 'timer timer--low' : 'timer'} aria-label={`${left} seconds left`}>
      <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden>
        <circle cx="32" cy="32" r={r} className="timer__track" />
        <circle
          cx="32"
          cy="32"
          r={r}
          className="timer__fill"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - left / total)}
        />
      </svg>
      <span>{left}</span>
    </div>
  );
}

export function Choices({
  choices,
  correct,
  counts,
  picked,
  onPick,
  disabled,
}: {
  choices: readonly string[];
  correct?: number;
  counts?: readonly number[];
  picked?: number;
  onPick?: (i: number) => void;
  disabled?: boolean;
}) {
  const most = Math.max(1, ...(counts ?? [0]));
  return (
    <div className="choices">
      {choices.map((text, i) => {
        const cls = [
          'choice',
          `choice--${i}`,
          correct !== undefined && (i === correct ? 'choice--right' : 'choice--dim'),
          picked === i && 'choice--picked',
        ]
          .filter(Boolean)
          .join(' ');
        const body = (
          <>
            <span className="choice__shape" aria-hidden>
              {SHAPES[i]}
            </span>
            <span className="choice__text">{text}</span>
            {counts && (
              <span className="choice__count">
                <span
                  className="choice__bar"
                  style={{ width: `${(100 * (counts[i] ?? 0)) / most}%` }}
                />
                {counts[i] ?? 0}
              </span>
            )}
            {correct === i && (
              <span className="choice__mark" aria-label="correct answer">
                ✓
              </span>
            )}
          </>
        );
        return onPick ? (
          <button key={i} className={cls} disabled={disabled} onClick={() => onPick(i)}>
            {body}
          </button>
        ) : (
          <div key={i} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The standings. With `moves`, rows start where they stood before the reveal
 * and slide to their new places, so every screen replays the same shake-up.
 */
export function Leaderboard({
  ranked,
  limit,
  meId,
  moves,
}: {
  ranked: GameState['ranked'];
  limit?: number;
  meId?: bigint;
  moves?: Map<bigint, Move>;
}) {
  const rows = limit ? ranked.slice(0, limit) : ranked;
  if (rows.length === 0) return null;
  return (
    <ol className="board">
      {rows.map(p => {
        const m = moves?.get(p.id);
        const cls = ['board__row', p.id === meId && 'board__row--me', m?.rows && 'board__row--moved']
          .filter(Boolean)
          .join(' ');
        return (
          <li
            key={String(p.id)}
            className={cls}
            style={m?.rows ? ({ '--from': m.rows } as CSSProperties) : undefined}
          >
            <span className="board__rank">{ordinal(p.rank)}</span>
            <span className="board__name">{p.name}</span>
            {p.streak >= 2 && <span className="board__streak">{p.streak} in a row</span>}
            {m && m.places !== 0 && (
              <span className={m.places > 0 ? 'board__move board__move--up' : 'board__move board__move--down'}>
                {m.places > 0 ? '▲' : '▼'}
                {Math.abs(m.places)}
              </span>
            )}
            <span className="board__score">{p.score.toLocaleString()}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Who's locked in on the current question, lit up as their answers land. */
export function Roster({ g, showTimes = false }: { g: GameState; showTimes?: boolean }) {
  const inAt = new Map(g.answersNow.map(a => [a.playerId, a.answeredMs]));
  return (
    <ul className="roster" aria-label={`${inAt.size} of ${g.ranked.length} answered`}>
      {g.ranked.map(p => {
        const ms = inAt.get(p.id);
        return (
          <li key={String(p.id)} className={ms === undefined ? 'roster__p' : 'roster__p roster__p--in'}>
            {p.name}
            {showTimes && ms !== undefined && <span className="roster__ms">{(ms / 1000).toFixed(1)}s</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** "4 of 6 got it · fastest: Ana, 1.8 s", from the reveal's published counts. */
export function CrowdLine({ g }: { g: GameState }) {
  const c = g.crowd;
  if (!c || c.total === 0) return null;
  return (
    <p className="crowd">
      <b>
        {c.right} of {c.total}
      </b>{' '}
      got it
      {c.fastest && (
        <>
          {' '}
          · fastest: <b>{c.fastest.name}</b>, {(c.fastest.ms / 1000).toFixed(1)}s
        </>
      )}
    </p>
  );
}

/** Mastery before and after this game, per concept. Updates as answers are scored. */
export function GrowthList({ list, title }: { list: Growth[]; title: string }) {
  if (list.length === 0) return null;
  return (
    <section className="growth">
      <h3 className="stage__sub">{title}</h3>
      <ul className="growth__list">
        {list.map(gr => {
          const up = gr.after >= gr.before;
          return (
            <li key={String(gr.conceptId)} className="growth__row">
              <span className="growth__name">{gr.name}</span>
              <span className="growth__bar" aria-hidden>
                <span className="growth__was" style={{ width: pct(Math.min(gr.before, gr.after)) }} />
                <span
                  className={up ? 'growth__delta growth__delta--up' : 'growth__delta growth__delta--down'}
                  style={{ left: pct(Math.min(gr.before, gr.after)), width: pct(Math.abs(gr.after - gr.before)) }}
                />
              </span>
              <span className="growth__nums">
                {pct(gr.before)} → <b>{pct(gr.after)}</b>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
