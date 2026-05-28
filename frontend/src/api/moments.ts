import { api } from "./client";

export type MomentAuthor = {
  open_id: string;
  name: string;
  avatar_url?: string;
  title?: string;
  position?: string;
};

export type MomentImage = {
  file_token: string;
  name?: string;
};

export type MomentComment = {
  id: number;
  post_id: number;
  author: MomentAuthor;
  content: string;
  created_at: string;
};

export type MomentPost = {
  id: number;
  author: MomentAuthor;
  content?: string;
  images: MomentImage[];
  created_at: string;
  updated_at: string;
  likes_count: number;
  comments_count: number;
  i_liked: boolean;
  recent_comments: MomentComment[];
};

export type ListMomentsResponse = {
  items: MomentPost[];
  next_cursor: number | null;
};

export type CreateMomentPayload = {
  content: string | null;
  images: MomentImage[];
};

export type UploadMomentImageResponse = {
  file_token: string;
  name: string;
  size: number;
  type: string;
};

export const listMoments = async (
  cursor: number | null,
  limit = 20,
  authorOpenId?: string,
): Promise<ListMomentsResponse> => {
  const params: Record<string, string | number> = { limit };
  if (cursor !== null) {
    params.cursor = cursor;
  }
  if (authorOpenId) {
    params.author_open_id = authorOpenId;
  }
  const { data } = await api.get<ListMomentsResponse>("/moments", { params });
  return data;
};

export const createMoment = async (payload: CreateMomentPayload): Promise<MomentPost> => {
  const { data } = await api.post<MomentPost>("/moments", payload);
  return data;
};

export const deleteMoment = async (id: number): Promise<void> => {
  await api.delete(`/moments/${id}`);
};

export const addComment = async (postId: number, content: string): Promise<MomentComment> => {
  const { data } = await api.post<MomentComment>(`/moments/${postId}/comments`, { content });
  return data;
};

export const deleteComment = async (postId: number, commentId: number): Promise<void> => {
  await api.delete(`/moments/${postId}/comments/${commentId}`);
};

export const toggleLike = async (postId: number): Promise<{ liked: boolean; likes_count: number }> => {
  const { data } = await api.post<{ liked: boolean; likes_count: number }>(`/moments/${postId}/like`);
  return data;
};

export const uploadMomentImage = async (file: File): Promise<UploadMomentImageResponse> => {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<UploadMomentImageResponse>("/files/upload?target=moment", form, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return data;
};

export const momentImageUrl = (fileToken: string): string => {
  const token = localStorage.getItem("jwt") || "";
  return `/api/files/${encodeURIComponent(fileToken)}/proxy?t=${encodeURIComponent(token)}`;
};
