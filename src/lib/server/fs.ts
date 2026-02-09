import { existsSync, mkdirSync, readdirSync, unlinkSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyBranding, type BrandingOptions } from './branding';

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

export function getThumbTempDir(clipId: string) {
  const dir = join(process.cwd(), THUMBS_DIR, clipId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Finalizes the thumbnail by applying brand overlays and saving to /clips
 */
export async function finalizeThumbnail(
  clipId: string,
  thumbIndex: string,
  finalName: string,
  brandingData?: Omit<BrandingOptions, 'inputPath' | 'outputPath'>
) {
  const thumbDir = join(process.cwd(), THUMBS_DIR, clipId);
  const sourcePath = join(thumbDir, `thumb-${thumbIndex}.jpg`);
  const destPath = getClipPath(`${finalName}.jpg`);

  if (existsSync(sourcePath)) {
    if (brandingData) {
      try {
        await applyBranding({
          ...brandingData,
          inputPath: sourcePath,
          outputPath: destPath
        });
        return true;
      } catch (error) {
        console.error('[fs] Branding failed, falling back to simple copy:', error);
      }
    }

    console.log(`[fs] Finalizing thumbnail (fallback): ${destPath}`);
    copyFileSync(sourcePath, destPath);
    return true;
  }
  return false;
}
