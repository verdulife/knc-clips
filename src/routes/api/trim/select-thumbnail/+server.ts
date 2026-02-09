import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { finalizeThumbnail } from '$lib/server/fs';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { clipId, thumbIndex, finalName, branding } = await request.json() as {
      clipId: string;
      thumbIndex: string;
      finalName: string;
      branding?: {
        clipTitle: string;
        episodeTitle: string;
        identifier: string;
      }
    };

    if (!clipId || !thumbIndex || !finalName) {
      return json({ error: 'Missing clipId, thumbIndex or finalName' }, { status: 400 });
    }

    const success = await finalizeThumbnail(clipId, thumbIndex, finalName, branding);

    if (success) {
      return json({ success: true });
    } else {
      return json({ error: 'Could not finalize thumbnail' }, { status: 500 });
    }
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[api/trim/select-thumbnail] Error:', error);
    return json({ error: error.message }, { status: 500 });
  }
};
