"""OfferGuard 首批账号与业务表。此迁移保持独立定义，不引用运行时模型。"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mysql import DATETIME

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def id_column():
    return sa.Column("id", sa.String(36), primary_key=True)


def owner_column():
    return sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)


def case_column():
    return sa.Column("case_id", sa.String(36), sa.ForeignKey("job_cases.id", ondelete="CASCADE"), nullable=False, index=True)


def created_column():
    return sa.Column("created_at", DATETIME(fsp=6), nullable=False)


def col(name, type):
    return sa.Column(name, type, nullable=False)


def table(name, *columns):
    op.create_table(name, *columns, mysql_engine="InnoDB", mysql_charset="utf8mb4", mysql_collate="utf8mb4_unicode_ci")


def upgrade():
    table("users", id_column(), col("email", sa.String(254, collation="utf8mb4_bin")),
          col("password_hash", sa.String(256)), col("profile", sa.JSON()), created_column(),
          sa.UniqueConstraint("email", name="uq_user_email"))
    table("sessions", sa.Column("token_hash", sa.String(64), primary_key=True), owner_column(),
          col("csrf", sa.String(64)), col("expires_at", DATETIME(fsp=6)))
    table("job_cases", id_column(), owner_column(), col("company", sa.String(100)),
          col("role", sa.String(100)), col("city", sa.String(50)), col("deadline", sa.String(10)),
          col("stage", sa.String(30)), created_column())
    table("materials", id_column(), case_column(), col("title", sa.String(255)),
          col("type", sa.String(30)), col("current_version_id", sa.String(36)), created_column())
    table("material_versions", id_column(), case_column(),
          sa.Column("material_id", sa.String(36), sa.ForeignKey("materials.id", ondelete="CASCADE"), nullable=False, index=True),
          col("number", sa.Integer()), col("filename", sa.String(255)), col("mime", sa.String(100)),
          col("storage_key", sa.String(36)), col("size", sa.Integer()), col("pages", sa.JSON()),
          col("parse_state", sa.String(30)), col("parse_note", sa.Text()), created_column(),
          sa.UniqueConstraint("material_id", "number", name="uq_material_version"),
          sa.UniqueConstraint("storage_key", name="uq_version_storage"))
    table("todos", id_column(), case_column(), col("title", sa.Text()), col("done", sa.Boolean()), created_column())
    table("communications", id_column(), case_column(), col("question", sa.Text()), col("reply", sa.Text()), created_column())
    table("timeline_events", id_column(), case_column(), col("title", sa.String(100)), col("detail", sa.Text()), created_column())
    table("personal_assets", id_column(), owner_column(), col("type", sa.String(20)),
          col("filename", sa.String(255)), col("mime", sa.String(100)), col("storage_key", sa.String(36)),
          created_column(), sa.UniqueConstraint("user_id", "type", name="uq_user_asset_type"),
          sa.UniqueConstraint("storage_key", name="uq_asset_storage"))
    table("file_deletions", sa.Column("storage_key", sa.String(36), primary_key=True), created_column())


def downgrade():
    for name in ("file_deletions", "personal_assets", "timeline_events", "communications", "todos",
                 "material_versions", "materials", "job_cases", "sessions", "users"):
        op.drop_table(name)
