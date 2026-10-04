import { useEffect, useState, type FormEvent } from 'react';
import { useReducer } from 'spacetimedb/react';
import { normalizeCode } from '@/lib/algorithms';
import { reducers } from '@/lib/module_bindings';
import { Choices, CrowdLine, Frame, GrowthList, Leaderboard, Notice, Roster, Timer, gate } from '@/components/play/parts';
import { looksLikeCode, ordinal, secondsLeft } from '@/components/play/route';
import { errorText, pct, startedMs, useGame, useGrowth, useNow, type GameState } from '@/components/play/useGame';

const NAME_KEY = 'sprout-play-name';

export const gardenHref = (address: string, courseId: bigint) =>
  `/${encodeURIComponent(address)}/garden?course=${courseId}`;

function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}

function savedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export default function Player({ code, playKey }: { code: string | null; playKey: string | null }) {
  if (!code) return <EnterCode />;
  return <PlayGame code={code} playKey={playKey} />;
}

function EnterCode() {
  const [code, setCode] = useState('');
  const go = (e: FormEvent) => {
    e.preventDefault();
    if (looksLikeCode(code)) window.location.assign(`/play/${normalizeCode(code)}`);
  };
  return (
    <Frame>
      <form className="join" onSubmit={go}>
        <h1>Join a game</h1>
        <label htmlFor="code">Game code</label>
        <input
          id="code"
          className="join__code"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={9}
          placeholder="ABC123"
          autoFocus
        />
        <button className="btn" disabled={!looksLikeCode(code)}>
          Next
        </button>
      </form>
    </Frame>
  );
}

function PlayGame({ code, playKey }: { code: string; playKey: string | null }) {
  const g = useGame(code);
  const blocked = gate(g, code);
  if (blocked) return <Frame>{blocked}</Frame>;
  if (!g.me) {
    if (g.game!.status === 'finished')
      return (
        <Frame>
          <Notice title="This game has ended">Ask the host to start a new one.</Notice>
        </Frame>
      );
    return <JoinForm code={code} playKey={playKey} />;
  }
  return (
    <Frame>
      <PlayStage g={g} code={code} />
    </Frame>
  );
}

export function JoinForm({ code, playKey }: { code: string; playKey: string | null }) {
  const join = useReducer(reducers.joinGame);
  const [name, setName] = useState(savedName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem(NAME_KEY, name.trim());
    } catch {
      /* private mode: the name just isn't remembered */
    }
    join({ code, name, hostKey: playKey ?? undefined })
      .catch(err => setError(errorText(err)))
      .finally(() => setBusy(false));
  };

  return (
    <Frame>
      <form className="join" onSubmit={submit}>
        <h1>
          Game <span className="join__badge">{code}</span>
        </h1>
        <label htmlFor="name">Your name</label>
        <input
          id="name"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={20}
          autoComplete="nickname"
          placeholder="What should we call you?"
          autoFocus
        />
        {playKey && (
          <p className="join__note">
            You're joining as the student who made this game, so your answers
            count toward your Sprout garden.
          </p>
        )}
        <button className="btn" disabled={busy || !name.trim()}>
          Join
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </Frame>
  );
}

function PlayStage({ g, code }: { g: GameState; code: string }) {
  const game = g.game!;
  const me = g.me!;
  const q = g.question;
  const submit = useReducer(reducers.submitAnswer);
  const now = useNow(250);
  // What this device picked; the server keeps choices private until the reveal.
  const [picked, setPicked] = useState<{ index: number; choice: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const growth = useGrowth(me.learnerAddress, game.courseId, me.joinedAt.microsSinceUnixEpoch);
  const right = g.myAnswer?.correct === true;

  useEffect(() => setError(null), [game.questionIndex, game.status]);
  // A small buzz when the answer lands, so a phone in hand feels the reveal.
  useEffect(() => {
    if (game.status === 'reveal') buzz(right ? 40 : [30, 60, 30]);
  }, [game.status, game.questionIndex]);

  const head = (
    <header className="me">
      <span className="me__name">{me.name}</span>
      <span className="me__score">{me.score.toLocaleString()}</span>
    </header>
  );

  if (game.status === 'lobby')
    return (
      <>
        {head}
        <Notice title="You're in">
          Watch the host's screen. The game starts when they're ready.
        </Notice>
        {g.ranked.length > 1 && (
          <ul className="chips chips--center" aria-label="Players here">
            {g.ranked.map(p => (
              <li key={String(p.id)} className={p.id === me.id ? 'chip chip--me' : 'chip'}>
                {p.name}
              </li>
            ))}
          </ul>
        )}
      </>
    );

  if (game.status === 'finished')
    return (
      <>
        {head}
        <section className="result">
          <p className="result__big">{ordinal(me.rank)} place</p>
          <p>
            {me.score.toLocaleString()} points, {me.correctCount} of {game.questionCount} right
          </p>
          {me.learnerAddress && (
            <p className="result__garden">
              Your answers were saved to Sprout.{' '}
              <a href={gardenHref(me.learnerAddress, game.courseId)}>See your garden</a>.
            </p>
          )}
        </section>
        <GrowthList list={growth.list} title="What grew" />
        <Leaderboard ranked={g.ranked} meId={me.id} />
      </>
    );

  if (!q) return <p className="play__loading">Loading the question…</p>;
  const mine = picked && picked.index === game.questionIndex ? picked.choice : undefined;

  if (game.status === 'question') {
    const left = secondsLeft(startedMs(game), game.secondsPerQuestion, now);
    const choose = (choice: number) => {
      setPicked({ index: game.questionIndex, choice });
      submit({ code, questionIndex: game.questionIndex, choice }).catch(err => {
        setPicked(null);
        setError(errorText(err));
      });
    };
    return (
      <>
        {head}
        <div className="stage__bar">
          <span>
            {game.questionIndex + 1} of {game.questionCount}
          </span>
          <Timer left={left} total={game.secondsPerQuestion} />
        </div>
        <h2 className="prompt">{q.prompt}</h2>
        {g.myAnswer || mine !== undefined ? (
          <>
            <Choices choices={q.choices} picked={mine} />
            <p className="waiting">
              Locked in. {g.answersNow.length} of {g.ranked.length} answered…
            </p>
            <Roster g={g} />
          </>
        ) : (
          <Choices choices={q.choices} onPick={choose} disabled={left === 0} />
        )}
        {error && <p className="error">{error}</p>}
      </>
    );
  }

  // Reveal.
  const answered = g.myAnswer;
  const move = g.moves.get(me.id);
  const started = game.questionStartedAt?.microsSinceUnixEpoch ?? 0n;
  const grew = growth.latest && growth.latest.at >= started && growth.latest.conceptId === q.conceptId ? growth.latest : undefined;
  return (
    <>
      {head}
      <section className={right ? 'verdict verdict--right' : 'verdict verdict--wrong'}>
        <p className="verdict__word">{!answered ? 'Out of time' : right ? 'Correct' : 'Not quite'}</p>
        {right && <p className="verdict__points">+{answered!.points.toLocaleString()}</p>}
        {me.streak >= 2 && <p className="verdict__streak">{me.streak} in a row</p>}
        <p className="verdict__rank">
          You're in {ordinal(me.rank)}
          {move && move.places > 0 && ` (up ${move.places})`}
          {move && move.places < 0 && ` (down ${-move.places})`}
        </p>
        {move && move.passed.length > 0 && (
          <p className="verdict__passed">
            You passed {move.passed.slice(0, 2).join(' and ')}
            {move.passed.length > 2 && ` and ${move.passed.length - 2} more`}
          </p>
        )}
        {grew && (
          <p className="verdict__grew">
            {grew.name}: {pct(grew.before)} → {pct(grew.after)} mastery
          </p>
        )}
      </section>
      <h2 className="prompt">{q.prompt}</h2>
      <Choices choices={q.choices} correct={q.correctIndex} picked={mine} />
      <CrowdLine g={g} />
      {q.explanation && <p className="explain">{q.explanation}</p>}
    </>
  );
}
