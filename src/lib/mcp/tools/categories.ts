// MCP tools: categories and the vendor memory.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CATEGORY_KINDS } from "@/lib/category-shared";
import { defineTool, ToolError } from "@/lib/mcp/types";
import { requireCategory } from "@/lib/mcp/shared";

export const listCategories = defineTool({
  name: "list_categories",
  title: "List categories",
  description:
    "Every category with its kind (expense, income, or both), parent, and how many transactions use it. " +
    "Categories are per user and unique on name + kind.",
  readOnly: true,
  inputSchema: z.object({
    kind: z.enum(CATEGORY_KINDS).optional().describe("Filter to one kind."),
  }),
  handler: async (args, ctx) => {
    const categories = await prisma.category.findMany({
      where: { userId: ctx.userId, ...(args.kind ? { kind: args.kind } : {}) },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      include: { _count: { select: { transactions: true, budgetLines: true } } },
    });
    return {
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        parentId: c.parentId,
        color: c.color,
        icon: c.icon,
        isDefault: c.isDefault,
        transactionCount: c._count.transactions,
        budgetLineCount: c._count.budgetLines,
      })),
    };
  },
});

export const createCategory = defineTool({
  name: "create_category",
  title: "Create category",
  description:
    'Create a category. `kind` decides where it can be used: "expense" for spending, "income" for money in, ' +
    '"both" for categories like Transfer. Check list_categories first — a duplicate name and kind is rejected.',
  readOnly: false,
  inputSchema: z.object({
    name: z.string().trim().min(1).max(100),
    kind: z.enum(CATEGORY_KINDS),
    parentId: z.string().optional().describe("Id of a parent category, for a sub-category."),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional()
      .describe("Hex color, e.g. #3b82f6."),
    icon: z.string().max(50).optional(),
  }),
  handler: async (args, ctx) => {
    if (args.parentId) await requireCategory(ctx, args.parentId);
    const duplicate = await prisma.category.findUnique({
      where: { userId_name_kind: { userId: ctx.userId, name: args.name, kind: args.kind } },
    });
    if (duplicate) {
      throw new ToolError(
        `A "${args.kind}" category named "${args.name}" already exists (id ${duplicate.id}).`
      );
    }
    const category = await prisma.category.create({
      data: {
        userId: ctx.userId,
        name: args.name,
        kind: args.kind,
        parentId: args.parentId ?? null,
        color: args.color ?? null,
        icon: args.icon ?? null,
      },
    });
    return { category };
  },
});

export const updateCategory = defineTool({
  name: "update_category",
  title: "Update category",
  description:
    "Rename or restyle a category, or move it under a different parent. Transactions keep their link, so a " +
    "rename applies to history too.",
  readOnly: false,
  inputSchema: z.object({
    categoryId: z.string(),
    name: z.string().trim().min(1).max(100).optional(),
    kind: z.enum(CATEGORY_KINDS).optional(),
    parentId: z.string().nullable().optional().describe("null moves it to the top level."),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable()
      .optional(),
    icon: z.string().max(50).nullable().optional(),
  }),
  handler: async (args, ctx) => {
    const existing = await requireCategory(ctx, args.categoryId);
    if (args.parentId) await requireCategory(ctx, args.parentId);
    if (args.parentId === args.categoryId) {
      throw new ToolError("A category cannot be its own parent.");
    }

    // Renames must not collide with another category on the per-user unique.
    const nextName = args.name ?? existing.name;
    const nextKind = args.kind ?? existing.kind;
    const duplicate = await prisma.category.findFirst({
      where: { userId: ctx.userId, name: nextName, kind: nextKind, NOT: { id: existing.id } },
    });
    if (duplicate) {
      throw new ToolError(`A "${nextKind}" category named "${nextName}" already exists.`);
    }

    const category = await prisma.category.update({
      where: { id: existing.id },
      data: {
        name: args.name,
        kind: args.kind,
        parentId: args.parentId !== undefined ? args.parentId : undefined,
        color: args.color !== undefined ? args.color : undefined,
        icon: args.icon !== undefined ? args.icon : undefined,
      },
    });
    return { category };
  },
});

export const deleteCategory = defineTool({
  name: "delete_category",
  title: "Delete category",
  description:
    "Delete a category. Transactions are kept but become uncategorized, so recategorize them first if the " +
    "history matters. A category still used by budget lines cannot be deleted — move those lines first.",
  readOnly: false,
  destructive: true,
  inputSchema: z.object({ categoryId: z.string() }),
  handler: async (args, ctx) => {
    const existing = await prisma.category.findFirst({
      where: { id: args.categoryId, userId: ctx.userId },
      include: { _count: { select: { budgetLines: true, transactions: true } } },
    });
    if (!existing) throw new ToolError(`No category with id "${args.categoryId}".`);
    if (existing._count.budgetLines > 0) {
      throw new ToolError(
        `"${existing.name}" is used by ${existing._count.budgetLines} budget line(s). ` +
          "Reassign or delete those first."
      );
    }
    await prisma.category.delete({ where: { id: existing.id } });
    return { deleted: true, uncategorizedTransactions: existing._count.transactions };
  },
});

export const listVendors = defineTool({
  name: "list_vendors",
  title: "List vendors",
  description:
    "The vendor memory built from past transactions: who the user pays, how often, and the category last used " +
    "with each. Useful for matching a merchant name to the category it usually belongs to.",
  readOnly: true,
  inputSchema: z.object({
    search: z.string().optional().describe("Case-insensitive substring of the vendor name."),
    limit: z.number().int().min(1).max(100).default(25),
  }),
  handler: async (args, ctx) => {
    const search = args.search?.trim().toLowerCase();
    const vendors = await prisma.vendor.findMany({
      where: {
        userId: ctx.userId,
        ...(search ? { nameNormalized: { contains: search } } : {}),
      },
      include: { defaultCategory: { select: { id: true, name: true } } },
      orderBy: [{ usageCount: "desc" }, { lastUsedAt: "desc" }],
      take: args.limit,
    });
    return {
      vendors: vendors.map((v) => ({
        id: v.id,
        name: v.name,
        usageCount: v.usageCount,
        lastUsedAt: v.lastUsedAt?.toISOString() ?? null,
        defaultCategoryId: v.defaultCategory?.id ?? null,
        defaultCategory: v.defaultCategory?.name ?? null,
      })),
    };
  },
});
