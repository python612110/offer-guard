from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, Form
from fastapi.responses import FileResponse
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from .config import settings
from .db import get_db
from .files import drain_deletions, path_for, queue_delete, read_upload, save_file
from .models import Annotation, Asset, Communication, Event, JobCase, Material, Session, Todo, User, Version, CaseRecord, now, uid
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from .schemas import CaseInput, CommunicationInput, Credentials, MaterialType, ProfileInput, StageInput, TodoInput, TodoUpdate
from .security import COOKIE, authenticated, check_origin, create_session, hash_password, rate_limit, token_hash, verify_password

router = APIRouter(prefix="/api")
DB = Annotated[DBSession, Depends(get_db)]
Account = Annotated[User, Depends(authenticated)]


def owned_case(db, user, case_id):
    item = db.scalar(select(JobCase).where(JobCase.id == case_id, JobCase.user_id == user.id))
    if not item:
        raise HTTPException(404, "事项不存在。")
    return item


def owned(db, user, model, resource_id):
    item = db.get(model, resource_id)
    if not item:
        raise HTTPException(404, "记录不存在。")
    owned_case(db, user, item.case_id)
    return item


def event(db, case_id, title, detail=""):
    db.add(Event(case_id=case_id, title=title, detail=detail))


def serialize(item):
    result = {}
    mapping = {"case_id": "caseId", "material_id": "materialId",
               "current_version_id": "currentVersionId", "created_at": "createdAt",
               "parse_state": "parseState", "parse_note": "parseNote", "version_id": "versionId"}
    for column in item.__table__.columns:
        key = column.name
        if key in ("user_id", "storage_key"):
            continue
        value = getattr(item, key)
        if key == "created_at":
            value = value.isoformat(timespec="milliseconds") + "Z"
        result[mapping.get(key, key)] = value
    if isinstance(item, Version):
        result["fileUrl"] = f"/api/versions/{item.id}/file"
    if isinstance(item, Asset):
        result["fileUrl"] = f"/api/assets/{item.id}/file"
    return result


@router.post("/auth/register", status_code=201)
def register(body: Credentials, request: Request, response: Response, db: DB):
    check_origin(request)
    rate_limit(request)
    user = User(email=body.email, password_hash=hash_password(body.password))
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "该邮箱已注册，请直接登录。")
    return create_session(db, user, response, request)


@router.post("/auth/login")
def login(body: Credentials, request: Request, response: Response, db: DB):
    check_origin(request)
    rate_limit(request)
    user = db.scalar(select(User).where(User.email == body.email))
    if not verify_password(body.password, user.password_hash if user else None):
        raise HTTPException(401, "邮箱或密码错误。")
    return create_session(db, user, response, request)


@router.get("/auth/me")
def me(request: Request, db: DB, user: Account):
    session = db.get(Session, token_hash(request.cookies[COOKIE]))
    return {"user": {"id": user.id, "email": user.email}, "csrf": session.csrf}


@router.post("/auth/logout", status_code=204)
def logout(request: Request, response: Response, db: DB, user: Account):
    db.execute(delete(Session).where(Session.token_hash == token_hash(request.cookies[COOKIE])))
    db.commit()
    response.delete_cookie(COOKIE, path="/api", secure=settings.cookie_secure, httponly=True, samesite="lax")


@router.get("/workspace")
def workspace(db: DB, user: Account):
    # 元数据不带原文件。原件按需通过带鉴权的端点下载。
    cases = db.scalars(select(JobCase).where(JobCase.user_id == user.id).order_by(JobCase.created_at.desc())).all()
    case_ids = [c.id for c in cases]
    result = {"cases": [serialize(c) for c in cases], "profile": user.profile}
    for name, model in [("materials", Material), ("versions", Version), ("todos", Todo),
                        ("communications", Communication), ("events", Event), ("records", CaseRecord),
                        ("annotations", Annotation)]:
        rows = db.scalars(select(model).where(model.case_id.in_(case_ids)).order_by(model.created_at.desc())).all()
        result[name] = [serialize(row) for row in rows]
    result["assets"] = [serialize(a) for a in db.scalars(select(Asset).where(Asset.user_id == user.id))]
    return result


@router.post("/cases", status_code=201)
def create_case(body: CaseInput, db: DB, user: Account):
    item = JobCase(id=uid(), user_id=user.id, **body.model_dump())
    db.add(item)
    db.flush()
    event(db, item.id, "创建求职事项", item.role)
    db.commit()
    return serialize(item)


class RecordInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["comparison", "decision"]
    topic: str = Field(max_length=100)
    status: Literal["待核实", "口径一致", "存在差异", "无法核验", "继续沟通", "准备签约", "放弃"]
    reason: str = Field(min_length=1, max_length=3000)
    versionIds: list[str] = Field(max_length=100)


@router.post("/cases/{case_id}/records", status_code=201)
def add_record(case_id: str, body: RecordInput, db: DB, user: Account):
    owned_case(db, user, case_id)
    for version_id in body.versionIds:
        if owned(db, user, Version, version_id).case_id != case_id:
            raise HTTPException(422, "引用版本不属于当前事项。")
    item = CaseRecord(case_id=case_id, kind=body.kind,
                      payload=body.model_dump(exclude={"kind"}))
    db.add(item)
    event(db, case_id, "保存人工核对" if body.kind == "comparison" else "保存我的决定", body.status)
    db.commit()
    return serialize(item)


class SalaryFollowupInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["track", "reply", "confirmed", "unresolved"]
    revision: int = Field(ge=0)
    note: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=3000)]
    versionId: str | None = Field(default=None, max_length=36)


@router.post("/records/{record_id}/salary-followup")
def update_salary_followup(record_id: str, body: SalaryFollowupInput, db: DB, user: Account):
    item = db.scalar(
        select(CaseRecord).join(JobCase, JobCase.id == CaseRecord.case_id)
        .where(CaseRecord.id == record_id, JobCase.user_id == user.id)
        .with_for_update()
    )
    if not item or item.kind != "comparison" or item.payload.get("topic") != "薪资待遇":
        raise HTTPException(404, "没有找到薪资核对记录。")
    steps = item.payload.get("salaryFollowup", [])
    if body.revision != len(steps):
        raise HTTPException(409, "记录已更新，请刷新后再保存。")
    if len(steps) >= 30:
        raise HTTPException(422, "这条记录已达到追踪上限，请新建一条核对记录。")
    if (body.kind == "track") != (not steps):
        raise HTTPException(422, "请先开启追踪，每条记录只开启一次。")
    if body.kind in ("confirmed", "unresolved"):
        if not any(step["kind"] == "reply" for step in steps):
            raise HTTPException(422, "请先记录 HR 回复。")
        material = db.scalar(
            select(Material).where(
                Material.case_id == item.case_id, Material.type == "劳动合同",
                Material.current_version_id == body.versionId,
            ).with_for_update()
        )
        if not material or body.versionId in item.payload.get("versionIds", []):
            raise HTTPException(422, "请选择此事项中未参与原核对的当前劳动合同版本。")
    elif body.versionId is not None:
        raise HTTPException(422, "只有复核结论可以引用合同版本。")
    step = {"kind": body.kind, "note": body.note, "createdAt": now().isoformat(timespec="milliseconds") + "Z"}
    if body.versionId is not None:
        step["versionId"] = body.versionId
    item.payload = {**item.payload, "salaryFollowup": [*steps, step]}
    db.commit()
    return serialize(item)


@router.patch("/cases/{case_id}")
def update_stage(case_id: str, body: StageInput, db: DB, user: Account):
    item = owned_case(db, user, case_id)
    item.stage = body.stage
    event(db, case_id, "更新求职阶段", body.stage)
    db.commit()
    return serialize(item)


def finish_delete(db):
    db.commit()
    drain_deletions(db)


@router.delete("/cases/{case_id}", status_code=204)
def delete_case(case_id: str, db: DB, user: Account):
    item = owned_case(db, user, case_id)
    queue_delete(db, db.scalars(select(Version.storage_key).where(Version.case_id == case_id)).all())
    db.delete(item)
    finish_delete(db)


@router.post("/cases/{case_id}/materials", status_code=201)
async def upload_material(
    case_id: str, db: DB, user: Account, file: UploadFile,
    type: Annotated[MaterialType, Form()],
    material_id: Annotated[str | None, Form()] = None,
):
    owned_case(db, user, case_id)
    material = owned(db, user, Material, material_id) if material_id else None
    if material and material.case_id != case_id:
        raise HTTPException(404, "材料不属于当前事项。")
    if material and material.type != type:
        raise HTTPException(422, "新版本不能改变材料类别。")
    # 文件解析运行在线程池，避免阻塞其他请求。
    filename, mime, content, pages, note = await read_upload(file)
    from starlette.concurrency import run_in_threadpool
    key = await run_in_threadpool(save_file, content)
    try:
        if not material:
            material = Material(id=uid(), case_id=case_id, title=filename, type=type)
            db.add(material)
            db.flush()
        number = (db.scalar(select(func.max(Version.number)).where(Version.material_id == material.id)) or 0) + 1
        version = Version(id=uid(), material_id=material.id, case_id=case_id, number=number,
                          filename=filename, mime=mime, storage_key=key, size=len(content),
                          pages=pages, parse_state="readable" if any(p["text"].strip() for p in pages) else "needs-confirmation",
                          parse_note=note)
        db.add(version)
        material.current_version_id = version.id
        event(db, case_id, "保存材料新版本" if material_id else "添加材料", f"{filename} · 第 {number} 版")
        db.commit()
    except Exception:
        db.rollback()
        path_for(key).unlink(missing_ok=True)
        raise
    return serialize(version)


@router.delete("/materials/{material_id}", status_code=204)
def delete_material(material_id: str, db: DB, user: Account):
    item = owned(db, user, Material, material_id)
    queue_delete(db, db.scalars(select(Version.storage_key).where(Version.material_id == material_id)).all())
    event(db, item.case_id, "删除材料及所有版本", item.title)
    db.delete(item)
    finish_delete(db)


def private_response(item):
    path = path_for(item.storage_key)
    if not path.is_file():
        raise HTTPException(404, "原文件缺失，请联系管理员恢复备份。")
    return FileResponse(path, media_type=item.mime, filename=item.filename,
                        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})


@router.get("/versions/{version_id}/file")
def version_file(version_id: str, db: DB, user: Account):
    return private_response(owned(db, user, Version, version_id))


@router.post("/cases/{case_id}/todos", status_code=201)
def add_todo(case_id: str, body: TodoInput, db: DB, user: Account):
    owned_case(db, user, case_id)
    item = Todo(case_id=case_id, title=body.title)
    db.add(item)
    event(db, case_id, "添加待办事项", body.title)
    db.commit()
    return serialize(item)


@router.patch("/todos/{todo_id}")
def update_todo(todo_id: str, body: TodoUpdate, db: DB, user: Account):
    item = owned(db, user, Todo, todo_id)
    item.done = body.done
    db.commit()
    return serialize(item)


@router.post("/cases/{case_id}/communications", status_code=201)
def add_communication(case_id: str, body: CommunicationInput, db: DB, user: Account):
    owned_case(db, user, case_id)
    item = Communication(case_id=case_id, **body.model_dump())
    db.add(item)
    event(db, case_id, "保存 HR 沟通记录", "已记录回复，尚未执行 AI 核验" if body.reply else "待 HR 回复")
    db.commit()
    return serialize(item)


@router.put("/profile")
def profile(body: ProfileInput, db: DB, user: Account):
    user.profile = body.model_dump()
    db.commit()
    return user.profile


@router.post("/assets", status_code=201)
async def upload_asset(db: DB, user: Account, file: UploadFile, type: Annotated[Literal["photo", "signature"], Form()]):
    filename, mime, content, _, _ = await read_upload(file, asset=True)
    key = save_file(content)
    try:
        old = db.scalar(select(Asset).where(Asset.user_id == user.id, Asset.type == type))
        if old:
            queue_delete(db, [old.storage_key])
            db.delete(old)
            db.flush()
        item = Asset(user_id=user.id, type=type, filename=filename, mime=mime, storage_key=key)
        db.add(item)
        db.commit()
    except Exception:
        db.rollback()
        path_for(key).unlink(missing_ok=True)
        raise
    drain_deletions(db)
    return serialize(item)


def owned_asset(db, user, asset_id):
    item = db.scalar(select(Asset).where(Asset.id == asset_id, Asset.user_id == user.id))
    if not item:
        raise HTTPException(404, "素材不存在。")
    return item


@router.get("/assets/{asset_id}/file")
def asset_file(asset_id: str, db: DB, user: Account):
    return private_response(owned_asset(db, user, asset_id))


@router.delete("/assets/{asset_id}", status_code=204)
def delete_asset(asset_id: str, db: DB, user: Account):
    item = owned_asset(db, user, asset_id)
    queue_delete(db, [item.storage_key])
    db.delete(item)
    finish_delete(db)


@router.delete("/workspace", status_code=204)
def clear_workspace(db: DB, user: Account):
    case_ids = select(JobCase.id).where(JobCase.user_id == user.id)
    queue_delete(db, db.scalars(select(Version.storage_key).where(Version.case_id.in_(case_ids))).all())
    queue_delete(db, db.scalars(select(Asset.storage_key).where(Asset.user_id == user.id)).all())
    db.execute(delete(JobCase).where(JobCase.user_id == user.id))
    db.execute(delete(Asset).where(Asset.user_id == user.id))
    user.profile = {"name": "", "school": "", "role": ""}
    finish_delete(db)
