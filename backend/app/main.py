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
from .routers import health, auth, sync as sync_router, members, papers, meeting_notes, auto_minute, audit, competitions, contributions, points, projects, tasks, calendar as calendar_router, stats, awards, trainings, advising, grants, industrial, penalties, product_stages, paper_milestones, paper_external, files as files_router, gallery, a_class_achievements as a_class_router, moments as moments_router, voice, assistant, lab as lab_router, lark_callbacks, chat_insights, ai_assistants, usage as usage_router, project_report, public_calendar, permissions as permissions_router, approval_rules, stage_templates, bitable
from .services.background import initialize_runtime, start_background_services, stop_background_services
from .middleware import BodySizeLimitMiddleware, SlowRequestLogMiddleware, limiter

_log = logging.getLogger(__name__)

_IMMUTABLE_ASSET_HEADERS = {"Cache-Control": "public, max-age=31536000, immutable"}
_NO_CACHE_HEADERS = {"Cache-Control": "no-cache"}


class CachedStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            response.headers["Cache-Control"] = _IMMUTABLE_ASSET_HEADERS["Cache-Control"]
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_runtime()
    background_tasks = []
    if settings.enable_background_services:
        background_tasks = await start_background_services()
        _log.info("background services enabled in API process")
    else:
        _log.info("background services disabled in API process")
    try:
        yield
    finally:
        if background_tasks:
            await stop_background_services(background_tasks)


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
app.include_router(assistant.router)
app.include_router(lab_router.router)
app.include_router(lark_callbacks.router)
app.include_router(chat_insights.router)
app.include_router(ai_assistants.router)
app.include_router(usage_router.router)
app.include_router(project_report.router)
app.include_router(public_calendar.router)
app.include_router(permissions_router.router)
app.include_router(approval_rules.router)
app.include_router(stage_templates.router)
app.include_router(bitable.router)


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
