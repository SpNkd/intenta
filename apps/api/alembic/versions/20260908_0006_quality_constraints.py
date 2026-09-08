# ruff: noqa: E501
"""Add straightforward domain consistency checks.

Revision ID: 20260908_0006
Revises: 20260907_0005
"""

from collections.abc import Sequence

from alembic import op

revision = "20260908_0006"
down_revision = "20260907_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_check_constraint("ck_technique_version_positive", "techniques", "version > 0")
    op.create_check_constraint("ck_step_position_positive", "experiment_steps", "position > 0")
    op.create_check_constraint("ck_step_amount_positive", "experiment_steps", "amount_minor > 0")
    op.create_check_constraint(
        "ck_step_reflection_days_positive", "experiment_steps", "reflection_after_days > 0"
    )
    op.create_check_constraint(
        "ck_intention_positive_snapshots",
        "intentions",
        "step_position > 0 AND amount_minor > 0 AND reflection_after_days > 0 AND statement_template_version > 0 AND technique_version > 0",
    )
    op.create_check_constraint(
        "ck_intention_status_timestamps",
        "intentions",
        "(status = 'draft' AND activated_at IS NULL AND completed_at IS NULL) OR (status = 'active' AND activated_at IS NOT NULL AND completed_at IS NULL) OR (status IN ('completed', 'cancelled') AND activated_at IS NOT NULL AND completed_at IS NOT NULL)",
    )
    op.create_check_constraint(
        "ck_outcome_resolution_fields",
        "outcomes",
        "(resolution = 'happened' AND outcome_type <> 'none' AND was_expected <> 'not_applicable' AND followed_original_intention <> 'not_applicable') OR (resolution IN ('not_happened', 'uncertain') AND outcome_type = 'none' AND source_type IS NULL AND amount_received_minor IS NULL AND was_expected = 'not_applicable' AND followed_original_intention = 'not_applicable' AND occurred_at IS NULL)",
    )


def downgrade() -> None:
    for name, table in (
        ("ck_outcome_resolution_fields", "outcomes"),
        ("ck_intention_status_timestamps", "intentions"),
        ("ck_intention_positive_snapshots", "intentions"),
        ("ck_step_reflection_days_positive", "experiment_steps"),
        ("ck_step_amount_positive", "experiment_steps"),
        ("ck_step_position_positive", "experiment_steps"),
        ("ck_technique_version_positive", "techniques"),
    ):
        op.drop_constraint(name, table, type_="check")
