from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import io
from uuid import uuid4
import zipfile

from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfWriter
from sqlalchemy import select

from app.db import SessionLocal
from app.files import path_for
from app.main import app
from app.models import Asset, Session, User, Version, now
from app.security import COOKIE, token_hash

PASSWORD = "correct horse battery staple"


def register(client):
    email = f"{uuid4()}@example.test"
    response = client.post("/api/auth/register", json={"email": email, "password": PASSWORD})
    assert response.status_code == 201, response.text
    client.headers["X-CSRF-Token"] = response.json()["csrf"]
    return email, response.json()["user"]["id"]


def make_case(client):
    response = client.post("/api/cases", json={"company": "测试企业", "role": "开发工程师", "city": "杭州", "stage": "已获 Offer"})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def upload(client, case_id, material_id=None, content=b"Salary: 20000", material_type="Offer"):
    data = {"type": material_type}
    if material_id:
        data["material_id"] = material_id
    response = client.post(f"/api/cases/{case_id}/materials", data=data, files={"file": ("offer.txt", content, "text/plain")})
    assert response.status_code == 201, response.text
    return response.json()


def image_bytes():
    buffer = io.BytesIO()
    Image.new("RGB", (4, 4), color="green").save(buffer, "PNG")
    return buffer.getvalue()


def test_auth_sessions_password_storage_and_expiry(client):
    email, user_id = register(client)
    cookie = client.cookies[COOKIE]
    assert any(cookie.name == COOKIE and cookie.has_nonstandard_attr("HttpOnly") for cookie in client.cookies.jar)
    with SessionLocal() as db:
        user = db.get(User, user_id)
        assert user.password_hash != PASSWORD and user.password_hash.startswith("scrypt$")
        assert db.get(Session, cookie) is None
    assert client.get("/api/auth/me").json()["user"]["email"] == email
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/workspace").status_code == 401
    assert client.post("/api/auth/login", json={"email": email, "password": "incorrect-pass"}).status_code == 401
    response = client.post("/api/auth/login", json={"email": email.upper(), "password": PASSWORD})
    assert response.status_code == 200
    client.headers["X-CSRF-Token"] = response.json()["csrf"]
    with SessionLocal() as db:
        db.get(Session, token_hash(client.cookies[COOKIE])).expires_at = now() - timedelta(seconds=1)
        db.commit()
    assert client.get("/api/workspace").status_code == 401


def test_csrf_origin_validation_and_limits(client):
    register(client)
    assert client.post("/api/cases", json={"company": "A", "role": "B"}, headers={"X-CSRF-Token": ""}).status_code == 403
    assert client.post("/api/cases", json={"company": "A", "role": "B"}, headers={"Origin": "https://other.example"}).status_code == 403
    assert client.post("/api/cases", json={"company": "", "role": "B"}).status_code == 422
    assert client.post("/api/cases", json={"company": "A", "role": "B", "deadline": "2026-99-99"}).status_code == 422
    for _ in range(14):
        client.post("/api/auth/login", json={"email": "none@example.test", "password": PASSWORD})
    assert client.post("/api/auth/login", json={"email": "none@example.test", "password": PASSWORD}).status_code == 429


def test_two_users_cannot_access_or_modify_each_others_data(client):
    register(client)
    case_id = make_case(client)
    version = upload(client, case_id)
    todo = client.post(f"/api/cases/{case_id}/todos", json={"title": "确认薪资"}).json()
    asset = client.post("/api/assets", data={"type": "signature"}, files={"file": ("signature.png", image_bytes())}).json()
    with TestClient(app, headers={"Origin": "http://127.0.0.1:5173"}) as other:
        register(other)
        assert other.get("/api/workspace").json()["cases"] == []
        for url in (version["fileUrl"], asset["fileUrl"]):
            assert other.get(url).status_code == 404
        assert other.delete(f"/api/cases/{case_id}").status_code == 404
        assert other.patch(f"/api/cases/{case_id}", json={"stage": "已签约"}).status_code == 404
        assert other.delete(f"/api/materials/{version['materialId']}").status_code == 404
        assert other.delete(f"/api/assets/{asset['id']}").status_code == 404
        assert other.patch(f"/api/todos/{todo['id']}", json={"done": True}).status_code == 404
        assert other.post(f"/api/cases/{case_id}/todos", json={"title": "注入"}).status_code == 404
        assert other.post(f"/api/cases/{case_id}/communications", json={"question": "注入"}).status_code == 404
        other_case = make_case(other)
        response = other.post(f"/api/cases/{other_case}/materials", data={"type": "Offer", "material_id": version["materialId"]}, files={"file": ("x.txt", b"bad")})
        assert response.status_code == 404
        assert other.delete("/api/workspace").status_code == 204
    assert client.get(version["fileUrl"]).content == b"Salary: 20000"
    assert client.get(asset["fileUrl"]).status_code == 200


def test_version_history_todos_communication_profile_and_deletion(client):
    register(client)
    case_id = make_case(client)
    v1 = upload(client, case_id)
    v2 = upload(client, case_id, v1["materialId"], b"Salary: 22000")
    assert [v1["number"], v2["number"]] == [1, 2]
    assert client.get(v1["fileUrl"]).content == b"Salary: 20000"
    assert client.get(v2["fileUrl"]).content == b"Salary: 22000"
    todo = client.post(f"/api/cases/{case_id}/todos", json={"title": "确认薪资"}).json()
    assert client.patch(f"/api/todos/{todo['id']}", json={"done": True}).json()["done"] is True
    assert client.post(f"/api/cases/{case_id}/communications", json={"question": "薪资构成", "reply": "固定工资"}).status_code == 201
    assert client.put("/api/profile", json={"name": "同学", "school": "测试大学", "role": "前端"}).status_code == 200
    assert client.patch(f"/api/cases/{case_id}", json={"stage": "已签约"}).status_code == 200
    data = client.get("/api/workspace").json()
    assert data["materials"][0]["currentVersionId"] == v2["id"]
    assert data["versions"][0]["pages"][0]["text"] == "Salary: 22000"
    assert "storage_key" not in str(data) and "blob" not in data["versions"][0]
    with SessionLocal() as db:
        paths = [path_for(v.storage_key) for v in db.scalars(select(Version).where(Version.case_id == case_id))]
    assert client.delete(f"/api/materials/{v1['materialId']}").status_code == 204
    assert all(not p.exists() for p in paths)
    assert client.get(v1["fileUrl"]).status_code == 404
    assert len(client.get("/api/workspace").json()["todos"]) == 1
    assert client.delete(f"/api/cases/{case_id}").status_code == 204
    data = client.get("/api/workspace").json()
    assert all(data[key] == [] for key in ("cases", "materials", "versions", "todos", "communications", "events"))


def test_salary_followup_preserves_history_and_checks_current_version(client):
    register(client)
    case_id = make_case(client)
    offer = upload(client, case_id)
    first = upload(client, case_id, material_type="劳动合同")
    record = client.post(f"/api/cases/{case_id}/records", json={
        "kind": "comparison", "topic": "薪资待遇", "status": "待核实",
        "reason": "确认补贴", "versionIds": [offer["id"], first["id"]],
    }).json()
    path = f"/api/records/{record['id']}/salary-followup"

    def step(kind, revision, version_id=None):
        payload = {"kind": kind, "revision": revision, "note": " 固定补贴 "}
        if version_id:
            payload["versionId"] = version_id
        return client.post(path, json=payload)

    assert step("reply", 0).status_code == 422
    assert step("track", 0).status_code == 200
    assert step("confirmed", 1, first["id"]).status_code == 422
    assert step("reply", 1).status_code == 200
    assert step("reply", 1).status_code == 409
    assert step("confirmed", 2, first["id"]).status_code == 422
    revised = upload(client, case_id, first["materialId"], material_type="劳动合同")
    foreign = upload(client, make_case(client), material_type="劳动合同")
    assert step("confirmed", 2, foreign["id"]).status_code == 422
    assert step("confirmed", 2, revised["id"]).status_code == 200
    final = upload(client, case_id, first["materialId"], material_type="劳动合同")
    assert step("unresolved", 3, revised["id"]).status_code == 422
    assert step("unresolved", 3, final["id"]).status_code == 200
    snapshot = client.get("/api/workspace").json()["records"][0]["payload"]
    assert snapshot["versionIds"] == [offer["id"], first["id"]]
    assert [entry["kind"] for entry in snapshot["salaryFollowup"]] == ["track", "reply", "confirmed", "unresolved"]
    assert snapshot["salaryFollowup"][2]["versionId"] == revised["id"]
    assert snapshot["salaryFollowup"][0]["note"] == "固定补贴"


def test_assets_replace_and_clear_removes_files_but_keeps_account(client):
    _, user_id = register(client)
    case_id = make_case(client)
    version = upload(client, case_id)
    def asset(type):
        response = client.post("/api/assets", data={"type": type}, files={"file": ("photo.png", image_bytes())})
        assert response.status_code == 201, response.text
        return response.json()
    old = asset("photo")
    with SessionLocal() as db:
        old_path = path_for(db.get(Asset, old["id"]).storage_key)
    new = asset("photo")
    assert old["id"] != new["id"] and not old_path.exists()
    assert client.get(old["fileUrl"]).status_code == 404
    signature = asset("signature")
    assert client.delete(f"/api/assets/{signature['id']}").status_code == 204
    with SessionLocal() as db:
        paths = [path_for(v.storage_key) for v in db.scalars(select(Version).where(Version.case_id == case_id))]
        paths += [path_for(a.storage_key) for a in db.scalars(select(Asset).where(Asset.user_id == user_id))]
    assert client.delete("/api/workspace").status_code == 204
    assert all(not path.exists() for path in paths)
    assert client.get(version["fileUrl"]).status_code == 404
    assert client.get("/api/auth/me").status_code == 200
    assert client.get("/api/workspace").json()["profile"] == {"name": "", "school": "", "role": ""}


def test_invalid_files_and_real_docx_pdf_parser(client):
    register(client)
    case_id = make_case(client)
    for filename, content in (("fake.pdf", b"not a pdf"), ("fake.png", b"not an image"), ("binary.txt", b"\x00"),
                              ("empty.txt", b""), ("code.exe", b"executable"), ("huge.txt", b"x" * (20 * 1024 * 1024 + 1))):
        response = client.post(f"/api/cases/{case_id}/materials", data={"type": "Offer"}, files={"file": (filename, content)})
        assert response.status_code in (422, 413), response.text
    assert client.get("/api/workspace").json()["materials"] == []
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Salary 30000</w:t></w:r></w:p></w:body></w:document>')
    response = client.post(f"/api/cases/{case_id}/materials", data={"type": "劳动合同"}, files={"file": ("contract.docx", buffer.getvalue())})
    assert response.status_code == 201, response.text
    assert response.json()["pages"] == [{"number": 1, "text": "Salary 30000"}]
    pdf = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=300, height=300)
    writer.write(pdf)
    response = client.post(f"/api/cases/{case_id}/materials", data={"type": "Offer"}, files={"file": ("scan.pdf", pdf.getvalue())})
    assert response.status_code == 201
    assert response.json()["parseState"] == "needs-confirmation"


def test_concurrent_versions_are_numbered_without_overwriting(client):
    register(client)
    case_id = make_case(client)
    original = upload(client, case_id)
    def add_version(i):
        with TestClient(app, headers=dict(client.headers), cookies=dict(client.cookies)) as concurrent:
            return upload(concurrent, case_id, original["materialId"], f"Version {i}".encode())
    with ThreadPoolExecutor(max_workers=3) as executor:
        versions = list(executor.map(add_version, range(3)))
    assert sorted(v["number"] for v in versions) == [2, 3, 4]
    assert len(client.get("/api/workspace").json()["versions"]) == 4
    assert client.get(original["fileUrl"]).content == b"Salary: 20000"
