import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id"

import { devLoginSchema } from "@/lib/schemas/auth"

/** An 8-hour working day. JWTs cannot be revoked, so keep the window short. */
const SESSION_MAX_AGE = 60 * 60 * 8

export const ALLOW_ENTRA = process.env.ALLOW_ENTRA === "true"

/**
 * A sign-in that checks nothing: type a name, get a session.
 *
 * Temporary, until the Entra credentials are in hand. It is behind its own
 * flag rather than folded into the Entra provider so that switching back is an
 * env change and a deleted provider, not a rewrite.
 *
 * **This is not authentication.** Anyone who can reach the login page can sign
 * in as anyone, and the app writes to the live Bubble database. It is safe on
 * localhost and nowhere else — do not deploy anything reachable with this on.
 * The signed-in shell shows a banner whenever it is active so it cannot be
 * left on by accident.
 */
export const ALLOW_DEV_LOGIN = process.env.ALLOW_DEV_LOGIN === "true"

/**
 * The session is not mapped onto a Bubble `user` row. The live schema has no
 * `email`, `Role` or `passwordHash` field on `user` — the address sits inside
 * an opaque `authentication` object that the Data API cannot be constrained
 * on — so there is nothing to look the signed-in person up by. Every Bubble
 * call is made with the API token instead, which means `Created By` on every
 * row is the token's owner, not the person who submitted the form.
 *
 * The consequence to keep in mind: **the session identifies the person to the
 * UI only.** Who a request belongs to is whatever `fieldPM2` says. There are
 * no roles in this schema, so every signed-in user reaches every screen.
 *
 * Because of that, the two providers below are interchangeable: nothing
 * downstream may branch on which one was used.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    ...(ALLOW_ENTRA
      ? [
          MicrosoftEntraID({
            clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
            clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
            issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
          }),
        ]
      : []),
    ...(ALLOW_DEV_LOGIN
      ? [
          Credentials({
            id: "dev-login",
            name: "Development sign-in",
            credentials: { name: { label: "Name", type: "text" } },
            async authorize(raw) {
              const parsed = devLoginSchema.safeParse(raw)
              if (!parsed.success) return null

              // No lookup and no secret to check — the name is the whole
              // identity. `id` only has to be stable within the session.
              const name = parsed.data.name.trim()
              return { id: `dev:${name.toLowerCase()}`, name, email: null }
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, account, profile, user }) {
      // `account` and `user` are present only on the first call after sign-in.
      if (account) {
        // Entra does not always populate the `email` claim. Tenants keyed on
        // userPrincipalName — as this one is — expose the address as
        // `preferred_username` instead. The dev provider supplies neither.
        token.name = token.name ?? user?.name ?? profile?.name ?? null
        token.email = token.email ?? user?.email ?? profile?.preferred_username ?? null
      }
      return token
    },
  },
})
