"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  Phone,
  RefreshCw,
  Settings2,
  Sparkles,
  UserRound,
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

type Indicator = { id: string; name: string };
type ConsultantOption = {
  key: string;
  name: string;
  source: "team" | "custom";
  linkReference: string;
};
type FormValues = {
  consultant: string;
  name: string;
  phone: string;
  indicatorId: string;
  observations: string;
};
type IndicationSummary = {
  consultant: string;
  indicatedName: string;
  phone: string;
  indicator: string;
  observations?: string;
};
type Status =
  | { type: "idle" }
  | { type: "submitting" }
  | {
      type: "success";
      message: string;
      dealId: string;
      summary: IndicationSummary;
      warning?: string;
    }
  | { type: "error"; message: string };

const initialValues: FormValues = {
  consultant: "",
  name: "",
  phone: "",
  indicatorId: "",
  observations: "",
};

function dealUrl(dealId: string) {
  return `https://crm.rdstation.com/app/deals/${encodeURIComponent(dealId)}`;
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

async function postDeal(values: FormValues, consultantReference: string) {
  const response = await fetch("/api/deals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...values, consultantReference }),
  });
  const result = (await response.json()) as {
    id?: string;
    indicationId?: number;
    name?: string;
    warning?: string;
    message?: string;
    summary?: IndicationSummary;
  };
  if (!response.ok) throw new Error(result.message || "Não foi possível criar a indicação.");
  if (!result.id || !result.summary) {
    throw new Error("A indicação foi processada, mas o RD Station não retornou o resumo completo.");
  }
  return result;
}

export default function Home({ consultantReference = "" }: { consultantReference?: string }) {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [consultant, setConsultant] = useState<ConsultantOption | null>(null);
  const [loadingConsultants, setLoadingConsultants] = useState(true);
  const [consultantsMessage, setConsultantsMessage] = useState("");
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [loadingIndicators, setLoadingIndicators] = useState(true);
  const [integrationMessage, setIntegrationMessage] = useState("");
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const [copiedDealId, setCopiedDealId] = useState<string | null>(null);

  const loadIndicators = useCallback(async () => {
    setLoadingIndicators(true);
    setIntegrationMessage("");
    try {
      const response = await fetch("/api/indicators", { cache: "no-store" });
      const result = (await response.json()) as {
        configured?: boolean;
        indicators?: Indicator[];
        message?: string;
      };
      if (!response.ok) throw new Error(result.message || "Não foi possível carregar os indicadores.");
      setIndicators(result.indicators ?? []);
      if (result.configured === false || !result.indicators?.length) {
        setIntegrationMessage(
          result.message || "Nenhuma negociação em andamento foi encontrada no funil de indicadores.",
        );
      }
    } catch (error) {
      setIntegrationMessage(error instanceof Error ? error.message : "Não foi possível carregar os indicadores.");
    } finally {
      setLoadingIndicators(false);
    }
  }, []);

  const loadConsultant = useCallback(async () => {
    setLoadingConsultants(true);
    setConsultantsMessage("");
    if (!consultantReference) {
      setConsultant(null);
      setValues((current) => ({ ...current, consultant: "" }));
      setConsultantsMessage("Acesse este formulário pelo link individual do consultor.");
      setLoadingConsultants(false);
      return;
    }
    try {
      const response = await fetch(
        `/api/consultants?reference=${encodeURIComponent(consultantReference)}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as {
        consultant?: ConsultantOption;
        message?: string;
      };
      if (!response.ok || !result.consultant) {
        throw new Error(result.message || "Não foi possível identificar o consultor deste link.");
      }
      setConsultant(result.consultant);
      setValues((current) => ({ ...current, consultant: result.consultant?.key ?? "" }));
    } catch (error) {
      setConsultant(null);
      setValues((current) => ({ ...current, consultant: "" }));
      setConsultantsMessage(
        error instanceof Error ? error.message : "Não foi possível identificar o consultor deste link.",
      );
    } finally {
      setLoadingConsultants(false);
    }
  }, [consultantReference]);

  useEffect(() => {
    void Promise.resolve().then(() => Promise.all([loadIndicators(), loadConsultant()]));
  }, [loadConsultant, loadIndicators]);

  const createDeal = useCallback(async (submission: FormValues) => {
    setStatus({ type: "submitting" });
    setCopiedDealId(null);
    const result = await postDeal(submission, consultantReference);
    setValues({ ...initialValues, consultant: submission.consultant });
    setStatus({
      type: "success",
      message: result.indicationId
        ? `${result.name || submission.name} foi criado no RD Station e registrado no banco de dados.`
        : `${result.name || submission.name} foi criado no RD Station.`,
      dealId: result.id,
      summary: result.summary,
      warning: result.warning,
    });
    return { id: result.id, name: result.name || submission.name, status: "created" };
  }, [consultantReference]);

  async function copyDealUrl(dealId: string) {
    await navigator.clipboard.writeText(dealUrl(dealId));
    setCopiedDealId(dealId);
  }

  useEffect(() => {
    type ModelContext = {
      registerTool: (
        tool: {
          name: string;
          title: string;
          description: string;
          inputSchema: object;
          annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
          execute: (input: unknown) => Promise<unknown>;
        },
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    void Promise.resolve(
      context.registerTool(
        {
          name: "create_indication_deal",
          title: "Criar indicação no RD Station",
          description: "Cria um contato e uma negociação de indicação usando os mesmos campos deste formulário.",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", minLength: 2 },
              phone: { type: "string", description: "Celular brasileiro com DDD" },
              indicatorId: { type: "string", description: "ID da negociação indicadora" },
              observations: { type: "string" },
            },
            required: ["name", "phone", "indicatorId"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          async execute(input) {
            const next = input as Omit<FormValues, "consultant">;
            if (!next || typeof next !== "object") throw new Error("Dados inválidos.");
            if (!consultant) throw new Error("Acesse o formulário pelo link individual do consultor.");
            const normalized: FormValues = {
              ...next,
              consultant: consultant.key,
              phone: formatPhone(String(next.phone ?? "")),
              observations: next.observations ?? "",
            };
            setValues(normalized);
            try {
              return await createDeal(normalized);
            } catch (error) {
              const message = error instanceof Error ? error.message : "Não foi possível criar a indicação.";
              setStatus({ type: "error", message });
              throw new Error(message);
            }
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, [consultant, createDeal]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (values.phone.replace(/\D/g, "").length !== 11) {
      setStatus({ type: "error", message: "Informe um celular com DDD e 11 dígitos." });
      return;
    }
    try {
      await createDeal(values);
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Não foi possível criar a indicação.",
      });
    }
  }

  const canSubmit =
    status.type !== "submitting" &&
    !!values.consultant &&
    values.name.trim().length >= 2 &&
    values.phone.replace(/\D/g, "").length === 11 &&
    !!values.indicatorId;

  const selectedIndicator =
    indicators.find((indicator) => indicator.id === values.indicatorId) ?? null;

  return (
    <main className="min-h-screen bg-[#f7f5f8] text-[#26152f]">
      <div className="brand-grid" aria-hidden="true" />
      <header className="relative border-b border-white/10 bg-[#522370] text-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-white/12 ring-1 ring-white/20">
              <Sparkles className="size-5 text-[#34d366]" />
            </span>
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-white/60">Indicações</p>
              <p className="text-sm font-semibold sm:text-base">DNA Crescimento</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/gerenciador"
              className="inline-flex size-10 items-center justify-center rounded-xl bg-white/10 text-white/85 ring-1 ring-white/15 transition hover:bg-white/20"
              aria-label="Abrir gerenciador"
              title="Gerenciador"
            >
              <Settings2 className="size-4" />
            </Link>
          </div>
        </div>
      </header>

      <section className="relative mx-auto max-w-2xl px-5 py-8 sm:px-8 lg:py-12">
        <div className="rounded-[1.75rem] border border-[#e5dce9] bg-white p-5 shadow-[0_28px_90px_rgba(63,30,78,0.12)] sm:p-8">
          {status.type === "success" && (
            <div className="mb-5 rounded-2xl border border-[#b9e8c7] bg-[#effbf2] p-4 text-[#176f37]" role="status">
              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-semibold">Indicação criada com sucesso</p>
                  <p className="mt-1 text-sm">{status.message}</p>
                  <dl className="mt-4 grid gap-3 rounded-xl border border-[#ccebd5] bg-white/70 p-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[#5b8067]">Indicado</dt>
                      <dd className="mt-1 text-sm font-medium text-[#245a35]">{status.summary.indicatedName}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[#5b8067]">Telefone</dt>
                      <dd className="mt-1 text-sm font-medium text-[#245a35]">{formatPhone(status.summary.phone)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[#5b8067]">Consultor responsável</dt>
                      <dd className="mt-1 text-sm font-medium text-[#245a35]">
                        {status.summary.consultant.toLocaleUpperCase("pt-BR")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[#5b8067]">Indicador</dt>
                      <dd className="mt-1 text-sm font-medium text-[#245a35]">{status.summary.indicator}</dd>
                    </div>
                    {status.summary.observations && (
                      <div className="sm:col-span-2">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-[#5b8067]">Observações</dt>
                        <dd className="mt-1 whitespace-pre-wrap text-sm font-medium text-[#245a35]">
                          {status.summary.observations}
                        </dd>
                      </div>
                    )}
                  </dl>
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#5b8067]">URL da negociação</p>
                    <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <code className="min-w-0 flex-1 break-all rounded-xl border border-[#ccebd5] bg-white/70 px-3 py-2.5 text-xs text-[#245a35]">
                        {dealUrl(status.dealId)}
                      </code>
                      <button
                        type="button"
                        onClick={() => void copyDealUrl(status.dealId)}
                        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#176f37] px-4 text-sm font-semibold text-white transition hover:bg-[#125b2d]"
                      >
                        {copiedDealId === status.dealId ? (
                          <CheckCircle2 className="size-4" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                        {copiedDealId === status.dealId ? "Copiado" : "Copiar URL"}
                      </button>
                    </div>
                  </div>
                  {status.warning && <p className="mt-2 text-sm font-medium text-amber-700">{status.warning}</p>}
                </div>
              </div>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="consultant">Consultor responsável</Label>
                {!loadingConsultants && consultantsMessage && (
                  <button type="button" onClick={() => void loadConsultant()} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#622f7d] hover:underline">
                    <RefreshCw className="size-3" /> Tentar novamente
                  </button>
                )}
              </div>
              <div className="relative">
                <UserRound className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#8b7198]" />
                <Input
                  id="consultant"
                  readOnly
                  aria-readonly="true"
                  value={
                    loadingConsultants
                      ? "Carregando consultor..."
                      : consultant?.name.toLocaleUpperCase("pt-BR") ?? "Consultor não identificado"
                  }
                  className="h-12 cursor-default rounded-xl border-[#d9cddd] bg-[#f3eff5] pl-11 pr-4 text-base text-[#522370]"
                />
              </div>
              {consultantsMessage && (
                <p className="flex items-start gap-1.5 text-xs leading-5 text-amber-700">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" /> {consultantsMessage}
                </p>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do indicado</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  minLength={2}
                  maxLength={180}
                  autoComplete="name"
                  placeholder="Nome completo"
                  value={values.name}
                  onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
                  className="h-12 rounded-xl border-[#d9cddd] bg-[#fcfbfd] px-4 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#8b7198]" />
                  <Input
                    id="phone"
                    name="phone"
                    required
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="(00) 00000-0000"
                    value={values.phone}
                    onChange={(event) => setValues((current) => ({ ...current, phone: formatPhone(event.target.value) }))}
                    className="h-12 rounded-xl border-[#d9cddd] bg-[#fcfbfd] pl-11 pr-4 text-base"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="indicator">Indicador</Label>
                {!loadingIndicators && integrationMessage && (
                  <button type="button" onClick={() => void loadIndicators()} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#622f7d] hover:underline">
                    <RefreshCw className="size-3" /> Tentar novamente
                  </button>
                )}
              </div>
              <Combobox
                items={indicators}
                value={selectedIndicator}
                onValueChange={(indicator) =>
                  setValues((current) => ({ ...current, indicatorId: indicator?.id ?? "" }))
                }
                itemToStringLabel={(indicator) => indicator.name}
                isItemEqualToValue={(indicator, value) => indicator.id === value.id}
                disabled={loadingIndicators || !indicators.length}
                autoHighlight
              >
                <ComboboxInput
                  id="indicator"
                  required
                  showClear
                  placeholder={
                    loadingIndicators
                      ? "Carregando indicadores..."
                      : "Digite para buscar a negociação"
                  }
                  className="h-12 w-full rounded-xl border-[#d9cddd] bg-[#fcfbfd] px-1 text-base"
                />
                <ComboboxContent className="rounded-xl border-[#e5dce9]">
                  <ComboboxEmpty>Nenhuma negociação em andamento encontrada.</ComboboxEmpty>
                  <ComboboxList>
                    {(indicator: Indicator) => (
                      <ComboboxItem key={indicator.id} value={indicator}>
                        {indicator.name}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              {integrationMessage && (
                <p className="flex items-start gap-1.5 text-xs leading-5 text-amber-700">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" /> {integrationMessage}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="observations">Observações</Label>
              <Textarea
                id="observations"
                name="observations"
                maxLength={4000}
                placeholder="Inclua informações importantes para o atendimento"
                value={values.observations}
                onChange={(event) => setValues((current) => ({ ...current, observations: event.target.value }))}
                className="min-h-28 resize-y rounded-xl border-[#d9cddd] bg-[#fcfbfd] px-4 py-3 text-base"
              />
            </div>

            <Button type="submit" size="lg" disabled={!canSubmit} className="h-13 w-full rounded-xl bg-[#622f7d] text-base font-bold shadow-[0_12px_28px_rgba(98,47,125,0.25)] hover:bg-[#512569]">
              {status.type === "submitting" ? <><Loader2 className="animate-spin" /> Criando no RD Station...</> : "Criar indicação no RD Station"}
            </Button>

            {status.type === "error" && (
              <p className="flex items-start justify-center gap-2 text-sm font-medium text-[#b42335]" role="alert">
                <AlertCircle className="mt-0.5 size-4 shrink-0" /> {status.message}
              </p>
            )}
          </form>
        </div>
      </section>
    </main>
  );
}
