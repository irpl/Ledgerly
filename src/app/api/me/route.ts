import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { profileInput } from "@/lib/validation";
import { Prisma } from "@/generated/prisma/client";

const PROFILE_SELECT = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  inboundKey: true,
  forwardAddresses: { select: { id: true, address: true }, orderBy: { address: "asc" } },
} satisfies Prisma.UserSelect;

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ user });
}

export async function PATCH(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = profileInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        email: data.email,
        displayName: data.displayName !== undefined ? data.displayName : undefined,
      },
      select: PROFILE_SELECT,
    });
    return NextResponse.json({ user });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "That email is already in use." },
        { status: 409 }
      );
    }
    throw e;
  }
}
