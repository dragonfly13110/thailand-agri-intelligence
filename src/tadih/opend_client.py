"""Client for DGA Open Government Data of Thailand API (opend.data.go.th).

Uses standard library urllib for robust, dependency-free HTTPS communication.
Authenticates using the api-key header loaded from .env.
"""

import json
from typing import Any, Dict, Optional
import urllib.error
import urllib.parse
import urllib.request

from tadih.env import get_opend_api_key

DEFAULT_OPEND_URL = "https://opend.data.go.th"
DEFAULT_TIMEOUT_SECONDS = 15


def check_opend_api_key_status(api_key: Optional[str] = None) -> Dict[str, Any]:
    """Check if OpenD API key is configured and display masked status."""
    key = api_key if api_key is not None else get_opend_api_key()
    if not key or not key.strip():
        return {
            "status": "missing_key",
            "message": "OPEND_API_KEY not found in .env. Please add OPEND_API_KEY=... in .env",
            "configured": False,
        }
    key = key.strip()
    masked = key[:4] + ("*" * max(0, len(key) - 8)) + key[-4:] if len(key) >= 8 else "****"
    return {
        "status": "configured",
        "masked_key": masked,
        "configured": True,
        "key_length": len(key),
    }


def query_opend_api(
    endpoint_path: str,
    params: Optional[Dict[str, Any]] = None,
    api_key: Optional[str] = None,
    base_url: str = DEFAULT_OPEND_URL,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
) -> Dict[str, Any]:
    """Execute authenticated request to opend.data.go.th."""
    key = api_key if api_key is not None else get_opend_api_key()
    if not key or not key.strip():
        return {
            "status": "error",
            "error_type": "MISSING_API_KEY",
            "message": "OPEND_API_KEY is not configured in .env",
        }
    key = key.strip()

    url = base_url.rstrip("/") + "/" + endpoint_path.lstrip("/")
    if params:
        url += "?" + urllib.parse.urlencode(params)

    headers = {
        "api-key": key,
        "User-Agent": "TADIH-ThailandAgriIntelligence/1.0",
        "Accept": "application/json",
    }

    req = urllib.request.Request(url, headers=headers, method="GET")

    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            status_code = response.status
            content = response.read().decode("utf-8")
            try:
                data = json.loads(content)
            except json.JSONDecodeError:
                data = {"raw_text": content}
            return {
                "status": "success",
                "status_code": status_code,
                "data": data,
            }
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return {
            "status": "error",
            "status_code": e.code,
            "error_type": "HTTP_ERROR",
            "message": e.reason,
            "response_body": body,
        }
    except urllib.error.URLError as e:
        return {
            "status": "error",
            "error_type": "NETWORK_ERROR",
            "message": str(e.reason),
        }
