-- insight-lab-profile · SQLite 镜像 schema v0.2
-- 真理源在飞书 Base, 此库为本地加速镜像 (读快/全文搜索/聚合)
-- 写操作: API 先写 Base, 成功后镜像到此库
-- 同步: 5 min 增量轮询 + 每晚全量校对

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ============================================================
-- 表 1. members 人员主表
-- ============================================================
CREATE TABLE IF NOT EXISTS members (
    open_id          TEXT PRIMARY KEY,
    base_record_id   TEXT UNIQUE,              -- Base 端 record_id
    name             TEXT NOT NULL,
    en_name          TEXT,
    email            TEXT,
    mobile           TEXT,
    avatar_url       TEXT,
    role             TEXT NOT NULL CHECK(role IN ('student','teacher','staff','admin')),
    department       TEXT,
    title            TEXT,
    enroll_date      DATE,
    graduate_date    DATE,
    research_area    TEXT,                     -- JSON array
    bio              TEXT,
    status           TEXT NOT NULL DEFAULT 'active'
                     CHECK(status IN ('active','on_leave','graduated','left')),
    privacy_level    TEXT NOT NULL DEFAULT 'internal'
                     CHECK(privacy_level IN ('public','internal','private')),
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_members_dept   ON members(department);
CREATE INDEX IF NOT EXISTS idx_members_role   ON members(role);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);

-- ============================================================
-- 表 2. advising 师生关系 (支持多导师/联培)
-- ============================================================
CREATE TABLE IF NOT EXISTS advising (
    advising_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    base_record_id   TEXT UNIQUE,
    student_open_id  TEXT NOT NULL,
    advisor_open_id  TEXT NOT NULL,
    role             TEXT NOT NULL CHECK(role IN ('primary','co_advisor','external')),
    start_date       DATE NOT NULL,
    end_date         DATE,
    notes            TEXT,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_open_id) REFERENCES members(open_id),
    FOREIGN KEY (advisor_open_id) REFERENCES members(open_id)
);
CREATE INDEX IF NOT EXISTS idx_advising_student ON advising(student_open_id);
CREATE INDEX IF NOT EXISTS idx_advising_advisor ON advising(advisor_open_id);

-- ============================================================
-- 表 3. papers 论文
-- ============================================================
CREATE TABLE IF NOT EXISTS papers (
    paper_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    base_record_id   TEXT UNIQUE,
    title            TEXT NOT NULL,
    authors_text     TEXT NOT NULL,
    venue            TEXT NOT NULL,
    venue_type       TEXT NOT NULL CHECK(venue_type IN ('journal','conference','workshop','preprint')),
    venue_level      TEXT,
    year             INTEGER NOT NULL,
    publish_date     DATE,
    doi              TEXT,
    arxiv_id         TEXT,
    url              TEXT,
    pdf_url          TEXT,
    abstract         TEXT,
    status           TEXT NOT NULL CHECK(status IN ('published','accepted','under_review','in_progress','rejected')),
    keywords         TEXT,                     -- JSON array
    citation_count   INTEGER DEFAULT 0,
    notes            TEXT,
    created_by       TEXT NOT NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES members(open_id)
);
CREATE INDEX IF NOT EXISTS idx_papers_year     ON papers(year);
CREATE INDEX IF NOT EXISTS idx_papers_venue    ON papers(venue);
CREATE INDEX IF NOT EXISTS idx_papers_status   ON papers(status);
CREATE VIRTUAL TABLE IF NOT EXISTS papers_fts USING fts5(
    title, abstract, authors_text, notes,
    content='papers', content_rowid='paper_id'
);

-- ============================================================
-- 表 4. paper_authors 论文-作者关联 (保序)
-- ============================================================
CREATE TABLE IF NOT EXISTS paper_authors (
    paper_author_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    base_record_id   TEXT UNIQUE,
    paper_id         INTEGER NOT NULL,
    author_open_id   TEXT NOT NULL,
    author_order     INTEGER NOT NULL,
    role             TEXT NOT NULL,            -- 可多值, JSON array: ['first','corresponding']
    affiliation      TEXT,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE,
    FOREIGN KEY (author_open_id) REFERENCES members(open_id),
    UNIQUE(paper_id, author_open_id),
    UNIQUE(paper_id, author_order)
);
CREATE INDEX IF NOT EXISTS idx_pa_author ON paper_authors(author_open_id);

-- ============================================================
-- 表 5. competitions 比赛
-- ============================================================
CREATE TABLE IF NOT EXISTS competitions (
    comp_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    base_record_id   TEXT UNIQUE,
    name             TEXT NOT NULL,
    organizer        TEXT NOT NULL,
    level            TEXT NOT NULL,
    category         TEXT,                     -- JSON array
    start_date       DATE,
    end_date         DATE NOT NULL,
    team_lead_open_id TEXT,
    award_level      TEXT NOT NULL,
    rank             TEXT,
    score            REAL,
    certificate_url  TEXT,
    project_url      TEXT,
    description      TEXT,
    reflection       TEXT,
    created_by       TEXT NOT NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_lead_open_id) REFERENCES members(open_id),
    FOREIGN KEY (created_by) REFERENCES members(open_id)
);

-- 比赛队员关联表 (拍平 team_members 多选)
CREATE TABLE IF NOT EXISTS competition_members (
    comp_id          INTEGER NOT NULL,
    member_open_id   TEXT NOT NULL,
    member_role      TEXT NOT NULL DEFAULT 'member' CHECK(member_role IN ('member','advisor')),
    PRIMARY KEY (comp_id, member_open_id, member_role),
    FOREIGN KEY (comp_id) REFERENCES competitions(comp_id) ON DELETE CASCADE,
    FOREIGN KEY (member_open_id) REFERENCES members(open_id)
);
CREATE INDEX IF NOT EXISTS idx_cm_member ON competition_members(member_open_id);

-- ============================================================
-- 表 6. meeting_notes 会议心得
-- ============================================================
CREATE TABLE IF NOT EXISTS meeting_notes (
    note_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    base_record_id   TEXT UNIQUE,
    owner_open_id    TEXT NOT NULL,
    meeting_title    TEXT NOT NULL,
    meeting_date     DATE NOT NULL,
    meeting_type     TEXT NOT NULL,
    external_participants TEXT,
    location         TEXT,
    lark_minute_token TEXT,
    summary          TEXT NOT NULL,
    my_reflection    TEXT,
    action_items     TEXT,
    attachment_urls  TEXT,                     -- JSON array
    tags             TEXT,                     -- JSON array
    source           TEXT NOT NULL CHECK(source IN ('manual','auto_minute','imported')),
    review_status    TEXT NOT NULL DEFAULT 'draft' CHECK(review_status IN ('draft','submitted')),
    privacy_level    TEXT NOT NULL DEFAULT 'internal' CHECK(privacy_level IN ('public','internal','private')),
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_open_id) REFERENCES members(open_id)
);
CREATE INDEX IF NOT EXISTS idx_mn_owner ON meeting_notes(owner_open_id);
CREATE INDEX IF NOT EXISTS idx_mn_date  ON meeting_notes(meeting_date);
CREATE VIRTUAL TABLE IF NOT EXISTS meeting_notes_fts USING fts5(
    meeting_title, summary, my_reflection, action_items,
    content='meeting_notes', content_rowid='note_id'
);

-- 会议参与人关联表 (组内)
CREATE TABLE IF NOT EXISTS meeting_participants (
    note_id          INTEGER NOT NULL,
    member_open_id   TEXT NOT NULL,
    PRIMARY KEY (note_id, member_open_id),
    FOREIGN KEY (note_id) REFERENCES meeting_notes(note_id) ON DELETE CASCADE,
    FOREIGN KEY (member_open_id) REFERENCES members(open_id)
);

-- ============================================================
-- 表 7. awards 奖项/荣誉
-- ============================================================
CREATE TABLE IF NOT EXISTS awards (
    award_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    base_record_id   TEXT UNIQUE,
    recipient_open_id TEXT NOT NULL,
    name             TEXT NOT NULL,
    level            TEXT NOT NULL,
    category         TEXT NOT NULL,
    issuer           TEXT NOT NULL,
    award_date       DATE NOT NULL,
    amount           REAL,
    certificate_url  TEXT,
    description      TEXT,
    created_by       TEXT NOT NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recipient_open_id) REFERENCES members(open_id),
    FOREIGN KEY (created_by) REFERENCES members(open_id)
);
CREATE INDEX IF NOT EXISTS idx_awards_recipient ON awards(recipient_open_id);

-- ============================================================
-- 表 8. trainings 培训/活动
-- ============================================================
CREATE TABLE IF NOT EXISTS trainings (
    training_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    base_record_id   TEXT UNIQUE,
    participant_open_id TEXT NOT NULL,
    name             TEXT NOT NULL,
    type             TEXT NOT NULL,
    organizer        TEXT,
    start_date       DATE NOT NULL,
    end_date         DATE,
    location         TEXT,
    hours            REAL,
    has_certificate  BOOLEAN DEFAULT 0,
    certificate_url  TEXT,
    reflection       TEXT,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (participant_open_id) REFERENCES members(open_id)
);
CREATE INDEX IF NOT EXISTS idx_trainings_participant ON trainings(participant_open_id);

-- ============================================================
-- 表 9. audit_log 审计
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
    log_id           INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_open_id    TEXT NOT NULL,
    action           TEXT NOT NULL CHECK(action IN ('create','update','delete','export')),
    target_table     TEXT NOT NULL,
    target_id        TEXT NOT NULL,
    diff             TEXT,
    ip               TEXT,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (actor_open_id) REFERENCES members(open_id)
);
CREATE INDEX IF NOT EXISTS idx_audit_actor  ON audit_log(actor_open_id);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_table, target_id);

-- ============================================================
-- 同步元数据
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_state (
    table_name       TEXT PRIMARY KEY,
    last_sync_at     TIMESTAMP,
    last_base_cursor TEXT,
    rows_synced      INTEGER DEFAULT 0,
    last_error       TEXT
);
