import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(caminho = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${caminho}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${caminho}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renderiza a orientacao para um link incompleto", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Link de indica[^<]+Programa de Indica[^<]*<\/title>/i);
  assert.match(html, /Link de indica[^<]+incompleto/i);
  assert.match(html, /indicacoes\.exemplo\.com/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("renderiza o formulario personalizado do parceiro", async () => {
  const response = await render("/22_D=Allan/ALLAN");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Programa de Indica/i);
  assert.match(html, /Allan/);
  assert.match(html, /ALLAN/);
  assert.match(html, /Contato principal/);
  assert.match(html, /Nome do contato/);
  assert.match(html, /Nome completo da PESSOA que será efetuado o contato/);
  assert.match(html, /Empresas indicadas/);
  assert.match(html, /Nome da empresa/);
  assert.match(html, /Adicionar empresa do mesmo grupo/);
  assert.match(html, /Observação geral/);
  assert.match(html, /registrada em todas as negociações criadas/);
  assert.match(html, /mesmo respons[^<]+vel/i);
  assert.ok(
    html.indexOf("Nome do contato") < html.indexOf("Nome da empresa"),
    "O contato principal deve aparecer antes das empresas.",
  );
  assert.match(html, /Tipo de documento/);
  assert.match(html, /CNPJ(?:<!-- -->)? da empresa/);
  assert.match(html, /<option value="CNPJ" selected="">CNPJ<\/option>/);
  assert.match(html, /<option value="CAEPF">CAEPF<\/option>/);
  assert.match(html, /<option value="CPF">CPF<\/option>/);
  assert.match(html, /\(31\) 3333-4444 ou \(31\) 99999-9999/);
});

test("renderiza o formulario B2C pela rota oficial", async () => {
  const response = await render(
    "/B2C/110126_Q=Allan/ALLAN/A/Expansao/12345678000199",
  );
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Programa de Indica/i);
  assert.match(html, /<title>Programa de Indica[^<]+B2C[^<]*<\/title>/i);
  assert.match(html, /110126/);
  assert.match(html, /Allan/);
  assert.match(html, /ALLAN/);
  assert.match(html, /Tipo de documento/);
  assert.match(html, /Contato principal/);
  assert.match(html, /Adicionar empresa do mesmo grupo/);
  assert.match(html, /Observação geral/);
});

test("renderiza o formulario de indicacao com agendamento", async () => {
  const response = await render(
    "/B2B/110126_Q=Allan/ALLAN/A/Expans%C3%A3o/12345678000199",
  );
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Indica[^<]+e Agendamento/i);
  assert.match(html, /<title>Indica[^<]+e agendamento B2B[^<]+Programa de Indica[^<]*<\/title>/i);
  assert.match(html, /110126/);
  assert.match(html, /Opera[^<]+o Q/);
  assert.match(html, /Curva/);
  assert.match(html, /value="A"/);
  assert.match(html, /Setor/);
  assert.match(html, /Expans[^<]+o/);
  assert.match(html, /CPF\/CNPJ do parceiro/);
  assert.match(html, /12\.345\.678\/0001-99/);
  assert.match(html, /Nome da empresa <b>\*<\/b>/i);
  assert.match(html, /name="nome_empresa"/i);
  assert.doesNotMatch(html, /<span>Nome do parceiro<\/span>/i);
  assert.match(html, /E-mail do contato <b>\*<\/b>/i);
  assert.match(html, /Adicionar outro e-mail/i);
  assert.match(html, /somente pelo Google Agenda/i);
  assert.match(html, /Data da reuni[^<]+/i);
  assert.match(html, /Hor[^<]+rio da reuni[^<]+/i);
  assert.match(html, /Selecione primeiro a data/i);
  assert.doesNotMatch(html, /<option value="08:00">08:00<\/option>/);
  assert.doesNotMatch(html, /<option value="08:15">/);
  assert.doesNotMatch(html, /<option value="07:00">/);
  assert.doesNotMatch(html, /<option value="19:00">/);
  assert.match(html, /30 em 30 minutos/i);
  assert.match(html, /anteced[^<]+ncia m[^<]+nima de 15 minutos/i);
  assert.doesNotMatch(html, /Respons[^<]+vel pela reuni[^<]+/i);
  assert.match(html, /Quantidade de clientes/i);
  assert.match(html, /Dados do parceiro/i);
  assert.doesNotMatch(html, /Nome do cliente/i);
  assert.doesNotMatch(html, /O nome da empresa e da negocia[^<]+/i);
  assert.doesNotMatch(html, /A empresa parceira ser[^<]+localizada no RD/i);
  assert.doesNotMatch(html, /Assunto da reuni[^<]+/i);
  assert.doesNotMatch(html, /Reuni[^<]+o de apresenta[^<]+/i);
  assert.match(html, /Enviar e agendar reuni[^<]+/i);
});

test("formata CPF recebido sem mascara no link B2B", async () => {
  const response = await render(
    "/B2B/110126_Q=Allan/ALLAN/A/Expans%C3%A3o/12345678900",
  );
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /123\.456\.789-00/);
});

test("restaura a barra no nome do parceiro recebido com cifrao", async () => {
  for (const fluxo of ["B2B", "B2C"]) {
    const response = await render(
      `/${fluxo}/110126_Q=Alpha%20Contabilidade%20S$S/ALLAN/A/Expansao/12345678000199`,
    );
    assert.equal(response.status, 200);

    const html = await response.text();
    assert.match(html, /Alpha Contabilidade S\/S/);
    assert.doesNotMatch(html, /value="Alpha Contabilidade S\$S"/);
  }
});

test("preserva sinal de mais no nome do parceiro", async () => {
  const response = await render(
    "/B2B/26_D=G+%20CONTABILIDADE%20LTDA/MARIA%20EDUARDA%20VIEGAS%20MAFALDO%20TELES/C/Direta/15128121000190",
  );
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /G\+ CONTABILIDADE LTDA/);
  assert.doesNotMatch(html, /value="G  CONTABILIDADE LTDA"/);
});

test("restaura sinal de mais recebido como til para compatibilidade com IIS", async () => {
  for (const fluxo of ["B2B", "B2C"]) {
    const response = await render(
      `/${fluxo}/26_D=G~%20CONTABILIDADE%20LTDA/MARIA%20EDUARDA%20VIEGAS%20MAFALDO%20TELES/C/Direta/15128121000190`,
    );
    assert.equal(response.status, 200);

    const html = await response.text();
    assert.match(html, /G\+ CONTABILIDADE LTDA/);
    assert.doesNotMatch(html, /value="G~ CONTABILIDADE LTDA"/);
  }
});

test("mantem a configuracao do dominio oficial e do inicio de producao", async () => {
  const [
    layout,
    packageJson,
    inicioProducao,
    formularioAgendamento,
    apiIndicacoes,
    apiAgendamentos,
    clienteRd,
    historicoIndicacoes,
    migracaoAgendamento,
    googleCalendar,
    ambienteProducao,
    carregadorGoogle,
    viteConfig,
  ] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/iniciar-producao.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/formulario-agendamento.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/indicacoes/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agendamentos/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/rd-station-v2.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/indicacoes-sst.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../database/004_adicionar_agendamento_b2b_indicacoes_sst.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../lib/google-calendar.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.production.example", import.meta.url), "utf8"),
    readFile(
      new URL("../scripts/carregar-credencial-google.mjs", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /NEXT_PUBLIC_SITE_URL/);
  assert.match(layout, /\/favicon\.svg/);
  assert.match(packageJson, /"start":\s*"node scripts\/iniciar-producao\.mjs"/);
  assert.match(inicioProducao, /\.env\.production/);
  assert.match(inicioProducao, /RD_CRM_V1_TOKEN/);
  assert.match(formularioAgendamento, /min=\{dataMinima\}/);
  assert.match(apiAgendamentos, /RD_CAMPANHA_AGENDAMENTO/);
  assert.match(apiAgendamentos, /RD_ETAPA_AGENDAMENTO/);
  assert.match(apiIndicacoes, /RD_ETAPA_INDICACAO/);
  assert.match(
    googleCalendar,
    /Array\.from\(\{ length: 21 \}, \(_, indice\) => \{[\s\S]*?indice \* 30/,
  );
  assert.match(
    googleCalendar,
    /ANTECEDENCIA_MINIMA_MINUTOS\s*=\s*15/,
  );
  assert.match(
    apiAgendamentos,
    /pelo menos 15 minutos de antecedência/,
  );
  assert.match(googleCalendar, /conferenceDataVersion=1/);
  assert.match(googleCalendar, /type:\s*"hangoutsMeet"/);
  assert.match(apiAgendamentos, /idEtapa:\s*ID_ETAPA_NOVO_LEAD/);
  assert.match(apiAgendamentos, /RD_CAMPO_PRE_VENDEDOR_B2B/);
  assert.match(apiAgendamentos, /RD_OPCAO_PRE_VENDEDOR_B2B/);
  assert.match(
    apiAgendamentos,
    /camposParaAtualizar\[slugConsultor\]\s*=\s*opcaoConsultor\.valorOpcao/,
  );
  assert.match(clienteRd, /stage_id:\s*dados\.idEtapa/);
  assert.match(
    apiAgendamentos,
    /EMPRESA_NAO_LOCALIZADA_POR_ID_E_CRIACAO_RECUSADA/,
  );
  assert.match(
    apiAgendamentos,
    /Já existe uma empresa com esse nome cadastrada no RD Station CRM/,
  );
  assert.match(
    apiAgendamentos,
    /Já existe uma empresa com esse documento cadastrada no RD Station CRM/,
  );
  assert.match(formularioAgendamento, /motivosErro\.map/);
  assert.match(apiAgendamentos, /identificarMotivosConflitoEmpresa/);
  assert.doesNotMatch(
    apiAgendamentos,
    /O ID Parceiro \$\{dados\.idParceiro\} não localizou/,
  );
  assert.match(apiAgendamentos, /discriminator:\s*"B2B"/);
  assert.match(apiIndicacoes, /discriminator:\s*"B2C"/);
  assert.match(apiIndicacoes, /registrarIndicacoesRecebidas/);
  assert.match(apiIndicacoes, /LIMITE_EMPRESAS\s*=\s*10/);
  assert.match(apiIndicacoes, /aguardarResponsavelNegociacao/);
  assert.match(apiIndicacoes, /idResponsavel:\s*idResponsavelLote/);
  assert.match(apiIndicacoes, /contatoCriado\.id/);
  assert.match(apiIndicacoes, /observacao:\s*observacaoGeral/);
  assert.match(apiIndicacoes, /Empresas do mesmo grupo:/);
  assert.match(apiIndicacoes, /Nome da empresa:/);
  assert.match(apiIndicacoes, /Documento da empresa:/);
  assert.match(apiIndicacoes, /Quantidade de colaboradores:/);
  assert.match(apiIndicacoes, /empresa\.quantidadeFuncionarios/);
  assert.match(apiIndicacoes, /empresa\.cargos \? `Cargos:/);
  assert.match(apiIndicacoes, /Link da negociação dessa empresa:/);
  assert.match(apiIndicacoes, /crm\.rdstation\.com\/app#\/deals/);
  assert.match(apiIndicacoes, /montarResumoEmpresasGrupo/);
  assert.match(apiIndicacoes, /for \(const registro of negociacoesCriadasGrupo\)/);
  assert.match(apiIndicacoes, /garantirSegmentoEcossistema/);
  assert.match(apiAgendamentos, /garantirSegmentoEcossistema/);
  assert.match(clienteRd, /NOME_SEGMENTO_ECOSSISTEMA\s*=\s*"ECOSSISTEMA"/);
  assert.match(clienteRd, /segment_ids:\s*\[idSegmento\]/);
  assert.match(clienteRd, /new Set\(\[\.\.\.segmentosAtuais, idSegmento\]\)/);
  assert.match(apiAgendamentos, /status === "lost"/);
  assert.match(apiAgendamentos, /montarAnotacaoNegociacaoExistente/);
  assert.match(
    apiAgendamentos,
    /return `\$\{data\}T\$\{horario\}:00\.000-03:00`/,
  );
  assert.match(apiAgendamentos, /dataHoraIso:\s*dataHoraRd/);
  assert.match(clienteRd, /due_date:\s*dados\.dataHoraIso/);
  assert.match(
    apiAgendamentos,
    /dataHoraReuniao:\s*`\$\{dataReuniao\} \$\{horarioReuniao\}:00`/,
  );
  assert.doesNotMatch(
    apiAgendamentos,
    /dataHoraIso:\s*dataHora\.toISOString\(\)/,
  );
  assert.match(historicoIndicacoes, /data_hora_reuniao/);
  assert.match(historicoIndicacoes, /responsavel_reuniao_id/);
  assert.match(migracaoAgendamento, /ADD COLUMN `discriminator`/);
  assert.match(packageJson, /"jose"/);
  assert.match(formularioAgendamento, /\/api\/agendamentos\?data=/);
  assert.doesNotMatch(formularioAgendamento, /name="responsavel_id"/);
  assert.match(apiAgendamentos, /consultarDisponibilidadeDia/);
  assert.match(apiAgendamentos, /escolherResponsavelEquilibrado/);
  assert.match(apiAgendamentos, /contarAgendamentosB2BPorResponsavel/);
  assert.match(apiAgendamentos, /criarEventoGoogle/);
  assert.match(apiAgendamentos, /emails_secundarios/);
  assert.match(apiAgendamentos, /emailsParticipantes/);
  assert.match(apiAgendamentos, /meetbot@meetgeek\.ai/);
  assert.match(apiAgendamentos, /nome:\s*nomeEmpresa/);
  assert.match(apiAgendamentos, /nomeCliente:\s*nomeEmpresa/);
  assert.match(apiAgendamentos, /Este parceiro:\s*\$\{dados\.nomeEmpresa\}/);
  assert.match(googleCalendar, /calendar\.freebusy/);
  assert.match(googleCalendar, /calendar\.events\.owned/);
  assert.match(googleCalendar, /meetings\.space\.settings/);
  assert.match(googleCalendar, /calendars\/primary\/events/);
  assert.match(googleCalendar, /sendUpdates=all/);
  assert.match(googleCalendar, /attendees:\s*emailsParticipantes\.map/);
  assert.match(googleCalendar, /Reunião SST - \$\{dados\.nomeEmpresa\}/);
  assert.match(googleCalendar, /meet\.googleapis\.com\/v2\/spaces/);
  assert.match(googleCalendar, /accessType:\s*"OPEN"/);
  assert.match(googleCalendar, /entryPointAccess:\s*"ALL"/);
  assert.match(googleCalendar, /configurarAcessoAbertoMeet/);
  assert.match(googleCalendar, /indicacao-b2b-sst/);
  assert.match(ambienteProducao, /GOOGLE_SERVICE_ACCOUNT_FILE=/);
  assert.match(carregadorGoogle, /GOOGLE_SERVICE_ACCOUNT_JSON_BASE64/);
  assert.match(viteConfig, /vinext\(\)/);
  assert.match(viteConfig, /GOOGLE_SERVICE_ACCOUNT_JSON_BASE64/);
});
