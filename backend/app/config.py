from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import SecretStr
from sqlalchemy import URL

ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")
    mysql_host: str = "127.0.0.1"
    mysql_port: int = 3306
    mysql_database: str = "offerguard"
    mysql_user: str = "offerguard"
    mysql_password: str = ""
    mysql_unix_socket: str = ""
    cookie_secure: bool = False
    allowed_origins: list[str] = ["http://127.0.0.1:5173", "http://localhost:5173"]
    storage_dir: Path = ROOT / "private"
    deepseek_api_key: SecretStr = SecretStr("")
    deepseek_model: str = "deepseek-flash"

    @property
    def database_url(self):
        return URL.create(
            "mysql+pymysql", username=self.mysql_user, password=self.mysql_password,
            host=self.mysql_host, port=self.mysql_port, database=self.mysql_database,
            query={"charset": "utf8mb4", **({"unix_socket": self.mysql_unix_socket} if self.mysql_unix_socket else {})},
        )


settings = Settings()
