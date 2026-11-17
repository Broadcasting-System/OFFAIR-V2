import * as h from "@/lib/wiki/handlers";

type Ctx = { params: Promise<{ path: string[] }> };

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: Ctx) {
  return h.publicUpload(req, await ctx.params);
}
