import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { extractTranscriptionFragment } from '$lib/server/trimmer';
import { generateClickbaitTitle } from '$lib/server/ai';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { transcription, startTime, endTime, originalTitle } = await request.json();

    if (!transcription || startTime === undefined || endTime === undefined || !originalTitle) {
      return json({ error: 'Missing required fields for reroll' }, { status: 400 });
    }

    const fragment = extractTranscriptionFragment(transcription, startTime, endTime);
    const newAiTitle = await generateClickbaitTitle(fragment, originalTitle);

    return json({ aiTitle: newAiTitle });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[api/ai/reroll] Error:', error);
    return json({ error: error.message }, { status: 500 });
  }
};
