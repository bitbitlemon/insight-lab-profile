import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Dialog, Popup, Toast } from "antd-mobile";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { deleteMeetingNote, getMeetingNote, listMeetingNotes } from "../api/meeting_notes";
import { useMemberDirectory } from "../components/MemberPicker";
import { PageShell, SectionEmpty, SectionError, SectionLoading, chipStyle, colors, sectionCardStyle } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import type { MeetingNote, Member } from "../types/api";

const extractMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
    if (typeof detail === "string") return detail;
    if (typeof err.message === "string" && err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return "操作失败";
};

const itemStyle: CSSProperties = {
  border: "1px solid rgba(229,231,235,0.92)",
  borderRadius: 12,
  padding: 14,
  background: "#ffffff",
  boxShadow: "0 8px 20px rgba(15,23,42,0.05)",
  textAlign: "left",
  width: "100%",
  cursor: "pointer",
};

const sourceLabel: Record<MeetingNote["source"], string> = {
  manual: "手动",
  auto_minute: "妙记",
  imported: "导入",
};

const privacyLabel: Record<MeetingNote["privacy_level"], string> = {
  public: "公开",
  internal: "内部",
  private: "私密",
};

const memberName = (map: Record<string, Member>, openId: string) => map[openId]?.name || openId;

const MeetingNotesPage = () => {
  const { me, loading: authLoading } = useAuth();
  const { members } = useMemberDirectory();
  const navigate = useNavigate();
  const memberMap = useMemo(
    () =>
      members.reduce<Record<string, Member>>((acc, member) => {
        acc[member.open_id] = member;
        return acc;
      }, {}),
    [members],
  );
  const [items, setItems] = useState<MeetingNote[]>([]);
  const [selected, setSelected] = useState<MeetingNote | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const pageSize = 10;

  const load = async (nextPage = page) => {
    setLoading(true);
    try {
      const response = await listMeetingNotes({ page: nextPage, page_size: pageSize });
      setItems(response.items);
      setTotal(response.total);
      setPage(response.page);
    } catch (err) {
      setItems([]);
      setTotal(0);
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!me) return;
    void load(1);
  }, [me?.open_id]);

  const openDetail = async (note: MeetingNote) => {
    setSelected(note);
    setDetailLoading(true);
    try {
      const detail = await getMeetingNote(note.note_id);
      setSelected(detail);
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setDetailLoading(false);
    }
  };

  const confirmDelete = async (note: MeetingNote) => {
    const confirmed = await Dialog.confirm({
      title: "确认删除会议纪要",
      content: `将删除「${note.meeting_title}」。`,
      confirmText: "删除",
      cancelText: "取消",
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteMeetingNote(note.note_id);
      Toast.show({ icon: "success", content: "会议纪要已删除" });
      setSelected(null);
      await load(page);
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (authLoading) return <SectionLoading text="正在加载权限..." />;
  if (!me) return <SectionError title="无法访问" description="当前未登录，请先完成登录" />;

  return (
    <PageShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card style={sectionCardStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              type="button"
              onClick={() => navigate("/board")}
              style={{
                alignSelf: "flex-start",
                border: "none",
                background: "transparent",
                padding: 0,
                color: colors.primaryDeep,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ← 返回看板
            </button>
            <div style={{ fontSize: 24, fontWeight: 800, color: colors.title }}>会议纪要</div>
            <div style={{ color: colors.muted, fontSize: 13 }}>浏览可见的会议总结、反思与行动项</div>
          </div>
        </Card>

        {loading ? <SectionLoading text="正在加载会议纪要..." /> : null}
        {!loading && items.length === 0 ? <SectionEmpty description="暂无会议纪要" /> : null}
        {!loading && items.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((note) => (
              <button key={note.note_id} type="button" style={itemStyle} onClick={() => void openDetail(note)}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: colors.title, fontSize: 15, fontWeight: 800 }}>{note.meeting_title}</div>
                    <div style={{ marginTop: 6, color: colors.muted, fontSize: 12 }}>
                      {note.meeting_date} · {note.meeting_type} · {memberName(memberMap, note.owner_open_id)}
                    </div>
                  </div>
                  <span style={chipStyle("#eef2ff", "#4338ca")}>{sourceLabel[note.source]}</span>
                </div>
                <div style={{ marginTop: 8, color: colors.body, fontSize: 13, lineHeight: 1.6 }}>
                  {note.summary.length > 96 ? `${note.summary.slice(0, 96)}...` : note.summary}
                </div>
              </button>
            ))}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "4px 2px" }}>
              <div style={{ color: colors.muted, fontSize: 12 }}>
                共 {total} 条 · 第 {page}/{totalPages} 页
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button size="small" disabled={page <= 1} onClick={() => void load(Math.max(1, page - 1))}>
                  上一页
                </Button>
                <Button size="small" disabled={page >= totalPages} onClick={() => void load(Math.min(totalPages, page + 1))}>
                  下一页
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <Popup
        visible={Boolean(selected)}
        onMaskClick={() => setSelected(null)}
        bodyStyle={{
          height: "82vh",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          overflow: "auto",
          background: "#f8fafc",
        }}
      >
        {selected ? (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: colors.title, fontSize: 18, fontWeight: 850 }}>{selected.meeting_title}</div>
                <div style={{ marginTop: 6, color: colors.muted, fontSize: 12 }}>
                  {selected.meeting_date} · {selected.meeting_type} · {memberName(memberMap, selected.owner_open_id)}
                </div>
              </div>
              <Button size="small" fill="none" onClick={() => setSelected(null)}>
                关闭
              </Button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={chipStyle("#eef2ff", "#4338ca")}>{sourceLabel[selected.source]}</span>
              <span style={chipStyle("#f3f4f6", "#4b5563")}>{privacyLabel[selected.privacy_level]}</span>
              <span style={chipStyle(selected.review_status === "submitted" ? "#dcfce7" : "#fef3c7", selected.review_status === "submitted" ? "#15803d" : "#92400e")}>
                {selected.review_status === "submitted" ? "已提交" : "草稿"}
              </span>
            </div>
            {detailLoading ? <SectionLoading text="正在加载详情..." /> : null}
            <Card style={sectionCardStyle}>
              <div style={{ color: colors.title, fontSize: 14, fontWeight: 800 }}>会议总结</div>
              <div style={{ marginTop: 8, color: colors.body, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{selected.summary}</div>
            </Card>
            {selected.my_reflection ? (
              <Card style={sectionCardStyle}>
                <div style={{ color: colors.title, fontSize: 14, fontWeight: 800 }}>个人反思</div>
                <div style={{ marginTop: 8, color: colors.body, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{selected.my_reflection}</div>
              </Card>
            ) : null}
            {selected.action_items ? (
              <Card style={sectionCardStyle}>
                <div style={{ color: colors.title, fontSize: 14, fontWeight: 800 }}>行动项</div>
                <div style={{ marginTop: 8, color: colors.body, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{selected.action_items}</div>
              </Card>
            ) : null}
            {selected.location || selected.tags || selected.external_participants ? (
              <Card style={sectionCardStyle}>
                <div style={{ color: colors.title, fontSize: 14, fontWeight: 800 }}>补充信息</div>
                <div style={{ marginTop: 8, color: colors.body, fontSize: 13, lineHeight: 1.8 }}>
                  {selected.location ? <div>地点: {selected.location}</div> : null}
                  {selected.external_participants ? <div>外部参会人: {selected.external_participants}</div> : null}
                  {selected.tags ? <div>标签: {selected.tags}</div> : null}
                </div>
              </Card>
            ) : null}
            {me.role === "admin" || selected.owner_open_id === me.open_id ? (
              <Button block color="danger" fill="outline" loading={deleting} onClick={() => void confirmDelete(selected)}>
                删除会议纪要
              </Button>
            ) : null}
          </div>
        ) : null}
      </Popup>
    </PageShell>
  );
};

export default MeetingNotesPage;
