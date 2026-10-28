import { errorResponse, guard, readJson, serverCtx } from "@/server/ai";
import { Body, run } from "@/lib/ai/tasks/story";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    guard(req);
    return Response.json(await run(serverCtx(), await readJson(req, Body, 400_000)));
  } catch (e) {
    return errorResponse(e);
  }
}
