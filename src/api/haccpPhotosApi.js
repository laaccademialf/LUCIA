import { getCollectionsApiBase, getCollectionsApiHeaders } from "./collectionsApi";

const endpoint = (path) => `${getCollectionsApiBase()}${path}`;

const MAX_UPLOAD_BATCH_BYTES = 3 * 1024 * 1024;

const estimatePhotoPayloadBytes = (photo) => {
  const dataUrl = String(photo?.dataUrl || "");
  if (!dataUrl) return 0;
  const base64 = dataUrl.includes(",") ? dataUrl.split(",").slice(1).join(",") : dataUrl;
  return Math.ceil((base64.length * 3) / 4);
};

const splitByPayloadSize = (photos = []) => {
  const batches = [];
  let currentBatch = [];
  let currentBytes = 0;

  (Array.isArray(photos) ? photos : []).forEach((photo) => {
    const photoBytes = estimatePhotoPayloadBytes(photo);
    const effectiveBytes = Math.max(photoBytes, 1);
    const shouldStartNewBatch =
      currentBatch.length > 0 && currentBytes + effectiveBytes > MAX_UPLOAD_BATCH_BYTES;

    if (shouldStartNewBatch) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBytes = 0;
    }

    currentBatch.push(photo);
    currentBytes += effectiveBytes;
  });

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
};

export const uploadHaccpPhotosApi = async (photos = []) => {
  const list = Array.isArray(photos) ? photos.filter(Boolean) : [];
  if (!list.length) return [];

  const batches = splitByPayloadSize(list);
  const uploaded = [];

  for (const batch of batches) {
    const response = await fetch(endpoint("/api/haccp/photos"), {
      method: "POST",
      headers: getCollectionsApiHeaders(),
      body: JSON.stringify({ photos: batch }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const hint = response.status === 413
        ? " Запит завеликий: зменшіть/додайте менше фото за раз."
        : "";
      throw new Error(`HACCP photo upload failed (${response.status}): ${body || "no body"}.${hint}`.trim());
    }

    const payload = await response.json().catch(() => ({}));
    const photosFromBatch = Array.isArray(payload?.photos) ? payload.photos : [];
    uploaded.push(...photosFromBatch);
  }

  return uploaded;
};