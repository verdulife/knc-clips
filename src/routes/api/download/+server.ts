import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { downloadVideo } from '$lib/server/download';

export const GET: RequestHandler = ({ url }) => {
  const videoId = url.searchParams.get('videoId');
  const youtubeUrl = url.searchParams.get('url');

  if (!videoId || !youtubeUrl) {
    return json({ error: 'Missing videoId or url' }, { status: 400 });
  }

  const abortController = new AbortController();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (event: string, data: any) => {
        if (abortController.signal.aborted) return;

        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch (e) {
          // Controller might be closed
        }
      };

      try {
        await downloadVideo(youtubeUrl, videoId, {
          signal: abortController.signal,
          onProgress: (progress) => {
            sendEvent('progress', progress);
          }
        });

        if (!abortController.signal.aborted) {
          sendEvent('complete', { success: true });
          controller.close();
        }
      } catch (err: any) {
        console.error('[SSE/Download] Error:', err);
        if (!abortController.signal.aborted) {
          sendEvent('error', { message: err.message || 'Download failed' });
          controller.close();
        }
      }
    },
    cancel() {
      console.log('[SSE/Download] Connection closed, aborting yt-dlp...');
      abortController.abort();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
};
