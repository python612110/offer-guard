"""真实 MySQL 测试夹具；完全独立于用户正在运行的数据库。"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

import pymysql
import pytest

ROOT = Path(__file__).resolve().parents[1]
MYSQLD = Path("/usr/local/mysql/bin/mysqld")


def pytest_configure(config):
    if not MYSQLD.exists():
        raise pytest.UsageError("测试需要本机安装 MySQL mysqld。")
    directory = Path(tempfile.mkdtemp(prefix=".mt-", dir=ROOT))
    config._mysql_directory = directory
    config._mysql_process = None
    data = directory / "data"
    data.mkdir()
    socket = directory / "s"
    base = [str(MYSQLD), "--no-defaults", f"--datadir={data}", f"--log-error={directory / 'mysql.log'}"]
    subprocess.run(base + ["--initialize-insecure"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    process = subprocess.Popen(base + ["--skip-networking", "--mysqlx=OFF", f"--socket={socket}",
                                      f"--pid-file={directory / 'pid'}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    config._mysql_process = process
    deadline = time.monotonic() + 25
    connection = None
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise pytest.UsageError(f"测试 MySQL 启动失败，诊断日志：{directory / 'mysql.log'}")
        try:
            connection = pymysql.connect(unix_socket=str(socket), user="root", password="")
            break
        except pymysql.MySQLError:
            time.sleep(0.2)
    if connection is None:
        raise pytest.UsageError("测试 MySQL 启动超时。")
    with connection, connection.cursor() as cursor:
        cursor.execute("CREATE DATABASE offerguard_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
    os.environ.update(MYSQL_UNIX_SOCKET=str(socket), MYSQL_USER="root", MYSQL_PASSWORD="",
                      MYSQL_DATABASE="offerguard_test", STORAGE_DIR=str(directory / "files"), COOKIE_SECURE="false")
    # 迁移通过真实命令运行，验证含空格的工作区路径也可用。
    subprocess.run([str(ROOT / ".venv/bin/alembic"), "-c", str(ROOT / "alembic.ini"), "upgrade", "head"],
                   cwd=ROOT, check=True)


def pytest_unconfigure(config):
    process = getattr(config, "_mysql_process", None)
    if process and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
    directory = getattr(config, "_mysql_directory", None)
    if directory:
        shutil.rmtree(directory)


@pytest.fixture
def client():
    from app.main import app
    from app.security import attempts
    from fastapi.testclient import TestClient
    attempts.clear()
    with TestClient(app, headers={"Origin": "http://127.0.0.1:5173"}) as client:
        yield client
