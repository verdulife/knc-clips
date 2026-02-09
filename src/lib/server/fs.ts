import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const TEMP_DIR = 'temp';
const CLIPS_DIR = 'clips';
const THUMBS_DIR = join(TEMP_DIR, 'thumbnails');

export function ensureDirectories() {
  const paths = [TEMP_DIR, CLIPS_DIR, THUMBS_DIR];

  for (const p of paths) {
    const fullPath = join(process.cwd(), p);
    if (!existsSync(fullPath)) {
      console.log(`[fs] Creating directory: ${fullPath}`);
      mkdirSync(fullPath, { recursive: true });
    }
  }
}

export function cleanTempFiles() {
  const tempPath = join(process.cwd(), TEMP_DIR);
  if (!existsSync(tempPath)) return;

  try {
    const files = readdirSync(tempPath);
    for (const file of files) {
      const fullPath = join(tempPath, file);
      // Only clean top-level .part/.ytdl files, keep thumbnails dir
      if (file.endsWith('.part') || file.endsWith('.ytdl')) {
        console.log(`[fs] Cleaning up temp file: ${file}`);
        unlinkSync(fullPath);
      }
    }
  } catch (error) {
    console.error('[fs] Error cleaning temp files:', error);
  }
}

export function getTempPath(filename: string) {
  return join(process.cwd(), TEMP_DIR, filename);
}

export function getClipPath(filename: string) {
  return join(process.cwd(), CLIPS_DIR, filename);
}

export function getThumbTempDir() {
  const dir = join(process.cwd(), THUMBS_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}