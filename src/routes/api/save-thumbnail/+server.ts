import { json } from '@sveltejs/kit';
import { writeFile } from 'fs/promises';
import { join } from 'path';

export const POST = async ({ request }) => {
  try {
    const { base64, filename } = await request.json();

    if (!base64 || !filename) {
      return json({ error: 'Missing base64 or filename' }, { status: 400 });
    }

    // Remove the data URL prefix (e.g., "data:image/png;base64,")
    const base64Data = base64.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');

    // Target path: clips folder in project root
    const filePath = join(process.cwd(), 'clips', filename);

    await writeFile(filePath, buffer);

    console.log(`Thumbnail saved: ${filePath}`);
    return json({ success: true, path: filePath });
  } catch (err) {
    console.error('Error saving thumbnail:', err);
    return json({ error: 'Failed to save thumbnail' }, { status: 500 });
  }
};
