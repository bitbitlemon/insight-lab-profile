# insight-lab-profile Base Schema v0.2

> 飞书多维表格 (Base) 为真理源,SQLite 镜像本地加速。
> 字段命名:Base 端中文显示名,代码端 `snake_case`;`open_id` 为人员关联键。

**v0.2 决策摘要** (6 个推荐方案已敲定):
1. 导师关系 → 独立 `advising` 关系表 (支持多导师)
2. 论文作者 → `paper_authors` 中间表 (保序 + 角色)
3. 会议心得 → 仅会议范畴 (不扩展通用日志)
4. 附件 → 仅存链接 (Base 落 Drive,SQLite 存 URL)
5. 手机/邮箱 → SQLite 不加密 (内网部署可接受)
6. 会议心得自动化 → 妙记抓取 → 给每参与人建 `auto_minute` 草稿 → 本人补 `my_reflection` 才 `submitted`

---

## 表 1 · members (人员主表)

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| open_id | 文本 (主键) | ✓ | 飞书 open_id |
| name | 文本 | ✓ | 中文姓名 |
| en_name | 文本 |  | 英文名 |
| email | 文本 |  | 飞书邮箱 |
| mobile | 电话 |  | 手机号 (HR 可见) |
| avatar_url | URL |  | 头像 |
| role | 单选 | ✓ | `student` / `teacher` / `staff` / `admin` |
| department | 单选 | ✓ | 所属部门 |
| title | 文本 |  | 职称/年级 |
| enroll_date | 日期 |  | 入学/入职日期 |
| graduate_date | 日期 |  | 毕业/离职日期 |
| research_area | 多选 |  | 研究方向标签 |
| bio | 多行文本 |  | 个人简介 |
| status | 单选 | ✓ | `active` / `on_leave` / `graduated` / `left` |
| privacy_level | 单选 | ✓ | `public` / `internal` / `private` |
| created_at | 创建时间 | ✓ | |
| updated_at | 修改时间 | ✓ | |

> 导师关系移到 `advising` 表 (v0.2),支持多导师。

---

## 表 2 · advising (师生关系) ⭐ v0.2 新增

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| advising_id | 自动编号 | ✓ | |
| student_open_id | 文本 | ✓ | 学生 |
| advisor_open_id | 文本 | ✓ | 导师 |
| role | 单选 | ✓ | `primary` / `co_advisor` / `external` |
| start_date | 日期 | ✓ | 关系开始日期 |
| end_date | 日期 |  | 关系结束日期 (空=进行中) |
| notes | 多行文本 |  | 备注 (如 "联培项目") |
| created_at | 创建时间 | ✓ | |

**约束**:同一学生同一时间窗内 `primary` 可有多个 (联培),`role` + 时间窗联合唯一性由应用层校验。

---

## 表 3 · papers (论文)

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| paper_id | 自动编号 | ✓ | P001... |
| title | 文本 | ✓ | 论文标题 |
| authors_text | 文本 | ✓ | 完整作者署名文本 (含外部作者) |
| venue | 文本 | ✓ | 期刊/会议名 |
| venue_type | 单选 | ✓ | `journal` / `conference` / `workshop` / `preprint` |
| venue_level | 单选 |  | `CCF-A` / `CCF-B` / `CCF-C` / `SCI-1` / `SCI-2` / `其他` |
| year | 数字 | ✓ | |
| publish_date | 日期 |  | |
| doi | 文本 |  | |
| arxiv_id | 文本 |  | |
| url | URL |  | 论文链接 |
| pdf_url | URL |  | PDF 链接 (上传 Base 附件后取其 URL) |
| abstract | 多行文本 |  | |
| status | 单选 | ✓ | `published` / `accepted` / `under_review` / `in_progress` / `rejected` |
| keywords | 多选 |  | |
| citation_count | 数字 |  | |
| notes | 多行文本 |  | 心得/亮点 |
| created_by | 文本 | ✓ | 录入人 open_id |
| created_at | 创建时间 | ✓ | |
| updated_at | 修改时间 | ✓ | |

> 组内作者的精确顺序和角色见 `paper_authors` 表 (v0.2)。

---

## 表 4 · paper_authors (论文-作者关联) ⭐ v0.2 新增

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| paper_author_id | 自动编号 | ✓ | |
| paper_id | 文本 (FK) | ✓ | 论文 ID |
| author_open_id | 文本 | ✓ | 组内作者 open_id (外部作者只在 papers.authors_text 体现) |
| author_order | 数字 | ✓ | 署名顺序 (1=一作) |
| role | 多选 | ✓ | `first` / `corresponding` / `co_first` / `co_corresponding` / `general` |
| affiliation | 文本 |  | 该作者在该论文署名时的单位 |
| created_at | 创建时间 | ✓ | |

**约束**:`(paper_id, author_open_id)` 唯一;`(paper_id, author_order)` 唯一。

---

## 表 5 · competitions (比赛)

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| comp_id | 自动编号 | ✓ | C001... |
| name | 文本 | ✓ | |
| organizer | 文本 | ✓ | |
| level | 单选 | ✓ | `国际` / `国家级` / `省部级` / `校级` / `院级` |
| category | 多选 |  | |
| start_date | 日期 |  | |
| end_date | 日期 | ✓ | |
| team_members | 单向关联(members) | ✓ | 队员 |
| team_lead_open_id | 文本 |  | 队长 |
| advisor_open_ids | 单向关联(members) |  | 指导老师 |
| award_level | 单选 | ✓ | `特等奖` / `一等奖` / `二等奖` / `三等奖` / `优胜奖` / `参赛` |
| rank | 文本 |  | 如 "Top 3 / 500" |
| score | 数字 |  | |
| certificate_url | URL |  | 证书链接 (附件上传后取 URL) |
| project_url | URL |  | |
| description | 多行文本 |  | |
| reflection | 多行文本 |  | 心得 |
| created_by | 文本 | ✓ | |
| created_at | 创建时间 | ✓ | |
| updated_at | 修改时间 | ✓ | |

---

## 表 6 · meeting_notes (会议心得)

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| note_id | 自动编号 | ✓ | M001... |
| owner_open_id | 文本 | ✓ | 撰写人 (一人一条) |
| meeting_title | 文本 | ✓ | |
| meeting_date | 日期 | ✓ | |
| meeting_type | 单选 | ✓ | `组会` / `项目会` / `外部会议` / `学术报告` / `1on1` / `其他` |
| participants | 单向关联(members) |  | 组内参会人 |
| external_participants | 多行文本 |  | 外部参会人 |
| location | 文本 |  | |
| lark_minute_token | 文本 |  | 飞书妙记 token (自动抓时填) |
| summary | 多行文本 | ✓ | 会议纪要 (可从妙记自动填) |
| my_reflection | 多行文本 |  | 个人心得 (本人手写;auto_minute 草稿时可空) |
| action_items | 多行文本 |  | 待办 |
| attachment_urls | 多行文本 |  | 附件链接列表 |
| tags | 多选 |  | |
| source | 单选 | ✓ | `manual` / `auto_minute` / `imported` |
| review_status | 单选 | ✓ | `draft` / `submitted` (auto_minute 默认 draft, 本人补 my_reflection 后提交) |
| privacy_level | 单选 | ✓ | `public` / `internal` / `private` |
| created_at | 创建时间 | ✓ | |
| updated_at | 修改时间 | ✓ | |

---

## 表 7 · awards (奖项/荣誉)

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| award_id | 自动编号 | ✓ | A001... |
| recipient_open_id | 文本 | ✓ | |
| name | 文本 | ✓ | |
| level | 单选 | ✓ | `国际` / `国家级` / `省部级` / `校级` / `院级` |
| category | 单选 | ✓ | `奖学金` / `荣誉称号` / `优秀学生` / `专利` / `软著` / `其他` |
| issuer | 文本 | ✓ | |
| award_date | 日期 | ✓ | |
| amount | 数字 |  | 金额 (奖学金) |
| certificate_url | URL |  | |
| description | 多行文本 |  | |
| created_by | 文本 | ✓ | |
| created_at | 创建时间 | ✓ | |
| updated_at | 修改时间 | ✓ | |

---

## 表 8 · trainings (培训/活动)

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| training_id | 自动编号 | ✓ | T001... |
| participant_open_id | 文本 | ✓ | |
| name | 文本 | ✓ | |
| type | 单选 | ✓ | `暑期学校` / `Workshop` / `讲座` / `线上课程` / `企业培训` / `其他` |
| organizer | 文本 |  | |
| start_date | 日期 | ✓ | |
| end_date | 日期 |  | |
| location | 文本 |  | |
| hours | 数字 |  | 学时 |
| has_certificate | 复选 |  | |
| certificate_url | URL |  | |
| reflection | 多行文本 |  | |
| created_at | 创建时间 | ✓ | |
| updated_at | 修改时间 | ✓ | |

---

## 表 9 · audit_log (审计日志)

| 字段名 | 类型 | 说明 |
|---|---|---|
| log_id | 自动编号 | |
| actor_open_id | 文本 | 操作人 |
| action | 单选 | `create` / `update` / `delete` / `export` |
| target_table | 单选 | |
| target_id | 文本 | |
| diff | 多行文本 | 变更 JSON |
| ip | 文本 | |
| created_at | 创建时间 | |

---

## 权限模型

| 角色 | members | papers / comps / awards / trainings | meeting_notes | advising | audit_log |
|---|---|---|---|---|---|
| `student` 本人 | 读 public+internal, 写自己 | 写自己关联的, 读 internal+ | 写自己, 读自己+public | 读自己相关 | 不可见 |
| `student` 他人 | 读 public+internal | 读 internal+ | 读 public | 读 public | 不可见 |
| `teacher` | 读全部, 写自己 | 读全部, 写自己关联的 | 读 internal+, 写自己 | 读全部, 写自己作为导师的关系 | 不可见 |
| `staff/hr` | 读写全部 | 读写全部 | 读 internal+ | 读写全部 | 读 |
| `admin` | 读写全部 | 读写全部 | 读写全部 | 读写全部 | 读 |

`privacy_level` 在 members / meeting_notes 控制可见性 (public/internal/private)。

---

## 同步策略 (Base ↔ SQLite)

- **写**: 前端 → FastAPI → Base API (真理源) → 写成功后镜像到 SQLite
- **读**: 前端 → FastAPI → SQLite (毫秒级,支持全文搜索/聚合)
- **增量同步**: 每 5 min 轮询 Base 的 `updated_at` 变更
- **全量校对**: 每晚 03:00 跑 `sync_full.py`,以 Base 为准修正镜像漂移
- **冲突策略**: Base 端任何修改都覆盖 SQLite (因为 Base 是真理源)

---

## 会议心得自动化流程 (决策 6 落地)

```
飞书会议结束
   ↓ (lark-event WebSocket 推送)
后端监听到 VC.meeting.ended
   ↓
调 lark-cli minutes 找到对应妙记
   ↓
拉妙记 summary / action_items / participants
   ↓
对每个组内参会人 (按 open_id 匹配 members):
   create meeting_notes row {
     owner_open_id: <参会人>,
     summary: <妙记总结>,
     action_items: <妙记待办>,
     source: "auto_minute",
     review_status: "draft",
     my_reflection: ""  // 留空,等本人补
   }
   ↓
飞书机器人 P2P 推一条卡片给该参会人:
   "你参加的 <会议主题> 已生成草稿,点这里补心得 → <小程序深链>"
   ↓
本人在小程序补 my_reflection,提交后 review_status: "draft" → "submitted"
```
