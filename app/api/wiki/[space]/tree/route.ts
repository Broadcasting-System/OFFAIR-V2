import * as h from "@/lib/wiki/handlers";

type Ctx = { params: Promise<{ space: string }> };

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: Ctx) {
  return h.tree(req, await ctx.params);
}
