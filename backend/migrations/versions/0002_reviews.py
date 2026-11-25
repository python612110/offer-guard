"""版本授权快照、持久审查任务与报告。"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mysql import DATETIME

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("review_budgets",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("day", sa.String(10), primary_key=True),
        sa.Column("used", sa.Integer(), nullable=False),
        mysql_engine="InnoDB", mysql_charset="utf8mb4", mysql_collate="utf8mb4_unicode_ci")
    op.create_table(
        "review_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("case_id", sa.String(36), sa.ForeignKey("job_cases.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("version_id", sa.String(36), sa.ForeignKey("material_versions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("digest", sa.String(64), nullable=False),
        sa.Column("model", sa.String(80), nullable=False),
        sa.Column("state", sa.String(20), nullable=False, index=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("report", sa.JSON(), nullable=True),
        sa.Column("error", sa.String(255), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("created_at", DATETIME(fsp=6), nullable=False),
        sa.Column("started_at", DATETIME(fsp=6), nullable=True),
        sa.Column("finished_at", DATETIME(fsp=6), nullable=True),
        sa.UniqueConstraint("version_id", "digest", name="uq_review_snapshot"),
        mysql_engine="InnoDB", mysql_charset="utf8mb4", mysql_collate="utf8mb4_unicode_ci",
    )


def downgrade():
    op.drop_table("review_runs")
    op.drop_table("review_budgets")
