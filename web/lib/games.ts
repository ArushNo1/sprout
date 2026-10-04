// Placeholder registry until the multiplayer games land. Add a game here, then give it a client in
// components/ and swap it into app/[userId]/[game]/[room]/page.tsx.
export type Game = { slug: string; name: string; blurb: string; players: string };

export const GAMES: Game[] = [
  { slug: 'concept-clash', name: 'Concept Clash', blurb: 'Race to answer questions from your shared course.', players: '2-6 players' },
  { slug: 'prereq-race', name: 'Prerequisite Race', blurb: 'Climb the knowledge graph before your friends do.', players: '2-4 players' },
];

export const gameBySlug = (slug: string) => GAMES.find(g => g.slug === slug);

/** Room codes are 4-8 letters or digits, case-insensitive. Returns the canonical (uppercase) code or null. */
export function normalizeRoom(code: string): string | null {
  return /^[A-Za-z0-9]{4,8}$/.test(code) ? code.toUpperCase() : null;
}
