import { NextResponse } from "next/server";

import { findConsultantByReference } from "@/lib/consultants";
import {
  formatCustomerDocument,
  isCustomerDocumentType,
  isValidCustomerDocument,
  normalizeCustomerDocument,
  type CustomerDocumentType,
} from "@/lib/customer-document";
import { randomRdTeamUserId, rdRequest } from "@/lib/rd";
import {
  createRdClientReferralDeal,
  createRdDealNote,
  createRdReferralContact,
  getRdDealCustomField,
  RdOAuthError,
} from "@/lib/rd-oauth";
import {
  createPendingSstClientReferrals,
  updateSstClientReferral,
} from "@/lib/sst-client-referrals";
import { findEligibleSstPartner } from "@/lib/sst-partners";

const CONSULTANT_FIELD_ID =
  process.env.RD_B2C_CONSULTANT_FIELD_ID?.trim() || "679294da974d290014ec0261";
const DOCUMENT_FIELD_ID =
  process.env.RD_B2C_DOCUMENT_FIELD_ID?.trim() || "68acc240a65baa0017cc3700";
const STAGE_ID =
  process.env.RD_B2C_STAGE_ID?.trim() || "678fb2c4ec27e8001e9926a7";
const TEAM_ID =
  process.env.RD_B2C_TEAM_ID?.trim() || "67a10d03a007d8001879c16b";
const CAMPAIGN_ID =
  process.env.RD_B2C_CAMPAIGN_ID?.trim() || "6866ad7eda2694001ef59e3a";
const DEAL_URL = "https://crm.rdstation.com/app/deals";
const MAX_COMPANIES = 10;

type CompanyInput = {
  name?: unknown;
  documentType?: unknown;
  document?: unknown;
  employeeCount?: unknown;
  roles?: unknown;
};

type Submission = {
  consultantReference?: unknown;
  partnerOrganizationId?: unknown;
  contactName?: unknown;
  phone?: unknown;
  email?: unknown;
  observations?: unknown;
  companies?: unknown;
};

type CustomFieldV1 = {
  allow_new?: boolean;
  for?: string;
  label?: string;
  opts?: string[];
  order?: number;
  required?: boolean;
  type?: string;
  unique?: boolean;
};

type NormalizedCompany = {
  index: number;
  name: string;
  documentType: CustomerDocumentType;
  document: string;
  employeeCount: string;
  roles: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function compareOption(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

async function ensureConsultantOption(fieldId: string, consultantName: string) {
  const field = await rdRequest<CustomFieldV1>(
    `/custom_fields/${encodeURIComponent(fieldId)}`,
  );
  if (field.for !== "deal" || field.type !== "option") {
    throw new Error("O campo de consultor do B2C não é uma lista de opções da negociação.");
  }
  const options = Array.isArray(field.opts) ? field.opts.filter(Boolean) : [];
  const expected = compareOption(consultantName);
  const existing = options.find((option) => compareOption(option) === expected);
  if (existing) return existing;

  const normalizedName = consultantName.normalize("NFC").replace(/\s+/g, " ").trim();
  await rdRequest<CustomFieldV1>(`/custom_fields/${encodeURIComponent(fieldId)}`, {
    method: "PUT",
    body: JSON.stringify({
      custom_field: {
        allow_new: field.allow_new ?? false,
        for: field.for,
        label: field.label,
        opts: [...options, normalizedName],
        order: field.order ?? 0,
        required: field.required ?? false,
        type: field.type,
        unique: field.unique ?? false,
      },
    }),
  });
  return normalizedName;
}

function normalizeCompanies(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_COMPANIES) {
    throw new Error(`Informe de 1 a ${MAX_COMPANIES} empresas.`);
  }
  const seenDocuments = new Set<string>();
  return value.map((item, index): NormalizedCompany => {
    const company = item && typeof item === "object" ? (item as CompanyInput) : {};
    const name = text(company.name);
    const documentTypeValue = text(company.documentType).toUpperCase();
    if (!isCustomerDocumentType(documentTypeValue)) {
      throw new Error(`Selecione o tipo de documento da empresa ${index + 1}.`);
    }
    const document = normalizeCustomerDocument(text(company.document), documentTypeValue);
    const employeeCount = text(company.employeeCount);
    const roles = text(company.roles);
    if (name.length < 2 || name.length > 255) {
      throw new Error(`O nome da empresa ${index + 1} deve ter pelo menos 2 caracteres.`);
    }
    if (!isValidCustomerDocument(document, documentTypeValue)) {
      throw new Error(`Informe um ${documentTypeValue} válido para a empresa ${index + 1}.`);
    }
    if (seenDocuments.has(document)) {
      throw new Error(`O documento da empresa ${index + 1} já foi informado nesta indicação.`);
    }
    seenDocuments.add(document);
    if (employeeCount && !/^\d{1,9}$/.test(employeeCount)) {
      throw new Error(`A quantidade de colaboradores da empresa ${index + 1} deve ser inteira.`);
    }
    if (roles && !/^\d{1,9}$/.test(roles)) {
      throw new Error(`O campo de cargos da empresa ${index + 1} deve ser inteiro.`);
    }
    return { index, name, documentType: documentTypeValue, document, employeeCount, roles };
  });
}

function companyNote(
  company: NormalizedCompany,
  observations: string,
  group: Array<{ company: NormalizedCompany; dealId: string }>,
) {
  const groupSummary = group.length > 1
    ? [
        "Empresas do mesmo grupo:",
        ...group.map(({ company: item, dealId }, index) =>
          [
            `Empresa ${index + 1}`,
            `Nome da empresa: ${item.name}`,
            `Documento da empresa: ${formatCustomerDocument(item.document, item.documentType)}`,
            item.employeeCount ? `Quantidade de colaboradores: ${item.employeeCount}` : "",
            item.roles ? `Cargos: ${item.roles}` : "",
            `Link da negociação: ${DEAL_URL}/${encodeURIComponent(dealId)}`,
          ].filter(Boolean).join("\n"),
        ),
      ].join("\n\n")
    : "";
  return [
    company.employeeCount ? `Quantidade de colaboradores: ${company.employeeCount}` : "",
    company.roles ? `Cargos: ${company.roles}` : "",
    observations ? `Observações: ${observations}` : "",
    groupSummary,
  ].filter(Boolean).join("\n\n");
}

export async function POST(request: Request) {
  let ids: number[] = [];
  try {
    const body = (await request.json()) as Submission;
    const consultantReference = text(body.consultantReference);
    const partnerOrganizationId = text(body.partnerOrganizationId);
    const contactName = text(body.contactName);
    const phone = text(body.phone).replace(/\D/g, "");
    const email = text(body.email).toLocaleLowerCase("pt-BR");
    const observations = text(body.observations);
    const companies = normalizeCompanies(body.companies);

    if (!consultantReference) throw new Error("Acesse o formulário pelo link individual do consultor.");
    if (!/^[a-fA-F0-9]{24}$/.test(partnerOrganizationId)) {
      throw new Error("Selecione um parceiro indicador válido.");
    }
    if (contactName.length < 2 || contactName.length > 180) {
      throw new Error("Informe um contato com pelo menos 2 caracteres.");
    }
    if (!/^\d{10,11}$/.test(phone)) throw new Error("Informe um telefone com DDD e 10 ou 11 dígitos.");
    if (!validEmail(email)) throw new Error("Informe um e-mail válido.");
    if (observations.length > 5000) throw new Error("A observação pode ter no máximo 5.000 caracteres.");

    const [consultant, partner] = await Promise.all([
      findConsultantByReference(consultantReference),
      findEligibleSstPartner(partnerOrganizationId),
    ]);
    if (!partner) {
      throw new Error(
        "O parceiro indicador precisa possuir negociação nos dois funis configurados.",
      );
    }
    const organizationId = partner.organizationId;
    const partnerName = partner.name;

    ids = await createPendingSstClientReferrals(
      companies.map((company) => ({
        partnerOrganizationId: organizationId,
        partnerName,
        consultantName: consultant.name,
        customerName: company.name,
        customerDocument: company.document,
        contactName,
        phone,
        email: email || undefined,
        employeeCount: company.employeeCount || undefined,
        roles: company.roles || undefined,
        observations: observations || undefined,
      })),
    );

    const [consultantField, documentField, consultantOption, ownerId] = await Promise.all([
      getRdDealCustomField(CONSULTANT_FIELD_ID),
      getRdDealCustomField(DOCUMENT_FIELD_ID),
      ensureConsultantOption(CONSULTANT_FIELD_ID, consultant.name),
      randomRdTeamUserId(TEAM_ID),
    ]);
    if (!consultantField.slug || consultantField.entity !== "deal") {
      throw new Error("O campo de consultor do B2C não está configurado no RD.");
    }
    if (!documentField.slug || documentField.entity !== "deal") {
      throw new Error("O campo de documento do cliente não está configurado no RD.");
    }

    const contactId = await createRdReferralContact({
      organizationId,
      name: contactName,
      phone,
      email: email || undefined,
    });
    await Promise.all(ids.map((id) => updateSstClientReferral(id, {
      status: "processando",
      message: "Contato principal criado e negociação aguardando criação.",
      contactId,
    })));

    const created: Array<{ company: NormalizedCompany; dealId: string; indicationId: number }> = [];
    const results: Array<{
      index: number;
      indicationId: number;
      company: string;
      dealId?: string;
      status: "sucesso" | "erro";
      message: string;
    }> = [];

    for (const company of companies) {
      const indicationId = ids[company.index];
      let createdDealId: string | undefined;
      try {
        const deal = await createRdClientReferralDeal({
          name: company.name,
          organizationId,
          contactId,
          stageId: STAGE_ID,
          campaignId: CAMPAIGN_ID,
          responsibleId: ownerId,
          customFields: {
            [consultantField.slug]: consultantOption,
            [documentField.slug]: formatCustomerDocument(company.document, company.documentType),
          },
        });
        createdDealId = deal.id;
        created.push({ company, dealId: deal.id, indicationId });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não foi possível criar a negociação.";
        await updateSstClientReferral(indicationId, {
          status: "erro",
          message,
          contactId,
          dealId: createdDealId,
        }).catch(() => undefined);
        results.push({
          index: company.index,
          indicationId,
          company: company.name,
          dealId: createdDealId,
          status: "erro",
          message,
        });
      }
    }

    for (const item of created) {
      try {
        const note = companyNote(item.company, observations, created);
        if (note) await createRdDealNote(item.dealId, note);
        const message = "Negociação criada com o contato principal e o responsável do grupo.";
        await updateSstClientReferral(item.indicationId, {
          status: "sucesso",
          message,
          contactId,
          dealId: item.dealId,
        });
        results.push({
          index: item.company.index,
          indicationId: item.indicationId,
          company: item.company.name,
          dealId: item.dealId,
          status: "sucesso",
          message,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "A negociação foi criada, mas a anotação falhou.";
        await updateSstClientReferral(item.indicationId, {
          status: "erro",
          message,
          contactId,
          dealId: item.dealId,
        }).catch(() => undefined);
        results.push({ index: item.company.index, indicationId: item.indicationId, company: item.company.name, dealId: item.dealId, status: "erro", message });
      }
    }

    const orderedResults = results.sort((left, right) => left.index - right.index);
    const successes = orderedResults.filter((item) => item.status === "sucesso");
    if (!successes.length) {
      return NextResponse.json(
        { message: orderedResults[0]?.message || "Não foi possível criar as negociações no RD Station.", results: orderedResults },
        { status: 502 },
      );
    }
    return NextResponse.json(
      {
        message: orderedResults.every((item) => item.status === "sucesso")
          ? `${successes.length} negociação(ões) criada(s) com sucesso.`
          : `${successes.length} negociação(ões) criada(s), com falha em ${orderedResults.length - successes.length}.`,
        partner: partnerName,
        consultant: consultant.name,
        contact: contactName,
        results: orderedResults,
      },
      { status: successes.length === orderedResults.length ? 201 : 207 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível processar a indicação B2C.";
    if (ids.length) {
      await Promise.all(ids.map((id) => updateSstClientReferral(id, {
        status: "erro",
        message,
      }).catch(() => undefined)));
    }
    console.error("Erro ao criar indicação de cliente SST.", {
      message,
      rdStatus: error instanceof RdOAuthError ? error.status : null,
      rdDetails: error instanceof RdOAuthError ? error.details : null,
    });
    const status = error instanceof RdOAuthError ? 502 : 400;
    return NextResponse.json(
      { message: status === 502 ? "Não foi possível concluir a indicação no RD Station. Tente novamente." : message },
      { status },
    );
  }
}
