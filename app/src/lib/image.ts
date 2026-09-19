import { JPEG_QUALITY, MAX_SIDE, THUMB_SIDE } from '../config';

export interface Encoded {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

/** Re-codifica la foto en el navegador: la orientación EXIF queda aplicada a
 *  los píxeles, el lado mayor baja a MAX_SIDE y el archivo resultante no
 *  lleva NINGÚN metadato (un canvas no sabe escribir EXIF). Es lo que sube. */
export async function encode(file: Blob): Promise<Encoded> {
  const img = await loadImage(file);
  const full = draw(img, MAX_SIDE);
  const thumb = draw(img, THUMB_SIDE);
  const [fullBlob, thumbBlob] = await Promise.all([toJpeg(full, JPEG_QUALITY), toJpeg(thumb, 0.8)]);
  return { full: fullBlob, thumb: thumbBlob, width: full.width, height: full.height };
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('La imagen no se pudo leer.')); };
    img.src = url;
  });
}

function draw(img: HTMLImageElement, maxSide: number): HTMLCanvasElement {
  /* `naturalWidth/Height` ya vienen orientados: los navegadores aplican la
     orientación EXIF al decodificar (image-orientation: from-image). */
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo codificar la imagen.'))),
      'image/jpeg', quality),
  );
}

export async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
