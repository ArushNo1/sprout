import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { reducers } from '../module_bindings';
import { Frame, Leaderboard, Notice, gate } from './parts';
import { JoinForm } from './Player';
import { ordinal } from './route';
import { errorText, useGame, type GameState } from './useGame';

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
      } else if (msg.type === 'sprout-answer' && Number.isInteger(msg.index) && Number.isInteger(msg.choice)) {
        answer({ code, questionIndex: msg.index, choice: msg.choice }).catch(err => setError(errorText(err)));
      } else if (msg.type === 'sprout-done') {
        setDone(true);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [answer, code]);

  const progress = (id: bigint) => g.answers.filter(a => a.playerId === id).length;
  const ready = g.questions.length === game.questionCount;

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
          {done && me.learnerAddress && (
            <p className="arcade__note">
              Your answers were saved to Sprout. Tap Results in the chat to see
              what moved.
            </p>
          )}
          <h3 className="stage__sub">High scores</h3>
          <Leaderboard ranked={g.ranked} meId={me.id} />
          <p className="arcade__note">
            {g.ranked.map(p => `${p.name} ${progress(p.id)}/${game.questionCount}`).join(' · ')}
          </p>
          <p className="arcade__note">
            Friends can join at <b>{window.location.host}/arcade/{code}</b>
          </p>
        </aside>
      </div>
    </Frame>
  );
}
