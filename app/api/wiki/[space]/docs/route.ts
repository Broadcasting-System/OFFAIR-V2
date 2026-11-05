import * as h from "@/lib/wiki/handlers";

type Ctx = { params: Promise<{ space: string }> };

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: Ctx) {
  return h.createDoc(req, await ctx.params);
}
