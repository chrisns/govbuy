"""Anthropic client factory (ADR-0007).

Credentials, first match wins:
  1. ANTHROPIC_API_KEY            - local dev (.env). Shadows federation, so unset it in CI.
  2. Workload Identity Federation - CI. ANTHROPIC_FEDERATION_RULE_ID, ANTHROPIC_ORGANIZATION_ID,
     ANTHROPIC_SERVICE_ACCOUNT_ID (+ ANTHROPIC_WORKSPACE_ID) name the Claude Console rule; the
     identity token is GitHub's OIDC token when running in Actions, else the file at
     ANTHROPIC_IDENTITY_TOKEN_FILE.

GitHub tokens are single-use (Anthropic rejects a repeated `jti`) and live ~5 minutes, so the
provider asks GitHub for a fresh one on every exchange instead of caching one in a file.
"""
from __future__ import annotations
import json
import os
import urllib.parse
import urllib.request

from . import config

AUDIENCE = "https://api.anthropic.com"
_FEDERATION_ENV = ("ANTHROPIC_FEDERATION_RULE_ID", "ANTHROPIC_ORGANIZATION_ID", "ANTHROPIC_SERVICE_ACCOUNT_ID")


def github_oidc_token() -> str:
    """A fresh GitHub Actions OIDC token for the Anthropic audience (needs `id-token: write`)."""
    url = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"]
    req = urllib.request.Request(
        f"{url}&audience={urllib.parse.quote(AUDIENCE, safe='')}",
        headers={"Authorization": f"Bearer {os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']}"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)["value"]


def _federation_configured() -> bool:
    has_token_source = bool(os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL") or os.environ.get("ANTHROPIC_IDENTITY_TOKEN_FILE"))
    return all(os.environ.get(k) for k in _FEDERATION_ENV) and has_token_source


def has_credentials() -> bool:
    return bool(config.ANTHROPIC_API_KEY) or _federation_configured()


def make_client():
    """An Anthropic client using whichever credential is available; raises if there is none."""
    from anthropic import Anthropic  # imported lazily so the package loads without the dep
    if config.ANTHROPIC_API_KEY:
        return Anthropic(api_key=config.ANTHROPIC_API_KEY)
    if not _federation_configured():
        raise RuntimeError("no Anthropic credentials: set ANTHROPIC_API_KEY, or the ANTHROPIC_FEDERATION_* variables")
    from anthropic import IdentityTokenFile, WorkloadIdentityCredentials
    in_actions = bool(os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL"))
    return Anthropic(credentials=WorkloadIdentityCredentials(
        identity_token_provider=github_oidc_token if in_actions else IdentityTokenFile(),
        federation_rule_id=os.environ["ANTHROPIC_FEDERATION_RULE_ID"],
        organization_id=os.environ["ANTHROPIC_ORGANIZATION_ID"],
        service_account_id=os.environ["ANTHROPIC_SERVICE_ACCOUNT_ID"],
        workspace_id=os.environ.get("ANTHROPIC_WORKSPACE_ID"),
    ))
