"""从同学维护的 Markdown 原件加载规则；不使用摘要冒充全文。"""
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = "knowledge/01_知识库说明与规则正文_OfferGuard.md"
POLICY = "skills-12-v2"


def catalog():
    text = (ROOT / SOURCE).read_text()
    skills = []
    for path in sorted((ROOT / "skills").glob("[0-1][0-9]_*.md")):
        if path.name.startswith("00_"):
            continue
        body = path.read_text()
        group = path.name[:2]
        section = text.split(f"### OG-{group} ", 1)[1].split("\n### ", 1)[0]
        records = []
        for line in section.splitlines():
            if re.match(rf"\| R{group}-\d\d \|", line):
                cells = [c.strip() for c in line.strip("|").split("|")]
                records.append({"rule_id": cells[0], "skill_id": f"OG-RISK-{group}",
                                "text": line, "legal_reference": cells[-1], "source": SOURCE})
        keywords = re.search(r"\*\*适用关键词：\*\*\s*(.+)", body)
        skills.append({
            "id": f"OG-RISK-{group}", "name": path.stem[3:],
            "version": re.search(r"(?m)^version:\s*(.+)", body)[1],
            "source": str(path.relative_to(ROOT)), "body": body,
            "keywords": re.split(r"[、，,]", keywords[1]) if keywords else [],
            "rules": records, "knowledge": section,
            "digest": hashlib.sha256((body + section).encode()).hexdigest(),
        })
    boundaries = text.split("## 接受边界", 1)[1].split("## 规则正文", 1)[0]
    return skills, boundaries


def route_skills(clauses, document_type):
    skills, boundaries = catalog()
    text = "\n".join(c["text"] for c in clauses)
    coverage, selected = [], []
    for skill in skills:
        hits = [k.strip() for k in skill["keywords"] if k.strip() in text]
        # 文件完整性与同文件主体核对始终参与；其他主题按实际条款路由。
        active = bool(hits) or skill["id"] in ("OG-RISK-04", "OG-RISK-09")
        coverage.append({k: skill[k] for k in ("id", "name", "version", "source", "digest")} |
                        {"state": "已检查" if active else "未进入",
                         "reason": "按原文关键词及全文上下文检查" if hits else
                         "全文完整性与主体核对" if active else "未检出相关关键词，未执行该主题语义审查"})
        if active:
            selected.append(skill)
    instructions = (ROOT / "skills/00_统一规范与接口契约.md").read_text()
    instructions += "\n知识库已接入，下列记录为本地原件真实检索结果，法律效力仍需人工核验。\n"
    instructions += boundaries + "\n".join(s["body"] + "\n" + s["knowledge"] for s in selected)
    return {r["rule_id"]: r for s in selected for r in s["rules"]}, coverage, instructions
