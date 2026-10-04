import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import Host from './play/Host.tsx';
import Player from './play/Player.tsx';
import { parseRoute } from './play/route.ts';
import './play/play.css';
import { Identity } from 'spacetimedb';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { DbConnection, ErrorContext } from './module_bindings/index.ts';

// Defaults to the live Sprout database on Maincloud; override in .env.local.
const HOST =
  import.meta.env.VITE_SPACETIMEDB_HOST || 'https://maincloud.spacetimedb.com';
const DB_NAME =
  import.meta.env.VITE_SPACETIMEDB_DB ||
  import.meta.env.VITE_SPACETIMEDB_DB_NAME ||
  'sprout-live';
const TOKEN_KEY = `${HOST}/${DB_NAME}/auth_token`;

const onConnect = (conn: DbConnection, identity: Identity, token: string) => {
  localStorage.setItem(TOKEN_KEY, token);
  console.log(
    'Connected to SpacetimeDB with identity:',
    identity.toHexString()
  );
};

const onDisconnect = () => {
  console.log('Disconnected from SpacetimeDB');
};

const onConnectError = (_ctx: ErrorContext, err: Error) => {
  console.log('Error connecting to SpacetimeDB:', err);
};

const connectionBuilder = DbConnection.builder()
  .withUri(HOST)
  .withDatabaseName(DB_NAME)
  .withToken(localStorage.getItem(TOKEN_KEY) || undefined)
  .onConnect(onConnect)
  .onDisconnect(onDisconnect)
  .onConnectError(onConnectError);

// /play and /host are live games; everything else is the garden.
const route = parseRoute(window.location.pathname, window.location.search);
if (route) document.title = route.kind === 'host' ? `Host ${route.code} · Sprout live` : 'Sprout live';
const page =
  route?.kind === 'host' ? (
    <Host code={route.code} hostKey={route.key} />
  ) : route?.kind === 'play' ? (
    <Player code={route.code} playKey={route.key} />
  ) : (
    <App />
  );

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>{page}</SpacetimeDBProvider>
  </StrictMode>
);
