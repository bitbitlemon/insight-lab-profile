import { api } from "./client";
import type { Page, MeetingNote } from "../types/api";

export const listMeetingNotes = async (params?: {
  owner_open_id?: string;
  keyword?: string;
  page?: number;
  page_size?: number;
}): Promise<Page<MeetingNote>> => {
  const { data } = await api.get<Page<MeetingNote>>("/meeting_notes", { params });
  return data;
};

export const getMeetingNote = async (note_id: number): Promise<MeetingNote> => {
  const { data } = await api.get<MeetingNote>(`/meeting_notes/${note_id}`);
  return data;
};

export const createMeetingNote = async (payload: Partial<MeetingNote>): Promise<MeetingNote> => {
  const { data } = await api.post<MeetingNote>("/meeting_notes", payload);
  return data;
};

export const updateMeetingNote = async (note_id: number, payload: Partial<MeetingNote>): Promise<MeetingNote> => {
  const { data } = await api.patch<MeetingNote>(`/meeting_notes/${note_id}`, payload);
  return data;
};

export const deleteMeetingNote = async (note_id: number): Promise<void> => {
  await api.delete(`/meeting_notes/${note_id}`);
};
