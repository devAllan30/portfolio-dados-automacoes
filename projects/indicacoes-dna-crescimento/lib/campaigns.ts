import { type RowDataPacket } from "mysql2/promise";

import { openMySqlConnection } from "@/lib/mysql";
import { rdRequest } from "@/lib/rd";

export const CAMPAIGN_PREFIX = "Indicações Sócios - ";

type CampaignResponse = {
  id?: string;
  _id?: string;
  name?: string;
};

type CampaignsResponse = {
  campaigns?: CampaignResponse[];
  has_more?: boolean;
};

type ActiveCampaignRow = RowDataPacket & {
  id_campanha: string;
  nome: string;
};

export type Campaign = { id: string; name: string };

function normalize(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export async function listIndicationCampaigns(): Promise<Campaign[]> {
  const allCampaigns: CampaignResponse[] = [];

  for (let page = 1; page <= 20; page += 1) {
    const response = await rdRequest<CampaignsResponse>(`/campaigns?limit=200&page=${page}`);
    const pageCampaigns = response.campaigns ?? [];
    allCampaigns.push(...pageCampaigns);
    if (!response.has_more || pageCampaigns.length < 200) break;
  }

  const prefix = CAMPAIGN_PREFIX.toLocaleLowerCase("pt-BR");
  return allCampaigns
    .map((campaign) => ({
      id: campaign.id ?? campaign._id ?? "",
      name: campaign.name?.trim() ?? "",
    }))
    .filter(
      (campaign) =>
        /^[a-fA-F0-9]{24}$/.test(campaign.id) &&
        campaign.name.toLocaleLowerCase("pt-BR").startsWith(prefix),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function getActiveCampaign() {
  const connection = await openMySqlConnection();
  try {
    const [rows] = await connection.execute<ActiveCampaignRow[]>(
      "SELECT id_campanha, nome FROM campanha_ativa LIMIT 1",
    );
    const row = rows[0];
    if (!row) return null;
    return { id: row.id_campanha.trim(), name: row.nome.trim() };
  } finally {
    await connection.end();
  }
}

export async function getActiveCampaignId() {
  return (await getActiveCampaign())?.id ?? null;
}

async function saveActiveCampaign(campaign: Campaign) {
  const connection = await openMySqlConnection();
  try {
    await connection.query("LOCK TABLES campanha_ativa WRITE");
    const [rows] = await connection.query<ActiveCampaignRow[]>(
      "SELECT id_campanha, nome FROM campanha_ativa",
    );

    if (rows.length === 1) {
      await connection.execute(
        "UPDATE campanha_ativa SET id_campanha = ?, nome = ? WHERE id_campanha = ? LIMIT 1",
        [campaign.id, campaign.name, rows[0].id_campanha],
      );
    } else {
      if (rows.length > 1) await connection.query("DELETE FROM campanha_ativa");
      await connection.execute(
        "INSERT INTO campanha_ativa (id_campanha, nome) VALUES (?, ?)",
        [campaign.id, campaign.name],
      );
    }
  } finally {
    try {
      await connection.query("UNLOCK TABLES");
    } catch {
      // Closing the connection also releases a table lock.
    }
    await connection.end();
  }
}

export async function setActiveCampaign(campaignId: string) {
  const campaigns = await listIndicationCampaigns();
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error("Selecione uma campanha válida de Indicações Sócios.");

  await saveActiveCampaign(campaign);

  return campaign;
}

export async function createIndicationCampaign(rawSuffix: string) {
  const suffix = normalize(rawSuffix);
  if (suffix.length < 2 || suffix.length > 150) {
    throw new Error("Informe um complemento entre 2 e 150 caracteres.");
  }

  const name = `${CAMPAIGN_PREFIX}${suffix}`;
  const campaigns = await listIndicationCampaigns();
  if (campaigns.some((campaign) => campaign.name.localeCompare(name, "pt-BR", { sensitivity: "accent" }) === 0)) {
    throw new Error("Essa campanha já existe no RD Station.");
  }

  const created = await rdRequest<CampaignResponse>("/campaigns", {
    method: "POST",
    body: JSON.stringify({ campaign: { name } }),
  });
  const id = created.id ?? created._id;
  if (!id) throw new Error("O RD Station não retornou o ID da nova campanha.");

  const campaign = { id, name: created.name?.trim() || name };
  await saveActiveCampaign(campaign);
  return campaign;
}
