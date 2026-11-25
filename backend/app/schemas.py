import re
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Stage = Literal["材料收集中", "已获 Offer", "签约确认中", "已签约", "已放弃", "已归档"]
MaterialType = Literal["招聘信息", "Offer", "三方协议", "劳动合同", "HR 沟通记录", "其他材料"]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(max_length=254)
    password: str = Field(min_length=10, max_length=128)

    @field_validator("email")
    @classmethod
    def email_valid(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("请输入有效邮箱")
        return value


class CaseInput(Input):
    company: str = Field(min_length=1, max_length=100)
    role: str = Field(min_length=1, max_length=100)
    city: str = Field(default="", max_length=50)
    deadline: str = ""
    stage: Stage = "材料收集中"

    @field_validator("deadline")
    @classmethod
    def deadline_valid(cls, value):
        if value:
            date.fromisoformat(value)
        return value


class StageInput(Input):
    stage: Stage


class TodoInput(Input):
    title: str = Field(min_length=1, max_length=2000)


class TodoUpdate(Input):
    done: bool


class CommunicationInput(Input):
    question: str = Field(min_length=1, max_length=10000)
    reply: str = Field(default="", max_length=20000)


class ProfileInput(Input):
    name: str = Field(default="", max_length=40)
    school: str = Field(default="", max_length=100)
    role: str = Field(default="", max_length=100)
