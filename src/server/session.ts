import "server-only";
import { cookies } from "next/headers";
import { GUEST_COOKIE, isGuestId } from "@/lib/session-cookie";

/** The guest id the proxy assigned. Null only if cookies are blocked. */
export async function currentUserId(): Promise<string | null> {
  const id = (await cookies()).get(GUEST_COOKIE)?.value;
  return isGuestId(id) ? id : null;
}
