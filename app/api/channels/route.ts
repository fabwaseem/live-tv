import { NextRequest, NextResponse } from "next/server";
import { getWorldPayload } from "@/lib/iptv";

// The catalogue is joined from multi-MB upstream files at request time
// (the handler reads searchParams and fetches upstream, so Cache
// Components keeps it dynamic); lib/iptv memoizes the joined build.

export async function GET(req: NextRequest) {
  try {
    const payload = await getWorldPayload();
    const country = req.nextUrl.searchParams.get("country");

    if (!country) return NextResponse.json(payload);

    const code = country.toUpperCase();
    const streams = payload.streams.filter((s) => s.country === code);
    return NextResponse.json({
      ...payload,
      streams,
      totals: {
        streams: streams.length,
        channels: new Set(streams.map((s) => s.channelId)).size,
        countries: code === "UN" ? 0 : 1,
      },
      countries: payload.countries.filter((c) => c.code === code),
    });
  } catch (error) {
    console.error("[/api/channels] failed to build catalogue:", error);
    return NextResponse.json(
      { error: "Could not load the channel catalogue. Please try again shortly." },
      { status: 502 },
    );
  }
}
