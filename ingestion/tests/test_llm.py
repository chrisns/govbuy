"""Anthropic credential selection (llm.py): API key for dev, Workload Identity Federation in CI."""
import json
import io
import pytest

from govbuy_ingest import config, llm

FED = {"ANTHROPIC_FEDERATION_RULE_ID": "fdrl_x", "ANTHROPIC_ORGANIZATION_ID": "org", "ANTHROPIC_SERVICE_ACCOUNT_ID": "svac_x",
       "ANTHROPIC_WORKSPACE_ID": "wrkspc_x"}
GHA = {"ACTIONS_ID_TOKEN_REQUEST_URL": "https://gh.example/token?x=1", "ACTIONS_ID_TOKEN_REQUEST_TOKEN": "req-tok"}


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    for k in [*FED, *GHA, "ANTHROPIC_IDENTITY_TOKEN_FILE"]:
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", None)


def test_no_credentials():
    assert not llm.has_credentials()
    with pytest.raises(RuntimeError):
        llm.make_client()


def test_api_key_wins(monkeypatch):
    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", "sk-ant-test")
    for k, v in {**FED, **GHA}.items():
        monkeypatch.setenv(k, v)
    assert llm.has_credentials()
    assert llm.make_client().api_key == "sk-ant-test"


def test_federation_needs_a_token_source(monkeypatch):
    for k, v in FED.items():
        monkeypatch.setenv(k, v)
    assert not llm.has_credentials()
    monkeypatch.setenv("ANTHROPIC_IDENTITY_TOKEN_FILE", "/tmp/t")
    assert llm.has_credentials()


def test_federation_in_actions_builds_client(monkeypatch):
    for k, v in {**FED, **GHA}.items():
        monkeypatch.setenv(k, v)
    assert llm.has_credentials()
    assert llm.make_client() is not None  # no network: the exchange only happens on the first request


def test_github_token_is_requested_fresh_for_the_anthropic_audience(monkeypatch):
    for k, v in GHA.items():
        monkeypatch.setenv(k, v)
    seen = []

    def fake_urlopen(req, timeout):
        seen.append(req)
        return io.BytesIO(json.dumps({"value": f"jwt-{len(seen)}"}).encode())

    monkeypatch.setattr(llm.urllib.request, "urlopen", fake_urlopen)
    assert llm.github_oidc_token() == "jwt-1"
    assert llm.github_oidc_token() == "jwt-2"  # never cached: Anthropic accepts each token once
    assert seen[0].full_url == "https://gh.example/token?x=1&audience=https%3A%2F%2Fapi.anthropic.com"
    assert seen[0].get_header("Authorization") == "Bearer req-tok"
