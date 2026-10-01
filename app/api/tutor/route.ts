import { NextResponse } from "next/server";
// Old clients must not keep writing the pre-migration checkpoint.
export function GET() {
    return NextResponse.json(
        { error: "Practice has moved to /vocabulary. Reload the app." },
        { status: 410 },
    );
}
export const POST = GET;
