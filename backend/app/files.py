import io
import os
import zipfile
from pathlib import Path
from uuid import uuid4
from xml.etree import ElementTree

from fastapi import HTTPException, UploadFile
from PIL import Image
from pypdf import PdfReader
from sqlalchemy import select

from .config import settings
from .models import FileDeletion

MIMES = {"txt": "text/plain", "md": "text/markdown", "pdf": "application/pdf",
         "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
         "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp"}


def path_for(key: str):
    # 只接受服务端生成的 UUID，不使用上传文件名构造路径。
    from uuid import UUID
    if str(UUID(key)) != key:
        raise ValueError("Invalid storage key")
    return settings.storage_dir / key


async def read_upload(upload: UploadFile, asset=False):
    filename = Path((upload.filename or "").replace("\\", "/")).name
    ext = filename.rsplit(".", 1)[-1].lower()
    allowed = ("png", "jpg", "jpeg", "webp") if asset else MIMES
    if ext not in allowed or len(filename) > 255:
        raise HTTPException(422, "文件类型或文件名不支持。")
    limit = (5 if asset else 20) * 1024 * 1024
    chunks, size = [], 0
    while chunk := await upload.read(65536):
        size += len(chunk)
        if size > limit:
            raise HTTPException(413, f"文件不能超过 {limit // 1024 // 1024} MB。")
        chunks.append(chunk)
    if not size:
        raise HTTPException(422, "不能上传空文件。")
    content = b"".join(chunks)
    try:
        from starlette.concurrency import run_in_threadpool
        pages, note = await run_in_threadpool(parse, content, ext)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(422, "无法读取文件，请检查格式、密码保护或文件损坏。")
    return filename, MIMES[ext], content, pages, note


def parse(content: bytes, ext: str):
    note = ""
    if ext in ("txt", "md"):
        text = content.decode("utf-8-sig")
        if "\x00" in text:
            raise ValueError("Binary file")
        pages = [{"number": 1, "text": text}]
    elif ext == "docx":
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            if sum(i.file_size for i in archive.infolist()) > 50 * 1024 * 1024:
                raise HTTPException(422, "DOCX 解压大小超过限制。")
            xml = archive.read("word/document.xml")
            if b"<!DOCTYPE" in xml or b"<!ENTITY" in xml:
                raise ValueError("Unsupported XML")
            root = ElementTree.fromstring(xml)
            ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
            text = "\n".join("".join(p.itertext()) for p in root.findall(".//w:p", ns))
            pages = [{"number": 1, "text": text}]
            note = "正文文本已提取；分页和排版请对照原件。"
    elif ext == "pdf":
        reader = PdfReader(io.BytesIO(content))
        if reader.is_encrypted:
            raise HTTPException(422, "请先移除 PDF 密码保护。")
        if len(reader.pages) > 150:
            raise HTTPException(422, "PDF 不能超过 150 页。")
        pages = [{"number": i + 1, "text": page.extract_text() or ""}
                 for i, page in enumerate(reader.pages)]
        note = "文字顺序可能受版式影响；扫描页需 OCR，当前未接入。"
    else:
        with Image.open(io.BytesIO(content)) as image:
            if image.format != {"png": "PNG", "jpg": "JPEG", "jpeg": "JPEG", "webp": "WEBP"}[ext]:
                raise ValueError("Image type mismatch")
            if image.width * image.height > 25_000_000:
                raise HTTPException(422, "图片像素过大，请压缩后上传。")
            image.verify()
        pages = []
        note = "图片原件已保存；OCR 尚未接入。"
    if sum(len(p["text"]) for p in pages) > 2_000_000:
        raise HTTPException(422, "解析文本过长，请拆分材料。")
    return pages, note


def save_file(content: bytes):
    settings.storage_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    key = str(uuid4())
    with os.fdopen(os.open(path_for(key), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as file:
        file.write(content)
    return key


def queue_delete(db, keys):
    for key in set(keys):
        if not db.get(FileDeletion, key):
            db.add(FileDeletion(storage_key=key))


def drain_deletions(db):
    for deletion in db.scalars(select(FileDeletion)).all():
        try:
            path_for(deletion.storage_key).unlink(missing_ok=True)
            db.delete(deletion)
        except OSError:
            continue
    db.commit()
