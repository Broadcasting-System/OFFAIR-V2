import * as h from "@/lib/wiki/handlers";

type Ctx = { params: Promise<{ space: string }> };

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: Ctx) {
  return h.uploads(req, await ctx.params);
}

export async function POST(req: Request, ctx: Ctx) {
  return h.upload(req, await ctx.params);
}
