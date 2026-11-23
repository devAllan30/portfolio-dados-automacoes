"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Copy,
  FileText,
  Loader2,
  Mail,
  Phone,
  Plus,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  formatCustomerDocument,
  isValidCustomerDocument,
  normalizeCustomerDocument,
  type CustomerDocumentType,
} from "@/lib/customer-document";

type EligiblePartner = { organizationId: string; name: string };
type Company = {
  id: string;
  name: string;
  documentType: CustomerDocumentType;
  document: string;
  employeeCount: string;
  roles: string;
};
type ApiResult = {
  index: number;
  indicationId: number;
  company: string;
  dealId?: string;
  status: "sucesso" | "erro";
  message: string;
};
type Success = {
  message: string;
  partner: string;
  consultant: string;
  contact: string;
  results: ApiResult[];
};

const MAX_COMPANIES = 10;

function newCompany(id = `company-${Date.now()}-${Math.random().toString(36).slice(2)}`): Company {
  return {
    id,
    name: "",
    documentType: "CNPJ",
    document: "",
    employeeCount: "",
    roles: "",
  };
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function validEmail(value: string) {
  return !value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function dealUrl(id: string) {
  return `https://crm.rdstation.com/app/deals/${id}`;
}

export function SstClientReferralForm({
  consultantReference,
  consultantName,
}: {
  consultantReference: string;
  consultantName: string;
}) {
  const [partnerOrganizationId, setPartnerOrganizationId] = useState("");
  const [partners, setPartners] = useState<EligiblePartner[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(true);
  const [partnersMessage, setPartnersMessage] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [observations, setObservations] = useState("");
  const [companies, setCompanies] = useState<Company[]>([newCompany("company-initial")]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<Success | null>(null);
  const [copiedDealId, setCopiedDealId] = useState("");

  const selectedPartner = useMemo(
    () => partners.find((partner) => partner.organizationId === partnerOrganizationId) ?? null,
    [partnerOrganizationId, partners],
  );

  const loadPartners = useCallback(async () => {
    setLoadingPartners(true);
    setPartnersMessage("");
    try {
      const response = await fetch("/api/sst-partners", { cache: "no-store" });
      const result = (await response.json()) as {
        partners?: EligiblePartner[];
        message?: string;
      };
      if (!response.ok) {
        throw new Error(result.message || "Não foi possível carregar os parceiros indicadores.");
      }
      setPartners(result.partners ?? []);
      if (!result.partners?.length) {
        setPartnersMessage(
          "Nenhuma empresa com negociação nos dois funis foi encontrada.",
        );
      }
    } catch (loadError) {
      setPartners([]);
      setPartnersMessage(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar os parceiros indicadores.",
      );
    } finally {
      setLoadingPartners(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadPartners);
  }, [loadPartners]);
  const phoneDigits = phone.replace(/\D/g, "");
  const documents = companies.map((company) =>
    normalizeCustomerDocument(company.document, company.documentType),
  );
  const uniqueDocuments = new Set(documents.filter(Boolean)).size === documents.filter(Boolean).length;
  const companiesAreValid = companies.every(
    (company) =>
      company.name.trim().length >= 2 &&
      isValidCustomerDocument(company.document, company.documentType) &&
      (!company.employeeCount || /^\d{1,9}$/.test(company.employeeCount)) &&
      (!company.roles || /^\d{1,9}$/.test(company.roles)),
  );
  const canSubmit =
    !submitting &&
    Boolean(consultantName && selectedPartner) &&
    contactName.trim().length >= 2 &&
    [10, 11].includes(phoneDigits.length) &&
    validEmail(email) &&
    observations.length <= 5000 &&
    companiesAreValid &&
    uniqueDocuments;

  function updateCompany(id: string, update: Partial<Omit<Company, "id">>) {
    setError("");
    setCompanies((current) => current.map((company) => company.id === id ? { ...company, ...update } : company));
  }

  function addCompany() {
    if (companies.length >= MAX_COMPANIES) return;
    setCompanies((current) => [...current, newCompany()]);
  }

  function removeCompany(id: string) {
    if (companies.length === 1) return;
    setCompanies((current) => current.filter((company) => company.id !== id));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/sst-client-referrals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          consultantReference,
          partnerOrganizationId,
          contactName,
          phone,
          email,
          observations,
          companies,
        }),
      });
      const result = (await response.json()) as Partial<Success> & { message?: string };
      if (!response.ok || !result.partner || !result.consultant || !result.contact || !result.results) {
        throw new Error(result.message || "Não foi possível enviar a indicação de cliente.");
      }
      setSuccess(result as Success);
      setPartnerOrganizationId("");
      setContactName("");
      setPhone("");
      setEmail("");
      setObservations("");
      setCompanies([newCompany()]);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível enviar a indicação de cliente.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyUrl(dealId: string) {
    await navigator.clipboard.writeText(dealUrl(dealId));
    setCopiedDealId(dealId);
  }

  if (success) {
    return (
      <div className="mx-auto max-w-2xl rounded-[1.75rem] border border-[#b9e8c7] bg-[#effbf2] p-5 shadow-[0_28px_90px_rgba(23,111,55,0.10)] sm:p-8" role="status">
        <div className="flex min-h-[58vh] items-center">
          <div className="w-full">
            <div className="flex items-start gap-3 text-[#176f37]">
              <CheckCircle2 className="mt-0.5 size-7 shrink-0" />
              <div>
                <p className="text-xl font-bold">Indicação de cliente enviada</p>
                <p className="mt-1 text-sm leading-6">{success.message}</p>
              </div>
            </div>
            <dl className="mt-6 grid gap-3 rounded-2xl border border-[#ccebd5] bg-white/75 p-4 text-sm sm:grid-cols-3">
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#5b8067]">Sócio</dt><dd className="mt-1 font-medium text-[#245a35]">{success.partner}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#5b8067]">Consultor</dt><dd className="mt-1 font-medium text-[#245a35]">{success.consultant}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#5b8067]">Contato</dt><dd className="mt-1 font-medium text-[#245a35]">{success.contact}</dd></div>
            </dl>
            <div className="mt-5 space-y-3">
              {success.results.map((result) => (
                <div key={result.indicationId} className={`rounded-2xl border p-4 ${result.status === "sucesso" ? "border-[#ccebd5] bg-white/75" : "border-[#efc3ca] bg-[#fff4f5]"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#245a35]">{result.company}</p>
                      <p className={`mt-1 text-xs ${result.status === "sucesso" ? "text-[#5b8067]" : "text-[#a6293c]"}`}>{result.message}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide ${result.status === "sucesso" ? "bg-[#dff5e5] text-[#176f37]" : "bg-[#ffe3e7] text-[#a6293c]"}`}>{result.status}</span>
                  </div>
                  {result.dealId && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <code className="min-w-0 flex-1 break-all rounded-xl border border-[#d8eadf] bg-white px-3 py-2 text-xs text-[#245a35]">{dealUrl(result.dealId)}</code>
                      <Button type="button" size="sm" onClick={() => void copyUrl(result.dealId!)} className="rounded-xl bg-[#176f37] hover:bg-[#125b2d]">
                        {copiedDealId === result.dealId ? <CheckCircle2 className="size-4" /> : <Copy className="size-4" />}
                        {copiedDealId === result.dealId ? "Copiado" : "Copiar"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" onClick={() => setSuccess(null)} className="mt-6 w-full rounded-xl border-[#a9d2b7] text-[#176f37] hover:bg-white">
              Enviar outra indicação de cliente
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl rounded-[1.75rem] border border-[#c7dfcf] bg-white p-5 shadow-[0_28px_90px_rgba(23,111,55,0.10)] sm:p-8">
      <div className="mb-6 border-b border-[#e3eee7] pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#568166]">SST · Indicação de cliente (B2C)</p>
        <h1 className="mt-1 text-2xl font-bold text-[#24452f]">Indique uma ou mais empresas</h1>
        <p className="mt-2 text-sm leading-6 text-[#607568]">Informe o contato principal e cadastre as empresas do grupo que deseja indicar.</p>
      </div>

      <form className="space-y-6" onSubmit={submit}>
        <section className="rounded-2xl border border-[#d8eadf] bg-[#f8fcf9] p-4 sm:p-5">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[#568166]">Dados da indicação</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="b2c-consultant">Consultor responsável</Label>
              <div className="relative">
                <UserRound className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#698574]" />
                <Input id="b2c-consultant" readOnly value={consultantName} className="h-12 rounded-xl border-[#cfe0d4] bg-[#eef6f0] pl-11 pr-4 text-base uppercase" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="b2c-partner">Parceiro indicador <span className="text-red-500">*</span></Label>
              <Combobox
                items={partners}
                value={selectedPartner}
                onValueChange={(item) => { setPartnerOrganizationId(item?.organizationId ?? ""); setError(""); }}
                itemToStringLabel={(item) => item.name}
                isItemEqualToValue={(item, value) => item.organizationId === value.organizationId}
                disabled={loadingPartners || !partners.length}
                autoHighlight
              >
                <ComboboxInput id="b2c-partner" required placeholder={loadingPartners ? "Carregando parceiros..." : "Digite para buscar o parceiro"} className="h-12 w-full rounded-xl border-[#cfe0d4] bg-white px-1 text-base" />
                <ComboboxContent className="rounded-xl border-[#d8eadf]">
                  <ComboboxEmpty>Nenhum parceiro encontrado.</ComboboxEmpty>
                  <ComboboxList>{(item: EligiblePartner) => <ComboboxItem key={item.organizationId} value={item}><Building2 className="size-4 text-[#568166]" /> {item.name}</ComboboxItem>}</ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
          </div>
          {partnersMessage && (
            <div className="mt-3 flex items-start justify-between gap-3 text-xs text-amber-700">
              <p className="flex items-start gap-2"><AlertCircle className="mt-0.5 size-3.5 shrink-0" /> {partnersMessage}</p>
              <button type="button" onClick={() => void loadPartners()} className="shrink-0 font-semibold underline">Tentar novamente</button>
            </div>
          )}
        </section>

        <div className="flex items-center gap-3"><span className="text-xs font-bold uppercase tracking-[0.15em] text-[#568166]">Contato principal</span><span className="h-px flex-1 bg-[#e3eee7]" /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="b2c-contact">Nome do contato <span className="text-red-500">*</span></Label>
            <Input id="b2c-contact" required minLength={2} maxLength={180} autoComplete="name" placeholder="Nome completo da pessoa que será contatada" value={contactName} onChange={(event) => { setContactName(event.target.value); setError(""); }} className="h-12 rounded-xl border-[#cfe0d4] bg-[#fbfefc] px-4 text-base" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="b2c-phone">Telefone do contato <span className="text-red-500">*</span></Label>
            <div className="relative"><Phone className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#698574]" /><Input id="b2c-phone" required inputMode="numeric" autoComplete="tel" placeholder="(00) 00000-0000" value={phone} onChange={(event) => { setPhone(formatPhone(event.target.value)); setError(""); }} className="h-12 rounded-xl border-[#cfe0d4] bg-[#fbfefc] pl-11 pr-4 text-base" /></div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="b2c-email">E-mail do contato <span className="font-normal text-[#7b8b81]">(opcional)</span></Label>
            <div className="relative"><Mail className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#698574]" /><Input id="b2c-email" type="email" maxLength={254} autoComplete="email" placeholder="nome@empresa.com.br" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} className="h-12 rounded-xl border-[#cfe0d4] bg-[#fbfefc] pl-11 pr-4 text-base" /></div>
          </div>
        </div>

        <div className="flex items-center gap-3"><span className="text-xs font-bold uppercase tracking-[0.15em] text-[#568166]">Empresas indicadas</span><span className="h-px flex-1 bg-[#e3eee7]" /></div>
        <div className="space-y-4">
          {companies.map((company, index) => (
            <section key={company.id} className="rounded-2xl border border-[#d8eadf] bg-[#fbfefc] p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3 border-b border-[#e3eee7] pb-4">
                <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-[#e4f6e9] text-sm font-bold text-[#176f37]">{index + 1}</span><div><p className="font-bold text-[#24452f]">Empresa {index + 1}</p><p className="text-xs text-[#607568]">Será criada uma negociação para esta empresa.</p></div></div>
                {companies.length > 1 && <button type="button" onClick={() => removeCompany(company.id)} className="grid size-9 place-items-center rounded-xl text-[#8a646b] transition hover:bg-[#fff0f2] hover:text-[#b42335]" aria-label={`Remover empresa ${index + 1}`}><Trash2 className="size-4" /></button>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2"><Label htmlFor={`b2c-company-${index}`}>Nome da empresa <span className="text-red-500">*</span></Label><Input id={`b2c-company-${index}`} required minLength={2} maxLength={255} autoComplete="organization" placeholder="Digite o nome da empresa" value={company.name} onChange={(event) => updateCompany(company.id, { name: event.target.value })} className="h-12 rounded-xl border-[#cfe0d4] bg-white px-4 text-base" /></div>
                <div className="space-y-2"><Label htmlFor={`b2c-document-type-${index}`}>Tipo de documento <span className="text-red-500">*</span></Label><select id={`b2c-document-type-${index}`} value={company.documentType} onChange={(event) => updateCompany(company.id, { documentType: event.target.value as CustomerDocumentType, document: "" })} className="h-12 w-full rounded-xl border border-[#cfe0d4] bg-white px-4 text-base outline-none focus:border-[#176f37] focus:ring-2 focus:ring-[#176f37]/20"><option value="CNPJ">CNPJ</option><option value="CAEPF">CAEPF</option><option value="CPF">CPF</option></select></div>
                <div className="space-y-2"><Label htmlFor={`b2c-document-${index}`}>{company.documentType} da empresa <span className="text-red-500">*</span></Label><div className="relative"><FileText className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#698574]" /><Input id={`b2c-document-${index}`} required inputMode="numeric" placeholder={company.documentType === "CNPJ" ? "00.000.000/0000-00" : company.documentType === "CPF" ? "000.000.000-00" : "000.000.000/000-00"} value={company.document} onChange={(event) => updateCompany(company.id, { document: formatCustomerDocument(event.target.value, company.documentType) })} className="h-12 rounded-xl border-[#cfe0d4] bg-white pl-11 pr-4 text-base" /></div></div>
                <div className="space-y-2"><Label htmlFor={`b2c-employees-${index}`}>Quantidade de colaboradores <span className="font-normal text-[#7b8b81]">(opcional)</span></Label><div className="relative"><Users className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#698574]" /><Input id={`b2c-employees-${index}`} inputMode="numeric" placeholder="Ex.: 50" value={company.employeeCount} onChange={(event) => updateCompany(company.id, { employeeCount: event.target.value.replace(/\D/g, "").slice(0, 9) })} className="h-12 rounded-xl border-[#cfe0d4] bg-white pl-11 pr-4 text-base" /></div></div>
                <div className="space-y-2"><Label htmlFor={`b2c-roles-${index}`}>Cargos <span className="font-normal text-[#7b8b81]">(opcional)</span></Label><div className="relative"><BriefcaseBusiness className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#698574]" /><Input id={`b2c-roles-${index}`} inputMode="numeric" placeholder="Ex.: 8" value={company.roles} onChange={(event) => updateCompany(company.id, { roles: event.target.value.replace(/\D/g, "").slice(0, 9) })} className="h-12 rounded-xl border-[#cfe0d4] bg-white pl-11 pr-4 text-base" /></div></div>
              </div>
            </section>
          ))}
        </div>
        <Button type="button" variant="outline" disabled={companies.length >= MAX_COMPANIES} onClick={addCompany} className="h-12 w-full rounded-xl border-dashed border-[#8fc2a0] text-[#176f37] hover:bg-[#eef8f1]"><Plus className="size-4" /> Adicionar empresa do mesmo grupo</Button>
        <p className="-mt-4 text-xs text-[#718078]">{companies.length} de {MAX_COMPANIES} empresas adicionadas</p>

        <div className="space-y-2 rounded-2xl border border-[#d8eadf] bg-[#f8fcf9] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3"><Label htmlFor="b2c-observations">Observação geral <span className="font-normal text-[#7b8b81]">(opcional)</span></Label><span className="text-xs tabular-nums text-[#7b8b81]">{observations.length}/5.000</span></div>
          <Textarea id="b2c-observations" maxLength={5000} placeholder="Digite informações gerais para todas as empresas do grupo" value={observations} onChange={(event) => { setObservations(event.target.value); setError(""); }} className="min-h-28 resize-y rounded-xl border-[#cfe0d4] bg-white px-4 py-3 text-base" />
          <p className="text-xs text-[#718078]">Esta observação será registrada em todas as negociações criadas.</p>
        </div>

        {!uniqueDocuments && <div className="flex items-start gap-3 rounded-2xl border border-[#efc3ca] bg-[#fff4f5] p-4 text-sm font-medium text-[#a6293c]"><AlertCircle className="mt-0.5 size-5 shrink-0" /> O mesmo documento não pode ser informado em duas empresas.</div>}
        {error && <div className="flex items-start gap-3 rounded-2xl border border-[#efc3ca] bg-[#fff4f5] p-4 text-sm font-medium text-[#a6293c]" role="alert"><AlertCircle className="mt-0.5 size-5 shrink-0" /> {error}</div>}

        <div className="rounded-2xl border border-[#d8eadf] bg-[#f8fcf9] px-4 py-3 text-xs leading-5 text-[#607568]">Será criado apenas um contato e uma negociação para cada empresa. Todas ficarão com o mesmo responsável.</div>
        <Button type="submit" size="lg" disabled={!canSubmit} className="h-13 w-full rounded-xl bg-[#176f37] text-base font-bold shadow-[0_12px_28px_rgba(23,111,55,0.22)] hover:bg-[#125b2d]">
          {submitting ? <><Loader2 className="size-5 animate-spin" /> Enviando indicação...</> : <><BriefcaseBusiness className="size-5" /> Enviar indicação de cliente</>}
        </Button>
      </form>
    </div>
  );
}
