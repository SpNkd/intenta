import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Outcome(Base):
    __tablename__ = "outcomes"
    __table_args__ = (
        CheckConstraint(
            "resolution IN ('happened', 'not_happened', 'uncertain')",
            name="ck_outcome_resolution",
        ),
        CheckConstraint(
            "outcome_type IN ('money', 'other_amount', 'opportunity', 'similar', 'other', 'none')",
            name="ck_outcome_type",
        ),
        CheckConstraint(
            "source_type IS NULL OR source_type IN "
            "('gift', 'refund', 'bonus_or_cashback', 'extra_income', 'found_money', "
            "'saving_or_discount', 'other')",
            name="ck_outcome_source_type",
        ),
        CheckConstraint(
            "amount_received_minor IS NULL OR amount_received_minor >= 0", name="ck_outcome_amount"
        ),
        CheckConstraint(
            "was_expected IN ('yes', 'no', 'unsure', 'not_applicable')",
            name="ck_outcome_was_expected",
        ),
        CheckConstraint(
            "followed_original_intention IN "
            "('yes', 'not_yet', 'chose_other', 'did_not_spend', 'not_applicable')",
            name="ck_outcome_followed_original_intention",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    intention_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("intentions.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    resolution: Mapped[str] = mapped_column(String(24), nullable=False)
    outcome_type: Mapped[str] = mapped_column(String(24), nullable=False)
    source_type: Mapped[str | None] = mapped_column(String(32))
    amount_received_minor: Mapped[int | None] = mapped_column(BigInteger)
    was_expected: Mapped[str] = mapped_column(String(24), nullable=False)
    followed_original_intention: Mapped[str] = mapped_column(String(24), nullable=False)
    user_note: Mapped[str | None] = mapped_column(Text)
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
