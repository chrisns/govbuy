# CI reaches Claude with Workload Identity Federation, not a stored API key

**Status:** accepted (2026-10-21)

**Amends:** [ADR-0006](0006-scheduled-github-actions-refresh.md) (the `GOVBUY_ANTHROPIC_API_KEY` secret).

The Sunday full refresh walks the LLM-based agentic sources through the Anthropic API. It used a
long-lived API key held as a GitHub Actions secret. It now holds nothing: the job asks GitHub for an
OIDC identity token and exchanges it at Anthropic for a ten-minute access token
(`govbuy_ingest.llm`). A leaked secret is no longer a way in, and the credential cannot outlive the
run.

## What Anthropic will accept

A federation rule in the Claude Console (`govbuy-refresh`, issuer `github-actions`) mints a token
only when **every** one of these holds, so a fork, a pull request, another branch, another workflow
or a renamed or transferred repo cannot get one:

- `sub` is exactly `repo:chrisns/govbuy:ref:refs/heads/main` (no wildcard, so pull-request runs, which
  have a different `sub`, never match);
- `repository_id` is `1265390175` and `repository_owner_id` is `715120` (GitHub's immutable ids, so a
  repo recreated under the same name does not match), and `repository` is `chrisns/govbuy`;
- `job_workflow_ref` is `chrisns/govbuy/.github/workflows/govbuy-refresh.yml@refs/heads/main`: only
  this workflow file as it exists on `main`;
- the audience is `https://api.anthropic.com`.

The rule targets service account `govbuy-ci` in the **govbuy workspace only** (not Default).

## Limiting the blast radius

Even a successful impersonation is boxed in by the workspace, which is configured in the Console:

- **Spend:** $20 a month.
- **Rate limits, per minute:** Haiku 5.5 100 requests / 1M in / 200K out; Sonnet 5.5 20 / 200K / 40K;
  Opus 5.5 10 / 100K / 20K (fast mode 10K / 2K). Every other model (Fable 5, Opus 5, Sonnet 5, all
  4.x), batch requests and web search are cut to the minimum (1 request, 1K tokens).
- The Console only offers `workspace:developer` or `org:admin` as a rule scope, so the token carries
  developer access within the govbuy workspace; there is no inference-only scope to pick.

Changing a model in `config.py` therefore means raising its limit in the Console first, or calls
fail with a 429.

## Models

`claude-haiku-5-5` extracts, `claude-sonnet-5-5` verifies, `claude-opus-5-5` discovers (previously
Haiku 4.5, Sonnet 5, Opus 5). Prices in `config.PRICES_USD_PER_MTOK` follow the 5.5 price list; Haiku
uses its upper (over 100k prompt tokens) tier so the cost ceiling never under-counts.

## Consequences

- Each GitHub token is single-use and lives about five minutes, so `llm.py` fetches a fresh one on
  every exchange rather than caching a file; never export `ANTHROPIC_API_KEY` in the job, because it
  outranks federation silently.
- Local runs still use `ANTHROPIC_API_KEY` from `.env`; take it from the govbuy workspace so the same
  limits apply.
- The Console ids live in `govbuy-refresh.yml` (identifiers, not secrets). Recreating the rule or
  service account means updating them there.
- `GOVBUY_ANTHROPIC_API_KEY` is no longer read and can be deleted from the repo secrets once a
  scheduled or manual `full=true` run has succeeded.
