import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Returns current deployment or build identifier
export async function GET() {
  const deploymentId =
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.BUILD_ID ||
    "1.0.2";

  return NextResponse.json(
    {
      deploymentId,
      version: "1.0.2",
      timestamp: Date.now(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    }
  );
}
