from contextlib import asynccontextmanager
import asyncio
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from .api import router
from .config import settings
from .db import SessionLocal
from .files import drain_deletions
from .reviews import router as review_router, worker
from .questions import router as question_router
from .annotations import router as annotation_router


@asynccontextmanager
async def lifespan(app):
    # 启动不自动建表；配置缺失时 API 仍能提供健康诊断与接口文档。
    try:
        with SessionLocal() as db:
            drain_deletions(db)
    except SQLAlchemyError:
        logging.warning("MySQL 尚未配置或迁移未执行；请按 backend/README.md 初始化。")
    stop = asyncio.Event()
    task = asyncio.create_task(worker(stop))
    try:
        yield
    finally:
        stop.set()
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="OfferGuard API", version="0.2.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_credentials=True,
                   allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Content-Type", "X-CSRF-Token"])
app.include_router(router)
app.include_router(review_router)
app.include_router(question_router)
app.include_router(annotation_router)


@app.middleware("http")
async def private_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(SQLAlchemyError)
async def database_error(request: Request, exc):
    # 不向前端或日志输出包含连接参数的异常文本。
    return JSONResponse(status_code=503, content={"detail": "数据库暂未就绪，请检查 MySQL 配置及数据库迁移。"})


@app.get("/api/health")
def health():
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1 FROM alembic_version LIMIT 1"))
        return {"status": "ready", "database": "mysql", "ai": "configured" if settings.deepseek_api_key.get_secret_value() else "not_connected"}
    except SQLAlchemyError:
        return JSONResponse(status_code=503, content={"status": "database_not_ready", "database": "mysql", "ai": "not_connected"})
