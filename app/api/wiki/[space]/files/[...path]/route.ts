import * as h from "@/lib/wiki/handlers";

type Ctx = { params: Promise<{ space: string; path: string[] }> };

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: Ctx) {
  return h.file(req, await ctx.params);
}
