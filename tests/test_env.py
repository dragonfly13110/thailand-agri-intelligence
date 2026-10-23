"""Unit tests for environment configuration loader and OpenD client."""

from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch
import urllib.error

from tadih.env import (
    load_dotenv,
    get_opend_api_key,
    get_doae_api_key,
    get_tadih_env,
    get_tadih_data_dir,
)
from tadih.opend_client import (
    check_opend_api_key_status,
    query_opend_api,
)


class EnvLoaderTests(unittest.TestCase):
    def test_load_dotenv_parses_values_and_strips_quotes(self):
        sample_env = """
        # Comment line
        OPEND_API_KEY="test-key-quoted-double"
        DATA_GO_TH_API_KEY='test-key-quoted-single'
        DOAE_CKAN_API_KEY=test-unquoted-key
        EMPTY_KEY=
        # Another comment
        TADIH_ENV = staging
        """
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as tf:
            tf.write(sample_env)
            temp_path = Path(tf.name)

        try:
            parsed = load_dotenv(temp_path, override=True)
            self.assertEqual(parsed.get("OPEND_API_KEY"), "test-key-quoted-double")
            self.assertEqual(parsed.get("DATA_GO_TH_API_KEY"), "test-key-quoted-single")
            self.assertEqual(parsed.get("DOAE_CKAN_API_KEY"), "test-unquoted-key")
            self.assertEqual(parsed.get("EMPTY_KEY"), "")
            self.assertEqual(parsed.get("TADIH_ENV"), "staging")
        finally:
            if temp_path.exists():
                temp_path.unlink()

    def test_check_opend_api_key_status_masked(self):
        # Empty / None key
        status_empty = check_opend_api_key_status(api_key="")
        self.assertFalse(status_empty["configured"])
        self.assertEqual(status_empty["status"], "missing_key")

        # Configured key
        status_configured = check_opend_api_key_status(api_key="abcdef123456fun4")
        self.assertTrue(status_configured["configured"])
        self.assertEqual(status_configured["status"], "configured")
        self.assertTrue(status_configured["masked_key"].startswith("abcd"))
        self.assertTrue(status_configured["masked_key"].endswith("fun4"))
        self.assertEqual(status_configured["key_length"], 16)

    def test_query_opend_api_missing_key(self):
        result = query_opend_api("test-endpoint", api_key="")
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["error_type"], "MISSING_API_KEY")

    @patch("tadih.opend_client.urllib.request.urlopen")
    def test_query_opend_api_authenticated_mock(self, mock_urlopen):
        # Setup mock response
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = b'{"success": true, "result": {"total": 42}}'
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        result = query_opend_api("get-ckan/datastore_search", params={"q": "rice"}, api_key="secret-fun4")

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["status_code"], 200)
        self.assertEqual(result["data"]["result"]["total"], 42)

        # Check request headers passed to urlopen
        called_req = mock_urlopen.call_args[0][0]
        self.assertEqual(called_req.get_header("Api-key"), "secret-fun4")
        self.assertIn("rice", called_req.full_url)

    @patch("tadih.opend_client.urllib.request.urlopen")
    def test_query_opend_api_http_error_handling(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.HTTPError(
            url="https://opend.data.go.th/test",
            code=403,
            msg="Forbidden",
            hdrs={},
            fp=MagicMock(read=lambda: b'{"error": "Invalid API Key"}'),
        )

        result = query_opend_api("test-endpoint", api_key="invalid-key")
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["status_code"], 403)
        self.assertEqual(result["error_type"], "HTTP_ERROR")


if __name__ == "__main__":
    unittest.main()
