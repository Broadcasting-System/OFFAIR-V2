import * as h from "@/lib/wiki/handlers";

type Ctx = { params: Promise<{ space: string; slug: string[] }> };

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: Ctx) {
  return h.listComments(req, await ctx.params);
}

export async function POST(req: Request, ctx: Ctx) {
  return h.addComment(req, await ctx.params);
}

export async function PATCH(req: Request, ctx: Ctx) {
  return h.editComment(req, await ctx.params);
}

export async function DELETE(req: Request, ctx: Ctx) {
  return h.deleteComment(req, await ctx.params);
}
