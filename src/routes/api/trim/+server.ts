import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClip } from '$lib/server/trimmer';
import type { EpisodeClip } from '$lib/types';

export const POST: RequestHandler = async ({ request }) => {
  const { videoId, clips, prefix, transcription } = (await request.json()) as {
    videoId: string;
    clips: EpisodeClip[];
    prefix?: string;
    transcription?: string;
  };

  if (!videoId || !clips || clips.length === 0) {
    return json({ error: 'Missing videoId or clips' }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown> | { success: boolean }) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      console.log(`[api/trim] Starting batch trim for video ${videoId} (${clips.length} clips)`);

      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        try {
          send('clip-start', { title: clip.title, index: i, total: clips.length });

          const { videoPath, clipId, aiTitle } = await createClip(
            {
              videoId,
              clipTitle: clip.title,
              startTime: clip.startTime,
              endTime: clip.endTime,
              duration: clip.duration,
              outputPrefix: prefix,
              transcription
            },
            (percent, status) => {
              send('clip-progress', { title: clip.title, index: i, percent, status });
            }
          );

          send('clip-complete', {
            title: clip.title,
            index: i,
            path: videoPath,
            clipId: clipId,
            aiTitle: aiTitle,
            success: true
          });
        } catch (err: unknown) {
          const error = err as Error;
          console.error(`[api/trim] Failed to trim clip: ${clip.title}`, error);
          send('clip-error', { title: clip.title, index: i, error: error.message });
        }
      }

      send('all-complete', { success: true });
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
};
