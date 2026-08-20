"""CREATE OR REPLACE TABLE can't change an existing table's CLUSTER BY spec — BigQuery requires
DROP + recreate instead. Every clustered materialize_* table must be dropped first so a table
that predates clustering (or has a different spec) doesn't blow up the run. Regression for
github.com/chrisns/govbuy/actions/runs/32383346205 (materialize_fusion / tender_award)."""
import pytest
from govbuy_ingest import bq


class FakeJob:
    def __init__(self, rows=None):
        self._rows = rows or []

    def result(self):
        return self._rows


class RecordingClient:
    def __init__(self):
        self.statements = []

    def query(self, sql):
        self.statements.append(sql.strip())
        if sql.strip().startswith("SELECT COUNT"):
            return FakeJob(rows=[{"n": 0}])
        return FakeJob()


def _assert_drop_before_create(statements: list[str], table: str) -> None:
    drop_i = next(i for i, s in enumerate(statements) if s == f"DROP TABLE IF EXISTS `{table}`")
    create_i = next(i for i, s in enumerate(statements) if f"CREATE OR REPLACE TABLE `{table}` CLUSTER BY" in s)
    assert drop_i < create_i, f"{table}: DROP must run before CREATE OR REPLACE"


def test_materialize_fusion_drops_clustered_tables_before_recreate(monkeypatch):
    fake = RecordingClient()
    monkeypatch.setattr(bq, "client", lambda: fake)
    bq.materialize_fusion()
    for table in ("tender_award", "supplier_calloff_total", "live_opportunity", "pipeline_notice"):
        _assert_drop_before_create(fake.statements, bq.config.pub(table))


def test_materialize_track_record_drops_before_recreate(monkeypatch):
    fake = RecordingClient()
    monkeypatch.setattr(bq, "client", lambda: fake)
    bq.materialize_track_record()
    _assert_drop_before_create(fake.statements, bq.config.pub("supplier_track_record"))


def test_materialize_observed_drops_before_recreate(monkeypatch):
    fake = RecordingClient()
    monkeypatch.setattr(bq, "client", lambda: fake)
    bq.materialize_observed()
    _assert_drop_before_create(fake.statements, bq.config.pub("observed_membership"))


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
