# Integração diária RD Station CRM → Omie

Versão pública e sanitizada de uma automação Python que lê vendas ganhas no
RD Station CRM, valida os dados do pagador e cria Ordens de Serviço no Omie.
A rotina mantém idempotência local, registra o resultado no CRM e envia um
relatório diário por e-mail.

Nenhuma credencial, ID de produção, caminho de rede, dado pessoal ou
mapeamento comercial real está incluído neste diretório.

## Problema resolvido

O fechamento comercial acontecia no CRM, enquanto o faturamento operacional
dependia da criação manual do cliente e da Ordem de Serviço no ERP. Isso gerava
digitação duplicada, risco de divergência cadastral, baixa rastreabilidade e
tempo gasto conferindo se uma venda já havia sido processada.

A automação transforma o negócio ganho em um fluxo controlado:

1. consulta os funis configurados para uma data de referência;
2. elimina negócios duplicados retornados pela paginação;
3. interpreta campos customizados e produtos do RD;
4. separa brindes, vendas já processadas e itens que exigem análise;
5. consulta ou cadastra o pagador no Omie;
6. cria a OS com serviços, parcelas, conta e categoria corretas;
7. grava o estado local e uma anotação no negócio;
8. envia um relatório diário detalhado por e-mail.

## Principais controles

- **Idempotência:** o `deal_id` é salvo após a criação da OS e não é processado
  novamente em execuções futuras.
- **Identidade do cliente:** somente documentos com 11 ou 14 dígitos, e não
  formados apenas por zeros, podem gerar ou compartilhar cadastro.
- **Produtos estritos:** qualquer produto sem mapeamento impede a OS e segue
  para análise; não há substituição silenciosa.
- **Brindes:** o total do primeiro produto igual a `0` ou `1` não gera OS.
- **Rate limit:** chamadas ao Omie são espaçadas e bloqueios temporários são
  repetidos com espera controlada.
- **Execução exclusiva:** um lock impede duas instâncias simultâneas no Windows.
- **Rastreabilidade:** sucessos, brindes, erros, logs e relatório diário ficam
  disponíveis para auditoria.
- **Modo seguro:** `--dry-run` consulta o RD e valida o fluxo sem gravar no RD,
  Omie, arquivos de estado ou e-mail.

## Estrutura

```text
integracao-rd-omie/
├── automacao_rd_omie.py       # aplicação e CLI
├── .env.example               # contrato de configuração sanitizado
├── requirements.txt           # dependências fixadas
├── tests/
│   └── test_automacao.py      # testes das regras puras
└── docs/
    └── arquitetura.md         # componentes, sequência e decisões
```

Em execução, a pasta indicada por `RD_OMIE_DATA_DIR` recebe:

```text
runtime/
├── success.json               # negócios com OS criada e respectivo nCodOS
├── gifts.json                 # brindes já tratados
├── errors.json                # último erro por negócio
├── rd-omie.lock               # bloqueio de concorrência
└── logs/
    └── rd-omie-AAAAMMDD.log   # saída completa por data de referência
```

## Requisitos

- Windows com Python 3.11 ou superior;
- acesso às APIs do RD Station CRM e Omie;
- credenciais SMTP, caso o relatório por e-mail esteja habilitado;
- permissão de escrita na pasta de estado;
- IDs e mapeamentos da instalação preenchidos no `.env`.

## Instalação

No PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edite o `.env` antes da primeira execução. O arquivo é ignorado pelo Git e
nunca deve ser versionado.

## Configuração

### Credenciais e escopo do RD

| Variável | Finalidade |
|---|---|
| `RD_CRM_TOKEN` | Token da API do RD Station CRM |
| `RD_PIPELINE_IDS` | IDs dos funis, separados por vírgula |
| `RD_FIELD_MAP_JSON` | Relação entre campos canônicos e campos customizados do RD |

O valor de cada item do `RD_FIELD_MAP_JSON` pode ser o `id`,
`api_identifier`, rótulo ou nome retornado no metadado do campo. As chaves
canônicas aceitas são:

| Chave | Conteúdo esperado |
|---|---|
| `payer_name` | Nome ou razão social do pagador |
| `payer_document` | CPF ou CNPJ do pagador |
| `payer_email` | E-mail de cobrança |
| `payer_phone` | Telefone do pagador |
| `billing_street` | Logradouro |
| `billing_number` | Número |
| `billing_district` | Bairro |
| `billing_city` | Cidade |
| `billing_state` | UF |
| `billing_zip` | CEP |
| `payment_method` | Forma de pagamento |
| `installments` | Número de parcelas |
| `partner_discount` | Abatimento aplicado ao primeiro serviço |
| `notes` | Observações adicionais |

### Omie e mapeamentos

| Variável | Finalidade |
|---|---|
| `OMIE_APP_KEY` / `OMIE_APP_SECRET` | Credenciais do aplicativo Omie |
| `OMIE_OS_STAGE` | Etapa inicial da OS |
| `OMIE_SERVICE_CITY` | Município da prestação do serviço |
| `OMIE_PAYMENT_TERM` | Código padrão da condição de pagamento |
| `OMIE_DEFAULT_CATEGORY` | Categoria padrão de serviço |
| `OMIE_PRODUCT_MAP_JSON` | Produto do RD → serviço e categoria do Omie |
| `OMIE_PAYMENT_ACCOUNT_MAP_JSON` | Palavra-chave de pagamento → conta corrente |

Exemplo de mapeamento de produto:

```json
{
  "Produto demonstrativo": {
    "service_code": 1234567890,
    "category": "1.01.01"
  }
}
```

Os nomes são comparados sem diferença de maiúsculas, minúsculas ou acentos.
O mapeamento de pagamento procura cada palavra-chave dentro do valor informado
no RD. Use termos não ambíguos.

### Persistência e comunicação

| Variável | Padrão | Finalidade |
|---|---:|---|
| `RD_OMIE_DATA_DIR` | `./runtime` | Estado, lock e logs |
| `HTTP_TIMEOUT` | `30` | Timeout HTTP em segundos |
| `OMIE_MIN_INTERVAL_SECONDS` | `3.5` | Intervalo mínimo entre chamadas Omie |
| `OMIE_MAX_RETRIES` | `3` | Tentativas após bloqueio por consumo |

### E-mail

`EMAIL_ENABLED=true` ativa o relatório. Configure `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` e `SMTP_TO`. `SMTP_CC` e `SMTP_BCC`
são opcionais. O e-mail contém totais, tabela por negociação e um JSON anexo.

## Execução

Data atual:

```powershell
python .\automacao_rd_omie.py
```

Data específica:

```powershell
python .\automacao_rd_omie.py --date 2026-01-06
```

Validação sem gravações:

```powershell
python .\automacao_rd_omie.py --date 2026-01-06 --dry-run
```

O formato de `--date` é sempre `AAAA-MM-DD`.

## Agendador de Tarefas do Windows

Crie uma tarefa diária e use:

- **Programa:** caminho absoluto para `.venv\Scripts\python.exe`;
- **Argumentos:** caminho absoluto para `automacao_rd_omie.py`;
- **Iniciar em:** pasta deste projeto;
- **Executar independentemente de o usuário estar conectado:** habilitado;
- **Não iniciar nova instância:** habilitado;
- **Repetir em caso de falha:** conforme a política operacional.

O campo **Iniciar em** é importante para que o `.env` seja localizado. Para
um ambiente mais controlado, defina `RD_OMIE_DATA_DIR` com caminho absoluto.

## Códigos de saída

| Código | Significado |
|---:|---|
| `0` | Execução concluída sem erros de negócio |
| `1` | Uma ou mais vendas ficaram em erro/análise |
| `2` | Configuração, data ou comunicação inválida |
| `4` | Falha inesperada |
| `5` | Outra instância já estava em execução |
| `6` | Processamento concluído, mas o e-mail falhou |

## Testes

```powershell
python -m unittest discover -s tests -v
python -m py_compile automacao_rd_omie.py
```

Os testes públicos cobrem normalização, brindes, mapeamento de produtos,
cálculo do valor unitário e seleção da conta de pagamento. Chamadas reais às
APIs não fazem parte da suíte pública.

## Segurança e confidencialidade

- nunca copie o `.env` para o repositório;
- não registre payloads que contenham dados pessoais;
- use uma conta SMTP dedicada e senha de aplicativo;
- armazene o diretório de estado em local com acesso restrito;
- trate os arquivos JSON e logs como dados operacionais sensíveis;
- rotacione imediatamente qualquer segredo exposto por engano.

Esta implementação demonstra a arquitetura e os controles aplicados. Valores
específicos da operação real foram removidos conforme a
[política de confidencialidade](../../CONFIDENTIALITY.md) do portfólio.

## Arquitetura

Consulte [`docs/arquitetura.md`](docs/arquitetura.md) para o diagrama do fluxo,
as fronteiras de responsabilidade e as decisões de confiabilidade.
