"use client";

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

/**
 * Canvas-based client-side downscale + re-encode before upload — brief
 * §10.1. No image-processing library; the Canvas API is enough for a
 * "max 1600px longest edge, re-encode as JPEG" pipeline.
 */
export async function downscaleImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, outputType, JPEG_QUALITY),
  );
  if (!blob) return file;

  const ext = outputType === "image/png" ? "png" : "jpg";
  const name = file.name.replace(/\.[^.]+$/, "") + `.${ext}`;
  return new File([blob], name, { type: outputType });
}
