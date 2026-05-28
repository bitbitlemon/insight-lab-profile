#!/bin/bash
# 批量建 Base 12 张表 + 字段, 回写 .env
set -u
LC=/home/ubuntu/.npm-global/bin/lark-cli
BT=LAzWbERfHaeOYrsvHEPc1YT6n7f
DEFAULT_TID=tblqw6T8wQdh4083
ENV_FILE=/home/ubuntu/insight-lab-profile/backend/.env
declare -A TID

log() { echo "[$(date +%H:%M:%S)] $*"; }
sl() { sleep 0.25; }

# ============================================================
# Step 1: 默认表 → members
# ============================================================
log "重命名默认表 → members"
$LC base +table-update --base-token $BT --table-id $DEFAULT_TID --name members --as user --jq '.ok' >/dev/null
TID[members]=$DEFAULT_TID
sl

# ============================================================
# Step 2: 建 11 张新表
# ============================================================
for t in advising papers paper_authors competitions competition_members meeting_notes meeting_participants awards trainings audit_log sync_state; do
  resp=$($LC base +table-create --base-token $BT --name $t --as user 2>&1)
  tid=$(echo "$resp" | jq -r '.data.table_id // empty')
  if [ -z "$tid" ]; then
    log "FAIL build $t: $(echo $resp | head -c 200)"
  else
    TID[$t]=$tid
    log "created $t = $tid"
  fi
  sl
done

# ============================================================
# Step 3: add 字段函数
# ============================================================
add() {
  local table=$1; local json=$2
  local fname=$(echo "$json" | jq -r '.field_name')
  local resp=$($LC base +field-create --base-token $BT --table-id ${TID[$table]} --json "$json" --as user 2>&1)
  if echo "$resp" | jq -e '.ok==true' >/dev/null 2>&1; then
    echo "    + $table.$fname"
  else
    echo "    ! $table.$fname FAIL: $(echo $resp | jq -r '.error // .' | head -c 200)"
  fi
  sl
}

# ============================================================
# 字段定义 — 严格按 docs/base_schema.md
# 注意: Base 创建表时已经默认有一个文本主字段 (一般叫 "多行文本" 或表名),
#       我们不动它, 直接在后面追加字段; 后续可在 UI 里删掉占位主字段
# ============================================================

log "=== members ==="
add members '{"field_name":"open_id","type":1,"property":{}}'
add members '{"field_name":"name","type":1,"property":{}}'
add members '{"field_name":"en_name","type":1,"property":{}}'
add members '{"field_name":"email","type":1,"property":{}}'
add members '{"field_name":"mobile","type":13,"property":{}}'
add members '{"field_name":"avatar_url","type":15,"property":{}}'
add members '{"field_name":"role","type":3,"property":{"options":[{"name":"student"},{"name":"teacher"},{"name":"staff"},{"name":"admin"}]}}'
add members '{"field_name":"department","type":1,"property":{}}'
add members '{"field_name":"title","type":1,"property":{}}'
add members '{"field_name":"enroll_date","type":5,"property":{"date_formatter":"yyyy/MM/dd","auto_fill":false}}'
add members '{"field_name":"graduate_date","type":5,"property":{"date_formatter":"yyyy/MM/dd","auto_fill":false}}'
add members '{"field_name":"research_area","type":4,"property":{"options":[]}}'
add members '{"field_name":"bio","type":1,"property":{}}'
add members '{"field_name":"status","type":3,"property":{"options":[{"name":"active"},{"name":"on_leave"},{"name":"graduated"},{"name":"left"}]}}'
add members '{"field_name":"privacy_level","type":3,"property":{"options":[{"name":"public"},{"name":"internal"},{"name":"private"}]}}'

log "=== advising ==="
add advising '{"field_name":"student_open_id","type":1,"property":{}}'
add advising '{"field_name":"advisor_open_id","type":1,"property":{}}'
add advising '{"field_name":"role","type":3,"property":{"options":[{"name":"primary"},{"name":"co_advisor"},{"name":"external"}]}}'
add advising '{"field_name":"start_date","type":5,"property":{"date_formatter":"yyyy/MM/dd","auto_fill":false}}'
add advising '{"field_name":"end_date","type":5,"property":{"date_formatter":"yyyy/MM/dd","auto_fill":false}}'
add advising '{"field_name":"notes","type":1,"property":{}}'

log "=== papers ==="
add papers '{"field_name":"title","type":1,"property":{}}'
add papers '{"field_name":"authors_text","type":1,"property":{}}'
add papers '{"field_name":"venue","type":1,"property":{}}'
add papers '{"field_name":"venue_type","type":3,"property":{"options":[{"name":"journal"},{"name":"conference"},{"name":"workshop"},{"name":"preprint"}]}}'
add papers '{"field_name":"venue_level","type":3,"property":{"options":[{"name":"CCF-A"},{"name":"CCF-B"},{"name":"CCF-C"},{"name":"SCI-1"},{"name":"SCI-2"},{"name":"其他"}]}}'
add papers '{"field_name":"year","type":2,"property":{"formatter":"0"}}'
add papers '{"field_name":"publish_date","type":5,"property":{"date_formatter":"yyyy/MM/dd","auto_fill":false}}'
add papers '{"field_name":"doi","type":1,"property":{}}'
add papers '{"field_name":"arxiv_id","type":1,"property":{}}'
add papers '{"field_name":"url","type":15,"property":{}}'
add papers '{"field_name":"pdf_url","type":15,"property":{}}'
add papers '{"field_name":"abstract","type":1,"property":{}}'
add papers '{"field_name":"status","type":3,"property":{"options":[{"name":"published"},{"name":"accepted"},{"name":"under_review"},{"name":"in_progress"},{"name":"rejected"}]}}'
add papers '{"field_name":"keywords","type":4,"property":{"options":[]}}'
add papers '{"field_name":"citation_count","type":2,"property":{"formatter":"0"}}'
add papers '{"field_name":"notes","type":1,"property":{}}'
add papers '{"field_name":"created_by","type":1,"property":{}}'

log "=== paper_authors ==="
add paper_authors '{"field_name":"paper_id","type":2,"property":{"formatter":"0"}}'
add paper_authors '{"field_name":"author_open_id","type":1,"property":{}}'
add paper_authors '{"field_name":"author_order","type":2,"property":{"formatter":"0"}}'
add paper_authors '{"field_name":"role","type":4,"property":{"options":[{"name":"first"},{"name":"corresponding"},{"name":"co_first"},{"name":"co_corresponding"},{"name":"general"}]}}'
add paper_authors '{"field_name":"affiliation","type":1,"property":{}}'

log "=== competitions ==="
add competitions '{"field_name":"name","type":1,"property":{}}'
add competitions '{"field_name":"organizer","type":1,"property":{}}'
add competitions '{"field_name":"level","type":3,"property":{"options":[{"name":"国际"},{"name":"国家级"},{"name":"省部级"},{"name":"校级"},{"name":"院级"}]}}'
add competitions '{"field_name":"category","type":4,"property":{"options":[]}}'
add competitions '{"field_name":"start_date","type":5,"property":{"date_formatter":"yyyy/MM/dd","auto_fill":false}}'
add competitions '{"field_name":"end_date","type":5,"property":{"date_formatter":"yyyy/MM/dd","auto_fill":false}}'
add competitions '{"field_name":"team_lead_open_id","type":1,"property":{}}'
add competitions '{"field_name":"award_level","type":3,"property":{"options":[{"name":"特等奖"},{"name":"一等奖"},{"name":"二等奖"},{"name":"三等奖"},{"name":"优胜奖"},{"name":"参赛"}]}}'
add competitions '{"field_name":"rank","type":1,"property":{}}'
add competitions '{"field_name":"score","type":2,"property":{"formatter":"0.00"}}'
add competitions '{"field_name":"certificate_url","type":15,"property":{}}'
add competitions '{"field_name":"project_url","type":15,"property":{}}'
add competitions '{"field_name":"description","type":1,"property":{}}'
add competitions '{"field_name":"reflection","type":1,"property":{}}'
add competitions '{"field_name":"created_by","type":1,"property":{}}'

log "=== competition_members ==="
add competition_members '{"field_name":"comp_id","type":2,"property":{"formatter":"0"}}'
add competition_members '{"field_name":"member_open_id","type":1,"property":{}}'
add competition_members '{"field_name":"member_role","type":3,"property":{"options":[{"name":"member"},{"name":"advisor"}]}}'

log "=== meeting_notes ==="
add meeting_notes '{"field_name":"owner_open_id","type":1,"property":{}}'
add meeting_notes '{"field_name":"meeting_title","type":1,"property":{}}'
add meeting_notes '{"field_name":"meeting_date","type":5,"property":{"date_formatter":"yyyy/MM/dd","auto_fill":false}}'
add meeting_notes '{"field_name":"meeting_type","type":3,"property":{"options":[{"name":"组会"},{"name":"项目会"},{"name":"外部会议"},{"name":"学术报告"},{"name":"1on1"},{"name":"其他"}]}}'
add meeting_notes '{"field_name":"external_participants","type":1,"property":{}}'
add meeting_notes '{"field_name":"location","type":1,"property":{}}'
add meeting_notes '{"field_name":"lark_minute_token","type":1,"property":{}}'
add meeting_notes '{"field_name":"summary","type":1,"property":{}}'
add meeting_notes '{"field_name":"my_reflection","type":1,"property":{}}'
add meeting_notes '{"field_name":"action_items","type":1,"property":{}}'
add meeting_notes '{"field_name":"attachment_urls","type":1,"property":{}}'
add meeting_notes '{"field_name":"tags","type":4,"property":{"options":[]}}'
add meeting_notes '{"field_name":"source","type":3,"property":{"options":[{"name":"manual"},{"name":"auto_minute"},{"name":"imported"}]}}'
add meeting_notes '{"field_name":"review_status","type":3,"property":{"options":[{"name":"draft"},{"name":"submitted"}]}}'
add meeting_notes '{"field_name":"privacy_level","type":3,"property":{"options":[{"name":"public"},{"name":"internal"},{"name":"private"}]}}'

log "=== meeting_participants ==="
add meeting_participants '{"field_name":"note_id","type":2,"property":{"formatter":"0"}}'
add meeting_participants '{"field_name":"member_open_id","type":1,"property":{}}'

log "=== awards ==="
add awards '{"field_name":"recipient_open_id","type":1,"property":{}}'
add awards '{"field_name":"name","type":1,"property":{}}'
add awards '{"field_name":"level","type":3,"property":{"options":[{"name":"国际"},{"name":"国家级"},{"name":"省部级"},{"name":"校级"},{"name":"院级"}]}}'
add awards '{"field_name":"category","type":3,"property":{"options":[{"name":"奖学金"},{"name":"荣誉称号"},{"name":"优秀学生"},{"name":"专利"},{"name":"软著"},{"name":"其他"}]}}'
add awards '{"field_name":"issuer","type":1,"property":{}}'
add awards '{"field_name":"award_date","type":5,"property":{"date_formatter":"yyyy/MM/dd","auto_fill":false}}'
add awards '{"field_name":"amount","type":2,"property":{"formatter":"0.00"}}'
add awards '{"field_name":"certificate_url","type":15,"property":{}}'
add awards '{"field_name":"description","type":1,"property":{}}'
add awards '{"field_name":"created_by","type":1,"property":{}}'

log "=== trainings ==="
add trainings '{"field_name":"participant_open_id","type":1,"property":{}}'
add trainings '{"field_name":"name","type":1,"property":{}}'
add trainings '{"field_name":"type","type":3,"property":{"options":[{"name":"暑期学校"},{"name":"Workshop"},{"name":"讲座"},{"name":"线上课程"},{"name":"企业培训"},{"name":"其他"}]}}'
add trainings '{"field_name":"organizer","type":1,"property":{}}'
add trainings '{"field_name":"start_date","type":5,"property":{"date_formatter":"yyyy/MM/dd","auto_fill":false}}'
add trainings '{"field_name":"end_date","type":5,"property":{"date_formatter":"yyyy/MM/dd","auto_fill":false}}'
add trainings '{"field_name":"location","type":1,"property":{}}'
add trainings '{"field_name":"hours","type":2,"property":{"formatter":"0.0"}}'
add trainings '{"field_name":"has_certificate","type":7,"property":{}}'
add trainings '{"field_name":"certificate_url","type":15,"property":{}}'
add trainings '{"field_name":"reflection","type":1,"property":{}}'

log "=== audit_log ==="
add audit_log '{"field_name":"actor_open_id","type":1,"property":{}}'
add audit_log '{"field_name":"action","type":3,"property":{"options":[{"name":"create"},{"name":"update"},{"name":"delete"},{"name":"export"}]}}'
add audit_log '{"field_name":"target_table","type":1,"property":{}}'
add audit_log '{"field_name":"target_id","type":1,"property":{}}'
add audit_log '{"field_name":"diff","type":1,"property":{}}'
add audit_log '{"field_name":"ip","type":1,"property":{}}'

log "=== sync_state ==="
add sync_state '{"field_name":"table_name","type":1,"property":{}}'
add sync_state '{"field_name":"last_sync_at","type":5,"property":{"date_formatter":"yyyy/MM/dd HH:mm","auto_fill":false}}'
add sync_state '{"field_name":"last_base_cursor","type":1,"property":{}}'
add sync_state '{"field_name":"rows_synced","type":2,"property":{"formatter":"0"}}'
add sync_state '{"field_name":"last_error","type":1,"property":{}}'

# ============================================================
# Step 4: 写回 .env
# ============================================================
log "=== 更新 .env ==="
# 删除旧的 LARK_TABLE_* 行
sed -i '/^LARK_TABLE_/d' $ENV_FILE
# 追加新的
{
  echo "LARK_TABLE_MEMBERS=${TID[members]:-}"
  echo "LARK_TABLE_ADVISING=${TID[advising]:-}"
  echo "LARK_TABLE_PAPERS=${TID[papers]:-}"
  echo "LARK_TABLE_PAPER_AUTHORS=${TID[paper_authors]:-}"
  echo "LARK_TABLE_COMPETITIONS=${TID[competitions]:-}"
  echo "LARK_TABLE_COMPETITION_MEMBERS=${TID[competition_members]:-}"
  echo "LARK_TABLE_MEETING_NOTES=${TID[meeting_notes]:-}"
  echo "LARK_TABLE_MEETING_PARTICIPANTS=${TID[meeting_participants]:-}"
  echo "LARK_TABLE_AWARDS=${TID[awards]:-}"
  echo "LARK_TABLE_TRAININGS=${TID[trainings]:-}"
  echo "LARK_TABLE_AUDIT_LOG=${TID[audit_log]:-}"
  echo "LARK_TABLE_SYNC_STATE=${TID[sync_state]:-}"
} >> $ENV_FILE

log "=== 验收 ==="
tbl_count=$($LC base +table-list --base-token $BT --as user --jq '.data.tables | length' 2>&1 | tail -1)
log "Base 表总数: $tbl_count (期望 12)"
env_count=$(grep -c "^LARK_TABLE_" $ENV_FILE)
log ".env LARK_TABLE_* 行: $env_count (期望 12)"
echo "==================================================="
echo "完成. Base URL: https://insight-lab.feishu.cn/base/$BT"
