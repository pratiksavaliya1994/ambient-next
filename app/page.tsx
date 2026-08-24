import { redirect } from "next/navigation"

/** The app is one flow; the root is just a doorway into it. */
export default function Page() {
  redirect("/requests")
}
