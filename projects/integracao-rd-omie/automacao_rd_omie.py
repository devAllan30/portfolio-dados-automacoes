"""Integração diária e idempotente entre RD Station CRM e Omie.

Esta é uma versão pública e sanitizada. Credenciais, IDs e mapeamentos de
produção são fornecidos exclusivamente por variáveis de ambiente.
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from email.message import EmailMessage
import html
import json
import os
from pathlib import Path
import re
import smtplib
import ssl
import sys
import time
import unicodedata
from typing import Any, Iterator

import requests
from dotenv import load_dotenv


RD_DEALS_URL = "https://crm.rdstation.com/api/v1/deals"
RD_ACTIVITIES_URL = "https://crm.rdstation.com/api/v1/activities"
RD_TASKS_URL = "https://crm.rdstation.com/api/v1/tasks"
OMIE_CLIENTS_URL = "https://app.omie.com.br/api/v1/geral/clientes/"
OMIE_OS_URL = "https://app.omie.com.br/api/v1/servicos/os/"


def text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def normalize(value: Any) -> str:
    value = unicodedata.normalize("NFKD", text(value).lower())
    return "".join(char for char in value if not unicodedata.combining(char))


def digits(value: Any) -> str:
    return "".join(char for char in text(value) if char.isdigit())


def as_float(value: Any, default: float | None = None) -> float | None:
    if value in (None, ""):
        return default
    if isinstance(value, (int, float)):
        return float(value)
    raw = text(value).replace(" ", "")
    if raw.count(",") == 1 and raw.count(".") >= 1:
        raw = raw.replace(".", "").replace(",", ".")
    elif raw.count(",") == 1:
        raw = raw.replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return default


def as_int(value: Any, default: int | None = None) -> int | None:
    number = as_float(value)
    return int(number) if number is not None else default


def as_bool(value: Any, default: bool = False) -> bool:
    normalized = normalize(value)
    if normalized in {"1", "true", "yes", "sim", "on"}:
        return True
    if normalized in {"0", "false", "no", "nao", "off"}:
        return False
    return default


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"Variável obrigatória ausente: {name}")
    return value


def json_env(name: str) -> dict[str, Any]:
    raw = required(name)
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{name} não contém um JSON válido: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{name} deve conter um objeto JSON.")
    return value


def email_list(value: str) -> list[str]:
    return [item.strip() for item in value.replace(";", ",").split(",") if item.strip()]


@dataclass(frozen=True)
class Config:
    rd_token: str
    omie_app_key: str
    omie_app_secret: str
    pipeline_ids: tuple[str, ...]
    field_map: dict[str, str]
    product_map: dict[str, dict[str, Any]]
    payment_accounts: dict[str, int]
    data_dir: Path
    omie_stage: str
    omie_service_city: str
    omie_payment_term: str
    omie_default_category: str
    http_timeout: int = 30
    omie_interval: float = 3.5
    omie_retries: int = 3

    @classmethod
    def from_env(cls) -> "Config":
        pipelines = tuple(
            item.strip() for item in required("RD_PIPELINE_IDS").split(",") if item.strip()
        )
        if not pipelines:
            raise ValueError("RD_PIPELINE_IDS deve informar ao menos um funil.")
        products = {
            normalize(name): config
            for name, config in json_env("OMIE_PRODUCT_MAP_JSON").items()
        }
        accounts = {
            normalize(name): int(code)
            for name, code in json_env("OMIE_PAYMENT_ACCOUNT_MAP_JSON").items()
        }
        return cls(
            rd_token=required("RD_CRM_TOKEN"),
            omie_app_key=required("OMIE_APP_KEY"),
            omie_app_secret=required("OMIE_APP_SECRET"),
            pipeline_ids=pipelines,
            field_map={str(k): str(v) for k, v in json_env("RD_FIELD_MAP_JSON").items()},
            product_map=products,
            payment_accounts=accounts,
            data_dir=Path(os.getenv("RD_OMIE_DATA_DIR", "./runtime")).resolve(),
            omie_stage=required("OMIE_OS_STAGE"),
            omie_service_city=required("OMIE_SERVICE_CITY"),
            omie_payment_term=required("OMIE_PAYMENT_TERM"),
            omie_default_category=required("OMIE_DEFAULT_CATEGORY"),
            http_timeout=int(os.getenv("HTTP_TIMEOUT", "30")),
            omie_interval=float(os.getenv("OMIE_MIN_INTERVAL_SECONDS", "3.5")),
            omie_retries=int(os.getenv("OMIE_MAX_RETRIES", "3")),
        )


class JsonState:
    def __init__(self, path: Path) -> None:
        self.path = path

    def read(self) -> dict[str, Any]:
        if not self.path.exists():
            return {}
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    def contains(self, deal_id: Any) -> bool:
        return text(deal_id) in self.read()

    def get(self, deal_id: Any) -> dict[str, Any]:
        value = self.read().get(text(deal_id), {})
        return value if isinstance(value, dict) else {}

    def write(self, deal_id: Any, info: dict[str, Any]) -> None:
        state = self.read()
        state[text(deal_id)] = {
            "recorded_at": datetime.now().isoformat(timespec="seconds"),
            "info": info,
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(self.path.suffix + ".tmp")
        temporary.write_text(
            json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        os.replace(temporary, self.path)


class Integrations:
    def __init__(self, config: Config, dry_run: bool = False) -> None:
        self.config = config
        self.dry_run = dry_run
        self.session = requests.Session()
        self.last_omie_call = 0.0
        self.client_cache: dict[str, int] = {}

    def rd_request(self, method: str, url: str, **kwargs: Any) -> requests.Response:
        kwargs.setdefault("timeout", self.config.http_timeout)
        response = self.session.request(method, url, **kwargs)
        response.raise_for_status()
        return response

    def fetch_won_deals(self, reference: datetime) -> list[dict[str, Any]]:
        start = reference.replace(hour=0, minute=0, second=0, microsecond=0)
        end = reference.replace(hour=23, minute=59, second=59, microsecond=0)
        found: list[dict[str, Any]] = []
        seen: set[str] = set()
        for pipeline_id in self.config.pipeline_ids:
            page = 1
            while True:
                response = self.rd_request(
                    "GET",
                    RD_DEALS_URL,
                    params={
                        "token": self.config.rd_token,
                        "page": page,
                        "limit": 200,
                        "deal_pipeline_id": pipeline_id,
                        "win": "true",
                        "closed_at": "true",
                        "closed_at_period": "true",
                        "start_date": start.strftime("%Y-%m-%dT%H:%M:%S"),
                        "end_date": end.strftime("%Y-%m-%dT%H:%M:%S"),
                    },
                )
                deals = response.json().get("deals", [])
                if not deals:
                    break
                for deal in deals:
                    deal_id = text(deal.get("id"))
                    if deal_id and deal_id not in seen:
                        seen.add(deal_id)
                        found.append(deal)
                if len(deals) < 200:
                    break
                page += 1
                time.sleep(0.5)
        return found

    def add_rd_note(self, deal_id: Any, message: str) -> bool:
        if self.dry_run:
            print(f"[DRY-RUN][RD][NOTE] {deal_id}: {message}")
            return True
        try:
            self.rd_request(
                "POST",
                RD_ACTIVITIES_URL,
                params={"token": self.config.rd_token},
                json={"deal_id": text(deal_id), "type": "note", "text": message},
            )
            return True
        except requests.RequestException as exc:
            print(f"[ERROR][RD] Could not add note to {deal_id}: {exc}")
            return False

    def flag_rd_failure(self, deal_id: Any, user_id: Any, reason: str) -> None:
        message = f"[RD -> Omie] Falha ao gerar OS: {reason}"
        if self.dry_run:
            print(f"[DRY-RUN][RD][FAILURE] {deal_id}: {message}")
            return
        self.add_rd_note(deal_id, message)
        task = {
            "type": "task",
            "subject": "Revisar dados para integração com o Omie",
            "deal_id": text(deal_id),
            "date": datetime.now().strftime("%Y-%m-%d"),
            "hour": datetime.now().strftime("%H:%M"),
        }
        if text(user_id):
            task["user_ids"] = [text(user_id)]
        try:
            self.rd_request(
                "POST",
                RD_TASKS_URL,
                params={"token": self.config.rd_token},
                json={"task": task},
            )
            self.rd_request(
                "PUT",
                f"{RD_DEALS_URL}/{deal_id}",
                params={"token": self.config.rd_token},
                json={"deal": {"win": None}},
            )
        except requests.RequestException as exc:
            print(f"[ERROR][RD] Could not flag deal {deal_id}: {exc}")

    def omie_post(
        self, url: str, call: str, param: dict[str, Any]
    ) -> tuple[dict[str, Any] | None, str | None]:
        if self.dry_run and call in {"IncluirCliente", "IncluirOS"}:
            key = "codigo_cliente_omie" if call == "IncluirCliente" else "nCodOS"
            print(f"[DRY-RUN][OMIE][{call}] payload prepared")
            return {key: 999999999}, None
        payload = {
            "call": call,
            "app_key": self.config.omie_app_key,
            "app_secret": self.config.omie_app_secret,
            "param": [param],
        }
        for attempt in range(1, self.config.omie_retries + 1):
            elapsed = time.monotonic() - self.last_omie_call
            if elapsed < self.config.omie_interval:
                time.sleep(self.config.omie_interval - elapsed)
            self.last_omie_call = time.monotonic()
            try:
                response = self.session.post(
                    url, json=payload, timeout=self.config.http_timeout
                )
                data = response.json()
            except (requests.RequestException, ValueError) as exc:
                return None, f"Omie request failed ({call}): {exc}"
            fault = text(data.get("faultstring")) if isinstance(data, dict) else ""
            limited = any(
                marker in normalize(fault)
                for marker in ("consumo indevido", "consumo redundante")
            )
            if fault and limited:
                match = re.search(r"(?:tente novamente em|aguarde)\s+(\d+)", normalize(fault))
                wait = int(match.group(1)) if match else 30
                print(f"[OMIE][RATE LIMIT] waiting {wait}s ({attempt}/{self.config.omie_retries})")
                time.sleep(wait + 1)
                continue
            if fault:
                return data, fault
            if response.status_code >= 400:
                return data, f"Omie returned HTTP {response.status_code}"
            return data, None
        return None, "Omie rate limit retries exhausted"

    def get_or_create_client(self, row: dict[str, Any]) -> tuple[int | None, str | None]:
        document = digits(row.get("payer_document"))
        if len(document) not in {11, 14} or set(document) == {"0"}:
            return None, "CPF/CNPJ do pagador ausente ou inválido"
        integration_code = f"RD_CLIENT_{document}"
        if integration_code in self.client_cache:
            return self.client_cache[integration_code], None
        data, error = self.omie_post(
            OMIE_CLIENTS_URL,
            "ConsultarCliente",
            {"codigo_cliente_integracao": integration_code},
        )
        code = extract_client_code(data)
        if not error and code:
            self.client_cache[integration_code] = code
            return code, None
        phone = digits(row.get("payer_phone"))
        client = {
            "codigo_cliente_integracao": integration_code,
            "razao_social": text(row.get("payer_name")),
            "cnpj_cpf": document,
            "endereco": text(row.get("billing_street")),
            "endereco_numero": text(row.get("billing_number")),
            "bairro": text(row.get("billing_district")),
            "cidade": text(row.get("billing_city")),
            "estado": text(row.get("billing_state")).upper()[:2],
            "cep": digits(row.get("billing_zip")),
            "telefone1_ddd": phone[:2],
            "telefone1_numero": phone[2:],
            "email": text(row.get("payer_email")),
        }
        data, error = self.omie_post(OMIE_CLIENTS_URL, "IncluirCliente", client)
        if error:
            return None, error
        code = extract_client_code(data)
        if not code:
            return None, "Omie did not return codigo_cliente_omie"
        self.client_cache[integration_code] = code
        return code, None


def generic_list(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        for key in ("items", "custom_fields", "fields"):
            if isinstance(value.get(key), list):
                return [item for item in value[key] if isinstance(item, dict)]
        return [value]
    return []


def custom_values(deal: dict[str, Any], field_map: dict[str, str]) -> dict[str, Any]:
    result = {key: None for key in field_map}
    expected = {key: normalize(identifier) for key, identifier in field_map.items()}
    for item in generic_list(deal.get("deal_custom_fields")):
        meta = item.get("custom_field") if isinstance(item.get("custom_field"), dict) else item
        identifiers = {
            normalize(meta.get("id")),
            normalize(meta.get("api_identifier")),
            normalize(meta.get("label")),
            normalize(meta.get("name")),
        }
        value = item.get("value", meta.get("value"))
        for canonical, identifier in expected.items():
            if identifier and identifier in identifiers and value not in (None, ""):
                result[canonical] = value
    return result


def products_from(deal: dict[str, Any]) -> list[dict[str, Any]]:
    products: list[dict[str, Any]] = []
    for item in generic_list(deal.get("deal_products")):
        product = item.get("product") if isinstance(item.get("product"), dict) else {}
        name = product.get("name") or item.get("name") or item.get("product_name")
        if not text(name):
            continue
        products.append(
            {
                "name": text(name),
                "quantity": item.get("amount", 1),
                "total": item.get("total", product.get("total")),
                "unit_price": item.get("base_price", item.get("price", product.get("price"))),
            }
        )
    return products


def transform_deal(deal: dict[str, Any], field_map: dict[str, str]) -> dict[str, Any]:
    user = deal.get("user") if isinstance(deal.get("user"), dict) else {}
    return {
        "deal_id": deal.get("id"),
        "deal_name": deal.get("name"),
        "responsible_name": user.get("name") or user.get("email"),
        "responsible_user_id": user.get("id") or user.get("_id"),
        "products": products_from(deal),
        **custom_values(deal, field_map),
    }


def extract_client_code(data: dict[str, Any] | None) -> int | None:
    if not isinstance(data, dict):
        return None
    code = data.get("codigo_cliente_omie")
    nested = data.get("cliente_cadastro")
    if not code and isinstance(nested, dict):
        code = nested.get("codigo_cliente_omie")
    return as_int(code)


def extract_os_code(data: dict[str, Any] | None) -> int | None:
    if not isinstance(data, dict):
        return None
    for source in (data, data.get("osCadastro"), data.get("OS"), data.get("os")):
        if isinstance(source, dict):
            code = source.get("nCodOS") or source.get("codigo_os") or source.get("codOS")
            if code:
                return as_int(code)
    return None


def is_gift(row: dict[str, Any]) -> bool:
    products = row.get("products", [])
    total = as_float(products[0].get("total")) if products else None
    return total is not None and any(abs(total - value) <= 1e-9 for value in (0.0, 1.0))


def payment_account(config: Config, value: Any) -> int | None:
    method = normalize(value)
    for keyword, code in config.payment_accounts.items():
        if keyword in method:
            return code
    return None


def build_services(config: Config, row: dict[str, Any]) -> tuple[list[dict[str, Any]] | None, str | None, str | None]:
    services: list[dict[str, Any]] = []
    category: str | None = None
    missing: list[str] = []
    discount = as_float(row.get("partner_discount"), 0.0) or 0.0
    for index, product in enumerate(row.get("products", [])):
        name = text(product.get("name"))
        mapping = config.product_map.get(normalize(name))
        if not mapping:
            missing.append(name)
            continue
        quantity = max(as_int(product.get("quantity"), 1) or 1, 1)
        total = as_float(product.get("total"))
        unit_price = total / quantity if total and total > 0 else as_float(product.get("unit_price"))
        if not unit_price or unit_price <= 0:
            missing.append(f"{name} (invalid value)")
            continue
        item: dict[str, Any] = {
            "nCodServico": int(mapping["service_code"]),
            "nQtde": quantity,
            "nValUnit": round(unit_price, 2),
        }
        if index == 0 and discount > 0:
            item["nValorDesconto"] = round(discount, 2)
        services.append(item)
        category = category or text(mapping.get("category"))
    if missing:
        return None, None, "Produto sem mapeamento ou valor válido: " + ", ".join(missing)
    if not services:
        return None, None, "Negociação sem serviços válidos"
    return services, category or config.omie_default_category, None


def build_os(config: Config, api: Integrations, row: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    services, category, error = build_services(config, row)
    if error:
        return None, error
    client_code, error = api.get_or_create_client(row)
    if error:
        return None, f"Falha no cliente Omie: {error}"
    account = payment_account(config, row.get("payment_method"))
    if not account:
        return None, f"Forma de pagamento não mapeada: {row.get('payment_method')!r}"
    notes = [
        f"Responsável: {text(row.get('responsible_name'))}",
        f"Negociação: {text(row.get('deal_name'))}",
    ]
    if text(row.get("notes")):
        notes.append(f"Observações: {text(row.get('notes'))}")
    return {
        "Cabecalho": {
            "cCodIntOS": f"RD_OS_{row.get('deal_id')}",
            "cCodParc": config.omie_payment_term,
            "cEtapa": config.omie_stage,
            "dDtPrevisao": datetime.now().strftime("%d/%m/%Y"),
            "nCodCli": int(client_code),
            "nQtdeParc": as_int(row.get("installments"), 1) or 1,
        },
        "Email": {
            "cEnvBoleto": "N",
            "cEnvLink": "N",
            "cEnviarPara": text(row.get("payer_email")),
        },
        "InformacoesAdicionais": {
            "cCidPrestServ": config.omie_service_city,
            "cCodCateg": category,
            "cDadosAdicNF": "",
            "nCodCC": account,
        },
        "ServicosPrestados": services,
        "Observacoes": {"cObsOS": " | ".join(notes)},
    }, None


def detail(row: dict[str, Any], result: str, message: str, os_code: Any = "") -> dict[str, Any]:
    return {
        "deal_id": text(row.get("deal_id")),
        "name": text(row.get("deal_name")) or "(sem nome)",
        "result": result,
        "os_code": os_code or "",
        "message": message,
    }


def execute(config: Config, reference: datetime, dry_run: bool = False) -> tuple[int, dict[str, Any]]:
    started = datetime.now()
    api = Integrations(config, dry_run=dry_run)
    success = JsonState(config.data_dir / "success.json")
    gifts = JsonState(config.data_dir / "gifts.json")
    errors = JsonState(config.data_dir / "errors.json")
    deals = api.fetch_won_deals(reference)
    print(f"Vendas encontradas em {reference:%d/%m/%Y}: {len(deals)}")
    summary = {"success": 0, "gift": 0, "error": 0, "skipped": 0}
    details: list[dict[str, Any]] = []
    for raw_deal in deals:
        row = transform_deal(raw_deal, config.field_map)
        deal_id = row.get("deal_id")
        if is_gift(row):
            summary["gift"] += 1
            if not gifts.contains(deal_id):
                api.add_rd_note(deal_id, "OS não gerada: negociação classificada como brinde.")
                if not dry_run:
                    gifts.write(deal_id, {})
            details.append(detail(row, "BRINDE", "OS não gerada"))
            continue
        if success.contains(deal_id):
            summary["skipped"] += 1
            saved = success.get(deal_id).get("info", {})
            details.append(detail(row, "IGNORADO", "OS já gerada", saved.get("nCodOS", "")))
            continue
        payload, error = build_os(config, api, row)
        if error:
            summary["error"] += 1
            api.flag_rd_failure(deal_id, row.get("responsible_user_id"), error)
            if not dry_run:
                errors.write(deal_id, {"reason": error})
            details.append(detail(row, "ERRO", error))
            continue
        response, error = api.omie_post(OMIE_OS_URL, "IncluirOS", payload or {})
        if error:
            summary["error"] += 1
            api.flag_rd_failure(deal_id, row.get("responsible_user_id"), error)
            if not dry_run:
                errors.write(deal_id, {"reason": error})
            details.append(detail(row, "ERRO", error))
            continue
        os_code = extract_os_code(response)
        summary["success"] += 1
        if not dry_run:
            success.write(deal_id, {"nCodOS": os_code})
        message = f"OS {os_code} gerada com sucesso" if os_code else "OS gerada com sucesso"
        api.add_rd_note(deal_id, f"[RD -> Omie] {message}.")
        details.append(detail(row, "SUCESSO", message, os_code))
    finished = datetime.now()
    report = {
        "status": "ERROR" if summary["error"] else "SUCCESS",
        "reference_date": reference.strftime("%Y-%m-%d"),
        "started_at": started.isoformat(timespec="seconds"),
        "finished_at": finished.isoformat(timespec="seconds"),
        "duration_seconds": round((finished - started).total_seconds(), 1),
        "dry_run": dry_run,
        "deals_found": len(deals),
        "summary": summary,
        "details": details,
    }
    return (1 if summary["error"] else 0), report


def build_email(report: dict[str, Any]) -> EmailMessage:
    status = "OK" if report.get("status") == "SUCCESS" else "COM ERROS"
    summary = report.get("summary", {})
    subject = f"[RD -> Omie] {report.get('reference_date')} - {status}"
    rows = []
    for item in report.get("details", []):
        rows.append(
            "<tr>" + "".join(
                f"<td style='padding:6px;border:1px solid #ddd'>{html.escape(text(value))}</td>"
                for value in (
                    item.get("result"), item.get("name"), item.get("deal_id"),
                    item.get("os_code") or "-", item.get("message"),
                )
            ) + "</tr>"
        )
    if not rows:
        rows.append("<tr><td colspan='5'>Nenhuma venda encontrada.</td></tr>")
    body = f"""<html><body style="font-family:Arial,sans-serif">
<h2>Integração diária RD Station CRM -> Omie</h2>
<p><strong>Data:</strong> {report.get('reference_date')}<br><strong>Status:</strong> {status}<br>
<strong>Encontradas:</strong> {report.get('deals_found', 0)} | <strong>OS:</strong> {summary.get('success', 0)} |
<strong>Brindes:</strong> {summary.get('gift', 0)} | <strong>Ignoradas:</strong> {summary.get('skipped', 0)} |
<strong>Erros:</strong> {summary.get('error', 0)}</p>
<table style="border-collapse:collapse;width:100%"><tr><th>Resultado</th><th>Negociação</th><th>ID RD</th><th>ID OS</th><th>Detalhe</th></tr>{''.join(rows)}</table>
</body></html>"""
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = required("SMTP_FROM")
    message["To"] = ", ".join(email_list(required("SMTP_TO")))
    cc = email_list(os.getenv("SMTP_CC", ""))
    if cc:
        message["Cc"] = ", ".join(cc)
    message.set_content(json.dumps(report, ensure_ascii=False, indent=2))
    message.add_alternative(body, subtype="html")
    message.add_attachment(
        json.dumps(report, ensure_ascii=False, indent=2).encode("utf-8"),
        maintype="application", subtype="json", filename="rd-omie-report.json",
    )
    return message


def send_email(report: dict[str, Any]) -> None:
    if not as_bool(os.getenv("EMAIL_ENABLED", "true"), True):
        print("E-mail desabilitado por EMAIL_ENABLED.")
        return
    host = required("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    recipients = email_list(required("SMTP_TO")) + email_list(os.getenv("SMTP_CC", "")) + email_list(os.getenv("SMTP_BCC", ""))
    message = build_email(report)
    context = ssl.create_default_context()
    use_ssl = as_bool(os.getenv("SMTP_USE_SSL", "false"))
    use_tls = as_bool(os.getenv("SMTP_USE_TLS", "true"), True)
    connection = smtplib.SMTP_SSL(host, port, context=context, timeout=60) if use_ssl else smtplib.SMTP(host, port, timeout=60)
    with connection as server:
        if use_tls and not use_ssl:
            server.starttls(context=context)
        if user:
            server.login(user, "".join(password.split()))
        server.send_message(message, to_addrs=recipients)
    print(f"Relatório enviado para: {', '.join(email_list(required('SMTP_TO')))}")


class Tee:
    def __init__(self, *targets: Any) -> None:
        self.targets = targets

    def write(self, value: str) -> int:
        for target in self.targets:
            target.write(value)
            target.flush()
        return len(value)

    def flush(self) -> None:
        for target in self.targets:
            target.flush()


@contextmanager
def daily_log(config: Config, reference: datetime) -> Iterator[Path]:
    log_dir = config.data_dir / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    path = log_dir / f"rd-omie-{reference:%Y%m%d}.log"
    stdout, stderr = sys.stdout, sys.stderr
    with path.open("a", encoding="utf-8") as file:
        sys.stdout, sys.stderr = Tee(stdout, file), Tee(stderr, file)
        try:
            print("\n" + "=" * 72)
            print(f"Início: {datetime.now():%d/%m/%Y %H:%M:%S}")
            print(f"Referência: {reference:%d/%m/%Y}")
            yield path
        finally:
            print(f"Fim: {datetime.now():%d/%m/%Y %H:%M:%S}")
            sys.stdout, sys.stderr = stdout, stderr


@contextmanager
def exclusive_lock(config: Config) -> Iterator[bool]:
    import msvcrt

    path = config.data_dir / "rd-omie.lock"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as file:
        if file.seek(0, os.SEEK_END) == 0:
            file.write(b"0")
            file.flush()
        file.seek(0)
        locked = False
        try:
            msvcrt.locking(file.fileno(), msvcrt.LK_NBLCK, 1)
            locked = True
            yield True
        except OSError:
            yield False
        finally:
            if locked:
                file.seek(0)
                msvcrt.locking(file.fileno(), msvcrt.LK_UNLCK, 1)


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Integração diária RD Station CRM -> Omie")
    parser.add_argument("--date", help="Data de referência em AAAA-MM-DD; padrão: hoje")
    parser.add_argument("--dry-run", action="store_true", help="Não grava no RD, Omie ou estado local")
    return parser.parse_args()


def main() -> int:
    load_dotenv()
    args = arguments()
    try:
        config = Config.from_env()
        reference = datetime.strptime(args.date, "%Y-%m-%d") if args.date else datetime.now()
        with daily_log(config, reference):
            with exclusive_lock(config) as allowed:
                if not allowed:
                    print("Outra instância já está em execução.")
                    return 5
                code, report = execute(config, reference, dry_run=args.dry_run)
                if args.dry_run:
                    print("[DRY-RUN] E-mail não enviado.")
                else:
                    try:
                        send_email(report)
                    except Exception as exc:
                        print(f"[ERROR] Falha no envio do relatório: {exc}")
                        return code or 6
                return code
    except (ValueError, requests.RequestException) as exc:
        print(f"[ERROR] {exc}")
        return 2
    except Exception as exc:
        print(f"[ERROR] Falha inesperada: {exc}")
        return 4


if __name__ == "__main__":
    raise SystemExit(main())
