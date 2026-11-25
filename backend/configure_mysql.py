"""交互式配置本机 MySQL。密码仅通过隐藏输入读取，不输出到终端。"""
import getpass
import os
from pathlib import Path
import secrets
import subprocess
import sys

import pymysql

ROOT = Path(__file__).resolve().parent


def main(admin=None, password=None):
    if (ROOT / ".env").exists():
        print("已有 backend/.env，未覆盖。请检查配置后执行 .venv/bin/alembic upgrade head。")
        return
    print("将创建 offerguard 数据库和专用本机用户，并执行首批建表迁移。")
    if admin is None:
        admin = input("MySQL 管理账号 [root]: ").strip() or "root"
    if password is None:
        password = getpass.getpass("MySQL 管理账号密码（不显示）: ")
    username = "og_" + secrets.token_hex(6)
    app_password = secrets.token_urlsafe(32)
    try:
        connection = pymysql.connect(host="127.0.0.1", port=3306, user=admin, password=password, charset="utf8mb4")
        with connection, connection.cursor() as cursor:
            cursor.execute("CREATE DATABASE IF NOT EXISTS offerguard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            cursor.execute("CREATE USER %s@'localhost' IDENTIFIED BY %s", (username, app_password))
            cursor.execute("GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, DROP ON offerguard.* TO %s@'localhost'", (username,))
        content = (f"MYSQL_HOST=127.0.0.1\nMYSQL_PORT=3306\nMYSQL_DATABASE=offerguard\n"
                   f"MYSQL_USER={username}\nMYSQL_PASSWORD={app_password}\nCOOKIE_SECURE=false\n"
                   'ALLOWED_ORIGINS=["http://127.0.0.1:5173","http://localhost:5173"]\n')
        with os.fdopen(os.open(ROOT / ".env", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as file:
            file.write(content)
    except pymysql.MySQLError:
        print("MySQL 配置失败：请检查账号、密码和建库授权。未输出凭据。", file=sys.stderr)
        sys.exit(1)
    subprocess.run([str(ROOT / ".venv/bin/alembic"), "-c", str(ROOT / "alembic.ini"), "upgrade", "head"], cwd=ROOT, check=True)
    print("MySQL 已配置并完成迁移。运行 .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000")


if __name__ == "__main__":
    main()
