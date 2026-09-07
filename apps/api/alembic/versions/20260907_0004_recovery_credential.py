"""Add one-time recovery credentials.

Revision ID: 20260907_0004
Revises: 20260907_0003
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260907_0004"
down_revision: str | None = "20260907_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "anonymous_users",
        sa.Column("recovery_code_acknowledged_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "recovery_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("public_id", sa.String(32), nullable=False),
        sa.Column("secret_hash", sa.String(255), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["anonymous_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("public_id"),
    )
    op.create_index("ix_recovery_credentials_user_id", "recovery_credentials", ["user_id"])
    op.create_index(
        "uq_recovery_credentials_active_user",
        "recovery_credentials",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("disabled_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_recovery_credentials_active_user", table_name="recovery_credentials")
    op.drop_index("ix_recovery_credentials_user_id", table_name="recovery_credentials")
    op.drop_table("recovery_credentials")
    op.drop_column("anonymous_users", "recovery_code_acknowledged_at")
