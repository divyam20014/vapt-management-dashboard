"""Small, idempotent schema upgrades for existing SQLite databases.

`Base.metadata.create_all` creates missing tables but never changes existing ones. Each step
below inspects the live schema and only acts when an older layout is found, so it is safe to run
on every start. Steps must never discard data that holds information.
"""

import logging

from sqlalchemy import Connection, text
from sqlalchemy.engine import Engine

from app.database.base import Base

logger = logging.getLogger(__name__)


def _columns(conn: Connection, table: str) -> dict[str, str]:
    return {row[1]: (row[2] or "").upper() for row in conn.execute(text(f"PRAGMA table_info({table})"))}


def _findings_assigned_to_is_user_reference(conn: Connection) -> None:
    """Phase 2 stored `findings.assigned_to` as free text; Phase 3 references users.id."""
    column_type = _columns(conn, "findings").get("assigned_to")
    if column_type is None or not column_type.startswith("VARCHAR"):
        return
    in_use = conn.execute(text("SELECT COUNT(*) FROM findings WHERE assigned_to IS NOT NULL")).scalar_one()
    if in_use:
        raise RuntimeError(
            "findings.assigned_to contains free-text values that cannot be converted to user references automatically."
        )
    conn.execute(text("ALTER TABLE findings DROP COLUMN assigned_to"))
    conn.execute(text("ALTER TABLE findings ADD COLUMN assigned_to INTEGER REFERENCES users(id)"))
    logger.info("Migration: findings.assigned_to now references users.id")


STEPS = [_findings_assigned_to_is_user_reference]


def upgrade(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as conn:
        for step in STEPS:
            step(conn)
        # Indexes declared on tables that already existed are not created by create_all.
        for table in Base.metadata.sorted_tables:
            for index in table.indexes:
                index.create(conn, checkfirst=True)
