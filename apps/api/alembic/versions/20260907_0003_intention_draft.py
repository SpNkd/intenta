"""Add experiment configuration and intention drafts.

Revision ID: 20260907_0003
Revises: 20260907_0002
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260907_0003"
down_revision: str | None = "20260907_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TECHNIQUE_ID = "10000000-0000-4000-8000-000000000001"
STEP_IDS = [f"20000000-0000-4000-8000-{position:012d}" for position in range(1, 6)]


def upgrade() -> None:
    op.create_table(
        "techniques",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("key", sa.String(64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("instruction", sa.Text(), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key", "version", name="uq_technique_key_version"),
    )
    op.create_index("ix_techniques_category", "techniques", ["category"])
    op.create_table(
        "experiment_steps",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("reflection_after_days", sa.Integer(), nullable=False),
        sa.Column("technique_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["technique_id"], ["techniques.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("position"),
    )
    op.create_table(
        "intentions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("experiment_step_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("step_position", sa.Integer(), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("reflection_after_days", sa.Integer(), nullable=False),
        sa.Column("intention_text_raw", sa.Text(), nullable=False),
        sa.Column("intention_statement", sa.Text(), nullable=False),
        sa.Column("statement_template_key", sa.String(64), nullable=False),
        sa.Column("statement_template_version", sa.Integer(), nullable=False),
        sa.Column("technique_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("technique_key", sa.String(64), nullable=False),
        sa.Column("technique_version", sa.Integer(), nullable=False),
        sa.Column("technique_title", sa.String(120), nullable=False),
        sa.Column("technique_instruction", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reflection_deferred_until", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('draft', 'active', 'completed', 'cancelled')", name="ck_intention_status"
        ),
        sa.ForeignKeyConstraint(["experiment_step_id"], ["experiment_steps.id"]),
        sa.ForeignKeyConstraint(["technique_id"], ["techniques.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["anonymous_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "step_position", name="uq_intention_user_step"),
    )
    op.create_index("ix_intentions_user_id", "intentions", ["user_id"])
    op.create_index(
        "uq_intention_user_unfinished",
        "intentions",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('draft', 'active')"),
    )

    techniques = sa.table(
        "techniques",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("key", sa.String),
        sa.column("version", sa.Integer),
        sa.column("title", sa.String),
        sa.column("instruction", sa.Text),
        sa.column("category", sa.String),
        sa.column("active", sa.Boolean),
    )
    op.bulk_insert(
        techniques,
        [
            {
                "id": TECHNIQUE_ID,
                "key": "handwritten_pause",
                "version": 1,
                "title": "Остановись на минуту",
                "instruction": (
                    "Прочитай написанное один раз. Заметь, что выбор уже сформулирован. "
                    "Затем отложи лист и возвращайся к обычным делам."
                ),
                "category": "physical_writing",
                "active": True,
            }
        ],
    )
    steps = sa.table(
        "experiment_steps",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("position", sa.Integer),
        sa.column("amount_minor", sa.BigInteger),
        sa.column("currency", sa.String),
        sa.column("reflection_after_days", sa.Integer),
        sa.column("technique_id", postgresql.UUID(as_uuid=True)),
        sa.column("active", sa.Boolean),
    )
    op.bulk_insert(
        steps,
        [
            {
                "id": STEP_IDS[index],
                "position": index + 1,
                "amount_minor": amount,
                "currency": "RUB",
                "reflection_after_days": 7,
                "technique_id": TECHNIQUE_ID,
                "active": True,
            }
            for index, amount in enumerate((50000, 100000, 200000, 500000, 1000000))
        ],
    )


def downgrade() -> None:
    op.drop_index("uq_intention_user_unfinished", table_name="intentions")
    op.drop_index("ix_intentions_user_id", table_name="intentions")
    op.drop_table("intentions")
    op.drop_table("experiment_steps")
    op.drop_index("ix_techniques_category", table_name="techniques")
    op.drop_table("techniques")
