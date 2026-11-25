import hashlib
import json
import re
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .api import Account, DB, owned, serialize
from .config import settings
from .models import Annotation, ReviewBudget, Version, now
from .questions import call_answer
from .reviews import ReviewError, redact

router = APIRouter(prefix="/api")


class MarkRect(BaseModel):
    model_config = ConfigDict(extra="forbid")
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)


class Anchor(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page: int = Field(ge=1)
    paragraph: int = Field(ge=0)
    quote: str = Field(min_length=1, max_length=800)
    pdfRects: list[MarkRect] | None = Field(default=None, max_length=80)


class NoteInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    anchor: Anchor
    note: str = Field(max_length=2000)
    color: Literal["yellow", "red"] | None = None


class PriorTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=1, max_length=1200)
    answer: str = Field(min_length=1, max_length=3000)


class ExcerptInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    anchor: Anchor
    question: str = Field(min_length=1, max_length=1000)
    scope: Literal["selection", "nearby", "document"] = "selection"
    history: list[PriorTurn] = Field(default_factory=list, max_length=3)


class AuthorizedExcerpt(ExcerptInput):
    digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    authorized: bool


def validate_anchor(version, anchor):
    text = next((p["text"] for p in version.pages if p["number"] == anchor.page), "")
    paragraphs = [p for p in re.split(r"\n+", text) if p.strip()]
    if (not anchor.quote.strip() or anchor.paragraph >= len(paragraphs)
            or anchor.quote not in paragraphs[anchor.paragraph]):
        raise HTTPException(422, "选段无法在当前版本的原文中定位，请重新选择。")


@router.post("/versions/{version_id}/annotations", status_code=201)
def add_annotation(version_id: str, body: NoteInput, db: DB, user: Account):
    version = owned(db, user, Version, version_id)
    validate_anchor(version, body.anchor)
    if not body.note.strip() and not body.color:
        raise HTTPException(422, "请填写批注内容或选择标记颜色。")
    row = Annotation(case_id=version.case_id, version_id=version.id,
                     anchor={**body.anchor.model_dump(exclude_none=True),
                             **({"color": body.color} if body.color else {})},
                     note=body.note.strip())
    db.add(row)
    db.commit()
    return serialize(row)


@router.delete("/annotations/{annotation_id}", status_code=204)
def delete_annotation(annotation_id: str, db: DB, user: Account):
    db.delete(owned(db, user, Annotation, annotation_id))
    db.commit()


def excerpt_context(version, body):
    validate_anchor(version, body.anchor)
    if not body.question.strip():
        raise HTTPException(422, "请填写问题。")
    payload = {
        "question": redact(body.question.strip()),
        "findings": [{"id": "excerpt", "text": redact(body.anchor.quote)}],
        "scope": body.scope,
        "context": [],
        "history": [
            {"question": redact(turn.question), "answer": redact(turn.answer)}
            for turn in body.history
        ],
    }
    if body.scope != "selection":
        paragraphs = [
            (p["number"], i, text)
            for p in version.pages
            for i, text in enumerate(t for t in re.split(r"\n+", p["text"]) if t.strip())
        ]
        if body.scope == "document":
            if sum(len(text) for _, _, text in paragraphs) > 16000 or len(paragraphs) > 500:
                raise HTTPException(422, "全文超出问答范围上限，请改用前后文，或上传拆分后的材料。")
            selected = paragraphs
        else:
            index = next(i for i, (page, paragraph, _) in enumerate(paragraphs)
                         if (page, paragraph) == (body.anchor.page, body.anchor.paragraph))
            selected = paragraphs[max(0, index - 3):index + 5]
        for page, paragraph, text in selected:
            safe = redact(text)
            if body.scope == "nearby" and len(safe) > 1200:
                offset = safe.find(payload["findings"][0]["text"]) if (
                    page, paragraph) == (body.anchor.page, body.anchor.paragraph) else 0
                start = max(0, offset - 200)
                safe = ("…" if start else "") + safe[start:start + 1200] + (
                    "…" if len(safe) > start + 1200 else "")
            payload["context"].append({"page": page, "paragraph": paragraph + 1, "text": safe})
    digest = hashlib.sha256(json.dumps(
        [version.id, body.anchor.model_dump(), payload], sort_keys=True, ensure_ascii=False
    ).encode()).hexdigest()
    return payload, digest


@router.post("/versions/{version_id}/excerpt-preview")
def preview_excerpt(version_id: str, body: ExcerptInput, db: DB, user: Account):
    payload, digest = excerpt_context(owned(db, user, Version, version_id), body)
    return {"digest": digest, "question": payload["question"], "text": payload["findings"][0]["text"],
            "context": payload["context"], "history": payload["history"]}


@router.post("/versions/{version_id}/excerpt-answer")
async def ask_excerpt(version_id: str, body: AuthorizedExcerpt, db: DB, user: Account):
    payload, digest = excerpt_context(owned(db, user, Version, version_id), body)
    if not body.authorized or body.digest != digest:
        raise HTTPException(409, "请重新预览并授权发送。")
    if not settings.deepseek_api_key.get_secret_value():
        raise HTTPException(503, "智能模型服务尚未配置。")
    day = now().date().isoformat()
    budget = db.get(ReviewBudget, (user.id, day))
    if budget and budget.used >= 10:
        raise HTTPException(429, "今天已达到 10 次调用上限。")
    if not budget:
        budget = ReviewBudget(user_id=user.id, day=day, used=0)
        db.add(budget)
    budget.used += 1
    db.commit()
    try:
        answer = await call_answer(payload, excerpt=True)
    except ReviewError as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"answer": answer.answer}
