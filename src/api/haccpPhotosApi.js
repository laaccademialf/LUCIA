import { getCollectionsApiBase, getCollectionsApiHeaders } from "./collectionsApi";

const endpoint = (path) => `${getCollectionsApiBase()}${path}`;

export const uploadHaccpPhotosApi = async (photos = []) => {
  const list = Array.isArray(photos) ? photos.filter(Boolean) : [];
  if (!list.length) return [];

  const response = await fetch(endpoint("/api/haccp/photos"), {
    method: "POST",
    headers: getCollectionsApiHeaders(),
    body: JSON.stringify({ photos: list }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HACCP photo upload failed (${response.status}): ${body || "no body"}`);
  }

  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload?.photos) ? payload.photos : [];
};