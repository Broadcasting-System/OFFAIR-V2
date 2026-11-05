import * as h from "@/lib/wiki/handlers";

type Ctx = { params: Promise<{ space: string }> };

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: Ctx) {
  return h.getSidebar(req, await ctx.params);
}

export async function PUT(req: Request, ctx: Ctx) {
  return h.putSidebar(req, await ctx.params);
}

export async function PATCH(req: Request, ctx: Ctx) {
  return h.patchSidebar(req, await ctx.params);
}
