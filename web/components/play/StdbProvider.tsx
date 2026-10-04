'use client';

// SpacetimeDB WebSocket connection bootstrap — mirrors spacetimedb/src/main.tsx.
// Wraps /play, /host, /arcade routes so the garden pages stay server-rendered.

import { useMemo, type ReactNode } from 'react';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { DbConnection, type ErrorContext } from '@/lib/module_bindings';
import { Identity } from 'spacetimedb';

const HOST = process.env.NEXT_PUBLIC_SPACETIMEDB_HOST || 'https://maincloud.spacetimedb.com';
const DB   = process.env.NEXT_PUBLIC_SPACETIMEDB_DB   || 'sprout-0gz5d';
const TOKEN_KEY = `${HOST}/${DB}/auth_token`;

export default function StdbProvider({ children }: { children: ReactNode }) {
  // Built inside the component so localStorage is available (browser only).
  const connectionBuilder = useMemo(() => {
    const token = (() => { try { return localStorage.getItem(TOKEN_KEY) ?? undefined; } catch { return undefined; } })();
    return DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(DB)
      .withToken(token)
      .onConnect((_conn: DbConnection, _identity: Identity, t: string) => {
        try { localStorage.setItem(TOKEN_KEY, t); } catch { /* private mode */ }
      })
      .onConnectError((_ctx: ErrorContext, err: Error) => {
        console.error('SpacetimeDB connect error:', err);
      });
  }, []); // stable — created once per mount

  return (
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      {children}
    </SpacetimeDBProvider>
  );
}
