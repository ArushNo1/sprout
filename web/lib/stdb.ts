// Read-only SpacetimeDB access for server components (SQL over HTTP, see spacetimedb/API.md).
// Options come back from SQL as [0, value] (some) or [1, []] (none); timestamps as { __timestamp_micros_since_unix_epoch__ }.

export type Row = Record<string, unknown>;

export class StdbError extends Error {}

function unwrap(value: unknown): unknown {
  if (Array.isArray(value) && value.length === 2 && (value[0] === 0 || (value[0] === 1 && Array.isArray(value[1]) && value[1].length === 0)))
    return value[0] === 0 ? unwrap(value[1]) : null;
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'number') return value[0]; // bare timestamp
  if (value && typeof value === 'object' && '__timestamp_micros_since_unix_epoch__' in value)
    return Number((value as Row).__timestamp_micros_since_unix_epoch__);
  return value;
}

export function decodeRows(result: { schema: { elements: { name: { some: string } }[] }; rows: unknown[][] }): Row[] {
  const names = result.schema.elements.map(e => e.name.some);
  return result.rows.map(row => Object.fromEntries(names.map((n, i) => [n, unwrap(row[i])])));
}

export const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

export async function sql(query: string): Promise<Row[]> {
  const host = process.env.SPACETIMEDB_HOST;
  const db = process.env.SPACETIMEDB_DB;
  if (!host || !db) throw new StdbError('SPACETIMEDB_HOST and SPACETIMEDB_DB are not set');
  const token = process.env.SPACETIMEDB_TOKEN;
  let res: Response;
  try {
    res = await fetch(`${host}/v1/database/${db}/sql`, {
      method: 'POST',
      body: query,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    throw new StdbError(`database unreachable: ${(err as Error).message}`);
  }
  if (!res.ok) throw new StdbError((await res.text()).trim() || `query failed (${res.status})`);
  const results = await res.json();
  return decodeRows(results[0]);
}
