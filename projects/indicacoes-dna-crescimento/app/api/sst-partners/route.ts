import { NextResponse } from "next/server";

import { publicRdError } from "@/lib/rd";
import { listEligibleSstPartners } from "@/lib/sst-partners";

export async function GET() {
  try {
    const partners = await listEligibleSstPartners();
    return NextResponse.json({ partners }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        partners: [],
        message: publicRdError(error),
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
