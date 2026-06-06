"""Per-run token cost accounting + soft ceiling (PRD §11.1 / ADR-0005).

Reports tokens + estimated £ + per-tier breakdown every run; a configurable soft ceiling
warns then pauses (the pipeline must not build-and-swap on a paused run).
"""
from __future__ import annotations
from dataclasses import dataclass, field
from . import config


@dataclass
class CostMeter:
    by_tier: dict = field(default_factory=dict)  # model -> [tin, tout]

    def add(self, model: str, tokens_in: int, tokens_out: int) -> None:
        cur = self.by_tier.setdefault(model, [0, 0])
        cur[0] += int(tokens_in)
        cur[1] += int(tokens_out)

    def gbp(self) -> float:
        total = 0.0
        for model, (tin, tout) in self.by_tier.items():
            pin, pout = config.PRICES_USD_PER_MTOK.get(model, (3.0, 15.0))
            total += (tin / 1e6) * pin + (tout / 1e6) * pout
        return round(total * config.USD_GBP, 4)

    def breakdown(self) -> list[dict]:
        out = []
        for model, (tin, tout) in self.by_tier.items():
            pin, pout = config.PRICES_USD_PER_MTOK.get(model, (3.0, 15.0))
            gbp = round(((tin / 1e6) * pin + (tout / 1e6) * pout) * config.USD_GBP, 4)
            out.append({"tier": model, "tokens_in": tin, "tokens_out": tout, "est_gbp": gbp})
        return out

    def status(self) -> str:
        """'ok' | 'warn' | 'pause' against the configured soft ceiling."""
        g = self.gbp()
        if g >= config.CEILING_PAUSE_GBP:
            return "pause"
        if g >= config.CEILING_WARN_GBP:
            return "warn"
        return "ok"
