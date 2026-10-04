import type { ReactNode } from 'react';
import { ordinal } from './route';
import type { GameState } from './useGame';

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

export function Leaderboard({
  ranked,
  limit,
  meId,
}: {
  ranked: GameState['ranked'];
  limit?: number;
  meId?: bigint;
}) {
  const rows = limit ? ranked.slice(0, limit) : ranked;
  if (rows.length === 0) return null;
  return (
    <ol className="board">
      {rows.map(p => (
        <li key={String(p.id)} className={p.id === meId ? 'board__row board__row--me' : 'board__row'}>
          <span className="board__rank">{ordinal(p.rank)}</span>
          <span className="board__name">{p.name}</span>
          {p.streak >= 2 && <span className="board__streak">{p.streak} in a row</span>}
          <span className="board__score">{p.score.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}
