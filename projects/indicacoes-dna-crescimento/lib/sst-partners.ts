import { rdRequest, SOURCE_PIPELINE_ID } from "@/lib/rd";
import { findRdOrganizationsWithDealsInPipeline } from "@/lib/rd-oauth";

export const SST_PIPELINE_ID = "678fab56b5999f0014422fe8";

type Deal = {
  organization?: { id?: string; _id?: string; name?: string };
  organization_id?: string;
};

type DealList = {
  deals?: Deal[];
  has_more?: boolean;
  next_page?: string | null;
};

export type EligibleSstPartner = {
  organizationId: string;
  name: string;
};

async function organizationsByPipeline(pipelineId: string) {
  const organizations = new Map<string, string>();
  let nextPage = "";
  for (let page = 1; page <= 25; page += 1) {
    const parameters = new URLSearchParams({
      deal_pipeline_id: pipelineId,
      limit: "200",
      order: "name",
      direction: "asc",
    });
    if (nextPage) parameters.set("next_page", nextPage);
    const result = await rdRequest<DealList>(`/deals?${parameters}`);
    for (const deal of result.deals ?? []) {
      const organizationId =
        deal.organization?.id ?? deal.organization?._id ?? deal.organization_id;
      const name = deal.organization?.name?.trim();
      if (organizationId) {
        const currentName = organizations.get(organizationId) ?? "";
        organizations.set(organizationId, currentName || name || "");
      }
    }
    if (!result.has_more || !result.next_page) break;
    nextPage = result.next_page;
  }
  return organizations;
}

let cachedPartners: { expiresAt: number; value: EligibleSstPartner[] } | null = null;

export async function listEligibleSstPartners() {
  if (cachedPartners && cachedPartners.expiresAt > Date.now()) {
    return cachedPartners.value;
  }

  const indicatorOrganizations = await organizationsByPipeline(SOURCE_PIPELINE_ID);
  const eligibleIds = await findRdOrganizationsWithDealsInPipeline(
    [...indicatorOrganizations.keys()],
    SST_PIPELINE_ID,
  );
  const partners = [...indicatorOrganizations.entries()]
    .filter(([organizationId]) => eligibleIds.has(organizationId))
    .map(([organizationId, name]) => ({
      organizationId,
      name: name || organizationId,
    }));

  partners.sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  cachedPartners = { expiresAt: Date.now() + 5 * 60_000, value: partners };
  return partners;
}

export async function findEligibleSstPartner(organizationId: string) {
  const partners = await listEligibleSstPartners();
  return partners.find((partner) => partner.organizationId === organizationId) ?? null;
}
