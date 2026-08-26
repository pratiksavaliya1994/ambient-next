import { z } from "zod"

/**
 * The temporary development sign-in. A name and nothing else — there is no
 * password to check, because there is no field in the Bubble schema to check
 * one against and no intention of adding one. See the note in `auth.ts`.
 */
export const devLoginSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(80, "That name is too long."),
})

export type DevLoginInput = z.infer<typeof devLoginSchema>
