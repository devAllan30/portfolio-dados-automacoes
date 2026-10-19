import { NextResponse } from "next/server";

import {
  CAMPAIGN_PREFIX,
  createIndicationCampaign,
  getActiveCampaignId,
  listIndicationCampaigns,
  setActiveCampaign,
} from "@/lib/campaigns";
import { ManagerUnauthorizedError, requireManagerSession } from "@/lib/manager-auth";
import { publicRdError, RdApiError, RdConfigurationError } from "@/lib/rd";

function errorResponse(error: unknown) {
  if (error instanceof ManagerUnauthorizedError) {
    return NextResponse.json({ message: error.message }, { status: 401 });
  }
  if (error instanceof RdConfigurationError) {
    return NextResponse.json({ message: publicRdError(error) }, { status: 503 });
  }
  if (error instanceof RdApiError) {
    return NextResponse.json({ message: publicRdError(error) }, { status: 502 });
  }
  return NextResponse.json(
    { message: error instanceof Error ? error.message : "Não foi possível atualizar as campanhas." },
    { status: 400 },
  );
}

export async function GET(request: Request) {
  try {
    await requireManagerSession(request);
    const [campaigns, activeCampaignId] = await Promise.all([
      listIndicationCampaigns(),
      getActiveCampaignId(),
    ]);
    return NextResponse.json({ prefix: CAMPAIGN_PREFIX, campaigns, activeCampaignId });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireManagerSession(request);
    const body = (await request.json()) as { suffix?: unknown };
    const suffix = typeof body.suffix === "string" ? body.suffix : "";
    const campaign = await createIndicationCampaign(suffix);
    return NextResponse.json({ campaign, activeCampaignId: campaign.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireManagerSession(request);
    const body = (await request.json()) as { campaignId?: unknown };
    const campaignId = typeof body.campaignId === "string" ? body.campaignId.trim() : "";
    const campaign = await setActiveCampaign(campaignId);
    return NextResponse.json({ campaign, activeCampaignId: campaign.id });
  } catch (error) {
    return errorResponse(error);
  }
}
