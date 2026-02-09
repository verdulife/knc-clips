import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { extractThumbnail } from '$lib/server/trimmer';
import { getClipPath, getThumbTempDir } from '$lib/server/fs';
import { join } from 'node:path';

/**
 * Captures a specific frame from a clip.
 * POST /api/capture-frame
 * Body: { clipId: string, timestamp: number }
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const { clipId, timestamp } = await request.json();

    if (!clipId || timestamp === undefined) {
      return json({ error: 'Missing clipId or timestamp' }, { status: 400 });
    }

    const videoPath = getClipPath(`${clipId}.mp4`);
    const thumbDir = getThumbTempDir();

    // Use a special index (e.g., 99) or a timestamp-based name to avoid collisions
    // For simplicity and matching current UI logic, we'll use a specific pattern
    const thumbName = `${clipId}-thumb-custom.jpg`;
    const outputPath = join(thumbDir, thumbName);

    await extractThumbnail(videoPath, timestamp, outputPath);

    return json({
      success: true,
      thumbUrl: `/api/proxy/thumbnail/${thumbName}`
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[api/capture-frame] Error:', error);
    return json({ error: error.message || 'Failed to capture frame' }, { status: 500 });
  }
};
