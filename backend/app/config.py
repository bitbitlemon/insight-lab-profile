from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    lark_app_id: str = ""
    lark_app_secret: str = ""
    lark_verification_token: str = ""
    lark_encrypt_key: str = ""

    lark_base_app_token: str = ""
    lark_table_members: str = ""
    lark_table_advising: str = ""
    lark_table_papers: str = ""
    lark_table_paper_authors: str = ""
    lark_table_competitions: str = ""
    lark_table_meeting_notes: str = ""
    lark_table_awards: str = ""
    lark_table_trainings: str = ""
    lark_table_audit_log: str = ""
    lark_table_points_ledger: str = ""
    lark_table_contributions: str = ""
    lark_table_competition_members: str = ""
    lark_table_meeting_participants: str = ""
    lark_table_sync_state: str = ""
    lark_table_projects: str = ""
    lark_table_tasks: str = ""
    lark_table_paper_milestones: str = ""

    # 张迁组论文日志/过程文档外部 Base (独立 Base, 非主 lark_base_app_token)
    lark_zhangqian_log_app_token: str = "Zkb8b0Gdaa0kVissTz0cuZOBnCe"
    lark_zhangqian_log_table_id: str = "tblNj1CpbDBRHeLd"

    database_url: str = "sqlite:///./data/insight_lab.db"

    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 168            # access token: 7 天
    jwt_refresh_expire_hours: int = 720    # refresh token: 30 天

    rate_limit_login_per_minute: int = 10
    request_max_body_bytes: int = 2 * 1024 * 1024   # 2MB
    upload_max_body_bytes: int = 25 * 1024 * 1024   # 25MB (附件上传, 与 lark drive single-shot 限制一致)
    slow_query_threshold_ms: int = 500

    sync_incremental_interval_sec: int = 300
    sync_full_cron_hour: int = 3

    app_host: str = "0.0.0.0"
    app_port: int = 8080
    app_debug: bool = False
    app_cors_origins: str = "https://applink.feishu.cn"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.app_cors_origins.split(",") if o.strip()]


settings = Settings()
