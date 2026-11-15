export function getImageExtension(mimeType: string): string | undefined {
  switch (mimeType) {
    case 'image/jpeg': return '.jpg';
    case 'image/png': return '.png';
    case 'image/webp': return '.webp';
    case 'image/heic': return '.heic';
    case 'image/heif': return '.heif';
    default: return undefined;
  }
}
