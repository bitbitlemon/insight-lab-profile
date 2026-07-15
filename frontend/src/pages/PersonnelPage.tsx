import { useEffect, useMemo, useState } from "react";
import { Card, SearchBar, Selector } from "antd-mobile";
import { listMembers } from "../api/members";
import { Avatar, PageShell, SectionEmpty, SectionLoading, colors, sectionCardStyle } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import type { Member } from "../types/api";
import { filterVisibleOrgMembers, getVisibleOrgGroupOptions, normalizeOrgGroup } from "../utils/orgGroups";

const canManagePersonnel = (member?: Member | null) =>
  Boolean(member && (member.role === "admin" || member.role === "staff" || /团长|政委|部长/.test(member.title || "")));

const PersonnelPage = () => {
  const { me } = useAuth();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [keyword, setKeyword] = useState("");
  const [department, setDepartment] = useState(normalizeOrgGroup(me?.department) || "");

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
      const visible = filterVisibleOrgMembers(all)
        .map((member) => ({ ...member, department: normalizeOrgGroup(member.department) || member.department }))
        .sort((a, b) => (a.department || "").localeCompare(b.department || "", "zh-CN") || a.name.localeCompare(b.name, "zh-CN"));
      setMembers(visible);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMembers();
  }, []);

  useEffect(() => {
    if (!department && me?.department) {
      setDepartment(normalizeOrgGroup(me.department) || "");
    }
  }, [me?.department, department]);

  const departments = useMemo(() => {
    const values = getVisibleOrgGroupOptions(members.map((member) => member.department));
    return [{ label: "全部部门", value: "" }].concat(values.map((value) => ({ label: value, value })));
  }, [members]);

  const filteredMembers = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return members.filter((member) => {
      if (department && member.department !== department) return false;
      if (!kw) return true;
      const hay = `${member.name} ${member.en_name || ""}`.toLowerCase();
      return hay.includes(kw);
    });
  }, [members, keyword, department]);

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
          <div style={{ marginTop: 4, color: colors.muted, fontSize: 13 }}>快速查找人员</div>
        </div>

        <Card style={sectionCardStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SearchBar value={keyword} placeholder="搜索姓名" onChange={setKeyword} />
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
          {filteredMembers.map((member) => (
            <Card key={member.open_id} style={{ ...sectionCardStyle, padding: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <Avatar src={member.avatar_url || undefined} name={member.name} size={30} />
                <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14, fontWeight: 800, color: colors.title }}>
                  {member.name}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </PageShell>
  );
};

export default PersonnelPage;
