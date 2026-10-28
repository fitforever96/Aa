"use client";

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/** Validate and downscale an uploaded photo to a JPEG data URL (keeps storage and PDFs lean). */
export async function imageFileToDataUrl(file: File, maxDim = 1800): Promise<string> {
  if (!OK_TYPES.includes(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error("Unsupported image type. Use JPEG, PNG, WebP or HEIC.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Image is larger than 15 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("This image could not be decoded on this device."));
      i.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}
