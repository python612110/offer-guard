"""合成材料验证；默认 mock 网关，--live 额外只调用一次真实 DeepSeek。"""
import asyncio
from datetime import timedelta
import sys
import time
from unittest.mock import patch
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import reviews
from app import questions
from app import annotations
from app.db import SessionLocal
from app.files import drain_deletions, queue_delete
from app.main import app
from app.models import ReviewBudget, ReviewQuestion, ReviewRun, User, Version, now
from app.security import attempts

ORIGIN = {"Origin": "http://127.0.0.1:5173"}
TEXT = """合成测试劳动合同（并非真实用户材料）
姓名：测试张某
身份证号码：110101199001011234
联系电话：13800138000
邮箱：synthetic@example.test
合同期限为一年。
试用期为六个月。
税前月薪人民币10000元，其中基本工资8000元，绩效2000元，绩效按公司制度执行。
员工自愿放弃社保。
每月10日发薪。
"""
ids = []


def register(c):
    r = c.post("/api/auth/register", json={"email": f"{uuid4()}@example.test", "password": "synthetic-password-2026"})
    assert r.status_code == 201
    ids.append(r.json()["user"]["id"])
    c.headers["X-CSRF-Token"] = r.json()["csrf"]


def upload(c, text=TEXT, case=None):
    if not case:
        r = c.post("/api/cases", json={"company": "合成测试企业", "role": "合成岗位", "stage": "已获 Offer"})
        assert r.status_code == 201
        case = r.json()["id"]
    r = c.post(f"/api/cases/{case}/materials", data={"type": "劳动合同"},
               files={"file": ("synthetic.txt", text.encode(), "text/plain")})
    assert r.status_code == 201
    return r.json()


def wait(c, vid, timeout=15):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        r = c.get(f"/api/versions/{vid}/reviews").json()[0]
        if r["state"] not in ("queued", "running"):
            return r
        time.sleep(.15)
    raise AssertionError("审查超时")


async def mock_call(payload):
    # 验证身份与联系方式不出网，同时包含伪装成指令的文本只作为数据。
    encoded = str(payload)
    assert "110101199001011234" not in encoded and "13800138000" not in encoded
    assert "synthetic@example.test" not in encoded and "测试张某" not in encoded
    return []


async def mock_answer(payload):
    assert payload["findings"]
    return questions.Answer(answer="合成回答：请 HR 书面确认。", citations=[payload["findings"][0]["id"]])

def mock_checks():
    attempts.clear()
    with patch.object(reviews, "call_model", mock_call), patch.object(questions, "call_answer", mock_answer), TestClient(app, headers=ORIGIN) as c:
        # 第二用户仅发 API 请求，不再启动同一 app 的第二个 lifespan/worker。
        other = TestClient(app, headers=ORIGIN)
        register(c); register(other)
        v = upload(c)
        catalog = c.get("/api/knowledge").json()
        assert len(catalog["skills"]) == 12 and catalog["ruleCount"] == 63
        assert all(s["body"] and s["knowledge"] for s in catalog["skills"])
        record_body = {"kind": "comparison", "topic": "薪资待遇", "status": "待核实",
                       "reason": "合成核对说明", "versionIds": [v["id"]]}
        record_url = f"/api/cases/{v['caseId']}/records"
        assert other.post(record_url, json=record_body).status_code == 404
        assert c.post(record_url, json=record_body).status_code == 201
        assert c.get("/api/workspace").json()["records"][0]["payload"]["reason"] == "合成核对说明"
        vid = v["id"]
        url = f"/api/versions/{vid}"
        preview = c.get(url + "/review-preview").json()
        assert len(preview["coverage"]) == 12
        assert other.get(url + "/review-preview").status_code == 404
        assert other.get(url + "/reviews").status_code == 404
        assert other.post(url + "/reviews", json={"digest": preview["digest"], "authorized": True}).status_code == 404
        assert c.post(url + "/reviews", json={"digest": preview["digest"], "authorized": False}).status_code == 422
        assert c.post(url + "/reviews", json={"digest": "0"*64, "authorized": True}).status_code == 409
        assert c.post(url + "/reviews", json={"digest": preview["digest"], "authorized": True}, headers={"X-CSRF-Token": ""}).status_code == 403
        body = {"digest": preview["digest"], "authorized": True}
        first = c.post(url + "/reviews", json=body)
        second = c.post(url + "/reviews", json=body)
        assert first.status_code == 202 and first.json()["id"] == second.json()["id"]
        r = wait(c, vid)
        assert r["state"] == "completed", r["error"]
        assert {f["triggered_rule"] for f in r["report"]["findings"]} == {"R02-02", "R03-01"}
        for f in r["report"]["findings"]:
            assert f["status"] == "待核实" and f["risk_level"] == "高"
            assert all(e["original_text"] in TEXT for e in f["evidence"])
        # 已完成的幂等提交不扣配额，刷新可恢复。
        assert c.post(url + "/reviews", json=body).json()["state"] == "completed"
        with SessionLocal() as db:
            assert db.scalar(select(ReviewBudget).where(ReviewBudget.user_id == ids[-2])).used == 1
        qa_url = f"/api/reviews/{r['id']}"
        assert other.get(qa_url + "/questions").status_code == 404
        q = c.post(qa_url + "/question-preview", json={"question": "请解释社保线索"}).json()
        qa_body = {"question": q["question"], "requestId": str(uuid4()), "digest": q["digest"], "authorized": True}
        assert other.post(qa_url + "/questions", json=qa_body).status_code == 404
        assert c.post(qa_url + "/questions", json={**qa_body, "authorized": False}).status_code == 409
        answer = c.post(qa_url + "/questions", json=qa_body)
        assert answer.status_code == 200 and answer.json()["state"] == "completed"
        assert c.post(qa_url + "/questions", json=qa_body).json()["id"] == answer.json()["id"]
        assert len(c.get(qa_url + "/questions").json()) == 1
        with SessionLocal() as db:
            assert db.scalar(select(ReviewBudget).where(ReviewBudget.user_id == ids[-2])).used == 2
        rid = r["id"]
        assert c.delete(f"/api/materials/{v['materialId']}").status_code == 204
        with SessionLocal() as db:
            assert db.get(ReviewRun, rid) is None
            assert db.get(ReviewQuestion, answer.json()["id"]) is None
        assert c.get(url + "/reviews").status_code == 404

        # 错误网关和手动重试，不自动重复调用。
        async def fail(payload):
            raise reviews.ReviewError("合成超时")
        v = upload(c); url = f"/api/versions/{v['id']}"
        p = c.get(url + "/review-preview").json()
        with patch.object(reviews, "call_model", fail):
            c.post(url + "/reviews", json={"digest": p["digest"], "authorized": True})
            assert wait(c, v["id"])["state"] == "failed"
        c.post(url + "/reviews", json={"digest": p["digest"], "authorized": True, "retry": True})
        assert wait(c, v["id"])["attempts"] == 2
        assert c.delete(f"/api/cases/{v['caseId']}").status_code == 204
        # 无文本、超长输入禁止发送。
        huge = upload(c, "工资" * 13000)
        assert c.get(f"/api/versions/{huge['id']}/review-preview").status_code == 422
        assert c.delete(f"/api/cases/{huge['caseId']}").status_code == 204
        # 模拟进程中断，不自动再次付费；恢复后仍要求授权。
        v = upload(c); url = f"/api/versions/{v['id']}"
        p = c.get(url + "/review-preview").json()
        c.post(url + "/reviews", json={"digest": p["digest"], "authorized": True})
        completed = wait(c, v["id"])
        assert completed["state"] == "completed", completed["error"]
        with SessionLocal() as db:
            interrupted = db.get(ReviewRun, completed["id"])
            interrupted.state, interrupted.report = "running", None
            interrupted.started_at = now() - timedelta(minutes=4)
            db.commit()
        reviews.claim()
        recovered = c.get(url + "/reviews").json()[0]
        assert recovered["state"] == "failed" and recovered["attempts"] == 1
        restarted = c.post(url + "/reviews", json={"digest": p["digest"], "authorized": True, "retry": True})
        assert restarted.status_code == 202, restarted.json()
        final = wait(c, v["id"])
        assert final["state"] == "completed", final["error"]
        # 删除后迟到的模型结果不能重建报告；每日配额不随材料删除重置。
        assert c.delete(f"/api/materials/{v['materialId']}").status_code == 204
        reviews.finish(completed["id"], [])
        with SessionLocal() as db:
            assert db.get(ReviewRun, completed["id"]) is None
            budget = db.scalar(select(ReviewBudget).where(ReviewBudget.user_id == ids[-2]))
            budget.used = 10
            db.commit()
        limited = upload(c)
        lp = c.get(f"/api/versions/{limited['id']}/review-preview").json()
        assert c.post(f"/api/versions/{limited['id']}/reviews", json={"digest": lp["digest"], "authorized": True}).status_code == 429
    print("PASS：脱敏、授权、CSRF、双用户隔离、硬规则、幂等、手动重试、报告级联删除、长度限制、中断恢复、配额")


def validation_checks():
    payload = {"document_type": "劳动合同", "clauses": [{"id": "p1-c1", "page": 1, "text": "工资面议"}], "rules": reviews.rules()}
    version = type("SyntheticVersion", (), {"id": "synthetic", "pages": [{"number": 1, "text": "工资面议"}]})()
    for rule, quote, clause in [("R99-99", "工资面议", "p1-c1"), ("R10-01", "月薪百万", "p1-c1"), ("R10-01", "工资面议", "p2-c1")]:
        candidate = reviews.Candidate(rule_id=rule, quote=quote, clause_id=clause, title="测试", explanation="测试", suggestion="测试")
        try:
            reviews.make_report(payload, version, [candidate])
        except reviews.ReviewError:
            pass
        else:
            raise AssertionError("未拦截伪造引文")
    negated = dict(payload, clauses=[{"id": "p1-c1", "page": 1, "text": "员工不得自愿放弃社保。"}])
    assert reviews.hard_findings(negated) == []
    for term, trial, hits in [("一年", "二个月", False), ("一年", "三个月", True),
                              ("三年", "六个月", False), ("二个月", "一月", False),
                              ("二个月", "一个月", True)]:
        test_payload = dict(payload, clauses=[{"id": "p1-c1", "page": 1, "text": f"合同期限为{term}。"},
                                               {"id": "p1-c2", "page": 1, "text": f"试用期为{trial}。"}])
        assert bool(reviews.hard_findings(test_payload)) == hits
        assert reviews.hard_findings(dict(test_payload, document_type="Offer")) == []
    # 网关认证、限流、超时、截断/空内容都不能生成成功报告。
    async def errors():
        for status in [401, 402, 429, 500]:
            transport = httpx.MockTransport(lambda request: httpx.Response(status))
            factory = httpx.AsyncClient
            with patch.object(reviews.httpx, "AsyncClient", lambda **kw: factory(transport=transport, **kw)):
                try:
                    await reviews.call_model(dict(payload, model="deepseek-flash"))
                except reviews.ReviewError:
                    pass
                else:
                    raise AssertionError("未拦截网关错误")
        for content, reason in [("", "stop"), ('{"findings":[]}', "length"), ('{"findings":[{}]}', "stop")]:
            transport = httpx.MockTransport(lambda request: httpx.Response(200, json={"choices": [{"finish_reason": reason, "message": {"content": content}}]}))
            factory = httpx.AsyncClient
            with patch.object(reviews.httpx, "AsyncClient", lambda **kw: factory(transport=transport, **kw)):
                try:
                    await reviews.call_model(dict(payload, model="deepseek-flash"))
                except reviews.ReviewError:
                    pass
                else:
                    raise AssertionError("未拦截损坏模型输出")
    asyncio.run(errors())
    print("PASS：伪造证据/规则拒绝、否定社保条款保护、网关错误与损坏输出")
    async def answer_validation():
        payload = {"question": "解释线索", "findings": [{"id": "risk-1"}], "notes": []}
        factory = httpx.AsyncClient
        for content, reason, valid in [
            ('{"answer":"请核实原文约定","citations":["risk-1"]}', "stop", True),
            ('{"answer":"伪造依据","citations":["unknown"]}', "stop", False),
            ('{"answer":"","citations":[]}', "stop", False),
            ('{"answer":"截断","citations":[]}', "length", False),
            ("", "stop", False),
        ]:
            transport = httpx.MockTransport(lambda request: httpx.Response(200, json={
                "choices": [{"finish_reason": reason, "message": {"content": content}}]}))
            with patch.object(questions.httpx, "AsyncClient", lambda **kw: factory(transport=transport, **kw)):
                try:
                    answer = await questions.call_answer(payload)
                except reviews.ReviewError:
                    assert not valid
                else:
                    assert valid and answer.citations == ["risk-1"]
    asyncio.run(answer_validation())
    print("PASS：追问回答结构、报告引用校验与截断拒绝")


def excerpt_check(live=False):
    attempts.clear()
    with TestClient(app, headers=ORIGIN) as c:
        other = TestClient(app, headers=ORIGIN)
        register(c)
        register(other)
        v = upload(c, "模拟劳动合同\n联系电话：13800138000\n试用期月薪6000元。")
        base = f"/api/versions/{v['id']}"
        anchor = {"page": 1, "paragraph": 0, "quote": "模拟劳动合同"}
        note = {"anchor": anchor, "note": "这是私有批注"}
        assert other.post(base + "/annotations", json=note).status_code == 404
        assert c.post(base + "/annotations", json={**note, "anchor": {**anchor, "paragraph": 2}}).status_code == 422
        saved = c.post(base + "/annotations", json=note)
        assert saved.status_code == 201, saved.text
        aid = saved.json()["id"]
        assert c.get("/api/workspace").json()["annotations"][0]["versionId"] == v["id"]
        assert other.get("/api/workspace").json()["annotations"] == []
        assert other.delete(f"/api/annotations/{aid}").status_code == 404
        rect = {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.04}
        marked = c.post(base + "/annotations", json={
            "anchor": {**anchor, "pdfRects": [rect]}, "note": "", "color": "red",
        })
        assert marked.status_code == 201 and marked.json()["anchor"]["color"] == "red", marked.text
        assert marked.json()["anchor"]["pdfRects"] == [rect]
        assert c.delete(f"/api/annotations/{marked.json()['id']}").status_code == 204
        request = {"anchor": anchor, "question": "这一段的试用期月工资是多少？我的电话13800138000"}
        preview = c.post(base + "/excerpt-preview", json=request)
        assert preview.status_code == 200, preview.text
        assert "13800138000" not in preview.text and preview.json()["context"] == []
        nearby = c.post(base + "/excerpt-preview", json={**request, "scope": "nearby"})
        assert "6000元" in nearby.text and "13800138000" not in nearby.text
        request.update(scope="document", history=[{"question": "这是什么文件？", "answer": "这是模拟劳动合同。"}])
        preview = c.post(base + "/excerpt-preview", json=request)
        assert preview.status_code == 200 and "6000元" in preview.text and "13800138000" not in preview.text
        assert len(preview.json()["history"]) == 1
        authorized = {**request, "digest": preview.json()["digest"], "authorized": True}
        assert c.post(base + "/excerpt-answer", json={**authorized, "authorized": False}).status_code == 409
        assert c.post(base + "/excerpt-answer", json={**authorized, "question": "换个问题"}).status_code == 409
        assert c.post(base + "/excerpt-answer", json={**authorized, "scope": "nearby"}).status_code == 409
        assert c.post(base + "/excerpt-answer", json={**authorized, "history": []}).status_code == 409
        if live:
            result = c.post(base + "/excerpt-answer", json=authorized)
        else:
            async def mock_excerpt(payload, *, excerpt):
                assert excerpt and payload["findings"] == [{"id": "excerpt", "text": anchor["quote"]}]
                assert payload["context"][-1]["text"] == "试用期月薪6000元。"
                assert "13800138000" not in str(payload) and "私有批注" not in str(payload)
                return questions.Answer(answer="试用期月薪6000元。", citations=["excerpt"])
            with patch.object(annotations, "call_answer", mock_excerpt):
                result = c.post(base + "/excerpt-answer", json=authorized)
        assert result.status_code == 200 and "6000" in result.json()["answer"], result.text
        assert c.delete(f"/api/materials/{v['materialId']}").status_code == 204
        assert c.get("/api/workspace").json()["annotations"] == []
        print("PASS：批注权限和级联删除、原文问答脱敏与授权" + ("（真实模型）" if live else "（模拟模型）"))


def live_check():
    attempts.clear()
    with TestClient(app, headers=ORIGIN) as c:
        register(c)
        v = upload(c)
        p = c.get(f"/api/versions/{v['id']}/review-preview").json()
        r = c.post(f"/api/versions/{v['id']}/reviews", json={"digest": p["digest"], "authorized": True})
        assert r.status_code == 202
        result = wait(c, v["id"], timeout=115)
        assert result["state"] == "completed", result["error"]
        assert len(result["report"]["findings"]) >= 2
        print(f"PASS：真实 DeepSeek 合成合同审查，{len(result['report']['findings'])} 项线索，原文证据均经服务端校验")
        c.delete(f"/api/cases/{v['caseId']}")


if __name__ == "__main__":
    try:
        if "--excerpt-live" in sys.argv or "--excerpt-only" in sys.argv:
            excerpt_check(live="--excerpt-live" in sys.argv)
        else:
            validation_checks()
            mock_checks()
            excerpt_check()
            if "--live" in sys.argv:
                live_check()
    finally:
        with SessionLocal() as db:
            case_ids = [u.id for u in db.scalars(select(User).where(User.id.in_(ids)))]
            from app.models import JobCase
            owned_cases = select(JobCase.id).where(JobCase.user_id.in_(case_ids))
            queue_delete(db, db.scalars(select(Version.storage_key).where(Version.case_id.in_(owned_cases))).all())
            for user in db.scalars(select(User).where(User.id.in_(ids))):
                db.delete(user)
            db.commit()
            drain_deletions(db)
