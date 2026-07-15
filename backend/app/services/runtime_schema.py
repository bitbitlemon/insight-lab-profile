from __future__ import annotations

from sqlalchemy import text


def apply_runtime_schema(engine, models: dict[str, object]) -> None:
    models["ProjectLog"].__table__.create(bind=engine, checkfirst=True)
    models["ProjectLogComment"].__table__.create(bind=engine, checkfirst=True)
    models["ProjectRelation"].__table__.create(bind=engine, checkfirst=True)
    models["AIChatSubmission"].__table__.create(bind=engine, checkfirst=True)
    models["LarkDocWatch"].__table__.create(bind=engine, checkfirst=True)
    models["LarkBaseChatSource"].__table__.create(bind=engine, checkfirst=True)
    models["LarkBaseChatMessage"].__table__.create(bind=engine, checkfirst=True)
    models["ContributionComment"].__table__.create(bind=engine, checkfirst=True)
    models["AIAssistantConfig"].__table__.create(bind=engine, checkfirst=True)
    models["LarkUserStatus"].__table__.create(bind=engine, checkfirst=True)
    models["LabSpace"].__table__.create(bind=engine, checkfirst=True)
    models["LabResource"].__table__.create(bind=engine, checkfirst=True)
    models["LabReservation"].__table__.create(bind=engine, checkfirst=True)
    models["LabOccupancy"].__table__.create(bind=engine, checkfirst=True)
    models["LabInteraction"].__table__.create(bind=engine, checkfirst=True)
    models["LabMessageConfig"].__table__.create(bind=engine, checkfirst=True)
    models["LabDailyReport"].__table__.create(bind=engine, checkfirst=True)
    models["AppPresence"].__table__.create(bind=engine, checkfirst=True)
    models["AppUsageDaily"].__table__.create(bind=engine, checkfirst=True)
    models["SnakeScore"].__table__.create(bind=engine, checkfirst=True)
    models["TaskFeedback"].__table__.create(bind=engine, checkfirst=True)
    models["SystemFeedback"].__table__.create(bind=engine, checkfirst=True)
    if "ApprovalRule" in models:
        models["ApprovalRule"].__table__.create(bind=engine, checkfirst=True)
    if "ProjectLogApproval" in models:
        models["ProjectLogApproval"].__table__.create(bind=engine, checkfirst=True)
    for name in ("StageChecklistTemplate", "ProjectStageCheck", "ProjectStageTransition"):
        if name in models:
            models[name].__table__.create(bind=engine, checkfirst=True)
    for name in ("PermissionAssignment", "LabBroadcastItem"):
        if name in models and models[name] is not None:
            models[name].__table__.create(bind=engine, checkfirst=True)
    with engine.begin() as conn:
        project_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(projects)")).fetchall()}
        if project_columns and "current_stage" not in project_columns:
            conn.execute(text("ALTER TABLE projects ADD COLUMN current_stage VARCHAR"))
        project_chats_sql = conn.execute(
            text("SELECT sql FROM sqlite_master WHERE type='table' AND name='project_chats'")
        ).scalar()
        if (
            project_chats_sql
            and "uq_project_chats_project_chat" in project_chats_sql
            and "uq_project_chats_project_chat_topic" not in project_chats_sql
            and "ProjectChat" in models
        ):
            conn.execute(text("PRAGMA foreign_keys=OFF"))
            conn.execute(text("PRAGMA legacy_alter_table=ON"))
            conn.execute(text("ALTER TABLE project_chats RENAME TO project_chats_old"))
            conn.execute(text("DROP INDEX IF EXISTS idx_project_chats_project"))
            conn.execute(text("DROP INDEX IF EXISTS idx_project_chats_chat"))
            models["ProjectChat"].__table__.create(bind=conn, checkfirst=True)
            conn.execute(text(
                "INSERT INTO project_chats ("
                "project_chat_id, project_id, chat_id, chat_name, description, selected_topic_key, "
                "selected_topic_title, sync_enabled, last_synced_at, last_message_at, latest_topic_key, "
                "latest_topic_title, latest_topic_reply_at, created_by, created_at, updated_at"
                ") SELECT "
                "project_chat_id, project_id, chat_id, chat_name, description, selected_topic_key, "
                "selected_topic_title, sync_enabled, last_synced_at, last_message_at, latest_topic_key, "
                "latest_topic_title, latest_topic_reply_at, created_by, created_at, updated_at "
                "FROM project_chats_old"
            ))
            conn.execute(text("DROP TABLE project_chats_old"))
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_project_chats_project_chat_topic_expr "
                "ON project_chats(project_id, chat_id, COALESCE(selected_topic_key, ''))"
            ))
            conn.execute(text("PRAGMA legacy_alter_table=OFF"))
            conn.execute(text("PRAGMA foreign_keys=ON"))
        if project_chats_sql and "ProjectChat" in models:
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_project_chats_project_chat_topic_expr "
                "ON project_chats(project_id, chat_id, COALESCE(selected_topic_key, ''))"
            ))
        lab_interactions_sql = conn.execute(
            text("SELECT sql FROM sqlite_master WHERE type='table' AND name='lab_interactions'")
        ).scalar()
        if lab_interactions_sql and any(kind not in lab_interactions_sql for kind in ("hammer", "whip", "water", "paper_airplane", "firework")):
            conn.execute(text("ALTER TABLE lab_interactions RENAME TO lab_interactions_old"))
            conn.execute(text("DROP INDEX IF EXISTS idx_lab_interactions_target"))
            conn.execute(text("DROP INDEX IF EXISTS idx_lab_interactions_actor"))
            conn.execute(text("DROP INDEX IF EXISTS idx_lab_interactions_created"))
            models["LabInteraction"].__table__.create(bind=conn, checkfirst=True)
            conn.execute(text(
                "INSERT INTO lab_interactions (interaction_id, target_open_id, actor_open_id, kind, note, created_at) "
                "SELECT interaction_id, target_open_id, actor_open_id, kind, note, created_at FROM lab_interactions_old"
            ))
            conn.execute(text("DROP TABLE lab_interactions_old"))
        for table in ("projects", "tasks"):
            rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            if not rows:
                continue
            columns = {row[1] for row in rows}
            if "publication_status" not in columns:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN publication_status VARCHAR NOT NULL DEFAULT 'draft'"))
            if table == "projects" and "workflow_nodes" not in columns:
                conn.execute(text("ALTER TABLE projects ADD COLUMN workflow_nodes TEXT"))
            if table == "tasks":
                if "today_todo_date" not in columns:
                    conn.execute(text("ALTER TABLE tasks ADD COLUMN today_todo_date DATE"))
                if "thinking" not in columns:
                    conn.execute(text("ALTER TABLE tasks ADD COLUMN thinking TEXT"))
                if "progress_draft" not in columns:
                    conn.execute(text("ALTER TABLE tasks ADD COLUMN progress_draft TEXT"))
                if "helper_open_ids" not in columns:
                    conn.execute(text("ALTER TABLE tasks ADD COLUMN helper_open_ids TEXT"))
                if "mentor_open_ids" not in columns:
                    conn.execute(text("ALTER TABLE tasks ADD COLUMN mentor_open_ids TEXT"))
                if "task_origin" not in columns:
                    conn.execute(text("ALTER TABLE tasks ADD COLUMN task_origin VARCHAR NOT NULL DEFAULT 'manual'"))
                if "lark_task_guid" not in columns:
                    conn.execute(text("ALTER TABLE tasks ADD COLUMN lark_task_guid VARCHAR"))
        contribution_rows = conn.execute(text("PRAGMA table_info(contributions)")).fetchall()
        if contribution_rows:
            contribution_columns = {row[1] for row in contribution_rows}
            if "like_count" not in contribution_columns:
                conn.execute(text("ALTER TABLE contributions ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0"))
            if "comment_count" not in contribution_columns:
                conn.execute(text("ALTER TABLE contributions ADD COLUMN comment_count INTEGER NOT NULL DEFAULT 0"))
