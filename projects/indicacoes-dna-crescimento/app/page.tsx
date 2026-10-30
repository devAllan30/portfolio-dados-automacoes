"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ptBR } from "date-fns/locale";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleEllipsis,
  Clock3,
  Copy,
  GraduationCap,
  Loader2,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";

type Indicator = { id: string; name: string };
type ScheduleOption = { value: string; label: string };
type Ecosystem = "imersao" | "sst";
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
type SstFormValues = {
  companyId: string;
  contactName: string;
  phone: string;
  primaryEmail: string;
  date: string;
  time: string;
  additionalEmails: string[];
  clientCount: string;
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
  | {
      type: "error";
      message: string;
      title?: string;
      reasons?: string[];
      taskId?: string;
    };
type SstStatus =
  | { type: "idle" }
  | { type: "submitting" }
  | {
      type: "success";
      message: string;
      responsible: string;
      eventLink?: string;
      meetLink: string;
      summary: {
        consultant: string;
        company: string;
        contact: string;
        phone: string;
        primaryEmail: string;
        date: string;
        time: string;
      };
    }
  | { type: "error"; message: string };

const initialValues: FormValues = {
  consultant: "",
  name: "",
  phone: "",
  indicatorId: "",
  observations: "",
};

const initialSstValues: SstFormValues = {
  companyId: "",
  contactName: "",
  phone: "",
  primaryEmail: "",
  date: "",
  time: "",
  additionalEmails: [],
  clientCount: "",
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

function parseScheduleDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : undefined;
}

function scheduleDateValue(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatSstPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  const localNumber = digits.slice(2);
  if (localNumber.length <= 4) return `(${digits.slice(0, 2)}) ${localNumber}`;
  if (localNumber.length <= 8) {
    return `(${digits.slice(0, 2)}) ${localNumber.slice(0, 4)}-${localNumber.slice(4)}`;
  }
  return `(${digits.slice(0, 2)}) ${localNumber.slice(0, 5)}-${localNumber.slice(5)}`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
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
  const [ecosystem, setEcosystem] = useState<Ecosystem | null>(null);
  const [sstValues, setSstValues] = useState<SstFormValues>(initialSstValues);
  const [sstStatus, setSstStatus] = useState<SstStatus>({ type: "idle" });
  const [sstDateOptions, setSstDateOptions] = useState<ScheduleOption[]>([]);
  const [sstTimeOptions, setSstTimeOptions] = useState<ScheduleOption[]>([]);
  const [loadingSstDates, setLoadingSstDates] = useState(false);
  const [loadingSstTimes, setLoadingSstTimes] = useState(false);
  const [sstScheduleMessage, setSstScheduleMessage] = useState("");
  const [sstCalendarOpen, setSstCalendarOpen] = useState(false);

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

  const loadSstDates = useCallback(async () => {
    setLoadingSstDates(true);
    setSstScheduleMessage("");
    try {
      const response = await fetch("/api/sst-availability", { cache: "no-store" });
      const result = (await response.json()) as {
        dates?: ScheduleOption[];
        message?: string;
      };
      if (!response.ok) {
        throw new Error(result.message || "Não foi possível carregar as datas disponíveis.");
      }
      setSstDateOptions(result.dates ?? []);
    } catch (error) {
      setSstDateOptions([]);
      setSstScheduleMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as datas disponíveis.",
      );
    } finally {
      setLoadingSstDates(false);
    }
  }, []);

  const loadSstTimes = useCallback(async (date: string) => {
    setSstTimeOptions([]);
    setSstScheduleMessage("");
    if (!date) return;
    setLoadingSstTimes(true);
    try {
      const response = await fetch(
        `/api/sst-availability?date=${encodeURIComponent(date)}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as {
        times?: ScheduleOption[];
        message?: string;
      };
      if (!response.ok) {
        throw new Error(result.message || "Não foi possível consultar as agendas.");
      }
      setSstTimeOptions(result.times ?? []);
      if (!result.times?.length) {
        setSstScheduleMessage("Não há horários disponíveis para esta data.");
      }
    } catch (error) {
      setSstTimeOptions([]);
      setSstScheduleMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível consultar as agendas.",
      );
    } finally {
      setLoadingSstTimes(false);
    }
  }, []);

  useEffect(() => {
    if (ecosystem === "sst") {
      void Promise.resolve().then(loadSstDates);
    }
  }, [ecosystem, loadSstDates]);

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

  function updateSstValues(patch: Partial<SstFormValues>) {
    setSstValues((current) => ({ ...current, ...patch }));
    setSstStatus({ type: "idle" });
  }

  function selectSstDate(option: ScheduleOption | null) {
    const date = option?.value ?? "";
    setSstValues((current) => ({ ...current, date, time: "" }));
    setSstStatus({ type: "idle" });
    void loadSstTimes(date);
  }

  function addAdditionalEmail() {
    if (sstValues.additionalEmails.length >= 10) return;
    updateSstValues({ additionalEmails: [...sstValues.additionalEmails, ""] });
  }

  function updateAdditionalEmail(index: number, value: string) {
    updateSstValues({
      additionalEmails: sstValues.additionalEmails.map((email, emailIndex) =>
        emailIndex === index ? value : email,
      ),
    });
  }

  function removeAdditionalEmail(index: number) {
    updateSstValues({
      additionalEmails: sstValues.additionalEmails.filter((_, emailIndex) => emailIndex !== index),
    });
  }

  async function handleSstSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const company = indicators.find((indicator) => indicator.id === sstValues.companyId);
    const phoneDigits = sstValues.phone.replace(/\D/g, "");
    const invalidAdditionalEmail = sstValues.additionalEmails.find(
      (email) => email.trim() && !isValidEmail(email),
    );
    const clientCount = Number(sstValues.clientCount);

    if (!consultant) {
      setSstStatus({ type: "error", message: "Acesse o formulário pelo link individual de um consultor ativo." });
      return;
    }
    if (!company || company.name.trim().length < 2) {
      setSstStatus({ type: "error", message: "Selecione uma empresa válida." });
      return;
    }
    if (sstValues.contactName.trim().length < 2) {
      setSstStatus({ type: "error", message: "Informe um contato com pelo menos 2 caracteres." });
      return;
    }
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      setSstStatus({ type: "error", message: "Informe um telefone com DDD e 10 ou 11 dígitos." });
      return;
    }
    if (!isValidEmail(sstValues.primaryEmail)) {
      setSstStatus({ type: "error", message: "Informe um e-mail principal válido." });
      return;
    }
    if (!sstValues.date || !sstValues.time) {
      setSstStatus({ type: "error", message: "Informe a data e o horário." });
      return;
    }
    if (invalidAdditionalEmail) {
      setSstStatus({ type: "error", message: `O e-mail adicional ${invalidAdditionalEmail} não é válido.` });
      return;
    }
    if (
      sstValues.clientCount.trim() &&
      (!Number.isInteger(clientCount) || clientCount <= 0)
    ) {
      setSstStatus({ type: "error", message: "A quantidade de clientes deve ser um número inteiro maior que zero." });
      return;
    }
    if (sstValues.observations.length > 5000) {
      setSstStatus({ type: "error", message: "A observação pode ter no máximo 5.000 caracteres." });
      return;
    }

    setSstStatus({ type: "submitting" });
    try {
      const response = await fetch("/api/sst-bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...sstValues,
          consultantReference,
        }),
      });
      const result = (await response.json()) as {
        message?: string;
        title?: string;
        reasons?: string[];
        taskId?: string;
        responsible?: string;
        eventLink?: string;
        meetLink?: string;
        summary?: {
          consultant: string;
          company: string;
          contact: string;
          phone: string;
          primaryEmail: string;
          date: string;
          time: string;
        };
      };
      if (!response.ok) {
        setSstStatus({
          type: "error",
          title: result.title,
          message: result.message || "Não foi possível concluir o agendamento.",
          reasons: result.reasons,
          taskId: result.taskId,
        });
        return;
      }
      if (!result.responsible || !result.meetLink || !result.summary) {
        throw new Error(result.message || "Não foi possível concluir o agendamento.");
      }
      setSstStatus({
        type: "success",
        message: result.message || "Reunião agendada com sucesso.",
        responsible: result.responsible,
        eventLink: result.eventLink,
        meetLink: result.meetLink,
        summary: result.summary,
      });
      setSstValues({ ...initialSstValues });
      setSstTimeOptions([]);
      setSstScheduleMessage("");
    } catch (error) {
      setSstStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Não foi possível concluir o agendamento.",
      });
      await loadSstTimes(sstValues.date);
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
  const selectedSstCompany =
    indicators.find((indicator) => indicator.id === sstValues.companyId) ?? null;
  const selectedSstDate =
    sstDateOptions.find((option) => option.value === sstValues.date) ?? null;
  const selectedSstTime =
    sstTimeOptions.find((option) => option.value === sstValues.time) ?? null;
  const sstPhoneDigits = sstValues.phone.replace(/\D/g, "");
  const validClientCount =
    !sstValues.clientCount.trim() ||
    (Number.isInteger(Number(sstValues.clientCount)) && Number(sstValues.clientCount) > 0);
  const canSubmitSst =
    sstStatus.type !== "submitting" &&
    !!consultant &&
    !!selectedSstCompany &&
    selectedSstCompany.name.trim().length >= 2 &&
    sstValues.contactName.trim().length >= 2 &&
    (sstPhoneDigits.length === 10 || sstPhoneDigits.length === 11) &&
    isValidEmail(sstValues.primaryEmail) &&
    !!selectedSstDate &&
    !!selectedSstTime &&
    sstValues.additionalEmails.length <= 10 &&
    sstValues.additionalEmails.every((email) => !email.trim() || isValidEmail(email)) &&
    validClientCount &&
    sstValues.observations.length <= 5000;

  function selectEcosystem(nextEcosystem: Ecosystem | null) {
    setEcosystem(nextEcosystem);
    setStatus({ type: "idle" });
    setCopiedDealId(null);
    setSstStatus({ type: "idle" });
  }

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

      <section className="relative mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:py-12">
        {ecosystem === null ? (
          <div className="overflow-hidden rounded-[1.75rem] border border-[#e5dce9] bg-white shadow-[0_28px_90px_rgba(63,30,78,0.12)]">
            <div className="border-b border-[#eee7f1] bg-[linear-gradient(135deg,#fbf9fc_0%,#f4edf7_100%)] px-5 py-7 text-center sm:px-8 sm:py-9">
              <span className="inline-flex items-center rounded-full border border-[#d8c8df] bg-white px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[#6a3b7e]">
                Etapa 1 de 2
              </span>
              <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#351940] sm:text-3xl">
                Qual ecossistema receberá a indicação?
              </h1>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#715f79] sm:text-base">
                Selecione uma opção para abrir o formulário com os campos e regras correspondentes.
              </p>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-3 sm:p-8">
              <button
                type="button"
                onClick={() => selectEcosystem("imersao")}
                className="group flex min-h-48 flex-col rounded-2xl border border-[#d9cddd] bg-white p-5 text-left transition hover:-translate-y-1 hover:border-[#74408c] hover:shadow-[0_16px_32px_rgba(82,35,112,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#622f7d] focus-visible:ring-offset-2"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-[#f0e8f4] text-[#622f7d] transition group-hover:bg-[#622f7d] group-hover:text-white">
                  <GraduationCap className="size-5" />
                </span>
                <span className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-[#8a7194]">Ecossistema</span>
                <span className="mt-1 text-xl font-bold text-[#351940]">IMERSÃO</span>
                <span className="mt-2 text-sm leading-5 text-[#715f79]">Indicações para a Imersão DNA Crescimento.</span>
                <span className="mt-auto pt-4 text-sm font-bold text-[#622f7d]">Selecionar</span>
              </button>

              <button
                type="button"
                onClick={() => selectEcosystem("sst")}
                className="group flex min-h-48 flex-col rounded-2xl border border-[#c7dfcf] bg-[#fbfefc] p-5 text-left transition hover:-translate-y-1 hover:border-[#25824b] hover:shadow-[0_16px_32px_rgba(23,111,55,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25824b] focus-visible:ring-offset-2"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-[#e4f6e9] text-[#176f37] transition group-hover:bg-[#176f37] group-hover:text-white">
                  <ShieldCheck className="size-5" />
                </span>
                <span className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-[#6d8775]">Ecossistema</span>
                <span className="mt-1 text-xl font-bold text-[#24452f]">SST</span>
                <span className="mt-2 text-sm leading-5 text-[#607568]">Indicações para soluções de Saúde e Segurança do Trabalho.</span>
                <span className="mt-auto pt-4 text-sm font-bold text-[#176f37]">Selecionar</span>
              </button>

              <div
                aria-disabled="true"
                className="flex min-h-48 flex-col rounded-2xl border border-dashed border-[#ddd5e0] bg-[#faf9fa] p-5 text-left opacity-75"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-[#eee9f0] text-[#917f98]">
                  <CircleEllipsis className="size-5" />
                </span>
                <span className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-[#998a9f]">Próximo ecossistema</span>
                <span className="mt-1 text-xl font-bold text-[#6f6473]">EM BREVE</span>
                <span className="mt-2 text-sm leading-5 text-[#8b808f]">A terceira opção será definida na próxima evolução.</span>
                <span className="mt-auto pt-4 text-xs font-bold uppercase tracking-[0.14em] text-[#998a9f]">Indisponível</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#dfd4e4] bg-white px-4 py-3 shadow-sm sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${ecosystem === "imersao" ? "bg-[#f0e8f4] text-[#622f7d]" : "bg-[#e4f6e9] text-[#176f37]"}`}>
                  {ecosystem === "imersao" ? <GraduationCap className="size-5" /> : <ShieldCheck className="size-5" />}
                </span>
                <div className="min-w-0">
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[#8a7194]">Ecossistema selecionado</p>
                  <p className="truncate font-bold text-[#351940]">{ecosystem === "imersao" ? "IMERSÃO" : "SST"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => selectEcosystem(null)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-[#622f7d] transition hover:bg-[#f4eef7]"
              >
                <ArrowLeft className="size-4" /> Alterar
              </button>
            </div>

            {ecosystem === "sst" ? (
              <div className="mx-auto max-w-2xl rounded-[1.75rem] border border-[#c7dfcf] bg-white p-5 shadow-[0_28px_90px_rgba(23,111,55,0.10)] sm:p-8">
                {sstStatus.type !== "success" && (
                  <div className="mb-6 border-b border-[#e3eee7] pb-5">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#568166]">Formulário SST</p>
                    <h1 className="mt-1 text-2xl font-bold text-[#24452f]">Nova indicação</h1>
                    <p className="mt-2 text-sm leading-6 text-[#607568]">
                      Preencha os dados da empresa e do contato. Os campos marcados são obrigatórios.
                    </p>
                  </div>
                )}

                {sstStatus.type === "success" && (
                  <div
                    className="flex min-h-[60vh] items-center rounded-2xl border border-[#b9e8c7] bg-[#effbf2] p-5 text-[#176f37] sm:p-8"
                    role="status"
                  >
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 size-6 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{sstStatus.message}</p>
                        <dl className="mt-4 grid gap-3 rounded-xl border border-[#ccebd5] bg-white/70 p-4 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-wide text-[#5b8067]">Consultor indicador</dt>
                            <dd className="mt-1 font-medium text-[#245a35]">
                              {sstStatus.summary.consultant.toLocaleUpperCase("pt-BR")}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-wide text-[#5b8067]">Empresa</dt>
                            <dd className="mt-1 font-medium text-[#245a35]">{sstStatus.summary.company}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-wide text-[#5b8067]">Contato</dt>
                            <dd className="mt-1 font-medium text-[#245a35]">{sstStatus.summary.contact}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-wide text-[#5b8067]">Telefone</dt>
                            <dd className="mt-1 font-medium text-[#245a35]">{formatPhone(sstStatus.summary.phone)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-wide text-[#5b8067]">E-mail</dt>
                            <dd className="mt-1 break-all font-medium text-[#245a35]">{sstStatus.summary.primaryEmail}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-wide text-[#5b8067]">Data e horário</dt>
                            <dd className="mt-1 font-medium text-[#245a35]">
                              {sstStatus.summary.date.split("-").reverse().join("/")} às {sstStatus.summary.time}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-wide text-[#5b8067]">Responsável pela reunião</dt>
                            <dd className="mt-1 font-medium text-[#245a35]">
                              {sstStatus.responsible.toLocaleUpperCase("pt-BR")}
                            </dd>
                          </div>
                        </dl>
                        <div className="mt-4 space-y-2 text-sm">
                          <p className="break-all">
                            <span className="font-semibold">Google Meet:</span>{" "}
                            <a className="underline underline-offset-2" href={sstStatus.meetLink} target="_blank" rel="noreferrer">
                              {sstStatus.meetLink}
                            </a>
                          </p>
                          {sstStatus.eventLink && (
                            <p className="break-all">
                              <span className="font-semibold">Google Agenda:</span>{" "}
                              <a className="underline underline-offset-2" href={sstStatus.eventLink} target="_blank" rel="noreferrer">
                                {sstStatus.eventLink}
                              </a>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {sstStatus.type !== "success" && (
                <form className="space-y-5" onSubmit={handleSstSubmit} noValidate>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="sst-consultant">Consultor responsável</Label>
                      {!loadingConsultants && consultantsMessage && (
                        <button
                          type="button"
                          onClick={() => void loadConsultant()}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#176f37] hover:underline"
                        >
                          <RefreshCw className="size-3" /> Tentar novamente
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <UserRound className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#698574]" />
                      <Input
                        id="sst-consultant"
                        readOnly
                        aria-readonly="true"
                        value={
                          loadingConsultants
                            ? "Carregando consultor..."
                            : consultant?.name.toLocaleUpperCase("pt-BR") ?? "Consultor não identificado"
                        }
                        className="h-12 cursor-default rounded-xl border-[#cfe0d4] bg-[#f1f7f3] pl-11 pr-4 text-base text-[#245a35]"
                      />
                    </div>
                    {consultantsMessage && (
                      <p className="flex items-start gap-1.5 text-xs leading-5 text-amber-700">
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0" /> {consultantsMessage}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="sst-company">Nome do Sócio</Label>
                      {!loadingIndicators && integrationMessage && (
                        <button
                          type="button"
                          onClick={() => void loadIndicators()}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#176f37] hover:underline"
                        >
                          <RefreshCw className="size-3" /> Tentar novamente
                        </button>
                      )}
                    </div>
                    <Combobox
                      items={indicators}
                      value={selectedSstCompany}
                      onValueChange={(company) => updateSstValues({ companyId: company?.id ?? "" })}
                      itemToStringLabel={(company) => company.name}
                      isItemEqualToValue={(company, value) => company.id === value.id}
                      disabled={loadingIndicators || !indicators.length}
                      autoHighlight
                    >
                      <ComboboxInput
                        id="sst-company"
                        required
                        showClear
                        placeholder={loadingIndicators ? "Carregando sócios..." : "Digite para buscar o sócio"}
                        className="h-12 w-full rounded-xl border-[#cfe0d4] bg-[#fbfefc] px-1 text-base"
                      />
                      <ComboboxContent className="rounded-xl border-[#d8eadf]">
                        <ComboboxEmpty>Nenhuma negociação em andamento encontrada.</ComboboxEmpty>
                        <ComboboxList>
                          {(company: Indicator) => (
                            <ComboboxItem key={company.id} value={company}>
                              <Building2 className="size-4 text-[#568166]" /> {company.name}
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

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="sst-contact-name">Nome do contato</Label>
                      <Input
                        id="sst-contact-name"
                        required
                        minLength={2}
                        maxLength={180}
                        autoComplete="name"
                        placeholder="Nome completo"
                        value={sstValues.contactName}
                        onChange={(event) => updateSstValues({ contactName: event.target.value })}
                        className="h-12 rounded-xl border-[#cfe0d4] bg-[#fbfefc] px-4 text-base"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sst-phone">Telefone</Label>
                      <div className="relative">
                        <Phone className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#698574]" />
                        <Input
                          id="sst-phone"
                          required
                          inputMode="numeric"
                          autoComplete="tel"
                          placeholder="(00) 00000-0000"
                          value={sstValues.phone}
                          onChange={(event) => updateSstValues({ phone: formatSstPhone(event.target.value) })}
                          className="h-12 rounded-xl border-[#cfe0d4] bg-[#fbfefc] pl-11 pr-4 text-base"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sst-primary-email">E-mail principal</Label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#698574]" />
                      <Input
                        id="sst-primary-email"
                        type="email"
                        required
                        maxLength={254}
                        autoComplete="email"
                        placeholder="contato@empresa.com.br"
                        value={sstValues.primaryEmail}
                        onChange={(event) => updateSstValues({ primaryEmail: event.target.value })}
                        className="h-12 rounded-xl border-[#cfe0d4] bg-[#fbfefc] pl-11 pr-4 text-base"
                      />
                    </div>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="sst-date" className="flex items-center gap-2">
                        <CalendarDays className="size-4 text-[#698574]" /> Data
                      </Label>
                      <Popover open={sstCalendarOpen} onOpenChange={setSstCalendarOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            id="sst-date"
                            type="button"
                            variant="outline"
                            disabled={loadingSstDates || !sstDateOptions.length}
                            className="h-12 w-full justify-start rounded-xl border-[#cfe0d4] bg-[#fbfefc] px-4 text-left text-base font-normal hover:bg-[#f4faf6]"
                          >
                            <CalendarDays className="size-4 text-[#568166]" />
                            {loadingSstDates
                              ? "Carregando datas..."
                              : selectedSstDate?.label ?? "Selecione uma data"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-auto rounded-2xl border-[#d8eadf] p-0">
                          <Calendar
                            mode="single"
                            locale={ptBR}
                            selected={parseScheduleDate(sstValues.date)}
                            startMonth={parseScheduleDate(sstDateOptions[0]?.value ?? "")}
                            endMonth={parseScheduleDate(sstDateOptions.at(-1)?.value ?? "")}
                            disabled={(date) => {
                              const day = date.getDay();
                              return (
                                day === 0 ||
                                day === 6 ||
                                !sstDateOptions.some(
                                  (option) => option.value === scheduleDateValue(date),
                                )
                              );
                            }}
                            onSelect={(date) => {
                              const option = date
                                ? sstDateOptions.find(
                                    (item) => item.value === scheduleDateValue(date),
                                  ) ?? null
                                : null;
                              selectSstDate(option);
                              if (option) setSstCalendarOpen(false);
                            }}
                            className="rounded-2xl bg-white"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sst-time" className="flex items-center gap-2">
                        <Clock3 className="size-4 text-[#698574]" /> Horário
                      </Label>
                      <Combobox
                        items={sstTimeOptions}
                        value={selectedSstTime}
                        onValueChange={(option) => updateSstValues({ time: option?.value ?? "" })}
                        itemToStringLabel={(option) => option.label}
                        isItemEqualToValue={(option, value) => option.value === value.value}
                        disabled={!sstValues.date || loadingSstTimes || !sstTimeOptions.length}
                        autoHighlight
                      >
                        <ComboboxInput
                          id="sst-time"
                          required
                          placeholder={
                            !sstValues.date
                              ? "Selecione a data"
                              : loadingSstTimes
                                ? "Consultando agendas..."
                                : sstTimeOptions.length
                                  ? "Selecione o horário"
                                  : "Nenhum horário disponível"
                          }
                          className="h-12 w-full rounded-xl border-[#cfe0d4] bg-[#fbfefc] px-1 text-base"
                        />
                        <ComboboxContent className="rounded-xl border-[#d8eadf]">
                          <ComboboxEmpty>Nenhum horário disponível.</ComboboxEmpty>
                          <ComboboxList>
                            {(option: ScheduleOption) => (
                              <ComboboxItem key={option.value} value={option}>
                                <Clock3 className="size-4 text-[#568166]" /> {option.label}
                              </ComboboxItem>
                            )}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#d8eadf] bg-[#f8fcf9] px-4 py-3 text-xs leading-5 text-[#607568]">
                    <p className="font-semibold text-[#365c42]">Agenda CLOSER SST em tempo real</p>
                    <p>Segunda a sexta, das 08:30 às 17:30, intervalos de 30 minutos e antecedência mínima de 15 minutos.</p>
                    {sstScheduleMessage && (
                      <p className="mt-1 flex items-start gap-1.5 font-medium text-amber-700">
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0" /> {sstScheduleMessage}
                      </p>
                    )}
                  </div>

                  <div className="space-y-3 rounded-2xl border border-[#d8eadf] bg-[#f8fcf9] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Label>E-mails adicionais</Label>
                        <p className="mt-1 text-xs leading-5 text-[#607568]">Opcional · até 10 endereços</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={sstValues.additionalEmails.length >= 10}
                        onClick={addAdditionalEmail}
                        className="shrink-0 rounded-lg border-[#a9d2b7] text-[#176f37] hover:bg-[#eef8f1] hover:text-[#125b2d]"
                      >
                        <Plus className="size-4" /> Adicionar
                      </Button>
                    </div>

                    {sstValues.additionalEmails.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-[#cfe0d4] bg-white px-4 py-3 text-sm text-[#718078]">
                        Nenhum e-mail adicional informado.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {sstValues.additionalEmails.map((email, index) => (
                          <div key={`additional-email-${index}`} className="flex items-center gap-2">
                            <div className="relative min-w-0 flex-1">
                              <Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#698574]" />
                              <Input
                                type="email"
                                maxLength={254}
                                aria-label={`E-mail adicional ${index + 1}`}
                                placeholder={`E-mail adicional ${index + 1}`}
                                value={email}
                                onChange={(event) => updateAdditionalEmail(index, event.target.value)}
                                className="h-11 rounded-xl border-[#cfe0d4] bg-white pl-10 pr-4"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeAdditionalEmail(index)}
                              className="grid size-10 shrink-0 place-items-center rounded-xl text-[#8a646b] transition hover:bg-[#fff0f2] hover:text-[#b42335]"
                              aria-label={`Remover e-mail adicional ${index + 1}`}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sst-client-count">Quantidade de clientes <span className="font-normal text-[#7b8b81]">(opcional)</span></Label>
                    <div className="relative">
                      <Users className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#698574]" />
                      <Input
                        id="sst-client-count"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
                        placeholder="Ex.: 25"
                        value={sstValues.clientCount}
                        onChange={(event) => updateSstValues({ clientCount: event.target.value })}
                        className="h-12 rounded-xl border-[#cfe0d4] bg-[#fbfefc] pl-11 pr-4 text-base"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="sst-observations">Observação <span className="font-normal text-[#7b8b81]">(opcional)</span></Label>
                      <span className="text-xs tabular-nums text-[#7b8b81]">{sstValues.observations.length}/5.000</span>
                    </div>
                    <Textarea
                      id="sst-observations"
                      maxLength={5000}
                      placeholder="Inclua informações importantes para o atendimento"
                      value={sstValues.observations}
                      onChange={(event) => updateSstValues({ observations: event.target.value })}
                      className="min-h-28 resize-y rounded-xl border-[#cfe0d4] bg-[#fbfefc] px-4 py-3 text-base"
                    />
                  </div>

                  {sstStatus.type === "error" && (
                    <div
                      className="flex items-start gap-3 rounded-2xl border border-[#efc3ca] bg-[#fff4f5] p-4 text-sm font-medium text-[#a6293c]"
                      role="alert"
                    >
                      <AlertCircle className="mt-0.5 size-5 shrink-0" />
                      <div className="space-y-2">
                        {sstStatus.title && <p className="font-bold">{sstStatus.title}</p>}
                        <p>{sstStatus.message}</p>
                        {sstStatus.reasons?.map((reason) => (
                          <p key={reason}>{reason}</p>
                        ))}
                        {sstStatus.taskId && (
                          <p className="text-xs font-normal">ID da tarefa no RD: {sstStatus.taskId}</p>
                        )}
                      </div>
                    </div>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    disabled={!canSubmitSst}
                    className="h-13 w-full rounded-xl bg-[#176f37] text-base font-bold shadow-[0_12px_28px_rgba(23,111,55,0.22)] hover:bg-[#125b2d]"
                  >
                    {sstStatus.type === "submitting" ? (
                      <>
                        <Loader2 className="size-5 animate-spin" /> Agendando reunião...
                      </>
                    ) : (
                      <>
                        <CalendarDays className="size-5" /> Enviar e agendar reunião
                      </>
                    )}
                  </Button>
                  <p className="text-center text-xs leading-5 text-[#718078]">
                    O horário é confirmado novamente no envio. O convite será enviado pelo Google Agenda.
                  </p>
                </form>
                )}
              </div>
            ) : (
              <div className="mx-auto max-w-2xl rounded-[1.75rem] border border-[#e5dce9] bg-white p-5 shadow-[0_28px_90px_rgba(63,30,78,0.12)] sm:p-8">
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
            )}
          </div>
        )}
      </section>
    </main>
  );
}
