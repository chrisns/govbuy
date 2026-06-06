"""Per-run token cost accounting + soft ceiling (PRD §7.2/§11.1 / ADR-0005).

Reports tokens + estimated £, broken down BOTH by model tier and by operator (£-per-operator,
PRD §7.2); a configurable soft ceiling warns then pauses (the pipeline must not build-and-swap on
a paused run).
"""
from __future__ import annotations
from dataclasses import dataclass, field
from . import config


def _gbp(model: str, tin: int, tout: int) -> float:
    pin, pout = config.PRICES_USD_PER_MTOK.get(model, (3.0, 15.0))
    return ((tin / 1e6) * pin + (tout / 1e6) * pout) * config.USD_GBP


@dataclass
class CostMeter:
    by_tier: dict = field(default_factory=dict)          # model -> [tin, tout]
    by_op: dict = field(default_factory=dict)            # (operator, model) -> [tin, tout]

    def add(self, model: str, tokens_in: int, tokens_out: int, operator: str | None = None) -> None:
        cur = self.by_tier.setdefault(model, [0, 0])
        cur[0] += int(tokens_in); cur[1] += int(tokens_out)
        if operator:
            o = self.by_op.setdefault((operator, model), [0, 0])
            o[0] += int(tokens_in); o[1] += int(tokens_out)

    def gbp(self) -> float:
        return round(sum(_gbp(m, tin, tout) for m, (tin, tout) in self.by_tier.items()), 4)

    def breakdown(self) -> list[dict]:
        return [{"tier": m, "tokens_in": tin, "tokens_out": tout, "est_gbp": round(_gbp(m, tin, tout), 4)}
                for m, (tin, tout) in self.by_tier.items()]

    def by_operator(self) -> list[dict]:
        agg: dict[str, float] = {}
        for (op, model), (tin, tout) in self.by_op.items():
            agg[op] = round(agg.get(op, 0.0) + _gbp(model, tin, tout), 4)
        return [{"operator_id": op, "est_gbp": g} for op, g in sorted(agg.items())]

    def status(self) -> str:
        g = self.gbp()
        if g >= config.CEILING_PAUSE_GBP:
            return "pause"
        if g >= config.CEILING_WARN_GBP:
            return "warn"
        return "ok"
