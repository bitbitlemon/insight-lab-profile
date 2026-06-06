import { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, SearchBar, Selector, Toast } from "antd-mobile";
import { listMembers, updateMember } from "../api/members";
import { Avatar, PageShell, SectionEmpty, SectionLoading, colors, listItemCardStyle, sectionCardStyle } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import type { Member } from "../types/api";

type Draft = {
  department: string;
  role: Member["role"];
  status: Member["status"];
  title: string;
  position: string;
};

const roleOptions = [
  { label: "学生", value: "student" },
  { label: "教师", value: "teacher" },
  { label: "管理", value: "staff" },
  { label: "管理员", value: "admin" },
];

const statusOptions = [
  { label: "在岗", value: "active" },
  { label: "请假", value: "on_leave" },
  { label: "毕业", value: "graduated" },
  { label: "离开", value: "left" },
];

const canManagePersonnel = (member?: Member | null) =>
  Boolean(member && (member.role === "admin" || member.role === "staff" || /团长|政委|部长/.test(member.title || "")));

const toDraft = (member: Member): Draft => ({
  department: member.department || "",
  role: member.role,
  status: member.status,
  title: member.title || "",
  position: member.position || "",
});

const PersonnelPage = () => {
  const { me } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingOpenId, setSavingOpenId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [keyword, setKeyword] = useState("");
  const [department, setDepartment] = useState(me?.department || "");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const loadMembers = async () => {
    setLoading(true);
    try {
      const firstPage = await listMembers({ page: 1, page_size: 100 });
      const totalPages = Math.ceil(firstPage.total / firstPage.page_size);
      const restPages = totalPages <= 1
        ? []
        : await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, index) =>
              listMembers({ page: index + 2, page_size: firstPage.page_size }),
            ),
          );
      const all = firstPage.items.concat(restPages.flatMap((page) => page.items));
      all.sort((a, b) => (a.department || "").localeCompare(b.department || "", "zh-CN") || a.name.localeCompare(b.name, "zh-CN"));
      setMembers(all);
      setDrafts(Object.fromEntries(all.map((member) => [member.open_id, toDraft(member)])));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMembers();
  }, []);

  useEffect(() => {
    if (!department && me?.department) {
      setDepartment(me.department);
    }
  }, [me?.department, department]);

  const departments = useMemo(() => {
    const values = Array.from(
      new Set(members.map((member) => member.department?.trim()).filter((value): value is string => Boolean(value))),
    ).sort((left, right) => left.localeCompare(right, "zh-CN"));
    return [{ label: "全部部门", value: "" }].concat(values.map((value) => ({ label: value, value })));
  }, [members]);

  const filteredMembers = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return members.filter((member) => {
      if (department && member.department !== department) return false;
      if (!kw) return true;
      const hay = `${member.name} ${member.en_name || ""} ${member.department || ""} ${member.title || ""} ${member.position || ""}`.toLowerCase();
      return hay.includes(kw);
    });
  }, [members, keyword, department]);

  const updateDraft = (openId: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [openId]: { ...prev[openId], ...patch } }));
  };

  const saveMember = async (member: Member) => {
    const draft = drafts[member.open_id];
    if (!draft) return;
    setSavingOpenId(member.open_id);
    try {
      const saved = await updateMember(member.open_id, {
        department: draft.department.trim() || null,
        role: draft.role,
        status: draft.status,
        title: draft.title.trim() || null,
        position: draft.position.trim() || null,
      });
      setMembers((prev) => prev.map((item) => (item.open_id === saved.open_id ? saved : item)));
      setDrafts((prev) => ({ ...prev, [saved.open_id]: toDraft(saved) }));
      Toast.show({ content: "已保存" });
    } catch (error) {
      Toast.show({ content: "保存失败，请确认权限" });
    } finally {
      setSavingOpenId(null);
    }
  };

  if (!canManagePersonnel(me)) {
    return (
      <PageShell>
        <Card style={sectionCardStyle}>
          <div style={{ fontSize: 16, fontWeight: 800, color: colors.title }}>人事系统</div>
          <div style={{ marginTop: 8, color: colors.muted, fontSize: 13 }}>当前账号没有人事调整权限。</div>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: colors.title }}>人事系统</div>
          <div style={{ marginTop: 4, color: colors.muted, fontSize: 13 }}>调整部门、岗位、职务、角色与成员状态</div>
        </div>

        <Card style={sectionCardStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SearchBar value={keyword} placeholder="搜索姓名、部门、岗位" onChange={setKeyword} />
            <Selector
              options={departments}
              columns={2}
              showCheckMark={false}
              value={[department]}
              onChange={(value) => setDepartment(value[0] || "")}
            />
          </div>
        </Card>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: colors.title }}>成员调整</div>
          <div style={{ color: colors.muted, fontSize: 12 }}>共 {filteredMembers.length} 人</div>
        </div>

        {loading ? <SectionLoading text="正在加载成员..." /> : null}
        {!loading && filteredMembers.length === 0 ? <SectionEmpty description="没有符合条件的成员" /> : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredMembers.map((member) => {
            const draft = drafts[member.open_id] || toDraft(member);
            return (
              <Card key={member.open_id} style={{ ...sectionCardStyle, padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar src={member.avatar_url || undefined} name={member.name} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: colors.title }}>{member.name}</div>
                    <div style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{member.open_id}</div>
                  </div>
                  <Button size="small" color="primary" loading={savingOpenId === member.open_id} onClick={() => saveMember(member)}>
                    保存
                  </Button>
                </div>

                <div style={{ ...listItemCardStyle, padding: 10, marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  <Input
                    value={draft.department}
                    placeholder="部门"
                    onChange={(value) => updateDraft(member.open_id, { department: value })}
                  />
                  <Input
                    value={draft.position}
                    placeholder="岗位"
                    onChange={(value) => updateDraft(member.open_id, { position: value })}
                  />
                  <Input
                    value={draft.title}
                    placeholder="职务，例如团长/部长/专岗"
                    onChange={(value) => updateDraft(member.open_id, { title: value })}
                  />
                  <Selector
                    options={roleOptions}
                    columns={2}
                    showCheckMark={false}
                    value={[draft.role]}
                    onChange={(value) => updateDraft(member.open_id, { role: (value[0] || "student") as Member["role"] })}
                  />
                  <Selector
                    options={statusOptions}
                    columns={2}
                    showCheckMark={false}
                    value={[draft.status]}
                    onChange={(value) => updateDraft(member.open_id, { status: (value[0] || "active") as Member["status"] })}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
};

export default PersonnelPage;
