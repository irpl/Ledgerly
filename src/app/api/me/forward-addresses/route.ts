import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { forwardAddressInput } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = forwardAddressInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid email address.", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const existing = await prisma.forwardAddress.findUnique({
    where: { address: parsed.data.address },
  });
  if (existing) {
    return NextResponse.json(
      {
        error:
          existing.userId === userId
            ? "You already registered that address."
            : "That address is registered to another user.",
      },
      { status: 409 }
    );
  }

  const forwardAddress = await prisma.forwardAddress.create({
    data: { userId, address: parsed.data.address },
  });
  return NextResponse.json(
    { forwardAddress: { id: forwardAddress.id, address: forwardAddress.address } },
    { status: 201 }
  );
}
