import { NextResponse } from "next/server";

import { getActiveCampaignId } from "@/lib/campaigns";
import { resolveConsultantSelection } from "@/lib/consultants";
import { saveIndication } from "@/lib/indications";
import {
  INDICATOR_DEAL_FIELD_ID,
  INDICATOR_NAME_FIELD_ID,
  publicRdError,
  rdRequest,
  RdConfigurationError,
  SOURCE_PIPELINE_ID,
  TARGET_PIPELINE_ID,
} from "@/lib/rd";

type Submission = {
  consultant?: unknown;
  consultantReference?: unknown;
  name?: unknown;
  phone?: unknown;
  indicatorId?: unknown;
  observations?: unknown;
};

type Pipeline = {
  deal_stages?: Array<{ id?: string; _id?: string; order?: number }>;
};

type Deal = {
  id?: string;
  _id?: string;
  name?: string;
  deal_pipeline?: { id?: string; _id?: string };
};

function parseSubmission(body: Submission) {
  const consultant = typeof body.consultant === "string" ? body.consultant.trim() : "";
  const consultantReference =
    typeof body.consultantReference === "string" ? body.consultantReference.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  const indicatorId = typeof body.indicatorId === "string" ? body.indicatorId.trim() : "";
  const observations = typeof body.observations === "string" ? body.observations.trim().slice(0, 4000) : "";

  if (!consultant) throw new Error("Acesse o formulário pelo link individual do consultor.");
  if (!consultantReference) throw new Error("O link do consultor responsável é inválido.");
  if (name.length < 2 || name.length > 180) throw new Error("Informe o nome do indicado.");
  if (!/^\d{11}$/.test(phone)) throw new Error("Informe um celular com DDD e 11 dígitos.");
  if (!/^[a-zA-Z0-9]+$/.test(indicatorId)) throw new Error("Selecione um indicador válido.");

  return { consultant, consultantReference, name, phone, indicatorId, observations };
}

export async function POST(request: Request) {
  try {
    const submission = parseSubmission((await request.json()) as Submission);
    const consultantSelection = await resolveConsultantSelection(
      submission.consultant,
      submission.consultantReference,
    );

    const [indicatorDeal, targetPipeline, campaignId] = await Promise.all([
      rdRequest<Deal>(`/deals/${encodeURIComponent(submission.indicatorId)}`),
      rdRequest<Pipeline>(`/deal_pipelines/${TARGET_PIPELINE_ID}`),
      getActiveCampaignId(),
    ]);
    const { consultantName, ownerId } = consultantSelection;
    if (!campaignId) {
      throw new Error("Selecione a campanha ativa no gerenciador antes de criar indicações.");
    }

    const sourcePipeline = indicatorDeal.deal_pipeline?.id ?? indicatorDeal.deal_pipeline?._id;
    if (sourcePipeline !== SOURCE_PIPELINE_ID) {
      return NextResponse.json(
        { message: "A negociação selecionada não pertence ao funil de indicadores." },
        { status: 400 },
      );
    }
    const indicatorName = indicatorDeal.name?.trim();
    if (!indicatorName) {
      throw new Error("A negociação selecionada não possui um nome válido no RD Station.");
    }

    const firstStage = [...(targetPipeline.deal_stages ?? [])]
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))[0];
    const stageId = firstStage?.id ?? firstStage?._id;
    if (!stageId) throw new Error("O funil de destino não possui uma etapa disponível.");

    const created = await rdRequest<Deal>("/deals", {
      method: "POST",
      body: JSON.stringify({
        campaign: { _id: campaignId },
        contacts: [
          {
            name: submission.name,
            phones: [{ phone: submission.phone, type: "cellphone" }],
          },
        ],
        deal: {
          name: submission.name,
          deal_stage_id: stageId,
          user_id: ownerId,
          deal_custom_fields: [
            {
              custom_field_id: INDICATOR_DEAL_FIELD_ID,
              value: submission.indicatorId,
            },
            {
              custom_field_id: INDICATOR_NAME_FIELD_ID,
              value: indicatorName,
            },
          ],
        },
      }),
    });

    const dealId = created.id ?? created._id;
    if (!dealId) throw new Error("O RD Station não retornou o ID da nova negociação.");

    const warnings: string[] = [];
    let indicationId: number | undefined;
    try {
      indicationId = await saveIndication({
        consultant: consultantName,
        indicatedName: submission.name,
        phone: submission.phone,
        indicator: indicatorName,
        indicatorDealId: submission.indicatorId,
        createdDealId: dealId,
        observations: submission.observations,
      });
    } catch (error) {
      console.error("Não foi possível salvar a indicação no banco de dados.", error);
      warnings.push("A negociação foi criada, mas o registro no banco de dados precisa ser conferido.");
    }

    const note = [
      `Consultor Responsável : ${consultantName}`,
      submission.observations ? `Observações: ${submission.observations}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      await rdRequest("/activities", {
        method: "POST",
        body: JSON.stringify({ activity: { deal_id: dealId, text: note } }),
      });
    } catch {
      warnings.push("A negociação foi criada, mas a anotação precisa ser conferida no RD Station.");
    }

    return NextResponse.json({
      id: dealId,
      indicationId,
      name: created.name ?? submission.name,
      indicatorId: submission.indicatorId,
      ownerId,
      summary: {
        consultant: consultantName,
        indicatedName: submission.name,
        phone: submission.phone,
        indicator: indicatorName,
        observations: submission.observations,
      },
      warning: warnings.length ? warnings.join(" ") : undefined,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: "Os dados enviados são inválidos." }, { status: 400 });
    }
    if (error instanceof RdConfigurationError) {
      return NextResponse.json({ message: publicRdError(error) }, { status: 503 });
    }
    if (error instanceof Error && !error.name.startsWith("Rd")) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: publicRdError(error) }, { status: 502 });
  }
}
