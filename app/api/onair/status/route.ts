import * as h from "@/lib/onair/handlers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return h.status(req);
}
