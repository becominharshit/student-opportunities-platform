import type { NextRequest } from "next/server";
import { authPost } from "@/lib/auth/handlers";

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  return authPost(request, (await context.params).action);
}
