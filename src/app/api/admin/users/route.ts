import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getAdminUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { adminCreateUserInput } from "@/lib/validation";
import { createDefaultCategories } from "@/lib/default-categories";
import { Prisma } from "@/generated/prisma/client";

const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  createdAt: true,
  _count: { select: { accounts: true, categories: true } },
} satisfies Prisma.UserSelect;

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    select: USER_SELECT,
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = adminCreateUserInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const passwordHash = await bcrypt.hash(data.password, 12);
  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: data.email.toLowerCase(),
          displayName: data.displayName ?? null,
          passwordHash,
          role: data.role,
        },
      });
      await createDefaultCategories(tx, created.id);
      return created;
    });
    const fresh = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: USER_SELECT,
    });
    return NextResponse.json({ user: fresh }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "A user with that email already exists." },
        { status: 409 }
      );
    }
    throw e;
  }
}
