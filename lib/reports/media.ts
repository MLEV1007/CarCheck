const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.m4v', '.avi'];

/**
 * A `defects.media_url` egy Supabase Storage publikus URL, kiterjesztés szerint
 * fotó vagy videó -- a wizard (`DefectMediaUpload.tsx`) mindkettőt ugyanabba a
 * mezőbe menti, itt a fájlnév kiterjesztéséből döntjük el a megjelenítés módját.
 */
export function isVideoUrl(url: string): boolean {
  const withoutQuery = url.split('?')[0]?.toLowerCase() ?? '';
  return VIDEO_EXTENSIONS.some((ext) => withoutQuery.endsWith(ext));
}
