import { errorResponse, guard, readJson, serverCtx } from "@/server/ai";
import { Body, run } from "@/lib/ai/tasks/command";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    guard(req);
    return Response.json(await run(serverCtx(), await readJson(req, Body, 400_000)));
  } catch (e) {
    return errorResponse(e);
  }
}
