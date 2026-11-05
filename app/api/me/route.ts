import * as h from "@/lib/wiki/handlers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return h.me(req);
}
