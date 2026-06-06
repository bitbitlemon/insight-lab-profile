import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from .config import settings
from .routers import health, auth, sync as sync_router, members, papers, meeting_notes, auto_minute, audit, competitions, contributions, points, projects, tasks, calendar as calendar_router, stats, awards, trainings, advising, grants, industrial, penalties, product_stages, paper_milestones, paper_external, files as files_router, gallery, a_class_achievements as a_class_router, moments as moments_router, voice, lab as lab_router, lark_callbacks, chat_insights, ai_assistants
from .services.scheduler import start_scheduler, stop_scheduler
from .services.listener import start_listener, stop_listener
from .services.audit import install_audit_listeners
from .services.zhangqian_log import _fetch_all_records
from .services.a_class_log import fetch_all as fetch_a_class_all
from .middleware import BodySizeLimitMiddleware, SlowRequestLogMiddleware, limiter
from sqlalchemy import text
from .db import engine
from .models import AIAssistantConfig, Contribution, ContributionComment, LabDailyReport, LabMessageConfig, LabOccupancy, LabReservation, LabResource, LabSpace, LarkUserStatus, ProjectLog, ProjectRelation

_log = logging.getLogger(__name__)

# zhangqian 全表缓存 TTL=600s, 提前 120s 续期, 避免用户在窗口边缘踩到 cache miss
_ZHANGQIAN_PREWARM_INTERVAL = 480.0
_IMMUTABLE_ASSET_HEADERS = {"Cache-Control": "public, max-age=31536000, immutable"}
_NO_CACHE_HEADERS = {"Cache-Control": "no-cache"}


class CachedStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            response.headers["Cache-Control"] = _IMMUTABLE_ASSET_HEADERS["Cache-Control"]
        return response


async def _prewarm_zhangqian_loop():
    while True:
        try:
            n = len(await _fetch_all_records(force=True))
            _log.info("zhangqian prewarm: %d records cached", n)
        except Exception:
            _log.exception("zhangqian prewarm failed (will retry)")
        await asyncio.sleep(_ZHANGQIAN_PREWARM_INTERVAL)


async def _prewarm_a_class_loop():
    while True:
        try:
            n = len(await fetch_a_class_all(force=True))
            _log.info("a_class prewarm: %d items cached", n)
        except Exception:
            _log.exception("a_class prewarm failed (will retry)")
        await asyncio.sleep(_ZHANGQIAN_PREWARM_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    ProjectLog.__table__.create(bind=engine, checkfirst=True)
    ProjectRelation.__table__.create(bind=engine, checkfirst=True)
    ContributionComment.__table__.create(bind=engine, checkfirst=True)
    AIAssistantConfig.__table__.create(bind=engine, checkfirst=True)
    LarkUserStatus.__table__.create(bind=engine, checkfirst=True)
    LabSpace.__table__.create(bind=engine, checkfirst=True)
    LabResource.__table__.create(bind=engine, checkfirst=True)
    LabReservation.__table__.create(bind=engine, checkfirst=True)
    LabOccupancy.__table__.create(bind=engine, checkfirst=True)
    LabMessageConfig.__table__.create(bind=engine, checkfirst=True)
    LabDailyReport.__table__.create(bind=engine, checkfirst=True)
    with engine.begin() as conn:
        for table in ("projects", "tasks"):
            rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            if not rows:
                continue
            columns = {row[1] for row in rows}
            if "publication_status" not in columns:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN publication_status VARCHAR NOT NULL DEFAULT 'draft'"))
            if table == "tasks":
                if "today_todo_date" not in columns:
                    conn.execute(text("ALTER TABLE tasks ADD COLUMN today_todo_date DATE"))
                if "thinking" not in columns:
                    conn.execute(text("ALTER TABLE tasks ADD COLUMN thinking TEXT"))
                if "progress_draft" not in columns:
                    conn.execute(text("ALTER TABLE tasks ADD COLUMN progress_draft TEXT"))
                if "task_origin" not in columns:
                    conn.execute(text("ALTER TABLE tasks ADD COLUMN task_origin VARCHAR NOT NULL DEFAULT 'manual'"))
        contribution_rows = conn.execute(text("PRAGMA table_info(contributions)")).fetchall()
        if contribution_rows:
            contribution_columns = {row[1] for row in contribution_rows}
            if "like_count" not in contribution_columns:
                conn.execute(text("ALTER TABLE contributions ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0"))
            if "comment_count" not in contribution_columns:
                conn.execute(text("ALTER TABLE contributions ADD COLUMN comment_count INTEGER NOT NULL DEFAULT 0"))
    install_audit_listeners()
    start_scheduler()
    start_listener()
    prewarm_task = asyncio.create_task(_prewarm_zhangqian_loop())
    prewarm_a_class_task = asyncio.create_task(_prewarm_a_class_loop())
    try:
        yield
    finally:
        prewarm_task.cancel()
        prewarm_a_class_task.cancel()
        await stop_listener()
        stop_scheduler()


app = FastAPI(
    title="insight-lab-profile",
    description="实验室人员档案系统 · 飞书 H5 + FastAPI + Base 镜像",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(SlowRequestLogMiddleware)
app.add_middleware(BodySizeLimitMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(sync_router.router)
app.include_router(members.router)
app.include_router(papers.router)
app.include_router(meeting_notes.router)
app.include_router(auto_minute.router)
app.include_router(audit.router)
app.include_router(competitions.router)
app.include_router(contributions.router)
app.include_router(points.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(calendar_router.router)
app.include_router(stats.router)
app.include_router(awards.router)
app.include_router(trainings.router)
app.include_router(advising.router)
app.include_router(grants.router)
app.include_router(industrial.router)
app.include_router(penalties.router)
app.include_router(product_stages.router)
app.include_router(paper_milestones.router)
app.include_router(paper_external.router)
app.include_router(files_router.router)
app.include_router(gallery.router)
app.include_router(a_class_router.router)
app.include_router(moments_router.router)
app.include_router(voice.router)
app.include_router(lab_router.router)
app.include_router(lark_callbacks.router)
app.include_router(chat_insights.router)
app.include_router(ai_assistants.router)


FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    app.mount("/assets", CachedStaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/", include_in_schema=False)
    @app.head("/", include_in_schema=False)
    @app.post("/", include_in_schema=False)
    @app.get("/{full_path:path}", include_in_schema=False)
    @app.head("/{full_path:path}", include_in_schema=False)
    def spa_index(full_path: str = ""):
        if full_path.startswith("api/"):
            return FileResponse(FRONTEND_DIST / "index.html", status_code=404, headers=_NO_CACHE_HEADERS)
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html", headers=_NO_CACHE_HEADERS)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.app_host, port=settings.app_port, reload=settings.app_debug)
