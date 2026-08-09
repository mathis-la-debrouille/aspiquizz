import { NextResponse } from "next/server";
import { touchSession } from "@/server/auth/session";

/**
 * Sliding-renewal write path — see session.ts. The app shell pings this once
 * per mount when the session is under the 15-day renewal threshold.
 */
export async function POST(): Promise<NextResponse> {
  const renewed = await touchSession();
  return NextResponse.json({ renewed });
}
