import * as h from "@/lib/wiki/handlers";

type Ctx = { params: Promise<{ space: string; slug: string[] }> };

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: Ctx) {
  return h.getDoc(req, await ctx.params);
}

export async function PUT(req: Request, ctx: Ctx) {
  return h.saveDoc(req, await ctx.params);
}

export async function DELETE(req: Request, ctx: Ctx) {
  return h.deleteDoc(req, await ctx.params);
}
