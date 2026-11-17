import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ler = (arquivo) => readFile(new URL(`../${arquivo}`, import.meta.url), "utf8");

test("mantém a página raiz do programa de indicações", async () => {
  const paginaRaiz = await ler("app/page.tsx");
  assert.match(paginaRaiz, /Link de indicação incompleto/);
  assert.doesNotMatch(paginaRaiz, /Abrir negociação/);
});

test("entrada de pré-vendas abre o formulário no caminho isolado", async () => {
  const entrada = await ler("app/pre-vendas/page.tsx");
  const formulario = await ler("app/formulario-agendamento-bdr.tsx");
  assert.match(entrada, /window\.location\.assign\(`\/pre-vendas\/\$\{id\}`\)/);
  assert.match(formulario, /\/api\/agendamento-bdr-sst\/negociacoes/);
  assert.match(formulario, /\/api\/agendamento-bdr-sst\/disponibilidade/);
  assert.match(formulario, /\/api\/agendamento-bdr-sst\/agendamentos/);
});

test("rota dinâmica aceita apenas o ID hexadecimal da negociação", async () => {
  const pagina = await ler("app/pre-vendas/[negociacao]/page.tsx");
  assert.match(pagina, /\^\[0-9a-f\]\{24\}\$/);
  assert.match(pagina, /FormularioAgendamentoBdr/);
});

test("fluxo BDR usa backend e estilos próprios", async () => {
  const layout = await ler("app/pre-vendas/layout.tsx");
  const rota = await ler("app/api/agendamento-bdr-sst/agendamentos/route.ts");
  assert.match(layout, /agendamento-bdr-sst\.css/);
  assert.match(rota, /lib\/agendamento-bdr-sst\/agendamentos/);
  assert.match(rota, /ID_ETAPA_AGENDADO = "678fab56b5999f0014422fec"/);
  assert.match(rota, /ID_CAMPO_PRE_VENDEDOR = "6878fdd3149ecd001a92e2d1"/);
});
