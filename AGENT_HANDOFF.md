# Agent Handoff

Last updated: 2026-06-05 10:19 CST

This file is the shared coordination note for Codex and Claude. Keep it short and update it before and after touching production files.

## Protocol

- Before editing, add your name, timestamp, target files, and intent under `Active Work`.
- Do not overwrite another agent's active files unless you have confirmed their work is complete.
- Pull the current remote file before patching. Avoid writing local stale snapshots back to the server.
- After editing, record verification commands and results under `Recent Changes`, then clear your `Active Work` entry.
- Keep entries concise. This is a coordination file, not a full changelog.

## Active Work

- Claude, 2026-06-03 18:30 CST: integrating chat intent cards into real flow. New files (no conflict): `backend/app/services/chat_cards.py` (build/send completion-confirm card + morning broadcast card, queries real DB), `backend/app/services/chat_card_actions.py` (handle card.action.trigger callbacks, writes real Task/ChatIntentLog). Minimal additive changes to Codex's area: `backend/app/routers/lark_callbacks.py` (+ dispatch branch by value.kind), `backend/app/services/scheduler.py` (+ 09:30 cron job append). My own file: `backend/app/services/chat_intelligence.py` (gate complete_task high-conf auto-apply behind card confirmation). Intent: enable production flow for AI-detected completion + daily morning broadcast in collaboration chat oc_1f036. Will not touch frontend during Codex's refactor.

## Recent Changes

- Codex, 2026-06-05 10:19 CST:
  - Checked CloudLab group-message clusters into round tables after pausing todo broadcast.
  - `chat_realtime_sync_extract` scheduler job remains registered; only the 09:30 todo broadcast is paused.
  - `backend/app/services/lark_chat_sync.py`: message-backend clusters now prefer stable `创建时间` before falling back to `发送时间（具体）`/`发送时间`, fixing a future timestamp that polluted the recent 30-minute round-table ordering/window.
  - Verification: backend pytest passed `34 passed`; direct cluster build returned 4 recent clusters with corrected times; production `/api/lab/chat-clusters?...recent_minutes=30` returned 200 with 4 rows, 3 eligible for 2+ member round tables; `/api/health` 200; web/backend services active.

- Codex, 2026-06-05 09:40 CST:
  - Paused automatic todo broadcast per user request.
  - `backend/app/services/scheduler.py`: removed registration of the daily 09:30 `chat_morning_broadcast` cron job. Kept `sync_and_extract_all_chats` realtime chat sync/extraction and kept card/action code untouched for future manual or resumed use.
  - Verification: backend pytest passed `34 passed`; scheduler job list no longer includes `chat_morning_broadcast`; backend service restarted; `/api/health` 200; web/backend services active.

- Codex, 2026-06-04 21:04 CST:
  - Fixed CloudLab group-message sender identity protection.
  - `backend/app/routers/lab.py`: before listing common chats or sending mention messages, backend now reads `lark-cli auth status` and requires `userOpenId` to match the current logged-in member; otherwise returns 409 instead of using the server default CLI user.
  - `frontend/src/api/lab.ts` and `frontend/src/pages/CloudLabPage.tsx`: mention send response includes actual sender fields; success toast shows sender name, and failures display backend identity mismatch details.
  - `backend/tests/test_smoke.py`: added coverage for matching sender identity and refusal when CLI user differs from the logged-in user.
  - Verification: backend pytest passed `34 passed`; frontend build passed; backend service restarted; production mismatch/expired CLI identity returned 409 instead of sending; external checks `/` 200, latest `CloudLabPage-DtONIt3e.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 17:18 CST:
  - Fixed CloudLab availability query failure.
  - `backend/app/routers/calendar.py`: `/api/calendar/freebusy` now normalizes offset datetimes before comparing against expanded class schedule datetimes, preventing aware-vs-naive datetime errors.
  - `backend/tests/test_smoke.py`: added regression coverage for freebusy requests using `+08:00` datetime parameters.
  - Verification: backend pytest passed `34 passed`; backend service restarted; production freebusy with `+08:00` returned 200; external checks `/` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 16:31 CST:
  - Allowed project owners to delete any task under their project and added CloudLab availability query.
  - `backend/app/routers/tasks.py`: project owner can now view/edit/delete tasks in their project even when they are not the task creator or assignee.
  - `frontend/src/pages/ProjectListPage.tsx`: task delete/edit permission now recognizes the owner of the task's project.
  - `frontend/src/pages/CloudLabPage.tsx`: added top toolbar `空闲` panel with time-range inputs, auto default query, free/class/meeting/leave summary, and per-member busy slots from calendar freebusy.
  - `backend/tests/test_smoke.py`: added project-owner task deletion smoke test.
  - Verification: backend pytest passed `33 passed`; frontend build passed; backend service restarted; external checks `/` 200, latest `ProjectListPage-CYglq_x0.js` 200, latest `CloudLabPage-CmCXIyMc.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 16:17 CST:
  - Refined collapsible detail modules and board member list density.
  - `frontend/src/pages/ProjectListPage.tsx`: removed outer `启动与完成评估` label; `完成后` and `关联飞书会议` now default collapsed with explicit expand controls.
  - `frontend/src/pages/BoardPage.tsx`: `此时此刻成员状态` now shows top 6 busiest/risk members by default, with expand/collapse for the rest and resets when switching departments.
  - Verification: frontend build passed; external checks `/` 200, latest `ProjectListPage-BVANz-fE.js` 200, latest `BoardPage-deXzRmKC.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 16:05 CST:
  - Removed daily plan/summary from CloudLab UI.
  - `frontend/src/pages/CloudLabPage.tsx`: removed daily report API imports, state, auto-sync effect, avatar attachment, member sheet daily plan/summary block, and bottom hint reference.
  - CloudLab now stays focused on realtime status, recent half-hour chat clusters, member task context, meetings, and messaging.
  - Backend daily report sync endpoints/tables remain available for future non-CloudLab surfaces.
  - Verification: frontend build passed; external checks `/` 200, latest `CloudLabPage-qDNUANpi.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 15:56 CST:
  - Refined project task actions and CloudLab group messaging.
  - `frontend/src/pages/ProjectListPage.tsx`: project detail task list now has a delete action per editable task; standalone task today-todo action is restyled as a compact status pill (`加今日` / `今日中`).
  - `backend/app/services/lark_chat_sync.py`: `search_visible_chats` now supports `identity`, and added `visible_chat_options` for common visible group selection.
  - `backend/app/routers/lab.py`: added `GET /api/lab/messages/common-chats`; `POST /api/lab/messages/mention` can send to selected `chat_id` and uses lark-cli `--as user` instead of bot.
  - `frontend/src/api/lab.ts`: added common chat API and `send_as` result typing.
  - `frontend/src/pages/CloudLabPage.tsx`: selected member sheet now loads common visible chats, lets manager choose the target chat, and sends mention message to that chat; fallback manual configured chat remains available.
  - `backend/tests/test_smoke.py`: updated message test for common chat listing and user-identity send parameter.
  - Verification: backend pytest passed `32 passed`; frontend build passed; backend service restarted; external checks `/` 200, latest `ProjectListPage-DB-zNDly.js` 200, latest `CloudLabPage-DMBnv67S.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 15:33 CST:
  - Integrated user-provided Feishu Base daily plan/summary table into CloudLab.
  - `backend/app/models/lab_daily.py`: added `LabDailyReport` cache table for Base rows.
  - `backend/app/services/lark_daily_plan_sync.py`: added full sync for Base `L7hwbIV3gaFoB7sJYDtcxM5Tnmg`, table `tblVFSPPbWKWNp4X`, view `vewNT787aB`, mapping member, daily thinking, daily summary, message summaries, and weekly summaries.
  - `backend/app/main.py` and `backend/app/models/__init__.py`: startup creates/exports `lab_daily_reports`.
  - `backend/app/routers/lab.py`: added `POST /api/lab/daily-reports/sync` and `GET /api/lab/daily-reports`; `/api/lab/chat-clusters` now supports `recent_minutes` and defaults to recent 30 minutes.
  - `backend/app/services/lark_chat_sync.py`: recent chat clustering now supports minute-level windows instead of minimum one hour.
  - `frontend/src/api/lab.ts` and `frontend/src/pages/CloudLabPage.tsx`: CloudLab loads daily reports, shows selected member's daily thinking/summary/message context, and refreshes recent 30-minute chat clusters every 60 seconds.
  - `backend/tests/test_smoke.py`: added Base daily report sync smoke test.
  - Verification: backend pytest passed `32 passed`; frontend build passed; backend service restarted; `lab_daily_reports` table confirmed; real Base sync fetched `13` rows; recent 30-minute chat clustering returned `2` clusters; external checks `/` 200, latest `CloudLabPage-CEaWS2n5.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 15:17 CST:
  - Implemented CloudLab quick group mention workflow.
  - `backend/app/models/lab_message.py`: added `LabMessageConfig` for per-manager CloudLab target group chat.
  - `backend/app/main.py` and `backend/app/models/__init__.py`: startup creates/exports `lab_message_configs`.
  - `backend/app/routers/lab.py`: added `GET/PUT /api/lab/message-config` and `POST /api/lab/messages/mention`; managers can configure their own `oc_xxx` chat and send a text message with a Feishu `<at user_id="...">` mention to the selected member.
  - `frontend/src/api/lab.ts`: added typed CloudLab message config/send APIs.
  - `frontend/src/pages/CloudLabPage.tsx`: added compact `消息群` config in the toolbar and `群里@` message input on selected member sheet.
  - `backend/tests/test_smoke.py`: added config/send smoke test with mocked Feishu send.
  - Verification: backend pytest passed `31 passed`; frontend build passed; backend service restarted; `lab_message_configs` table confirmed; external checks `/` 200, `/cloud-lab` 200, latest `CloudLabPage-BVQYULaS.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 11:24 CST:
  - Rebuilt manager operations board in `frontend/src/pages/BoardPage.tsx`.
  - Board now aggregates members, tasks, projects, and synced Lark statuses into an overall/department view.
  - Added manager view for realtime member status/current task, today and weekly execution traces, blocked/open workload, active projects, and department comparisons.
  - Added AI-style judgment lines for risk, weekly rhythm, department load, and executor workflow consistency across today/yesterday/before-yesterday.
  - Verification: backend pytest passed `30 passed`; frontend build passed; external checks `/` 200, `/board` 200, latest `BoardPage-DO3REPfC.js` 200, latest `ProjectListPage-Ca8Q_NYi.js` 200, `/api/health` 200; web/backend services active; listening ports include frontend `5173`, backend `8080`, helper `8081`, and HTTPS `443`.

- Codex, 2026-06-04 11:05 CST:
  - Refined project similarity, members, and workflow node editing.
  - `backend/app/routers/tasks.py`: project task assignee is now automatically added to project members; personal projects become team projects when needed.
  - `frontend/src/pages/ProjectListPage.tsx`: similar project matching now uses project/task content only, not type/category/tags; similar project cards are communication suggestions and no longer have apply buttons.
  - `frontend/src/pages/ProjectListPage.tsx`: project members panel now has an add-member selector/button and appears before recent logs in the project detail flow.
  - `frontend/src/pages/ProjectListPage.tsx`: workflow nodes render as editable cards again; each card edits node title, estimated hours, and review requirement, with add/delete node controls.
  - `backend/tests/test_smoke.py`: added smoke test for auto-adding task assignee to project members.
  - Verification: backend pytest passed `30 passed`; frontend build passed; backend service restarted; external checks `/` 200, latest `ProjectListPage-C3oadKz4.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 10:47 CST:
  - Refined project/task UX in `frontend/src/pages/ProjectListPage.tsx`.
  - Workflow templates are now editable: selecting a standard template fills editable node text, and generated tasks use the edited nodes.
  - In-progress tasks now show the assignee's synced Lark real-time status beside the assignee.
  - Task rows still click to expand/collapse; expanded task blank area click collapses; standalone task action column removed the expand/collapse button and keeps today-todo/delete actions.
  - Similar projects are now split into `做过相似项目` and `正在做相似项目`, showing project owner and participants; recommendation search widened to more backend-known projects.
  - Verification: frontend build passed; external checks `/` 200, latest `ProjectListPage-DyUASF-i.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 10:31 CST:
  - Implemented today todo workflow.
  - `backend/app/models/projects.py`: Task now stores `today_todo_date`, `thinking`, `progress_draft`, and `task_origin`.
  - `backend/app/main.py`: startup migration adds the new task columns to existing SQLite DBs.
  - `backend/app/routers/tasks.py`: `/api/tasks/today` now returns explicitly marked today-todo tasks; added `POST /api/tasks/{id}/today`; added `POST /api/tasks/today/from-thinking` to create today tasks from chat-style daily thinking text.
  - `frontend/src/api/tasks.ts` and `frontend/src/types/api.ts`: added typed fields and APIs.
  - `frontend/src/pages/ProjectListPage.tsx`: added top-level `今日待办` tab, task quick add/remove button, red `缺思路` tag, `群聊识别` tag, task thinking field, progress draft field, and AI-style daily overview for thinking/completion/deviation.
  - `backend/tests/test_smoke.py`: added today-todo and chat-thinking task smoke test.
  - Verification: backend pytest passed `29 passed`; frontend build passed; backend service restarted; tasks columns confirmed; external checks `/` 200, latest `ProjectListPage-C9TpP3HK.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 10:17 CST:
  - Refined task detail expansion layout.
  - `frontend/src/pages/ProjectListPage.tsx`: task start/review controls now render below the top task editor as a full-width section instead of being nested in the left column.
  - `frontend/src/pages/ProjectListPage.tsx`: `启动与完成评估` is internally split into `启动前` and `完成后` columns, so expected duration/reminder/start thinking and actual duration/deviation/reflection are visually balanced.
  - Verification: frontend build passed; external checks `/` 200, latest `ProjectListPage-CB12NlSc.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 10:08 CST:
  - Moved Lark calendar sync UI from project details to Calendar page.
  - `frontend/src/pages/ProjectListPage.tsx`: removed subscribed Lark calendar ID/date/sync controls from project meeting panel; project page now only saves meeting links and displays linked/synced meeting statistics.
  - `frontend/src/pages/CalendarPage.tsx`: added `飞书订阅日历同步` section with calendar ID, start/end date, and sync action.
  - Verification: frontend build passed; external checks `/` 200, latest `CalendarPage-B7jx-wpx.js` 200, latest `ProjectListPage-DgBxkIbg.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 09:59 CST:
  - Implemented project member editing and task expansion layout rebalance.
  - `backend/app/routers/projects.py`: added `PATCH /api/projects/{id}/members/{open_id}` for role/share/tags update.
  - `frontend/src/api/projects.ts`: added `updateProjectMember`.
  - `frontend/src/pages/ProjectListPage.tsx`: project detail member area now shows avatars and inline editable role/share/tags with save/remove actions.
  - `frontend/src/pages/ProjectListPage.tsx`: task expansion now places `启动与完成评估` under the left task title/description panel; standalone task logs also moved left, keeping right side compact for status/priority/assignee/time metadata.
  - `backend/tests/test_smoke.py`: added project member update assertions.
  - Verification: backend pytest passed `28 passed`; frontend build passed; backend service restarted; external checks `/` 200, latest `ProjectListPage-CBbRByiW.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 09:41 CST:
  - Implemented calendar/project meeting follow-up.
  - `backend/app/services/calendar_sync.py`: added batch pull/upsert for a specified Lark calendar ID, including `project:<id>` extraction into `related_project_id`.
  - `backend/app/routers/calendar.py`: added `POST /api/calendar/events/sync-lark`; `GET /api/calendar/events` now supports `related_project_id`.
  - `frontend/src/api/calendar.ts`: added `related_project_id` event filter and `syncLarkCalendarEvents`.
  - `frontend/src/pages/ProjectListPage.tsx`: `关联飞书会议` now has inputs to save a meeting link/title/duration into MeetingNote, inputs to sync a specified Lark calendar ID, and combines saved meeting notes plus synced calendar events for meeting count/duration/link statistics.
  - `frontend/src/pages/ProjectListPage.tsx`: `实时执行态势` removed workstation column and now shows each member's synced Lark status with a refresh action.
  - `backend/tests/test_smoke.py`: added calendar project filter + sync endpoint smoke test; stabilized lab reservation smoke date to current day.
  - Verification: backend pytest passed `28 passed`; frontend build passed; backend service restarted; external checks `/` 200, latest `ProjectListPage-DZ23NdFt.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 02:17 CST:
  - Optimized `frontend/src/pages/ProjectListPage.tsx` per user feedback.
  - `AI 助手配置` is now collapsed by default with only a compact summary row plus `展开配置` / `隐藏配置`.
  - Added `关联飞书会议` panel below the project save actions in inline project details.
  - Project meetings are read from existing meeting notes tagged with `project:<project_id>`.
  - Meeting links are detected from saved attachment URLs, summary, action items, reflection, or location; duration is parsed from text such as `时长 60 分钟`, `会议时长 1 小时`, or `duration: 45 min`.
  - Project efficiency note now includes linked meeting count and recognized meeting duration.
  - Verification: frontend build passed; external checks `/` 200, latest `ProjectListPage-5wNMSpRv.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 01:57 CST:
  - Implemented AI assistant configuration slice.
  - `backend/app/models/ai_assistants.py`: added `AIAssistantConfig` model for global/department assistant profiles.
  - `backend/app/routers/ai_assistants.py`: added list/create/update endpoints at `/api/ai-assistants`; staff/admin can configure, all authenticated users can read.
  - `backend/app/models/__init__.py` and `backend/app/main.py`: exported model, mounted router, startup creates `ai_assistant_configs`.
  - `frontend/src/api/aiAssistants.ts`: added typed AI assistant API.
  - `frontend/src/pages/ProjectListPage.tsx`: added compact `AI 助手配置` panel above management overview; managers can create/edit general or department assistants, everyone can see active configs.
  - `backend/tests/test_smoke.py`: added AI assistant config CRUD smoke test.
  - Verification: backend pytest passed `27 passed`; frontend build passed; backend service restarted; `ai_assistant_configs` table confirmed; external checks `/` 200, latest `ProjectListPage-Dq3Og-He.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 01:45 CST:
  - Implemented contribution comments slice.
  - `backend/app/models/contributions.py`: added `ContributionComment` model and relationship.
  - `backend/app/models/__init__.py`: exports `ContributionComment`.
  - `backend/app/main.py`: startup creates `contribution_comments` table.
  - `backend/app/routers/contributions.py`: added `GET /api/contributions/{id}/comments` and `POST /api/contributions/{id}/comments`; creating a comment increments `comment_count`.
  - `frontend/src/api/contributions.ts`: added `ContributionComment`, `listContributionComments`, and `createContributionComment`.
  - `frontend/src/pages/ProjectListPage.tsx`: project knowledge rows can expand comments, show author/time/content, and submit new comments inline.
  - `backend/tests/test_smoke.py`: extended contribution interaction test for comment list/create/count.
  - Verification: backend pytest passed `26 passed`; frontend build passed; backend service restarted; `contribution_comments` table confirmed; external checks `/` 200, latest `ProjectListPage-BXkFnPN9.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 01:28 CST:
  - Implemented contribution interaction metrics slice.
  - `backend/app/models/contributions.py`: added `like_count` and `comment_count`.
  - `backend/app/main.py`: startup migration adds missing contribution interaction columns on existing SQLite DBs.
  - `backend/app/routers/contributions.py`: `ContributionRead` now returns interaction counters; added `POST /api/contributions/{id}/interactions` for `like` / `comment` increments.
  - `frontend/src/api/contributions.ts`: added interaction fields and `recordContributionInteraction`.
  - `frontend/src/pages/ProjectListPage.tsx`: project knowledge list now shows `赞/评`, supports liking a knowledge item, and project daily/weekly summary aggregates real knowledge interaction counts.
  - `backend/tests/test_smoke.py`: added contribution interaction smoke test.
  - Verification: backend pytest passed `26 passed`; frontend build passed; backend service restarted; production DB columns confirmed; external checks `/` 200, latest `ProjectListPage-vI9JyCtO.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 00:55 CST:
  - Implemented similar-project / reusable-flow recommendation slice.
  - `frontend/src/pages/ProjectListPage.tsx`:
    - Loads a visible project history pool across planning/active/paused/completed/archived projects.
    - Project expansion now shows `相似项目与可复用流程` inside `项目流程拆解`.
    - Recommendations use project name/description/tag/department token overlap, same category, same department, same type, completed status, and available task nodes.
    - Recommendation cards show comparable project, people who worked on it, matched keywords, and sample task nodes.
    - `套用` converts a similar project's task list into custom workflow nodes (`节点 | 预计小时 | 审核说明`) and fills default assignee/reviewer.
  - Frontend build passed: `cd frontend && npm run build`.
  - External checks: `/` 200, latest `ProjectListPage-Bpk_r2C4.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 00:37 CST:
  - Implemented project daily/weekly summary slice.
  - `frontend/src/pages/ProjectListPage.tsx`:
    - Project expansion now shows `项目日报 / 周报摘要`.
    - Summarizes task updates in the last 24h and 7d, tasks completed this week, knowledge document count, knowledge hours, chat message interaction count, derived/transformed project count, and average contribution score when present.
    - Adds rule-based summary lines for project rhythm, weekly completion, knowledge sedimentation, and chat interaction.
    - Does not display fake like/comment data; notes that true likes/comments require knowledge module interaction fields.
  - Frontend build passed: `cd frontend && npm run build`.
  - External checks: `/` 200, latest `ProjectListPage-CX3jdV68.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 00:31 CST:
  - Implemented task-start historical recommendation slice.
  - `frontend/src/pages/ProjectListPage.tsx`:
    - Loads a visible historical task pool.
    - Task expansion now shows `相似历史任务` above the start/focus form.
    - Recommendations use title/description/project/tag token overlap, same project, same assignee, same category, and completed status.
    - Recommended rows show source project, assignee, matched keywords, status, and known actual focus time when available.
    - Opening a task preloads focus summaries for recommended tasks.
  - Frontend build passed: `cd frontend && npm run build`.
  - External checks: `/` 200, latest `ProjectListPage-BcGvczRY.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 00:17 CST:
  - Implemented the first management overview / rule-based AI judgment slice.
  - `frontend/src/pages/ProjectListPage.tsx`:
    - Added `管理概览` above the project/task table.
    - Project mode summarizes project count, completion rate, abnormal projects, and stalled projects.
    - Task mode summarizes due today, due this week, overdue, and blocked tasks.
    - Added rule-based `AI 辅助判断` cards for overdue risk, blocked work, overloaded assignees, abnormal projects, stalled projects, and low completion rate.
    - This is heuristic only; no model call yet.
  - Frontend build passed: `cd frontend && npm run build`.
  - External checks: `/` 200, latest `ProjectListPage-Da-kFnig.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-04 00:00 CST:
  - Implemented Project Management -> Cloud Lab member focus link.
  - `frontend/src/pages/ProjectListPage.tsx`:
    - `实时执行态势` rows now include a `查看` workstation action for assigned members.
    - The action navigates to `/cloud-lab?member_open_id=<open_id>`.
  - `frontend/src/pages/CloudLabPage.tsx`:
    - Reads `member_open_id` / `focus_member` URL params.
    - When avatars load, auto-selects the target member, opens the task panel, and switches to the member's area when applicable.
  - Frontend build passed: `cd frontend && npm run build`.
  - External checks: `/` 200, latest `ProjectListPage-Bl_y7j5g.js` 200, latest `CloudLabPage-Cj1vo9M2.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-03 23:39 CST:
  - Implemented the first real-time execution status slice for managers.
  - `frontend/src/pages/ProjectListPage.tsx`:
    - Added `实时执行态势` panel inside inline project expansion.
    - Shows current in-progress task count, actionable task count, blocked count, overdue count.
    - Groups active/open/blocked tasks by assignee/creator and shows each member's current task, status, overdue count, blocked count, and task count.
    - Added `安排会议` entry to jump to the calendar for immediate meeting scheduling.
    - This is the first visibility layer before deeper Cloud Lab virtual workstation and meeting/share-screen integration.
  - Frontend build passed: `cd frontend && npm run build`.
  - External checks: `/` 200, latest `ProjectListPage-DFVkdtFO.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-03 22:29 CST:
  - Implemented the first project efficiency metrics slice.
  - `frontend/src/pages/ProjectListPage.tsx`:
    - Project expansion now loads focus summaries for its tasks.
    - Added `项目效能` panel with planned total time, actual focus time, deviation, per-person effort, and completed task count.
    - Metrics derive planned time from `planned_start_date` → `due_date` and actual time from existing task focus summaries.
    - Added manual refresh for actual focus time.
    - Notes that meeting count, guidance time, and chat interaction metrics will be connected to calendar/meeting/chat data later.
  - Frontend build passed: `cd frontend && npm run build`.
  - External checks: `/` 200, latest `ProjectListPage-D3g9Go8l.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-03 22:12 CST:
  - Implemented project-linked knowledge statistics/list in project management.
  - `frontend/src/pages/ProjectListPage.tsx`:
    - Project expansion now loads existing `Contribution` document entries tagged with `project:<project_id>`.
    - Detail metadata shows project knowledge count.
    - Added `项目知识` section with refresh action, title, contributor, date, task tag, and short summary.
    - Newly created task knowledge entries are inserted into the expanded project's knowledge list immediately.
  - Frontend build passed: `cd frontend && npm run build`.
  - External checks: `/` 200, latest `ProjectListPage-DfsM1nMz.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-03 22:11 CST:
  - Implemented task-to-knowledge sedimentation entry point.
  - `frontend/src/pages/ProjectListPage.tsx`:
    - Task finish panel now defaults to `同步为知识文档`.
    - Finishing a task can create an existing `Contribution` entry of type `document`.
    - Knowledge entries include task/project context, goal result, expected vs actual time, deviation reason, and reflection text.
    - Knowledge entries are tagged with `任务知识`, `project:<id>`, and `task:<id>` for later project knowledge statistics.
    - Contribution creation failure does not block task completion, but shows a failure toast.
  - Frontend build passed: `cd frontend && npm run build`.
  - External checks: `/` 200, latest `ProjectListPage-DIgEfikH.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-03 21:50 CST:
  - Implemented the project startup workflow slice.
  - `frontend/src/pages/ProjectListPage.tsx`:
    - Added `项目流程拆解` inside inline project expansion.
    - Supports standard workflow templates for `开发/科研/竞赛/培训`.
    - Supports custom workflow nodes with `节点名 | 预计小时 | 审核说明` format.
    - `启动项目并生成任务` sets the project active, starts it, and bulk-creates sequenced tasks using existing task APIs.
    - Generated tasks include expected duration, review requirements, reviewer note, and knowledge-sedimentation prompt in task descriptions.
  - Frontend build passed: `cd frontend && npm run build`.
  - External checks: `/` 200, latest `ProjectListPage-GFTSv__5.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-03 21:27 CST:
  - Implemented the first slice of the project/task monitoring loop in project management.
  - `frontend/src/pages/ProjectListPage.tsx`:
    - Task expansion now has a `启动与完成评估` panel in both task-list mode and expanded project tasks.
    - Starting a task defaults to 60 minutes, records expected duration, reminder time, and start thinking through existing task focus APIs.
    - Starting a task sets it to `in_progress`, records `planned_start_date`, and fills `due_date` with expected end time when it was empty.
    - Reminder time schedules a page-session focus heartbeat card/log while the page remains open.
    - Ending a task records actual duration, goal-achievement result, deviation reason, and finish reflection, then marks the task done.
    - Historical actual focus time is shown from existing focus summary.
  - Frontend build passed: `cd frontend && npm run build`.
  - External checks: `/` 200, latest `ProjectListPage-Cf84Uf65.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-03 21:00 CST:
  - Refined project inline edit controls and section hierarchy.
  - `frontend/src/pages/ProjectListPage.tsx`:
    - Department is now a select populated from member/project departments instead of free text.
    - Project date fields are now native date pickers.
    - Large category tags are now selectable (`开发/科研/竞赛/培训`) and stored back into the existing tags field with custom tags.
    - Section headers such as `项目任务`, `群聊与话题`, `最近日志`, and `任务变更日志` are slightly bolder for faster scanning.
  - Frontend build passed: `cd frontend && npm run build`.
  - External checks: `/` 200, latest `ProjectListPage-aM8oJ8Af.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-03 17:48 CST:
  - Tightened the project management inline detail layout per user feedback.
  - `frontend/src/pages/ProjectListPage.tsx`:
    - Task inline editors now support changing assignee in both task-list mode and expanded project task rows.
    - Project inline editor now also exposes start date, target end date, actual end date, and points for direct editing.
    - Project details keep metadata above the activity area; logs now sit on the left with more usable space, and members sit on the right.
    - Related projects remain as a compact summary so they no longer consume a large blank column.
    - Lark chat/topic selector is now collapsible, only appears after searching, and auto-collapses after a topic is associated and synced.
  - Frontend build passed: `cd frontend && npm run build`.
  - Production entry was not restarted. Stable web entry `:8081` picked up the new `frontend/dist` build directly.
  - External checks: `/` 200, latest `ProjectListPage-BFrIVCuB.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-03 18:07 CST:
  - Extended project list inline expansion without restoring navigation.
  - `frontend/src/pages/ProjectListPage.tsx`:
    - Project expansion now lets project tasks expand/edit inline inside the expanded project.
    - Relation display is now a compact summary so it does not compete with logs and tasks for space.
    - Logs get a larger scrollable area.
    - Chat/topic functionality was restored inline: search visible Lark chats, load chat topics, associate selected topic, sync linked chat, and expand synced topic messages.
  - Frontend build passed: `cd frontend && npm run build`.
  - Production entry was not restarted. Stable web entry `:8081` picked up the new `frontend/dist` build directly.
  - External checks: `/` 200, latest `ProjectListPage-*.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-03 17:48 CST:
  - Restored detail context inside the project management list inline expansions.
  - `frontend/src/pages/ProjectListPage.tsx`:
    - Project row expansion now loads full project detail, project tasks, project relations, and project logs.
    - Project expansion now shows members, chats, relations, recent logs, detailed metadata, and task list in addition to inline editing.
    - Task row expansion now loads and shows task audit logs plus created/updated/completed/receipt context in addition to inline editing.
  - Frontend build passed: `cd frontend && npm run build`.
  - Production entry was not restarted. Stable web entry `:8081` picked up the new `frontend/dist` build directly.
  - External checks: `/` 200, latest `ProjectListPage-*.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-03 17:31 CST:
  - Reworked project management list views to expand/edit rows inline.
  - `frontend/src/pages/ProjectListPage.tsx`:
    - Project rows now expand inside the current project view instead of navigating to `/projects/:id`.
    - Inline project expansion supports editing name, description, status, priority, type, department, and tags.
    - Task rows now expand inside the current task view instead of navigating to `/tasks/:id/edit`.
    - Inline task expansion supports editing title, description, status, and priority.
    - Row actions now use `展开/收起` plus quick delete where permitted.
  - Frontend build passed: `cd frontend && npm run build`.
  - Production entry was not restarted. Stable web entry `:8081` picked up the new `frontend/dist` build directly.
  - External checks: `/` 200, latest `ProjectListPage-*.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-03 17:14 CST:
  - Reworked project detail to use inline expanded viewing/editing.
  - `frontend/src/pages/ProjectDetailPage.tsx`:
    - Project overview is now always visible and includes an inline project edit section on the same page.
    - Removed the project edit navigation button from the project detail operations.
    - Task rows now expand in-place below the selected row for viewing/editing instead of opening a popup or navigating.
    - Inline task expansion supports editing title, description, status, priority, assignee, save, notify-again, collapse, and viewing task logs.
  - Frontend build passed: `cd frontend && npm run build`.
  - Production entry was not restarted. Stable web entry `:8081` picked up the new `frontend/dist` build directly.
  - External checks: `/` 200, latest `ProjectDetailPage-*.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-03 16:56 CST:
  - Reworked project detail task interaction.
  - `frontend/src/pages/ProjectDetailPage.tsx`:
    - Replaced the project task board with a compact table-style task list matching the project management panel direction.
    - Kept assignee filtering and added dense columns for task title, status, assignee, priority, due date, and actions.
    - Clicking a task now opens a narrow right-side inline editor popup instead of navigating to the standalone task edit page.
    - The popup supports editing title, description, status, priority, and assignee, plus delete and notify-again actions.
  - Frontend build passed: `cd frontend && npm run build`.
  - Production entry was not restarted. Stable web entry `:8081` picked up the new `frontend/dist` build directly.
  - External checks: `/` 200, latest `ProjectDetailPage-*.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-03 16:39 CST:
  - Improved project detail task board and task detail project scoping.
  - `frontend/src/pages/ProjectDetailPage.tsx`:
    - Task status columns now align to the top and scroll independently with a max height, so one busy status no longer stretches the whole board.
    - Added assignee filtering in the project task tab with `全部负责人`, project members, task-only assignees, and `未分配`.
    - The related-project popup now requests projects scoped to the current user's `open_id`.
  - `frontend/src/pages/TaskFormPage.tsx`:
    - The task detail/edit page now loads related project options scoped to the current user instead of all projects.
  - Frontend build passed: `cd frontend && npm run build`.
  - Production entry was not restarted. Stable web entry `:8081` picked up the new `frontend/dist` build directly.
  - External checks: `/` 200, latest `ProjectDetailPage-*.js` 200, latest `TaskFormPage-*.js` 200, `/api/health` 200, web/backend services active.

- Codex, 2026-06-03 16:23 CST:
  - Added mobile adaptation and assignee filtering for the project management panel.
  - `frontend/src/pages/ProjectListPage.tsx`:
    - Mobile layout now stacks top controls, hides lower-priority sidebar sections, and wraps table content in horizontal scroll containers.
    - Task mode now has an assignee filter dropdown with `全部负责人`, individual assignees, and `未分配负责人`.
    - Task/project tables keep compact desktop density while avoiding button overflow on mobile.
  - Reworked task detail/edit page into the same enterprise workbench style.
  - `frontend/src/pages/TaskFormPage.tsx`:
    - Added compact topbar, main editor area, right-side property panel, 1px borders, smaller form fields, and mobile stacking.
    - Kept existing create/update/publish behavior and member picker.
  - Frontend build passed: `cd frontend && npm run build`.
  - Production entry was not restarted. Stable web entry `:8081` picked up the new `frontend/dist` build directly.
  - External checks: `/` 200, latest `ProjectListPage-*.js` 200, latest `TaskFormPage-*.js` 200, `/api/health` 200.

- Codex, 2026-06-03 16:12 CST:
  - Rebuilt the project management panel into a higher-density enterprise workbench style.
  - `frontend/src/pages/ProjectListPage.tsx`:
    - Replaced mobile/card-heavy layout with a fixed-height top workbar, 220px left sidebar, and dense main table area.
    - Project view now uses table rows with aligned columns for owner, status, priority, progress, task count, update time, and row actions.
    - Task view keeps quick deletion and now presents admin/staff users with assignee-grouped task tables.
    - Visual language adjusted toward Feishu Projects / Jira / Teambition: white/light-gray surfaces, 1px dividers, compact controls, small low-saturation tags, restrained shadows.
  - Frontend build passed: `cd frontend && npm run build`.
  - Production entry was not restarted. Stable web entry `:8081` picked up the new `frontend/dist` build directly.
  - External checks: `/` 200, latest `ProjectListPage-*.js` 200, `/api/health` 200.
  - Playwright could not visually inspect the authenticated project page because ordinary browser access is blocked by the Feishu environment gate, but the production chunk contains `pm-workbench`, `pm-table`, `项目视图`, and `按负责人查看任务`.

- Codex, 2026-06-03 15:46 CST:
  - Improved task mode on the project management page.
  - `frontend/src/pages/ProjectListPage.tsx`:
    - Task cards now have a quick `×` delete button for users with delete permission.
    - Admin/staff task mode now groups tasks by assignee, with unassigned tasks grouped last.
    - Delete uses the existing task delete API and removes the task from the current list after confirmation.
  - Frontend build passed: `cd frontend && npm run build`.
  - Production entry was not restarted. Stable web entry `:8081` picked up the new `frontend/dist` build directly.
  - External checks: `/` 200, latest `ProjectListPage-*.js` 200, `/api/health` 200.

- Claude, 2026-06-03 15:44 CST:
  - Removed 「软件开发流程节点」 module per user request:
    - `frontend/src/pages/ProjectDetailPage.tsx`
    - Deleted unconditional Card block (lines ~1086-1186) showing the 5-stage dev-flow grid (需求确认/原型验证/开发联调/测试验收/上线运维).
    - Deleted now-dead `developmentFlow` useMemo (~L401-412).
    - **Kept** `developmentStages` array + `getDevelopmentStageStatus` + `getDevelopmentStageTasks` + `developmentStageStyle` (currently dead but `developmentStages` is still referenced by Codex's `isDevelopmentProject` check at ~L980 — left intact to avoid breaking Codex's gating logic).
  - Verification:
    - `cd frontend && npm run build` passed (1m06s).
    - ProjectDetailPage chunk 46.54 kB → 44.30 kB (-2.24 kB).
  - Backend untouched.

- Codex, 2026-06-03 15:42 CST:
  - Aligned task deletion UX with project quick delete.
  - `frontend/src/pages/ProjectDetailPage.tsx`: task board cards now show a top-right `×` quick delete button for users with delete permission.
  - The quick delete reuses existing task delete confirmation and stops click propagation so it does not open task detail.
  - Frontend build passed: `cd frontend && npm run build`.
  - Production entry was not restarted. Stable web entry `:8081` picked up the new `frontend/dist` build directly.
  - External checks: `/` 200, latest `ProjectDetailPage-*.js` 200, `/api/health` 200.

- Codex, 2026-06-03 15:37 CST:
  - Stabilized production entry to prevent repeated "cannot enter" incidents during backend restarts.
  - New stable web entry:
    - `scripts/spa_proxy.py`
    - user service `/home/ubuntu/.config/systemd/user/insight-lab-web.service`
    - repo template `deploy/systemd/insight-lab-web.service`
  - Tailscale Funnel now points to `http://127.0.0.1:8081`, not backend `:8080`.
  - `insight-lab-web.service` serves `frontend/dist` directly and proxies `/api/*` to backend `:8080`.
  - Controlled test passed: with backend stopped, `/` from 8081 still returned 200 and `/api/health` returned 502; after backend restart `/api/health` returned 200.
  - `scripts/deploy_prod.sh` now defaults to `insight-lab-backend.service` and documents that frontend-only builds do not require restarting the web entry.
  - Current production checks:
    - `tailscale serve status`: Funnel on, `/ proxy http://127.0.0.1:8081`.
    - `insight-lab-web.service`: enabled + active.
    - `insight-lab-backend.service`: enabled + active.
    - External `https://vm-0-17-ubuntu.tail30ebf9.ts.net/`, `/cloud-lab`, `/api/health`: all 200.

- Claude, 2026-06-03 15:23 CST:
  - Added AI chat-todo-extraction feature for group `oc_1f0362526d814bc43cab99857a90a27e` (linked to virtual project "实验室运营" project_id=6, project_chat_id=3).
  - New files (no overlap with Codex):
    - `backend/app/models/chat_intent_logs.py` (new table `chat_intent_logs`, created via metadata.create_all).
    - `backend/app/services/chat_intelligence.py` (DeepSeek-driven extract + auto-apply, group msgs into topic/thread/10-min windows, confidence-gated two-stage landing).
    - `backend/app/routers/chat_insights.py` (GET list/detail, POST extract/approve/reject/cancel, GET chats/list).
    - `frontend/src/api/chatInsights.ts` + `frontend/src/pages/ChatInsightsPage.tsx` (admin-only approval UI at `/chat-insights`).
  - Minimal additive wire-up (append-only, no rewrites):
    - `backend/app/main.py`: added `chat_insights` to router import and `app.include_router(chat_insights.router)`.
    - `backend/app/models/__init__.py`: added `from .chat_intent_logs import ChatIntentLog`.
    - `frontend/src/routes.tsx`: added lazy import + `{ path: "/chat-insights", element: <ChatInsightsPage /> }`.
  - **Did NOT touch** `NavBar.tsx` / `ProfilePage.tsx` / `AdminConsolePage.tsx` to avoid Codex conflicts. Entry is URL-only at `/chat-insights`; a nav link can be added later.
  - Verification:
    - `python -c "from app.main import app"` → 7 `/api/chat-insights*` routes registered.
    - `systemctl --user restart insight-lab-backend.service` → up, `/api/health` 200.
    - `curl /api/chat-insights/chats/list` → 401 (admin-only as designed).
    - `cd frontend && npm run build` → passed (1m04s).
    - First real extraction on 24h history: 16 msgs examined → 7 intents (6 auto_applied conf=0.90 → Task #146-151 created with ProjectLog, 1 pending conf=0.70).

- Codex, 2026-06-03 15:11 CST:
  - Fixed Cloud Lab feedback:
    - `frontend/src/pages/CloudLabPage.tsx`
    - BU/specialty filtering now also filters chat-cluster members.
    - Workstation avatars now use `visibleAvatars`, so filtered-out departments do not leak into seats.
    - Task/detail text wraps long chat content instead of overflowing.
    - View hint now explicitly says to click the scene before WASD and explains computer snap-back.
  - Fixed project detail feedback:
    - `frontend/src/pages/ProjectDetailPage.tsx`
    - Development flow is hidden for paper/research projects and only shown for development-like projects.
    - Project chat message content now uses safer wrapping and bounded width.
  - Fixed class schedule feedback:
    - `backend/app/services/class_schedule_sync.py`
    - Period 1 now starts at 08:30, period 3 ends at 10:50.
    - Explicit time ranges in `节次范围` / `上课时间` / `时间` are parsed first.
  - Fixed startup/load issue:
    - `frontend/index.html`
    - Feishu H5 SDK script changed to `defer` so CDN delay cannot block React startup.

## Verification

- Backend tests: `cd /home/ubuntu/insight-lab-profile/backend; .venv/bin/pytest -q` passed, 25 tests.
- Frontend build: `cd /home/ubuntu/insight-lab-profile/frontend; npm run build` passed.
- Services restarted at 2026-06-03 15:11 CST:
  - `systemctl --user restart insight-lab-backend.service`
  - `npm run dev -- --host 0.0.0.0`
- External checks on `https://vm-0-17-ubuntu.tail30ebf9.ts.net/`:
  - `/` returned 200.
  - `/cloud-lab` returned 200.
  - `/api/health` returned 200 with `{"status":"ok","db":true}`.
- Feishu replies:
  - Codex replied to 9 feedback messages in group `oc_106acdd5fdeca37e3640e6e882e00a5c` at 2026-06-03 15:19 CST.
  - Covered loading stuck, paper project development flow, BU filtering, course time, draggable computer guidance, WASD guidance, chat overflow, and two earlier "stuck/cannot enter" reports.

## Open Items

- If Claude continues feature work, please update `Active Work` before editing shared frontend pages or backend routers.
