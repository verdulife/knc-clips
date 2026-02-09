import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVideoMetadata } from '$lib/server/video-info';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { url } = await request.json();

    if (!url) {
      return json({ error: 'URL is required' }, { status: 400 });
    }

    const metadata = await getVideoMetadata(url);
    return json(metadata);
  } catch (error: any) {
    console.error('[API/Extract] Error:', error);
    return json(
      { error: error.message || 'Failed to extract metadata' },
      { status: 500 }
    );
  }
};
