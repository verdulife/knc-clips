import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClip } from '$lib/server/trimmer';
import type { EpisodeClip } from '$lib/types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { videoId, clips, prefix } = await request.json() as {
      videoId: string,
      clips: EpisodeClip[],
      prefix?: string
    };

    if (!videoId || !clips || clips.length === 0) {
      return json({ error: 'Missing videoId or clips' }, { status: 400 });
    }

    console.log(`[api/trim] Starting batch trim for video ${videoId} (${clips.length} clips)`);

    const results = [];
    for (const clip of clips) {
      try {
        const { videoPath, clipId } = await createClip({
          videoId,
          clipTitle: clip.title,
          startTime: clip.startTime,
          duration: clip.duration,
          outputPrefix: prefix
        });
        // We return the clipId so the frontend can request the temporary thumbnails
        results.push({
          title: clip.title,
          path: videoPath,
          clipId: clipId,
          success: true
        });
      } catch (err: unknown) {
        const error = err as Error;
        console.error(`[api/trim] Failed to trim clip: ${clip.title}`, error);
        results.push({ title: clip.title, error: error.message, success: false });
      }
    }

    return json({ success: true, results });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[api/trim] Request error:', error);
    return json({ error: error.message || 'Trim processing failed' }, { status: 500 });
  }
};
