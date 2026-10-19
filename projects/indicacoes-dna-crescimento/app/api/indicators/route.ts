import { NextResponse } from "next/server";

import {
  publicRdError,
  rdRequest,
  RdConfigurationError,
  SOURCE_PIPELINE_ID,
} from "@/lib/rd";

type Deal = {
  id?: string;
  _id?: string;
  name?: string;
  hold?: boolean | null;
  win?: boolean | null;
};
type DealList = { deals?: Deal[]; has_more?: boolean };

export async function GET() {
  try {
    const indicators: Array<{ id: string; name: string }> = [];

    for (let page = 1; page <= 25; page += 1) {
      const params = new URLSearchParams({
        deal_pipeline_id: SOURCE_PIPELINE_ID,
        page: String(page),
        limit: "200",
        order: "name",
        direction: "asc",
      });
      const result = await rdRequest<DealList>(`/deals?${params}`);

      for (const deal of result.deals ?? []) {
        if (deal.win !== null && deal.win !== undefined) continue;
        if (deal.hold === true) continue;

        const id = deal.id ?? deal._id;
        const name = deal.name?.trim();
        if (id && name) indicators.push({ id, name });
      }

      if (!result.has_more) break;
    }

    return NextResponse.json({ configured: true, indicators });
  } catch (error) {
    const configured = !(error instanceof RdConfigurationError);
    return NextResponse.json(
      { configured, indicators: [], message: publicRdError(error) },
      { status: configured ? 502 : 200 },
    );
  }
}
