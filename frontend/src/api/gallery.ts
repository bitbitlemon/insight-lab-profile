import { api } from "./client";
import { appendAuthToken } from "../utils/fileLinks";

export type GallerySourceType = "all" | "competition" | "paper";

export interface GalleryPhoto {
  file_token: string;
  name: string | null;
  size: number | null;
  type: string | null;
  proxy_path: string;
  source_app_token?: string | null;
  source_table_id?: string | null;
  source_type: "competition" | "paper";
  source_subtype: string;
  source_id: number;
  source_title: string;
  occurred_at: string | null;
}

export interface GalleryListResponse {
  items: GalleryPhoto[];
  total: number;
}

export const galleryPhotoUrl = (photo: GalleryPhoto): string => appendAuthToken(photo.proxy_path);

export const galleryPhotoProxyUrl = (photo: GalleryPhoto): string => {
  return galleryPhotoUrl(photo);
};

export const listGalleryPhotos = async (sourceType?: GallerySourceType): Promise<GalleryListResponse> => {
  const params = sourceType && sourceType !== "all" ? { source_type: sourceType } : undefined;
  const { data } = await api.get<GalleryListResponse>("/gallery/photos", { params });
  return data;
};
