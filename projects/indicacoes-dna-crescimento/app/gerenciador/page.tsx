"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Loader2,
  LockKeyhole,
  LogIn,
  LogOut,
  Megaphone,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TeamMember = {
  id: number;
  name: string;
  email: string;
  active: boolean;
  type: "Time RD";
  linkReference: string;
};
type CustomConsultant = {
  id: number;
  name: string;
  active: boolean;
  type: "Cadastrado";
  linkReference: string;
};
type Campaign = { id: string; name: string };
type ManagerUser = { login: string };
type ConsultantsResponse = {
  teamMembers?: TeamMember[];
  customConsultants?: CustomConsultant[];
  message?: string;
};
type CampaignsResponse = {
  prefix?: string;
  campaigns?: Campaign[];
  activeCampaignId?: string | null;
  campaign?: Campaign;
  message?: string;
};

async function readResponse(response: Response, fallbackMessage: string) {
  const result = (await response.json()) as ConsultantsResponse & CampaignsResponse & {
    consultant?: CustomConsultant;
    removed?: boolean;
  };
  if (!response.ok) throw new Error(result.message || fallbackMessage);
  return result;
}

const DEFAULT_CAMPAIGN_PREFIX = "Indicações Sócios - ";

export default function ManagerPage() {
  const [authState, setAuthState] = useState<"checking" | "anonymous" | "authenticated">("checking");
  const [authUser, setAuthUser] = useState<ManagerUser | null>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [customConsultants, setCustomConsultants] = useState<CustomConsultant[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [copiedConsultantId, setCopiedConsultantId] = useState<number | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignPrefix, setCampaignPrefix] = useState(DEFAULT_CAMPAIGN_PREFIX);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [campaignSuffix, setCampaignSuffix] = useState("");
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [selectingCampaignId, setSelectingCampaignId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadConsultants = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/consultants", { cache: "no-store" });
      const result = await readResponse(response, "Não foi possível carregar os consultores.");
      setTeamMembers(result.teamMembers ?? []);
      setCustomConsultants(result.customConsultants ?? []);
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Não foi possível carregar os consultores.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    try {
      const response = await fetch("/api/campaigns", { cache: "no-store" });
      const result = await readResponse(response, "Não foi possível carregar as campanhas.");
      setCampaignPrefix(result.prefix ?? DEFAULT_CAMPAIGN_PREFIX);
      setCampaigns(result.campaigns ?? []);
      setActiveCampaignId(result.activeCampaignId ?? null);
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Não foi possível carregar as campanhas.",
      });
    } finally {
      setLoadingCampaigns(false);
    }
  }, []);

  useEffect(() => {
    void fetch("/api/manager-auth", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as { user?: ManagerUser };
        if (!response.ok || !result.user) throw new Error("Sessão não encontrada.");
        setAuthUser(result.user);
        setAuthState("authenticated");
      })
      .catch(() => setAuthState("anonymous"));
  }, []);

  useEffect(() => {
    if (authState !== "authenticated") return;
    void Promise.resolve().then(() => Promise.all([loadConsultants(), loadCampaigns()]));
  }, [authState, loadCampaigns, loadConsultants]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthMessage("");
    try {
      const response = await fetch("/api/manager-auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const result = (await response.json()) as { user?: ManagerUser; message?: string };
      if (!response.ok || !result.user) throw new Error(result.message || "Login ou senha inválidos.");
      setPassword("");
      setAuthUser(result.user);
      setAuthState("authenticated");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Não foi possível realizar o login.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function signOut() {
    await fetch("/api/manager-auth", { method: "DELETE" }).catch(() => undefined);
    setAuthUser(null);
    setAuthState("anonymous");
    setTeamMembers([]);
    setCustomConsultants([]);
    setCampaigns([]);
  }

  async function addConsultant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 2) return;
    setSaving(true);
    setMessage(null);
    try {
      await readResponse(
        await fetch("/api/consultants", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        }),
        "Não foi possível adicionar o consultor.",
      );
      setName("");
      await loadConsultants();
      setMessage({ type: "success", text: "Consultor criado com link individual." });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Não foi possível adicionar o consultor.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeConsultant(consultant: CustomConsultant) {
    if (!window.confirm(`Desativar ${consultant.name} e invalidar seu link?`)) return;
    setRemovingId(consultant.id);
    setMessage(null);
    try {
      await readResponse(
        await fetch("/api/consultants", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: consultant.id }),
        }),
        "Não foi possível remover o consultor.",
      );
      setCustomConsultants((current) => current.filter((item) => item.id !== consultant.id));
      setMessage({ type: "success", text: `${consultant.name} foi desativado.` });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Não foi possível remover o consultor.",
      });
    } finally {
      setRemovingId(null);
    }
  }

  async function copyConsultantLink(id: number, link: string) {
    await navigator.clipboard.writeText(link);
    setCopiedConsultantId(id);
  }

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (campaignSuffix.trim().length < 2) return;
    setSavingCampaign(true);
    setMessage(null);
    try {
      const result = await readResponse(
        await fetch("/api/campaigns", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ suffix: campaignSuffix }),
        }),
        "Não foi possível criar a campanha.",
      );
      setCampaignSuffix("");
      await loadCampaigns();
      setMessage({
        type: "success",
        text: `${result.campaign?.name ?? "A nova campanha"} foi criada e definida como ativa.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Não foi possível criar a campanha.",
      });
    } finally {
      setSavingCampaign(false);
    }
  }

  async function selectCampaign(campaign: Campaign) {
    if (campaign.id === activeCampaignId) return;
    setSelectingCampaignId(campaign.id);
    setMessage(null);
    try {
      await readResponse(
        await fetch("/api/campaigns", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ campaignId: campaign.id }),
        }),
        "Não foi possível selecionar a campanha.",
      );
      setActiveCampaignId(campaign.id);
      setMessage({ type: "success", text: `${campaign.name} agora é a campanha ativa.` });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Não foi possível selecionar a campanha.",
      });
    } finally {
      setSelectingCampaignId(null);
    }
  }

  if (authState === "checking") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f5f8] text-[#622f7d]">
        <div className="flex items-center gap-3 text-sm font-semibold">
          <Loader2 className="size-5 animate-spin" /> Verificando acesso...
        </div>
      </main>
    );
  }

  if (authState === "anonymous") {
    return (
      <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#f7f5f8] px-5 py-10 text-[#26152f]">
        <div className="brand-grid" aria-hidden="true" />
        <section className="relative w-full max-w-md rounded-[1.75rem] border border-[#e5dce9] bg-white p-6 shadow-[0_24px_80px_rgba(63,30,78,0.14)] sm:p-8">
          <div className="grid size-12 place-items-center rounded-2xl bg-[#522370] text-white shadow-lg shadow-[#522370]/20">
            <LockKeyhole className="size-5" />
          </div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-[#8b7198]">Acesso restrito</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em] text-[#3b164f]">Gerenciador de indicações</h1>
          <p className="mt-3 text-sm leading-6 text-[#806d89]">
            Entre com seu usuário e senha para gerenciar consultores e campanhas.
          </p>

          <form className="mt-7 space-y-4" onSubmit={signIn}>
            <div>
              <Label htmlFor="manager-login">Login</Label>
              <Input
                id="manager-login"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                autoComplete="username"
                required
                className="mt-2 h-12 rounded-xl border-[#d9cddd] bg-[#fcfbfd] px-4"
              />
            </div>
            <div>
              <Label htmlFor="manager-password">Senha</Label>
              <Input
                id="manager-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                className="mt-2 h-12 rounded-xl border-[#d9cddd] bg-[#fcfbfd] px-4"
              />
            </div>
            {authMessage && (
              <div className="flex items-start gap-2 rounded-xl border border-[#f0bcc3] bg-[#fff2f3] px-3 py-3 text-sm text-[#9f2232]" role="alert">
                <AlertCircle className="mt-0.5 size-4 shrink-0" /> {authMessage}
              </div>
            )}
            <Button
              type="submit"
              disabled={authLoading || !login.trim() || !password}
              className="h-12 w-full rounded-xl bg-[#622f7d] font-bold hover:bg-[#512569]"
            >
              {authLoading ? <Loader2 className="animate-spin" /> : <LogIn />}
              Entrar no gerenciador
            </Button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f5f8] text-[#26152f]">
      <div className="brand-grid" aria-hidden="true" />
      <header className="relative border-b border-white/10 bg-[#522370] text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-white/12 ring-1 ring-white/20">
              <UsersRound className="size-5 text-[#34d366]" />
            </span>
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-white/60">Configurações</p>
              <p className="text-sm font-semibold sm:text-base">Gerenciador de indicações</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-white/60 lg:inline">{authUser?.login}</span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/10 px-3 text-sm font-semibold text-white/90 ring-1 ring-white/15 transition hover:bg-white/20"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
            <Link
              href="/"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/10 px-3 text-sm font-semibold text-white/90 ring-1 ring-white/15 transition hover:bg-white/20"
            >
              <ArrowLeft className="size-4" />
              <span className="hidden sm:inline">Voltar ao formulário</span>
            </Link>
          </div>
        </div>
      </header>

      <section className="relative mx-auto max-w-5xl px-5 py-10 sm:px-8 lg:py-14">
        <div className="mb-8 max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#ede5f2] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-[#622f7d]">
            Consultores e campanhas
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-[-0.03em] text-[#3b164f] sm:text-4xl">
            Gerencie os links dos consultores.
          </h1>
          <p className="mt-3 text-base leading-7 text-[#715d7c]">
            Cada consultor recebe um link individual. O formulário identifica e bloqueia automaticamente o responsável a partir do link acessado.
          </p>
        </div>

        {message && (
          <div
            className={`mb-6 flex items-start gap-3 rounded-2xl border p-4 text-sm ${
              message.type === "success"
                ? "border-[#b9e8c7] bg-[#effbf2] text-[#176f37]"
                : "border-[#f0bcc3] bg-[#fff2f3] text-[#9f2232]"
            }`}
            role={message.type === "error" ? "alert" : "status"}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 size-5 shrink-0" />
            )}
            <span className="font-medium">{message.text}</span>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-[1.5rem] border border-[#e5dce9] bg-white p-5 shadow-[0_20px_60px_rgba(63,30,78,0.08)] sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8b7198]">Sincronização automática</p>
                <h2 className="mt-1.5 text-xl font-bold text-[#3b164f]">Equipe Vendedor Imersão</h2>
              </div>
              <span className="grid size-10 place-items-center rounded-xl bg-[#ecf9f0] text-[#159848]">
                <ShieldCheck className="size-5" />
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#806d89]">
              Os usuários desta equipe ficam salvos no banco como Time RD e recebem suas negociações diretamente.
            </p>

            <div className="mt-5 space-y-3">
              {loading ? (
                <div className="flex items-center gap-2 py-5 text-sm text-[#806d89]">
                  <Loader2 className="size-4 animate-spin" /> Carregando equipe...
                </div>
              ) : (
                teamMembers.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 rounded-2xl border border-[#ece5ef] bg-[#fcfbfd] p-3.5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f0e8f4] text-[#622f7d]">
                      <UserRound className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[#3b164f]">
                        {member.name.toLocaleUpperCase("pt-BR")}
                      </p>
                      <p className="truncate text-xs text-[#927f9b]">{member.email}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate text-[0.68rem] text-[#806d89]">
                          {member.linkReference}
                        </code>
                        <button
                          type="button"
                          onClick={() => void copyConsultantLink(member.id, member.linkReference)}
                          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-[#f0e8f4] px-2 text-[0.68rem] font-semibold text-[#622f7d]"
                          aria-label={`Copiar link de ${member.name}`}
                        >
                          {copiedConsultantId === member.id ? <CheckCircle2 className="size-3" /> : <Copy className="size-3" />}
                          {copiedConsultantId === member.id ? "Copiado" : "Copiar"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-[#e5dce9] bg-white p-5 shadow-[0_20px_60px_rgba(63,30,78,0.08)] sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8b7198]">Opções adicionais</p>
                <h2 className="mt-1.5 text-xl font-bold text-[#3b164f]">Consultores cadastrados</h2>
              </div>
              <button
                type="button"
                onClick={() => void loadConsultants()}
                disabled={loading}
                className="grid size-10 place-items-center rounded-xl bg-[#f0e8f4] text-[#622f7d] transition hover:bg-[#e7dced] disabled:opacity-50"
                aria-label="Atualizar consultores"
              >
                <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#806d89]">
              Os consultores cadastrados recebem um link próprio; suas negociações são distribuídas aleatoriamente entre a equipe.
            </p>

            <form className="mt-5" onSubmit={addConsultant}>
              <Label htmlFor="consultant-name">Novo consultor</Label>
              <div className="mt-2 flex gap-2">
                <Input
                  id="consultant-name"
                  value={name}
                  onChange={(event) => setName(event.target.value.toLocaleUpperCase("pt-BR"))}
                  autoCapitalize="characters"
                  minLength={2}
                  maxLength={100}
                  required
                  placeholder="Digite o nome"
                  className="h-11 rounded-xl border-[#d9cddd] bg-[#fcfbfd] px-4 text-base"
                />
                <Button
                  type="submit"
                  disabled={saving || name.trim().length < 2}
                  className="h-11 rounded-xl bg-[#622f7d] px-4 font-bold hover:bg-[#512569]"
                >
                  {saving ? <Loader2 className="animate-spin" /> : <Plus />}
                  <span className="hidden sm:inline">Adicionar</span>
                </Button>
              </div>
            </form>

            <div className="mt-5 space-y-2">
              {!loading && !customConsultants.length && (
                <p className="rounded-2xl border border-dashed border-[#d9cddd] px-4 py-6 text-center text-sm text-[#806d89]">
                  Nenhuma opção adicional cadastrada.
                </p>
              )}
              {customConsultants.map((consultant) => (
                <div key={consultant.id} className="rounded-2xl border border-[#ece5ef] bg-[#fcfbfd] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-[#3b164f]">
                      {consultant.name.toLocaleUpperCase("pt-BR")}
                    </span>
                    <button
                      type="button"
                      onClick={() => void removeConsultant(consultant)}
                      disabled={removingId === consultant.id}
                      className="grid size-9 shrink-0 place-items-center rounded-lg text-[#ad3544] transition hover:bg-[#fff0f2] disabled:opacity-50"
                      aria-label={`Desativar ${consultant.name}`}
                    >
                      {removingId === consultant.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate text-[0.68rem] text-[#806d89]">
                      {consultant.linkReference}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copyConsultantLink(consultant.id, consultant.linkReference)}
                      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-[#f0e8f4] px-2 text-[0.68rem] font-semibold text-[#622f7d]"
                      aria-label={`Copiar link de ${consultant.name}`}
                    >
                      {copiedConsultantId === consultant.id ? <CheckCircle2 className="size-3" /> : <Copy className="size-3" />}
                      {copiedConsultantId === consultant.id ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-[1.5rem] border border-[#e5dce9] bg-white p-5 shadow-[0_20px_60px_rgba(63,30,78,0.08)] sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8b7198]">Controle no RD Station</p>
              <h2 className="mt-1.5 text-xl font-bold text-[#3b164f]">Campanhas de indicação</h2>
              <p className="mt-3 text-sm leading-6 text-[#806d89]">
                Exibimos somente campanhas iniciadas por <strong className="text-[#622f7d]">{campaignPrefix}</strong>.
                A campanha ativa será vinculada automaticamente a cada nova negociação.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start">
              <span className="grid size-10 place-items-center rounded-xl bg-[#ecf9f0] text-[#159848]">
                <Megaphone className="size-5" />
              </span>
              <button
                type="button"
                onClick={() => void loadCampaigns()}
                disabled={loadingCampaigns}
                className="grid size-10 place-items-center rounded-xl bg-[#f0e8f4] text-[#622f7d] transition hover:bg-[#e7dced] disabled:opacity-50"
                aria-label="Atualizar campanhas"
              >
                <RefreshCw className={`size-4 ${loadingCampaigns ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          <form className="mt-6" onSubmit={createCampaign}>
            <Label htmlFor="campaign-suffix">Criar nova campanha</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="flex min-w-0 items-stretch overflow-hidden rounded-xl border border-[#d9cddd] bg-[#fcfbfd] focus-within:border-[#8a55a5] focus-within:ring-2 focus-within:ring-[#e7dced]">
                <span className="flex shrink-0 items-center border-r border-[#d9cddd] bg-[#f0e8f4] px-3 text-xs font-bold text-[#622f7d] sm:px-4 sm:text-sm">
                  {campaignPrefix}
                </span>
                <Input
                  id="campaign-suffix"
                  value={campaignSuffix}
                  onChange={(event) => setCampaignSuffix(event.target.value)}
                  minLength={2}
                  maxLength={150}
                  required
                  placeholder="Nome da campanha"
                  className="h-11 min-w-0 rounded-none border-0 bg-transparent px-3 text-base shadow-none focus-visible:ring-0"
                />
              </div>
              <Button
                type="submit"
                disabled={savingCampaign || campaignSuffix.trim().length < 2}
                className="h-11 rounded-xl bg-[#622f7d] px-5 font-bold hover:bg-[#512569]"
              >
                {savingCampaign ? <Loader2 className="animate-spin" /> : <Plus />}
                Criar campanha
              </Button>
            </div>
            <p className="mt-2 text-xs text-[#927f9b]">Você preenche apenas o texto depois do prefixo fixo.</p>
          </form>

          {!loadingCampaigns && !activeCampaignId && campaigns.length > 0 && (
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#f1d49a] bg-[#fff9eb] p-4 text-sm text-[#80570a]" role="status">
              <AlertCircle className="mt-0.5 size-5 shrink-0" />
              <span className="font-medium">Selecione uma campanha ativa antes de enviar novas indicações pelo formulário.</span>
            </div>
          )}

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {loadingCampaigns ? (
              <div className="flex items-center gap-2 py-5 text-sm text-[#806d89]">
                <Loader2 className="size-4 animate-spin" /> Carregando campanhas...
              </div>
            ) : campaigns.length ? (
              campaigns.map((campaign) => {
                const active = campaign.id === activeCampaignId;
                const selecting = campaign.id === selectingCampaignId;
                return (
                  <div
                    key={campaign.id}
                    className={`flex flex-col justify-between gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center ${
                      active ? "border-[#9ddbb0] bg-[#f1fbf4]" : "border-[#ece5ef] bg-[#fcfbfd]"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-bold text-[#3b164f]">{campaign.name}</p>
                      <p className="mt-1 font-mono text-[0.68rem] text-[#a08da9]">{campaign.id}</p>
                    </div>
                    {active ? (
                      <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-[#dff5e5] px-3 py-1.5 text-xs font-bold text-[#15783a] sm:self-auto">
                        <CheckCircle2 className="size-3.5" /> Ativa
                      </span>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={selectingCampaignId !== null}
                        onClick={() => void selectCampaign(campaign)}
                        className="h-9 shrink-0 self-start rounded-xl border-[#cfbfd6] text-[#622f7d] hover:bg-[#f0e8f4] sm:self-auto"
                      >
                        {selecting ? <Loader2 className="animate-spin" /> : <Megaphone />}
                        Usar campanha
                      </Button>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="rounded-2xl border border-dashed border-[#d9cddd] px-4 py-6 text-center text-sm text-[#806d89] md:col-span-2">
                Nenhuma campanha com esse prefixo foi encontrada. Crie a primeira acima.
              </p>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
