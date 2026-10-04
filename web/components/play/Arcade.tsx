import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { reducers } from '@/lib/module_bindings';
import { Frame, GrowthList, Notice, gate } from '@/components/play/parts';
import { JoinForm, gardenHref } from '@/components/play/Player';
import { ordinal } from '@/components/play/route';
import { errorText, useGame, useGrowth, type GameState } from '@/components/play/useGame';

const GAMES: Record<string, { name: string; how: string }> = {
  runner: { name: 'Quiz Runner', how: 'Answers fall down four lanes. Move into the right one: arrow keys, or tap a lane.' },
  meteor: { name: 'Meteor Blaster', how: 'Shoot the meteor with the right answer: arrow keys and space, or drag to aim and tap to fire.' },
};

// Arcade games are Kaplay pages in public/arcade, adapted from Nexus's
// templates. They run in a sandboxed iframe and talk to this page by
// postMessage (see public/arcade/bridge.js); this page turns each answer into
// an `arcade_answer` call, so scoring and mastery stay on the server.
export default function Arcade({ code, playKey }: { code: string; playKey: string | null }) {
  const g = useGame(code);
  const blocked = gate(g, code);
  if (blocked) return <Frame>{blocked}</Frame>;
  const game = g.game!;
  if (game.mode !== 'arcade')
    return (
      <Frame>
        <Notice title="That's a live game">
          Join it at <a href={`/play/${code}`}>/play/{code}</a>.
        </Notice>
      </Frame>
    );
  if (!g.me) {
    if (game.status === 'finished')
      return (
        <Frame>
          <Notice title="This game has ended">Ask Sprout for a new one.</Notice>
        </Frame>
      );
    return <JoinForm code={code} playKey={playKey} />;
  }
  return <ArcadeStage g={g} code={code} />;
}

function ArcadeStage({ g, code }: { g: GameState; code: string }) {
  const game = g.game!;
  const me = g.me!;
  const info = GAMES[game.template] ?? GAMES.runner;
  const answer = useReducer(reducers.arcadeAnswer);
  const start = useReducer(reducers.arcadeStart);
  const frame = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const payload = useMemo(
    () => ({
      type: 'sprout-questions',
      title: game.title,
      questions: g.questions.map(q => ({
        prompt: q.prompt,
        choices: [...q.choices],
        correct: q.correctIndex ?? -1,
        explanation: q.explanation ?? '',
      })),
    }),
    [g.questions, game.title]
  );
  // Read at message time, so a late subscription update can't reset a running game.
  const latest = useRef({ payload, answered: [] as number[] });
  latest.current = {
    payload,
    answered: g.answers.filter(a => a.playerId === me.id).map(a => a.questionIndex),
  };
  const growth = useGrowth(me.learnerAddress, game.courseId, me.joinedAt.microsSinceUnixEpoch);

  const names = useMemo(() => new Map(g.ranked.map(p => [p.id, p.name])), [g.ranked]);
  // The shared board as the game sees it: who's how far, and how the room did
  // on each question. Re-sent on every change so the canvas stays live.
  const live = useMemo(
    () => ({
      type: 'sprout-live',
      total: game.questionCount,
      rivals: g.ranked.map(p => ({
        name: p.name,
        done: g.answers.filter(a => a.playerId === p.id).length,
        score: p.score,
        me: p.id === me.id,
      })),
      crowd: g.questions.map(q => ({
        right: q.correctIndex === undefined ? 0 : q.choiceCounts[q.correctIndex] ?? 0,
        total: q.choiceCounts.reduce((n, c) => n + c, 0),
      })),
    }),
    [g.ranked, g.answers, g.questions, game.questionCount, me.id]
  );
  const gameReady = useRef(false);
  const seen = useRef<Set<bigint> | null>(null);
  const sendLive = () => {
    const win = frame.current?.contentWindow;
    if (!win || !gameReady.current) return;
    // Other players' new answers become in-game toasts; history doesn't.
    const fresh = seen.current ? g.answers.filter(a => !seen.current!.has(a.id)) : [];
    seen.current = new Set(g.answers.map(a => a.id));
    const events = fresh
      .filter(a => a.playerId !== me.id)
      .map(a => {
        const who = names.get(a.playerId) ?? 'Someone';
        return a.correct ? `${who} got Q${a.questionIndex + 1} +${a.points.toLocaleString()}` : `${who} missed Q${a.questionIndex + 1}`;
      });
    win.postMessage({ ...live, events }, '*');
  };
  const sendLiveRef = useRef(sendLive);
  sendLiveRef.current = sendLive;
  useEffect(() => sendLiveRef.current(), [live]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const msg = e.data ?? {};
      if (msg.type === 'sprout-ready') {
        if (!latest.current.payload.questions.length) return;
        frame.current.contentWindow!.postMessage(
          { ...latest.current.payload, answered: latest.current.answered },
          '*'
        );
        gameReady.current = true;
        sendLiveRef.current();
      } else if (msg.type === 'sprout-start') {
        start({ code }).catch(err => setError(errorText(err)));
      } else if (msg.type === 'sprout-answer' && Number.isInteger(msg.index) && Number.isInteger(msg.choice)) {
        answer({ code, questionIndex: msg.index, choice: msg.choice }).catch(err => setError(errorText(err)));
      } else if (msg.type === 'sprout-done') {
        setDone(true);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [answer, start, code]);

  const ready = g.questions.length === game.questionCount;
  const feed = [...g.answers].sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, 6);

  return (
    <Frame wide>
      <header className="stage__head arcade__head">
        <h1 className="stage__title">{info.name}</h1>
        <span className="stage__code">
          {game.title} · code <b>{code}</b>
        </span>
      </header>
      <div className="arcade">
        <div className="arcade__screen">
          {game.status === 'finished' ? (
            <Notice title="This game has ended">The board below is final.</Notice>
          ) : ready ? (
            <iframe
              ref={frame}
              className="arcade__frame"
              title={info.name}
              src={`/arcade/${game.template}.html`}
              sandbox="allow-scripts"
            />
          ) : (
            <p className="play__loading">Loading the questions…</p>
          )}
          <p className="arcade__how">{info.how}</p>
          {error && <p className="error">{error}</p>}
        </div>
        <aside className="arcade__side">
          <div className="me">
            <span className="me__name">
              {me.name} <span className="me__rank">{ordinal(me.rank)}</span>
            </span>
            <span className="me__score">{me.score.toLocaleString()}</span>
          </div>
          <h3 className="stage__sub">The race</h3>
          <ol className="race">
            {live.rivals.map((r, i) => {
              const p = g.ranked[i];
              return (
                <li key={String(p.id)} className={r.me ? 'race__row race__row--me' : 'race__row'}>
                  <span className="race__rank">{ordinal(p.rank)}</span>
                  <span className="race__name">{r.name}</span>
                  <span className="race__score">{r.score.toLocaleString()}</span>
                  <span className="race__track" aria-label={`${r.done} of ${game.questionCount} answered`}>
                    <span className="race__fill" style={{ width: `${(100 * r.done) / game.questionCount}%` }} />
                  </span>
                  <span className="race__done">
                    {p.correctCount}/{r.done} right
                  </span>
                </li>
              );
            })}
          </ol>
          {feed.length > 0 && (
            <ul className="feed" aria-live="polite">
              {feed.map(a => (
                <li key={String(a.id)} className={a.correct ? 'feed__item feed__item--right' : 'feed__item'}>
                  <b>{a.playerId === me.id ? 'You' : names.get(a.playerId) ?? 'Someone'}</b>{' '}
                  {a.correct ? `got Q${a.questionIndex + 1}` : `missed Q${a.questionIndex + 1}`}
                  {a.correct && <span className="feed__pts">+{a.points.toLocaleString()}</span>}
                </li>
              ))}
            </ul>
          )}
          <GrowthList list={growth.list} title={done ? 'What grew' : 'Growing as you play'} />
          {done && me.learnerAddress && (
            <p className="arcade__note">
              Your answers were saved to Sprout.{' '}
              <a href={gardenHref(me.learnerAddress, game.courseId)}>See your garden</a>.
            </p>
          )}
          <p className="arcade__note">
            Friends can join at <b>{window.location.host}/arcade/{code}</b>
          </p>
        </aside>
      </div>
    </Frame>
  );
}
