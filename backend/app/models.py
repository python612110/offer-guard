from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.mysql import DATETIME

from .db import Base

Timestamp = DateTime().with_variant(DATETIME(fsp=6), "mysql")


def uid():
    return str(uuid4())


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(254, collation="utf8mb4_bin"), unique=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    profile: Mapped[dict] = mapped_column(JSON, default=lambda: {"name": "", "school": "", "role": ""})
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=now)


class Session(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    csrf: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(Timestamp)


class JobCase(Base):
    __tablename__ = "job_cases"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    company: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(100))
    city: Mapped[str] = mapped_column(String(50), default="")
    deadline: Mapped[str] = mapped_column(String(10), default="")
    stage: Mapped[str] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=now)


class Material(Base):
    __tablename__ = "materials"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("job_cases.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    type: Mapped[str] = mapped_column(String(30))
    current_version_id: Mapped[str] = mapped_column(String(36), default="")
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=now)


class Version(Base):
    __tablename__ = "material_versions"
    __table_args__ = (UniqueConstraint("material_id", "number", name="uq_material_version"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    material_id: Mapped[str] = mapped_column(ForeignKey("materials.id", ondelete="CASCADE"), index=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("job_cases.id", ondelete="CASCADE"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    filename: Mapped[str] = mapped_column(String(255))
    mime: Mapped[str] = mapped_column(String(100))
    storage_key: Mapped[str] = mapped_column(String(36), unique=True)
    size: Mapped[int] = mapped_column(Integer)
    pages: Mapped[list] = mapped_column(JSON)
    parse_state: Mapped[str] = mapped_column(String(30))
    parse_note: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=now)


class Todo(Base):
    __tablename__ = "todos"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("job_cases.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(Text)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=now)


class Communication(Base):
    __tablename__ = "communications"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("job_cases.id", ondelete="CASCADE"), index=True)
    question: Mapped[str] = mapped_column(Text)
    reply: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=now)


class Event(Base):
    __tablename__ = "timeline_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("job_cases.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(100))
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=now)


class Asset(Base):
    __tablename__ = "personal_assets"
    __table_args__ = (UniqueConstraint("user_id", "type", name="uq_user_asset_type"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(20))
    filename: Mapped[str] = mapped_column(String(255))
    mime: Mapped[str] = mapped_column(String(100))
    storage_key: Mapped[str] = mapped_column(String(36), unique=True)
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=now)


class FileDeletion(Base):
    """持久化删除队列：数据库提交后清理原件，失败可重试。"""
    __tablename__ = "file_deletions"
    storage_key: Mapped[str] = mapped_column(String(36), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=now)


class ReviewRun(Base):
    __tablename__ = "review_runs"
    __table_args__ = (UniqueConstraint("version_id", "digest", name="uq_review_snapshot"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("job_cases.id", ondelete="CASCADE"), index=True)
    version_id: Mapped[str] = mapped_column(ForeignKey("material_versions.id", ondelete="CASCADE"), index=True)
    digest: Mapped[str] = mapped_column(String(64))
    model: Mapped[str] = mapped_column(String(80))
    state: Mapped[str] = mapped_column(String(20), index=True, default="queued")
    payload: Mapped[dict] = mapped_column(JSON)
    report: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str] = mapped_column(String(255), default="")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=now)
    started_at: Mapped[datetime | None] = mapped_column(Timestamp, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(Timestamp, nullable=True)


class ReviewBudget(Base):
    __tablename__ = "review_budgets"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    day: Mapped[str] = mapped_column(String(10), primary_key=True)
    used: Mapped[int] = mapped_column(Integer, default=0)


class CaseRecord(Base):
    """用户核对与决定快照，按事项隔离，保留历史。"""
    __tablename__ = "case_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("job_cases.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=now)


class ReviewQuestion(Base):
    __tablename__ = "review_questions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("review_runs.id", ondelete="CASCADE"), index=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("job_cases.id", ondelete="CASCADE"), index=True)
    question: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String(20), default="running")
    answer: Mapped[str] = mapped_column(Text, default="")
    citations: Mapped[list] = mapped_column(JSON, default=list)
    error: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=now)


class Annotation(Base):
    __tablename__ = "annotations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("job_cases.id", ondelete="CASCADE"), index=True)
    version_id: Mapped[str] = mapped_column(ForeignKey("material_versions.id", ondelete="CASCADE"), index=True)
    anchor: Mapped[dict] = mapped_column(JSON)
    note: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=now)
