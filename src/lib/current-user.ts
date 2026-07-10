// Server-only: session → user id helpers. Every data query must be scoped
// through one of these (or ownership-checked by id before acting).
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** API routes: current user id, or null (the route responds 401 itself). */
export async function getUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** Server-component pages: current user id, or redirect to /login. */
export async function requireUserId(): Promise<string> {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  return userId;
}

/**
 * Admin APIs: fresh database role check — the JWT's role claim is a UI hint
 * and may be stale (e.g. a demoted user with an old token).
 */
export async function getAdminUser(): Promise<{ id: string } | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role === "admin" ? { id: userId } : null;
}
