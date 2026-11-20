import * as h from "@/lib/onair/handlers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return h.start(req);
}
