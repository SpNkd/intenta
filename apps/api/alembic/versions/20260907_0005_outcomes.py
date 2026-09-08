"""Add outcomes for completed intentions.

Revision ID: 20260907_0005
Revises: 20260907_0004
Create Date: 2026-09-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260907_0005"
down_revision: str | None = "20260907_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "outcomes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("intention_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("resolution", sa.String(length=24), nullable=False),
        sa.Column("outcome_type", sa.String(length=24), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=True),
        sa.Column("amount_received_minor", sa.BigInteger(), nullable=True),
        sa.Column("was_expected", sa.String(length=24), nullable=False),
        sa.Column("followed_original_intention", sa.String(length=24), nullable=False),
        sa.Column("user_note", sa.Text(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "resolution IN ('happened', 'not_happened', 'uncertain')", name="ck_outcome_resolution"
        ),
        sa.CheckConstraint(
            "outcome_type IN ('money', 'other_amount', 'opportunity', 'similar', 'other', 'none')",
            name="ck_outcome_type",
        ),
        sa.CheckConstraint(
            "source_type IS NULL OR source_type IN "
            "('gift', 'refund', 'bonus_or_cashback', 'extra_income', 'found_money', "
            "'saving_or_discount', 'other')",
            name="ck_outcome_source_type",
        ),
        sa.CheckConstraint(
            "amount_received_minor IS NULL OR amount_received_minor >= 0", name="ck_outcome_amount"
        ),
        sa.CheckConstraint(
            "was_expected IN ('yes', 'no', 'unsure', 'not_applicable')",
            name="ck_outcome_was_expected",
        ),
        sa.CheckConstraint(
            "followed_original_intention IN "
            "('yes', 'not_yet', 'chose_other', 'did_not_spend', 'not_applicable')",
            name="ck_outcome_followed_original_intention",
        ),
        sa.ForeignKeyConstraint(["intention_id"], ["intentions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("intention_id"),
    )


def downgrade() -> None:
    op.drop_table("outcomes")
