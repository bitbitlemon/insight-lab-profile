import type { Member, Project } from "../types/api";

type OrgGroupConfig = {
  label: string;
  aliases: string[];
};

const ORG_GROUPS: OrgGroupConfig[] = [
  { label: "公安政法 BU", aliases: ["公安政法 BU", "公安政法事业部"] },
  { label: "具身智能 BU", aliases: ["具身智能 BU", "具身智能事业部"] },
  { label: "安全情报 BU", aliases: ["安全情报 BU", "安全情报事业部"] },
  { label: "教育科技 BU", aliases: ["教育科技 BU", "教育科技事业部"] },
  { label: "战略部", aliases: ["战略部"] },
  { label: "科技部", aliases: ["科技部"] },
  { label: "研发部", aliases: ["研发部"] },
];

const ORG_GROUP_ALIAS_TO_LABEL = new Map(
  ORG_GROUPS.flatMap((group) => group.aliases.map((alias) => [alias.trim(), group.label] as const)),
);

export const VISIBLE_ORG_GROUP_LABELS = ORG_GROUPS.map((group) => group.label);

export const normalizeOrgGroup = (value?: string | null) => {
  const normalized = (value || "").trim();
  return ORG_GROUP_ALIAS_TO_LABEL.get(normalized) || null;
};

export const isVisibleOrgGroup = (value?: string | null) => normalizeOrgGroup(value) !== null;

export const getVisibleOrgGroupOptions = (values: Array<string | null | undefined> = []) => {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeOrgGroup(value);
    if (normalized) seen.add(normalized);
  }
  return VISIBLE_ORG_GROUP_LABELS.filter((label) => seen.has(label));
};

export const filterVisibleOrgMembers = <T extends Member>(members: T[]) =>
  members.filter((member) => isVisibleOrgGroup(member.department));

export const filterVisibleOrgProjects = <T extends Project>(projects: T[]) =>
  projects.filter((project) => isVisibleOrgGroup(project.department));

export const memberOrgGroup = (member?: Pick<Member, "department"> | null) => normalizeOrgGroup(member?.department);

export const projectOrgGroup = (project?: Pick<Project, "department"> | null) => normalizeOrgGroup(project?.department);
