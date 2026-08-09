import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sfx|geo).*)"],
};

export function middleware(_request: NextRequest) {
  return NextResponse.next();
}
