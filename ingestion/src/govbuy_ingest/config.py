"""Runtime configuration for the govbuy ingestion harness (env-overridable)."""
from __future__ import annotations
import os
from pathlib import Path

def _load_dotenv() -> None:
    """Dev convenience: populate env from the repo .env (CH/Anthropic keys) if not already set."""
    here = Path(__file__).resolve()
    for parent in [Path.cwd(), *here.parents]:
        f = parent / ".env"
        if f.exists():
            for line in f.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())
            break


_load_dotenv()

PROJECT = os.environ.get("GCP_PROJECT", "govreposcrape")
BQ_LOCATION = os.environ.get("BQ_LOCATION", "EU")
RAW_DATASET = os.environ.get("BQ_RAW_DATASET", "govbuy_raw")
PUBLIC_DATASET = os.environ.get("BQ_PUBLIC_DATASET", "govbuy_public")
SIBLING_DATASET = os.environ.get("SIBLING_DATASET", "uk_tenders_public")

# Local archive backend (replay + substring-gate source). GCS in prod (set GCS_BUCKET).
ARCHIVE_DIR = Path(os.environ.get("GOVBUY_ARCHIVE_DIR", str(Path.home() / ".govbuy" / "archive")))
GCS_BUCKET = os.environ.get("GOVBUY_GCS_BUCKET")  # if set, archive to gs://BUCKET/...

# Secrets
COMPANIES_HOUSE_API = os.environ.get("COMPANIES_HOUSE_API")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")

# Tiered models (PRD §7.2): Haiku extract / Sonnet verify / Opus discover.
MODEL_EXTRACT = os.environ.get("GOVBUY_MODEL_EXTRACT", "claude-haiku-4-5-20251001")
MODEL_VERIFY = os.environ.get("GOVBUY_MODEL_VERIFY", "claude-sonnet-5")
MODEL_DISCOVER = os.environ.get("GOVBUY_MODEL_DISCOVER", "claude-opus-5")

# Approx per-MTok USD prices for cost reporting (override as pricing changes).
# ponytail: Sonnet 5 has a $2/$10 intro rate through 2026-08-31; priced here at the standard
# $3/$15 rate so the cost ceiling never under-counts spend once the intro rate lapses.
PRICES_USD_PER_MTOK = {
    MODEL_EXTRACT: (1.0, 5.0),    # (input, output) — Haiku tier
    MODEL_VERIFY: (3.0, 15.0),    # Sonnet 5
    MODEL_DISCOVER: (5.0, 25.0),  # Opus 5
}
USD_GBP = float(os.environ.get("GOVBUY_USD_GBP", "0.79"))

# Soft cost ceiling per run (PRD §11.1): warn then pause-without-swap.
CEILING_WARN_GBP = float(os.environ.get("GOVBUY_CEILING_WARN_GBP", "50"))
CEILING_PAUSE_GBP = float(os.environ.get("GOVBUY_CEILING_PAUSE_GBP", "150"))

# Membership confidence gate + staleness (PRD §9.1 / N7).
MEMBERSHIP_CONF_GATE = float(os.environ.get("GOVBUY_MEMBERSHIP_CONF_GATE", "0.6"))
MEMBERSHIP_STALE_DAYS = int(os.environ.get("GOVBUY_MEMBERSHIP_STALE_DAYS", "120"))

# Supplier-match bands (PRD §7.3 / N4).
MATCH_AUTO_ACCEPT = float(os.environ.get("GOVBUY_MATCH_AUTO_ACCEPT", "0.90"))
MATCH_QUARANTINE = float(os.environ.get("GOVBUY_MATCH_QUARANTINE", "0.60"))

# Liveness threshold for the dead-man's switch (PRD §7.2 / ADR-0005).
LIVENESS_MAX_HOURS = int(os.environ.get("GOVBUY_LIVENESS_MAX_HOURS", "36"))

USER_AGENT = os.environ.get("GOVBUY_USER_AGENT", "govbuy-harness/0.1 (+https://github.com/chrisns/govbuy)")


def raw(table: str) -> str:
    return f"{PROJECT}.{RAW_DATASET}.{table}"


def pub(table: str) -> str:
    return f"{PROJECT}.{PUBLIC_DATASET}.{table}"
