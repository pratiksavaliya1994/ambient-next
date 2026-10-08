/**
 * Trimmed and case-folded — the form of a name two rows are considered to
 * share. `tools.name` is free text with nothing enforcing uniqueness, and the
 * live table already proves both halves of this matter: two names carry
 * trailing spaces (`"Pumpjack #3 Red LW "`), and two pairs already collide
 * case-insensitively (`electric pumpjack #16`, `small 880 grinder #1`).
 *
 * Those existing collisions are left alone — this guards new rows; it is not a
 * migration.
 *
 * Client-safe, out of `server-only` `tool-create.ts`, because the stock take's
 * paste box matches names in the browser too.
 */
export function normaliseToolName(name: string): string {
  return name.trim().toLowerCase()
}
