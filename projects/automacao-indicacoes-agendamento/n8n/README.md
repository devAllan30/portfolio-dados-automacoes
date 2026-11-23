# Workflow n8n — publicação do link no RD Station

O arquivo
[`workflows/rd-publicar-link-formulario.json`](workflows/rd-publicar-link-formulario.json)
contém a versão pública e sanitizada do workflow **RD - Publicar link do
formulário na negociação**.

O fluxo recebe o evento de criação de uma negociação, valida o funil, evita o
processamento duplicado e preenche um campo personalizado da negociação com o
link do formulário de pré-vendas.

## Configuração utilizada

- evento esperado: `crm_deal_created`;
- funil permitido: `678fab56b5999f0014422fe8`;
- campo personalizado da negociação: `6afaf68330b2bb001da9f0fd`;
- URL gerada: `https://indicacao.qualitysst.com.br/pre-vendas/{deal_id}`;
- webhook: `POST /webhook/rd-deal-created`;
- API do CRM: RD Station CRM V1.

## Importação

1. Importe o arquivo JSON no n8n.
2. Crie ou selecione uma credencial HTTP para a API V1 do RD Station CRM. Ela
   deve enviar o token V1 no query parameter `token`.
3. Associe essa credencial aos três nós HTTP:
   - `V1 - Consultar negociação`;
   - `V1 - Publicar link na negociação`;
   - `Reler negociação no RD`.
4. Crie ou selecione a Data Table `rd_webhook_deals` em todos os nós de tabela.
5. Publique o workflow e cadastre a URL de produção do webhook no RD Station.

O workflow é importado desativado para evitar que um webhook seja publicado
antes de as credenciais e a tabela serem configuradas.

## Data Table

A tabela `rd_webhook_deals` deve possuir, além dos campos automáticos do n8n,
as seguintes colunas:

| Coluna | Tipo sugerido | Uso |
| --- | --- | --- |
| `transaction_uuid` | texto | chave de idempotência do evento |
| `deal_id` | texto | ID da negociação |
| `pipeline_id` | texto | ID do funil |
| `status` | texto | `received`, `success` ou `error` |
| `received_at` | data/texto | recebimento do webhook |
| `processed_at` | data/texto | conclusão do processamento |
| `error_message` | texto | diagnóstico da falha |
| `attempts` | número | quantidade de tentativas |

## Segurança

O arquivo versionado não contém token, referência de credencial, ID da
instância n8n, ID interno do workflow, ID do webhook, ID da Data Table nem dados
fixados de execução. O identificador da tabela está como
`CONFIGURE_DATA_TABLE_ID` e precisa ser selecionado após a importação.
