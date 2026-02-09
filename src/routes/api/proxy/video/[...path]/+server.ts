import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { join } from 'node:path';

/**
 * Serves generated MP4 clips from the clips folder to the frontend.
 * Usage: /api/proxy/video/[filename].mp4
 */
export const GET: RequestHandler = ({ params }) => {
  const filePath = params.path;

  if (!filePath) {
    throw error(400, 'Missing file path');
  }

  const fullPath = join(process.cwd(), 'clips', filePath);

  if (!existsSync(fullPath)) {
    console.error(`[api/proxy/video] File not found: ${fullPath}`);
    throw error(404, 'Video not found');
  }

  try {
    const stats = statSync(fullPath);
    const stream = createReadStream(fullPath);

    // Determine content type
    let contentType = 'application/octet-stream';
    if (fullPath.endsWith('.mp4')) contentType = 'video/mp4';
    else if (fullPath.endsWith('.png')) contentType = 'image/png';
    else if (fullPath.endsWith('.jpg') || fullPath.endsWith('.jpeg')) contentType = 'image/jpeg';

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': stats.size.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (err) {
    console.error('[api/proxy/video] Error serving video:', err);
    throw error(500, 'Error serving video');
  }
};
