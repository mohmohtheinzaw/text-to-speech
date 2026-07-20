import { NextResponse } from "next/server";

/**
 * Issues a short-lived Azure Speech auth token to the browser.
 *
 * Why: the browser Speech SDK needs credentials, but we must NEVER ship the
 * raw AZURE_SPEECH_KEY to the client. Instead the server exchanges the key for
 * a token (valid ~10 minutes) and hands only that to the browser.
 */
export async function GET() {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  if (!key || !region) {
    return NextResponse.json(
      { error: "Azure credentials are not configured. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(
      `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `Azure token request failed (${res.status}). Check your key and region.` },
        { status: 502 }
      );
    }

    const token = await res.text();
    return NextResponse.json({ token, region });
  } catch (err) {
    return NextResponse.json(
      { error: "Could not reach Azure. " + (err as Error).message },
      { status: 502 }
    );
  }
}
