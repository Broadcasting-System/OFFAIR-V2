import * as h from "@/lib/wiki/handlers";

type Ctx = { params: Promise<{ space: string; slug: string[] }> };

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: Ctx) {
  return h.revert(req, await ctx.params);
}
