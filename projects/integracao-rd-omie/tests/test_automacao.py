import importlib.util
from pathlib import Path
import sys
import unittest


MODULE_PATH = Path(__file__).resolve().parents[1] / "automacao_rd_omie.py"
SPEC = importlib.util.spec_from_file_location("automacao_rd_omie", MODULE_PATH)
automation = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = automation
SPEC.loader.exec_module(automation)


class RulesTest(unittest.TestCase):
    def config(self):
        return automation.Config(
            rd_token="test",
            omie_app_key="test",
            omie_app_secret="test",
            pipeline_ids=("pipeline",),
            field_map={},
            product_map={
                "servico exemplo": {"service_code": 123, "category": "1.01.01"}
            },
            payment_accounts={"pix": 456},
            data_dir=Path("runtime-test"),
            omie_stage="10",
            omie_service_city="CIDADE (UF)",
            omie_payment_term="999",
            omie_default_category="1.01.01",
        )

    def test_normalizes_accents(self):
        self.assertEqual(automation.normalize("Cartão de Crédito"), "cartao de credito")

    def test_detects_gift_by_first_product_total(self):
        self.assertTrue(automation.is_gift({"products": [{"total": "1,00"}]}))
        self.assertFalse(automation.is_gift({"products": [{"total": "120,00"}]}))

    def test_rejects_unmapped_product(self):
        services, category, error = automation.build_services(
            self.config(),
            {"products": [{"name": "Desconhecido", "quantity": 1, "total": 100}]},
        )
        self.assertIsNone(services)
        self.assertIsNone(category)
        self.assertIn("sem mapeamento", error)

    def test_builds_mapped_service(self):
        services, category, error = automation.build_services(
            self.config(),
            {
                "products": [
                    {"name": "Serviço Exemplo", "quantity": 2, "total": "200,00"}
                ]
            },
        )
        self.assertIsNone(error)
        self.assertEqual(category, "1.01.01")
        self.assertEqual(services[0]["nCodServico"], 123)
        self.assertEqual(services[0]["nValUnit"], 100.0)

    def test_maps_payment_account_by_keyword(self):
        self.assertEqual(automation.payment_account(self.config(), "Pagamento via PIX"), 456)


if __name__ == "__main__":
    unittest.main()
