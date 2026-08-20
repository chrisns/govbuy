"""materialize_sibling() must tolerate sibling_call_off_awards already being a TABLE (the
steady state after the first run) and only re-raise genuinely different DROP VIEW failures.
Regression for github.com/chrisns/govbuy/actions/runs/32382463182."""
from google.api_core import exceptions as google_exceptions
import pytest
from govbuy_ingest import bq


class FakeJob:
    def __init__(self, rows=None, raise_=None):
        self._rows = rows or []
        self._raise = raise_

    def result(self):
        if self._raise:
            raise self._raise
        return self._rows


class FakeClient:
    def __init__(self, drop_error):
        self.drop_error = drop_error

    def query(self, sql):
        if sql.strip().startswith("DROP VIEW"):
            return FakeJob(raise_=self.drop_error)
        if sql.strip().startswith("SELECT COUNT"):
            return FakeJob(rows=[{"n": 3}])
        return FakeJob()


def test_materialize_sibling_tolerates_existing_table(monkeypatch):
    err = google_exceptions.BadRequest(
        "Cannot drop govreposcrape:govbuy_public.sibling_call_off_awards which has type TABLE. "
        "A view was expected."
    )
    monkeypatch.setattr(bq, "client", lambda: FakeClient(err))
    assert bq.materialize_sibling() == {"sibling_call_off_awards_rows": 3}


def test_materialize_sibling_reraises_other_drop_errors(monkeypatch):
    err = google_exceptions.BadRequest("Some unrelated syntax error")
    monkeypatch.setattr(bq, "client", lambda: FakeClient(err))
    with pytest.raises(google_exceptions.BadRequest):
        bq.materialize_sibling()


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
