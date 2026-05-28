import { useEffect, useMemo, useState } from "react";
import { Button, Popup, SearchBar } from "antd-mobile";
import { listMembers } from "../api/members";
import { Avatar, chipStyle, colors } from "./ui";
import type { Member } from "../types/api";

interface MemberPickerProps {
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  multiple?: boolean;
  placeholder?: string;
  disabled?: boolean;
  excludeOpenIds?: string[];
}

let membersCache: Member[] | null = null;
let membersPromise: Promise<Member[]> | null = null;

const fetchAllMembers = async (): Promise<Member[]> => {
  if (membersCache) {
    return membersCache;
  }

  if (membersPromise) {
    return membersPromise;
  }

  membersPromise = (async () => {
    const items: Member[] = [];
    let page = 1;

    while (true) {
      const response = await listMembers({ page, page_size: 100 });
      items.push(...response.items);

      const loaded = response.page * response.page_size;
      if (!response.items.length || loaded >= response.total) {
        membersCache = items;
        return items;
      }

      page += 1;
    }
  })();

  try {
    return await membersPromise;
  } finally {
    membersPromise = null;
  }
};

export const useMemberDirectory = () => {
  const [members, setMembers] = useState<Member[]>(membersCache ?? []);
  const [loading, setLoading] = useState(!membersCache);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    if (membersCache) {
      setMembers(membersCache);
      setLoading(false);
      setError(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(false);

    fetchAllMembers()
      .then((items) => {
        if (!active) return;
        setMembers(items);
      })
      .catch(() => {
        if (!active) return;
        setMembers([]);
        setError(true);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return { members, loading, error };
};

const selectedChipBaseStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  minHeight: 32,
  padding: "5px 8px 5px 6px",
  borderRadius: 999,
  border: `1px solid ${colors.primary}22`,
  background: colors.primarySoft,
  color: colors.primaryDeep,
};

const MemberPicker = ({
  value,
  onChange,
  multiple = false,
  placeholder = "请选择成员",
  disabled,
  excludeOpenIds,
}: MemberPickerProps) => {
  const { members, loading, error } = useMemberDirectory();
  const [visible, setVisible] = useState(false);
  const [keyword, setKeyword] = useState("");

  const selectedIds = useMemo(() => {
    if (multiple) {
      return Array.isArray(value) ? value.map((item) => String(item)) : [];
    }
    if (typeof value === "string" && value) {
      return [value];
    }
    return [];
  }, [multiple, value]);

  const memberMap = useMemo(() => {
    return members.reduce<Record<string, Member>>((acc, member) => {
      acc[member.open_id] = member;
      return acc;
    }, {});
  }, [members]);

  const selectedMembers = useMemo(
    () => selectedIds.map((openId) => memberMap[openId]).filter((member): member is Member => Boolean(member)),
    [memberMap, selectedIds],
  );

  const normalizedKeyword = keyword.trim().toLowerCase();
  const excludedIds = useMemo(() => new Set(excludeOpenIds ?? []), [excludeOpenIds]);

  const groupedMembers = useMemo(() => {
    const filtered = members.filter((member) => {
      if (excludedIds.has(member.open_id)) {
        return false;
      }
      if (!normalizedKeyword) {
        return true;
      }
      const name = member.name?.toLowerCase() ?? "";
      const department = member.department?.toLowerCase() ?? "";
      return name.includes(normalizedKeyword) || department.includes(normalizedKeyword);
    });

    const groups = filtered.reduce<Record<string, Member[]>>((acc, member) => {
      const key = member.department?.trim() || "未分组";
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(member);
      return acc;
    }, {});

    return Object.entries(groups)
      .sort(([left], [right]) => left.localeCompare(right, "zh-CN"))
      .map(([department, items]) => ({
        department,
        items: items.sort((left, right) => (left.name || "").localeCompare(right.name || "", "zh-CN")),
      }));
  }, [excludedIds, members, normalizedKeyword]);

  const emitChange = (nextIds: string[]) => {
    if (!onChange) return;
    onChange(multiple ? nextIds : nextIds[0] || "");
  };

  const handleSelect = (openId: string) => {
    if (multiple) {
      const nextIds = selectedIds.includes(openId)
        ? selectedIds.filter((item) => item !== openId)
        : selectedIds.concat(openId);
      emitChange(nextIds);
      return;
    }

    emitChange([openId]);
    setVisible(false);
  };

  const handleRemove = (openId: string) => {
    if (disabled) return;
    if (multiple) {
      emitChange(selectedIds.filter((item) => item !== openId));
      return;
    }
    emitChange([]);
  };

  const handleClear = () => emitChange([]);

  return (
    <>
      <div
        onClick={() => {
          if (!disabled) {
            setVisible(true);
          }
        }}
        style={{
          minHeight: 46,
          padding: 8,
          borderRadius: 12,
          border: `1px solid ${colors.border}`,
          background: disabled ? "#f3f4f6" : colors.panel,
          color: colors.body,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {selectedMembers.length === 0 ? (
          <span style={{ color: colors.placeholder, fontSize: 13 }}>{placeholder}</span>
        ) : (
          <>
            {selectedMembers.map((member) => (
              <span
                key={member.open_id}
                style={{
                  ...selectedChipBaseStyle,
                  fontSize: multiple ? 11 : 13,
                  maxWidth: multiple ? "100%" : "calc(100% - 32px)",
                }}
              >
                <Avatar src={member.avatar_url} name={member.name} size={multiple ? 22 : 26} />
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    minWidth: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{member.name}</span>
                  {member.department ? <span style={chipStyle("#e0f2fe", "#0369a1", 600)}>{member.department}</span> : null}
                  {member.title ? <span style={chipStyle("#fef3c7", "#92400e", 600)}>{member.title}</span> : null}
                </span>
                <span
                  onClick={(event) => {
                    event.stopPropagation();
                    handleRemove(member.open_id);
                  }}
                  style={{
                    marginLeft: 2,
                    color: colors.primaryDeep,
                    fontSize: multiple ? 12 : 14,
                    lineHeight: 1,
                  }}
                >
                  ✕
                </span>
              </span>
            ))}
          </>
        )}
      </div>

      <Popup
        visible={visible}
        onMaskClick={() => setVisible(false)}
        bodyStyle={{
          height: "76vh",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          overflow: "hidden",
          background: "#f8fafc",
        }}
      >
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <div
            style={{
              padding: "14px 16px 10px",
              background: colors.panel,
              borderBottom: `1px solid ${colors.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: colors.title }}>
              {multiple ? `已选 ${selectedIds.length} 人` : "选择成员"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Button size="small" fill="none" onClick={handleClear}>
                清空
              </Button>
              {multiple ? (
                <Button size="small" color="primary" onClick={() => setVisible(false)}>
                  完成
                </Button>
              ) : null}
            </div>
          </div>

          <div style={{ padding: 12, background: colors.panel }}>
            <SearchBar
              value={keyword}
              onChange={setKeyword}
              placeholder="搜索姓名 / 部门"
              clearOnCancel
            />
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
            {loading ? (
              <div style={{ padding: "20px 8px", color: colors.muted, fontSize: 13 }}>正在加载成员...</div>
            ) : null}
            {!loading && (error || groupedMembers.length === 0) ? (
              <div style={{ padding: "20px 8px", color: colors.muted, fontSize: 13 }}>暂无成员</div>
            ) : null}
            {!loading
              ? groupedMembers.map((group) => (
                  <div key={group.department} style={{ marginTop: 10 }}>
                    <div style={{ padding: "8px 4px", color: colors.muted, fontSize: 12, fontWeight: 700 }}>
                      {group.department} ({group.items.length})
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        borderRadius: 14,
                        overflow: "hidden",
                        border: `1px solid ${colors.border}`,
                        background: colors.panel,
                      }}
                    >
                      {group.items.map((member, index) => {
                        const selected = selectedIds.includes(member.open_id);
                        return (
                          <div
                            key={member.open_id}
                            onClick={() => handleSelect(member.open_id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 12,
                              padding: "12px 14px",
                              borderTop: index === 0 ? "none" : `1px solid ${colors.border}`,
                              background: selected ? colors.primarySoft : colors.panel,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                              <Avatar src={member.avatar_url} name={member.name} size={34} />
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    minWidth: 0,
                                    color: colors.title,
                                    fontSize: 14,
                                    fontWeight: 700,
                                  }}
                                >
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.name}</span>
                                  {member.title ? <span style={chipStyle("#fef3c7", "#92400e", 600)}>{member.title}</span> : null}
                                </div>
                                <div style={{ marginTop: 4, color: colors.muted, fontSize: 12 }}>
                                  {member.department || "未设置部门"}
                                </div>
                              </div>
                            </div>
                            <div style={{ color: selected ? colors.primaryDeep : colors.placeholder, fontSize: 16, fontWeight: 700 }}>
                              {selected ? "✓" : ""}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              : null}
          </div>
        </div>
      </Popup>
    </>
  );
};

export default MemberPicker;
