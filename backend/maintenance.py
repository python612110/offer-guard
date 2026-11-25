"""重试删除原件。只操作数据库中已授权删除的队列，不扫描其他目录。"""
from app.db import SessionLocal
from app.files import drain_deletions

if __name__ == "__main__":
    with SessionLocal() as db:
        drain_deletions(db)
    print("文件删除队列已处理。")
