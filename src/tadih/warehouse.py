"""Small versioned DuckDB warehouse; no spatial downscaling or implicit joins."""

import json
from pathlib import Path

import duckdb

from .quality import FIELDS, validate_observation


def connect(path=":memory:"):
    if str(path) != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = duckdb.connect(str(path))
    columns = ", ".join(f'"{key}" ' + ("DOUBLE" if key == "value" else "VARCHAR") for key in FIELDS)
    db.execute(f"CREATE TABLE IF NOT EXISTS observations ({columns}, PRIMARY KEY(observation_id, revision_id))")
    # shortcut: caller supplies source revision IDs; add provider-specific revision mapping with each adapter.
    db.execute("""CREATE OR REPLACE VIEW latest_observations AS
        SELECT * EXCLUDE (revision_rank) FROM (
          SELECT *, row_number() OVER (
            PARTITION BY observation_id ORDER BY COALESCE(release_at, retrieved_at) DESC,
            retrieved_at DESC, revision_id DESC
          ) AS revision_rank FROM observations
        ) WHERE revision_rank = 1""")
    return db


def ingest_rows(db, rows):
    clean = [validate_observation(row) for row in rows]
    # Timestamps compare lexically in SQL only after canonical UTC normalization.
    from .quality import timestamp
    for row in clean:
        for field in ("observed_at", "release_at", "retrieved_at"):
            if row[field] is not None:
                row[field] = timestamp(row[field]).isoformat()
    db.execute("BEGIN")
    try:
        ids = list({row["observation_id"] for row in clean})
        existing_rows = db.execute("SELECT * FROM observations WHERE observation_id IN (SELECT unnest(?))", [ids]).fetchall()
        versions = {(row[0], row[FIELDS.index("revision_id")]): dict(zip(FIELDS, row)) for row in existing_rows}
        identities = {row[0]: dict(zip(FIELDS, row)) for row in existing_rows}
        additions = []
        identity_fields = ("source_id", "area_code", "spatial_support", "location_id", "commodity_id",
                           "observed_at", "measure", "unit", "market_id", "price_type", "grade", "season")
        for row in clean:
            previous_identity = identities.setdefault(row["observation_id"], row)
            if previous_identity:
                if any(previous_identity[key] != row[key] for key in identity_fields):
                    raise ValueError("observation_id cannot change series identity across revisions")
            key = (row["observation_id"], row["revision_id"])
            existing = versions.get(key)
            if existing:
                # Same revision may be fetched again, but must never overwrite changed historical values.
                comparable = [key for key in FIELDS if key != "retrieved_at"]
                if any(existing[field] != row[field] for field in comparable):
                    raise ValueError("changed payload requires a new revision_id")
            else:
                versions[key] = row
                additions.append([row[field] for field in FIELDS])
        if additions:
            placeholders = ",".join("?" for _ in FIELDS)
            db.executemany(f"INSERT INTO observations VALUES ({placeholders})", additions)
        db.execute("COMMIT")
    except Exception:
        db.execute("ROLLBACK")
        raise
    return len(clean)


def load_json_rows(db, path):
    with Path(path).open(encoding="utf-8-sig") as handle:
        rows = json.load(handle)
    if not isinstance(rows, list):
        raise ValueError("input must be a JSON array of normalized observations")
    return ingest_rows(db, rows)
