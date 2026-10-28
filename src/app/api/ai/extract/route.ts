import { errorResponse, guard, readJson, serverCtx } from "@/server/ai";
import { Body, run } from "@/lib/ai/tasks/extract";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    guard(req);
    return Response.json(await run(serverCtx(), await readJson(req, Body, 20_000_000)));
  } catch (e) {
    return errorResponse(e);
  }
}
