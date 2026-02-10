import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Serves images from the temp folder to the frontend.
 * Usage: /api/proxy/thumbnail/[clipId]/thumb-[index].jpg
 */
export const GET: RequestHandler = ({ params }) => {
  const filePath = params.path;

  if (!filePath) {
    throw error(400, 'Missing file path');
  }

  const fullPath = join(process.cwd(), 'temp', 'thumbnails', filePath);

  if (!existsSync(fullPath)) {
    throw error(404, 'Thumbnail not found');
  }

  try {
    const file = readFileSync(fullPath);
    return new Response(file, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (err) {
    console.error('[api/proxy] Error serving image:', err);
    throw error(500, 'Error serving image');
  }
};
