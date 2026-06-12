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
    sub.add_parser("discover"); sub.add_parser("materialize-sibling"); sub.add_parser("gca-sync"); sub.add_parser("gcloud-sync")
    gss = sub.add_parser("gcloud-services-sync"); gss.add_argument("--detail", action="store_true"); gss.add_argument("--max-pages", type=int, default=0)
    gsc = sub.add_parser("gcloud-services-shard"); gsc.add_argument("--lots", required=True); gsc.add_argument("--pages", required=True); gsc.add_argument("--out", required=True); gsc.add_argument("--no-detail", action="store_true")
    gsb = sub.add_parser("gcloud-services-bundle"); gsb.add_argument("--glob", required=True); gsb.add_argument("--out", required=True)
    cat = sub.add_parser("catalogues-sync"); cat.add_argument("--only", default="ndx,nhsbc")
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
        out = bq.materialize_sibling(); out.update(bq.materialize_track_record()); out.update(bq.materialize_fusion()); out.update(bq.materialize_observed())
        print(json.dumps(out, indent=2, default=str)); return 0
    if args.mode == "gca-sync":
        from .gca_api import sync as fw_sync
        from .gca_suppliers import sync as sup_sync
        from .gcloud_dm import sync as gc_sync
        fb, nf = fw_sync()
        sb, ns = sup_sync()
        gb, ng = gc_sync()
        bundle = {"run_id": "gca-api-sync", "mode": "refresh",
                  "documents": fb["documents"] + sb["documents"] + gb["documents"],
                  "facts": fb["facts"] + sb["facts"] + gb["facts"]}
        stats = bq.load_bundle(bundle)
        counts = bq.rebuild_public()
        ch = bq.ch_match_suppliers()  # incremental: carries forward resolved CRNs, matches only new names
        cov = bq.coverage()
        bq.write_status(bundle["run_id"], "refresh", stats, cov, est_gbp=0.0)
        print(json.dumps({"frameworks": nf, "gca_suppliers": ns, "gcloud_suppliers": ng, "load": stats, "public": counts, "ch": ch, "coverage": cov}, indent=2, default=str))
        return 0
    if args.mode == "gcloud-sync":
        from .gcloud_dm import sync as gc_sync
        gb, ng = gc_sync()
        stats = bq.load_bundle(gb)
        counts = bq.rebuild_public()
        ch = bq.ch_match_suppliers()  # incremental
        cov = bq.coverage()
        bq.write_status(gb["run_id"], "refresh", stats, cov, est_gbp=0.0)
        print(json.dumps({"gcloud_suppliers": ng, "load": stats, "public": counts, "ch": ch, "coverage": cov}, indent=2, default=str))
        return 0
    if args.mode == "gcloud-services-sync":
        from .gcloud_services import sync as svc_sync
        bundle, n = svc_sync(detail=args.detail, max_pages=args.max_pages or None)
        stats = bq.load_bundle(bundle)
        counts = bq.rebuild_public()
        print(json.dumps({"services": n, "load": stats, "public": counts}, indent=2, default=str))
        return 0
    if args.mode == "gcloud-services-shard":
        from .gcloud_services import crawl_shard
        lots = [x for x in args.lots.split(",") if x]
        a, b = (int(x) for x in args.pages.split("-"))
        crawl_shard(lots, a, b, args.out, detail=not args.no_detail)
        return 0
    if args.mode == "catalogues-sync":
        from . import catalogues as cat
        only = set(x.strip() for x in args.only.split(",") if x.strip())
        runners = {"ndx": cat.ndx_sync, "nhsbc": cat.nhsbc_sync, "espo": cat.espo_sync,
                   "ypo": cat.ypo_sync, "azure": cat.azure_sync}
        out = {}
        for key in only:
            if key not in runners:
                continue
            bundle, n = runners[key]()
            stats = bq.load_bundle(bundle)
            out[key] = {"records": n, "load": stats}
        counts = bq.rebuild_public()
        print(json.dumps({"catalogues": out, "public_service_rows": counts.get("service")}, indent=2, default=str))
        return 0
    if args.mode == "gcloud-services-bundle":
        import glob
        from .gcloud_services import to_bundle
        recs = []
        for path in sorted(glob.glob(args.glob)):
            for line in open(path, encoding="utf-8"):
                line = line.strip()
                if line:
                    recs.append(json.loads(line))
        # dedup by service_id (shards may overlap at lot boundaries)
        recs = list({r["service_id"]: r for r in recs}.values())
        bundle = to_bundle(recs, run_id="gcloud-services-detail")
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(bundle, f, ensure_ascii=False)
        print(json.dumps({"records": len(recs), "documents": len(bundle["documents"]), "facts": len(bundle["facts"]), "out": args.out}))
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
