import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RecoveryCredential(Base):
    __tablename__ = "recovery_credentials"
    __table_args__ = (
        Index("ix_recovery_credentials_user_id", "user_id"),
        Index(
            "uq_recovery_credentials_active_user",
            "user_id",
            unique=True,
            postgresql_where=text("disabled_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("anonymous_users.id", ondelete="CASCADE"), nullable=False
    )
    public_id: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    secret_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
