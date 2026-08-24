/**
 * The session carries nothing beyond what Entra returns. There is no Bubble
 * user id and no role: see the note in `auth.ts`.
 *
 * Kept as a module so `tsconfig`'s `include` still resolves it, and as the
 * place to augment if a real requester field is ever added in Bubble.
 */
export {}
