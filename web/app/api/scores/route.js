import { NextResponse } from "next/server";
import { scoreboard, sanitizeScoreEntry } from "../../../lib/scoreboard";

export async function GET() {
  return NextResponse.json({ scores: scoreboard.list() });
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const entry = sanitizeScoreEntry(payload);
    const list = scoreboard.record(entry);
    return NextResponse.json({ scores: list }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Invalid score payload" },
      { status: 400 }
    );
  }
}
