import { aiConfigured, MODEL } from "@/server/ai";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    configured: aiConfigured(),
    model: aiConfigured() ? MODEL : null,
    passcodeRequired: !!process.env.APP_ACCESS_TOKEN,
    research: aiConfigured(),
  });
}
