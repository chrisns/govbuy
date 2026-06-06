"""govbuy ingestion CLI.

Modes:
  load-bundle PATH [--match] [--est-gbp N]   load a fact bundle (in-session / workflow path):
                                             gate -> raw event log -> rebuild public -> [CH match]
                                             -> coverage -> run ledger
  rebuild                                    rebuild public tables from verified raw facts
  match                                      Companies House match all suppliers
  coverage                                   print the §15 spend-coverage metric
  status                                     print source_status + last run
  liveness                                   dead-man's switch (exit!=0 on alert)
  refresh [--operator OP] [--max-docs N]     PROD path: walk the frontier, fetch + Anthropic
                                             extract + verify + gate + load (needs ANTHROPIC_API_KEY)
"""
from __future__ import annotations
import argparse
import json
import sys


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="govbuy-ingest")
    sub = ap.add_subparsers(dest="mode", required=True)
    lb = sub.add_parser("load-bundle"); lb.add_argument("path"); lb.add_argument("--match", action="store_true"); lb.add_argument("--est-gbp", type=float, default=0.0)
    sub.add_parser("rebuild"); sub.add_parser("match"); sub.add_parser("coverage")
    sub.add_parser("status"); sub.add_parser("liveness"); sub.add_parser("seed-reference")
    rf = sub.add_parser("refresh"); rf.add_argument("--operator", default=None); rf.add_argument("--max-docs", type=int, default=0)
    bf = sub.add_parser("backfill"); bf.add_argument("--operator", default=None)
    sub.add_parser("discover"); sub.add_parser("materialize-sibling")
    args = ap.parse_args(argv)

    from . import bq, config

    if args.mode == "load-bundle":
        bundle = json.loads(open(args.path, encoding="utf-8").read())
        stats = bq.load_bundle(bundle)
        counts = bq.rebuild_public()
        ch = bq.ch_match_suppliers() if args.match else {}
        cov = bq.coverage()
        bq.write_status(bundle["run_id"], bundle.get("mode", "refresh"), stats, cov, est_gbp=args.est_gbp)
        print(json.dumps({"load": stats, "public": counts, "ch": ch, "coverage": cov}, indent=2, default=str))
        return 0
    if args.mode == "rebuild":
        counts = bq.rebuild_public(); cov = bq.coverage()
        print(json.dumps({"public": counts, "coverage": cov}, indent=2, default=str)); return 0
    if args.mode == "match":
        print(json.dumps(bq.ch_match_suppliers(), indent=2, default=str)); return 0
    if args.mode == "coverage":
        print(json.dumps(bq.coverage(), indent=2, default=str)); return 0
    if args.mode == "status":
        ss = bq.query(f"SELECT * FROM `{config.pub('source_status')}` ORDER BY source_id")
        rs = bq.query(f"SELECT * FROM `{config.pub('run_summary')}` ORDER BY finished_at DESC LIMIT 3")
        print(json.dumps({"source_status": ss, "recent_runs": rs}, indent=2, default=str)); return 0
    if args.mode == "seed-reference":
        from .reference import seed
        print(json.dumps(seed(), indent=2)); return 0
    if args.mode == "liveness":
        from .liveness import check
        return check()
    if args.mode == "refresh":
        from .pipeline import refresh
        return refresh(operator=args.operator, max_docs=args.max_docs or None)
    if args.mode == "backfill":
        from .pipeline import backfill
        return backfill(operator=args.operator)
    if args.mode == "discover":
        from .pipeline import discover
        return discover()
    if args.mode == "materialize-sibling":
        print(json.dumps(bq.materialize_sibling(), indent=2, default=str)); return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
