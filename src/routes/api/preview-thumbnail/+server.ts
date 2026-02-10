import type { RequestHandler } from './$types';
import { getClipPath } from '$lib/server/fs';
import ffmpeg from 'fluent-ffmpeg';
import { PassThrough } from 'stream';

/**
 * Generates a fast, low-res preview thumbnail for a specific timestamp.
 * GET /api/preview-thumbnail?clipId=X&timestamp=Y
 */
export const GET: RequestHandler = async ({ url }) => {
  const clipId = url.searchParams.get('clipId');
  const timestamp = parseFloat(url.searchParams.get('timestamp') || '0');

  if (!clipId) {
    return new Response('Missing clipId', { status: 400 });
  }

  const videoPath = getClipPath(`${clipId}.mp4`);

  // Create a PassThrough stream (Writable for ffmpeg, Readable for response)
  const stream = new PassThrough();

  try {
    const command = ffmpeg(videoPath)
      .seekInput(timestamp) // Seek before input for speed
      .frames(1)
      .format('image2')
      .videoCodec('mjpeg')
      .outputOptions([
        '-q:v 3', // Lower quality for speed (2-5 range)
        '-vf scale=160:-1', // Small width for preview
        '-preset ultrafast', // Max speed
        '-f mjpeg'
      ])
      .on('error', (err) => {
        console.error('[preview-thumbnail] FFmpeg error:', err);
      });

    // Pipe ffmpeg output to our PassThrough stream
    command.pipe(stream, { end: true });

    return new Response(stream as any, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
      }
    });
  } catch (err) {
    console.error('[preview-thumbnail] Error:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
};
