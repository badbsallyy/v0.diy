import { NextResponse } from "next/server";
import {
  getActiveProvider,
  getAvailableProviders,
} from "@/lib/ai-provider";

export async function GET() {
  return NextResponse.json({
    active: getActiveProvider(),
    available: getAvailableProviders(),
  });
}
