"""Add persistent rate-limit buckets.

Revision ID: 20260908_0007
Revises: 20260908_0006
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260908_0007"
down_revision: str | None = "20260908_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rate_limit_buckets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scope", sa.String(length=64), nullable=False),
        sa.Column("key_hash", sa.String(length=64), nullable=False),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("count > 0", name="ck_rate_limit_bucket_count_positive"),
        sa.CheckConstraint("expires_at > window_started_at", name="ck_rate_limit_bucket_expiry"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scope", "key_hash", "window_started_at", name="uq_rate_limit_bucket"),
    )
    op.create_index("ix_rate_limit_buckets_expires_at", "rate_limit_buckets", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_rate_limit_buckets_expires_at", table_name="rate_limit_buckets")
    op.drop_table("rate_limit_buckets")
