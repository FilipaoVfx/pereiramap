import type { MediaReference } from "../types";

const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;
const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined;

export const isCloudinaryConfigured = Boolean(cloudName && uploadPreset);

interface CloudinaryUploadResponse {
  public_id: string;
  secure_url: string;
  resource_type: "image" | "video";
  format: string;
  width?: number;
  height?: number;
  duration?: number;
  bytes: number;
}

function thumbnailFor(secureUrl: string, resourceType: "image" | "video") {
  if (resourceType !== "image") return undefined;
  return secureUrl.replace("/upload/", "/upload/c_fill,w_400,h_300,q_auto,f_auto/");
}

/**
 * Sube directo a Cloudinary desde el cliente (unsigned upload preset).
 * Si Cloudinary no está configurado todavía, cae en modo demo: guarda una
 * imagen de ejemplo pero conserva el resto del flujo real (location, time,
 * insert en Supabase, realtime).
 */
export function uploadEvidence(
  file: File,
  onProgress?: (percent: number) => void
): Promise<MediaReference> {
  if (!isCloudinaryConfigured) {
    return Promise.resolve(demoMediaReference(file));
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`
    );

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Cloudinary upload failed (${xhr.status})`));
        return;
      }
      const data = JSON.parse(xhr.responseText) as CloudinaryUploadResponse;
      resolve({
        provider: "cloudinary",
        publicId: data.public_id,
        secureUrl: data.secure_url,
        thumbnailUrl: thumbnailFor(data.secure_url, data.resource_type),
        resourceType: data.resource_type,
        format: data.format,
        width: data.width,
        height: data.height,
        durationSeconds: data.duration,
        bytes: data.bytes,
      });
    };

    xhr.onerror = () => reject(new Error("Cloudinary upload network error"));

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", uploadPreset as string);
    xhr.send(formData);
  });
}

function demoMediaReference(file: File): MediaReference {
  const seed = Math.random().toString(36).slice(2, 10);
  const isVideo = file.type.startsWith("video/");
  const url = `https://picsum.photos/seed/${seed}/800/600`;
  return {
    provider: "demo",
    publicId: `demo/${seed}`,
    secureUrl: url,
    thumbnailUrl: `https://picsum.photos/seed/${seed}/200/150`,
    resourceType: isVideo ? "video" : "image",
    format: isVideo ? "mp4" : "jpg",
    width: 800,
    height: 600,
    bytes: file.size,
  };
}
