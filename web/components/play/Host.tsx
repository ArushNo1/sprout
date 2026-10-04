import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useReducer } from 'spacetimedb/react';
import { reducers } from '@/lib/module_bindings';
import { Choices, Frame, Leaderboard, Notice, Timer, gate } from '@/components/play/parts';
import { secondsLeft } from '@/components/play/route';
import { errorText, startedMs, useGame, useNow, type GameState } from '@/components/play/useGame';

export default function Host({ code, hostKey }: { code: string; hostKey: string | null }) {
  const g = useGame(code);
  const claimHost = useReducer(reducers.claimHost);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);
  const asked = useRef(false);

  const claim = () => {
    if (!hostKey) return;
    claimHost({ code, hostKey })
      .then(() => setClaimed(true))
      .catch(e => setError(errorText(e)));
  };

  // Opening the host link makes this screen the host.
  useEffect(() => {
    if (!g.game || !g.identity || !hostKey || asked.current || g.isHost) return;
    asked.current = true;
    claim();
  }, [g.game, g.identity, g.isHost, hostKey]);

  const blocked = gate(g, code);
  if (blocked) return <Frame wide>{blocked}</Frame>;
  if (!hostKey || (error && !g.isHost))
    return (
      <Frame wide>
        <Notice title="This isn't a host link">
          {error ?? 'Open the host link Sprout sent you in the chat.'} To play
          instead, go to <a href={`/play/${code}`}>/play/{code}</a>.
        </Notice>
      </Frame>
    );
  if (!g.isHost)
    return (
      <Frame wide>
        {claimed ? (
          <Notice title="Hosting moved to another screen">
            The host link was opened somewhere else.{' '}
            <button className="btn btn--quiet" onClick={claim}>
              Host here instead
            </button>
          </Notice>
        ) : (
          <p className="play__loading">Setting up the host screen…</p>
        )}
      </Frame>
    );

  return (
    <Frame wide>
      <HostStage g={g} code={code} hostKey={hostKey} />
    </Frame>
  );
}

function HostStage({ g, code, hostKey }: { g: GameState; code: string; hostKey: string }) {
  const game = g.game!;
  const advance = useReducer(reducers.advanceGame);
  const endGame = useReducer(reducers.endGame);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useNow(250);

  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    fn()
      .catch(e => setError(errorText(e)))
      .finally(() => setBusy(false));
  };
  const next = () => run(() => advance({ code }));

  const q = g.question;
  const last = game.questionIndex + 1 >= game.questionCount;
  const header = (
    <header className="stage__head">
      <h1 className="stage__title">{game.title}</h1>
      <span className="stage__code">
        Code <b>{code}</b>
      </span>
    </header>
  );

  if (game.status === 'lobby') {
    return (
      <section className="stage">
        {header}
        <Lobby code={code} hostKey={hostKey} g={g} />
        <div className="stage__actions">
          <button className="btn" onClick={next} disabled={busy || g.ranked.length === 0}>
            Start the game
          </button>
          <span className="stage__note">
            {game.questionCount} questions, {game.secondsPerQuestion} seconds each
          </span>
        </div>
        {error && <p className="error">{error}</p>}
      </section>
    );
  }

  if (game.status === 'finished') {
    return (
      <section className="stage">
        {header}
        <Podium ranked={g.ranked} />
        <Leaderboard ranked={g.ranked} />
      </section>
    );
  }

  if (!q) return <p className="play__loading">Loading the question…</p>;
  const counter = `Question ${game.questionIndex + 1} of ${game.questionCount}`;

  if (game.status === 'question') {
    const left = secondsLeft(startedMs(game), game.secondsPerQuestion, now);
    return (
      <section className="stage">
        {header}
        <div className="stage__bar">
          <span>{counter}</span>
          <Timer left={left} total={game.secondsPerQuestion} />
          <span>
            {g.answersNow.length} of {g.ranked.length} answered
          </span>
        </div>
        <h2 className="prompt prompt--big">{q.prompt}</h2>
        <Choices choices={q.choices} />
        <div className="stage__actions">
          <button className="btn btn--quiet" onClick={next} disabled={busy}>
            Show the answer now
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>
    );
  }

  // Reveal.
  return (
    <section className="stage">
      {header}
      <div className="stage__bar">
        <span>{counter}</span>
      </div>
      <h2 className="prompt">{q.prompt}</h2>
      <Choices choices={q.choices} correct={q.correctIndex} counts={q.choiceCounts} />
      {q.explanation && <p className="explain">{q.explanation}</p>}
      <h3 className="stage__sub">Leaderboard</h3>
      <Leaderboard ranked={g.ranked} limit={5} />
      <div className="stage__actions">
        <button className="btn" onClick={next} disabled={busy}>
          {last ? 'Final results' : 'Next question'}
        </button>
        {!last && (
          <button className="btn btn--quiet" onClick={() => run(() => endGame({ code }))} disabled={busy}>
            End the game here
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function Lobby({ code, hostKey, g }: { code: string; hostKey: string; g: GameState }) {
  const joinUrl = `${window.location.origin}/play/${code}`;
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(joinUrl, { margin: 1, width: 360, color: { dark: '#0a4d17', light: '#f4eadf' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [joinUrl]);

  return (
    <div className="lobby">
      <div className="lobby__join">
        <p className="lobby__how">
          Go to <b>{window.location.host}/play</b> and enter
        </p>
        <p className="lobby__code">{code}</p>
        {qr && <img className="lobby__qr" src={qr} alt={`QR code for ${joinUrl}`} />}
        <a className="lobby__self" href={`/play/${code}?k=${encodeURIComponent(hostKey)}`} target="_blank" rel="noreferrer">
          Play too, as yourself (your answers grow your garden)
        </a>
      </div>
      <div className="lobby__players">
        <h3 className="stage__sub">
          {g.ranked.length === 0
            ? 'Waiting for players…'
            : `${g.ranked.length} ${g.ranked.length === 1 ? 'player' : 'players'}`}
        </h3>
        <ul className="chips">
          {g.ranked.map(p => (
            <li key={String(p.id)} className="chip">
              {p.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Podium({ ranked }: { ranked: GameState['ranked'] }) {
  const top = ranked.slice(0, 3);
  const order = [top[1], top[0], top[2]];
  return (
    <div className="podium">
      {order.map((p, i) =>
        p ? (
          <div key={String(p.id)} className={`podium__step podium__step--${p.rank}`}>
            <span className="podium__name">{p.name}</span>
            <span className="podium__score">{p.score.toLocaleString()}</span>
            <span className="podium__block">{p.rank}</span>
          </div>
        ) : (
          <div key={`empty-${i}`} className="podium__step podium__step--empty" />
        )
      )}
    </div>
  );
}
