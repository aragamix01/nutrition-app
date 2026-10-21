// Client-side photo shrinking before upload: long side ~1024 px, JPEG, under 1 MB. Nothing is stored.

const MAX_BYTES = 1_000_000;
const ATTEMPTS: [longSide: number, quality: number][] = [
  [1024, 0.8],
  [1024, 0.65],
  [800, 0.6],
];

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('encode failed'))),
      'image/jpeg',
      quality,
    ),
  );
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function shrinkImage(file: File): Promise<{ image: string; mimeType: 'image/jpeg' }> {
  // Honours EXIF rotation, so phone photos aren't sideways.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    for (const [longSide, quality] of ATTEMPTS) {
      const scale = Math.min(1, longSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await toBlob(canvas, quality);
      if (blob.size <= MAX_BYTES) return { image: await toBase64(blob), mimeType: 'image/jpeg' };
    }
    throw new Error('รูปใหญ่เกินไป ลองรูปอื่น');
  } finally {
    bitmap.close();
  }
}
