"""真实浏览器联调。只清理本次生成的随机测试账号，保留其他账号的数据。"""
import os
from pathlib import Path
import secrets
import shutil
import subprocess

from sqlalchemy import select

from app.db import SessionLocal
from app.files import drain_deletions, queue_delete
from app.models import Asset, JobCase, User, Version


def main():
    node = os.environ.get("OFFERGUARD_NODE_PATH") or shutil.which("node")
    if not node:
        raise SystemExit("未找到 Node，请配置 OFFERGUARD_NODE_PATH。")
    prefix = "live-" + secrets.token_hex(8)
    emails = [prefix + "-a@example.test", prefix + "-b@example.test"]
    environment = dict(os.environ, OG_TEST_A=emails[0], OG_TEST_B=emails[1],
                       OG_TEST_PASSWORD=secrets.token_urlsafe(24))
    script = Path(__file__).resolve().parents[1] / "frontend/e2e/live-mysql.mjs"
    try:
        result = subprocess.run([node, str(script)], env=environment, timeout=120)
        if result.returncode:
            raise SystemExit(result.returncode)
    finally:
        with SessionLocal() as db:
            users = db.scalars(select(User).where(User.email.in_(emails))).all()
            for user in users:
                ids = select(JobCase.id).where(JobCase.user_id == user.id)
                queue_delete(db, db.scalars(select(Version.storage_key).where(Version.case_id.in_(ids))).all())
                queue_delete(db, db.scalars(select(Asset.storage_key).where(Asset.user_id == user.id)).all())
                db.delete(user)
            db.commit()
            drain_deletions(db)
            print("本次联调账号与文件已清理。")


if __name__ == "__main__":
    main()
