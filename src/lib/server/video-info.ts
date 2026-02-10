import { youtubeDl, COOKIE_FILE, binPath } from './yt-dlp';
import type { EpisodeMetadata, EpisodeClip } from '../types';
import { readFile, readdir } from './fs';


export async function getVideoMetadata(url: string): Promise<EpisodeMetadata> {
  try {
    console.log(`[video-info] Extracting metadata for: ${url} using ${binPath}`);

    const output: any = await youtubeDl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificate: true,
      preferFreeFormats: true,
      cookies: COOKIE_FILE
    });

    // 2. Download subtitles (this needs to be a separate call because dump-single-json skips file writes)
    try {
      console.log(`[video-info] Downloading subtitles for: ${url}`);
      await youtubeDl(url, {
        writeAutoSub: true,
        writeSub: true,
        subLang: 'es*',
        skipDownload: true,
        output: 'temp/%(id)s.%(ext)s',
        cookies: COOKIE_FILE,
        noWarnings: true
      });
    } catch (subError) {
      console.warn('[video-info] Subtitle download failed (might not have any):', subError);
    }

    // Extracting Season and Episode from title
    const title = output.title || '';
    let seasonNumber: number | null = null;
    let episodeNumber: number | null = null;

    const seasonEpisodeMatch = title.match(/(\d+)x(\d+)/i) || title.match(/s(\d+)e(\d+)/i);

    if (seasonEpisodeMatch) {
      seasonNumber = parseInt(seasonEpisodeMatch[1]);
      episodeNumber = parseInt(seasonEpisodeMatch[2]);
    }

    // Mapping chapters to EpisodeClip
    const clips: EpisodeClip[] = (output.chapters || []).map((ch: any) => ({
      title: ch.title,
      startTime: ch.start_time,
      endTime: ch.end_time,
      duration: ch.end_time - ch.start_time,
      selected: false
    }));

    // Transcription handling
    let transcription = '';
    const videoId = output.id;
    console.log(`[video-info] Searching for transcription for videoId: ${videoId}`);

    // Look for any .vtt file starting with videoId in temp/
    const tempFiles = await readdir('temp');
    console.log(`[video-info] Files in temp/:`, tempFiles.filter(f => f.startsWith(videoId)));

    const vttFile = tempFiles.find((f: string) => f.startsWith(videoId) && f.endsWith('.vtt'));

    if (vttFile) {
      console.log(`[video-info] Found transcription file: ${vttFile}`);
      const vttPath = `temp/${vttFile}`;
      const vttContent = await readFile(vttPath);
      transcription = parseSubtitles(vttContent);
      console.log(`[video-info] Transcription parsed, length: ${transcription.length}`);
    } else {
      console.log(`[video-info] No transcription file found for ${videoId}`);
    }

    return {
      videoId: output.id,
      title: output.title,
      description: output.description || '',
      seasonNumber,
      episodeNumber,
      transcription,
      clips
    };
  } catch (error) {
    console.error('[video-info] Error extracting metadata:', error);
    throw error;
  }
}

function parseSubtitles(vttContent: string): string {
  // Simple VTT to indexed text parser
  const lines = vttContent.split('\n');
  let indexedText = '';
  let lastTimestamp = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for timestamp line (00:00:00.000 --> 00:00:00.000)
    const timestampMatch = line.match(/^(\d{2}:\d{2}:\d{2}.\d{3}) -->/);
    if (timestampMatch) {
      // Extract minute:second for the index
      const parts = timestampMatch[1].split('.')[0].split(':');
      const ts = parts.length > 2 ? parts.slice(1).join(':') : parts.join(':'); // mm:ss
      lastTimestamp = `[${ts}] `;
      continue;
    }

    // Skip empty lines, 'WEBVTT', or metadata
    if (!line || line === 'WEBVTT' || line.startsWith('Kind:') || line.startsWith('Language:')) {
      continue;
    }

    // If it's a text line, append it with the timestamp if not already added
    // We clean HTML tags like <c.colorE8E8E8>
    const cleanLine = line.replace(/<[^>]*>/g, '').trim();
    if (cleanLine && !indexedText.includes(lastTimestamp + cleanLine)) {
      if (lastTimestamp && !indexedText.endsWith(lastTimestamp)) {
        indexedText += lastTimestamp;
      }
      indexedText += cleanLine + ' ';
      lastTimestamp = ''; // Reset to avoid repeating same timestamp
    }
  }

  return indexedText.trim();
}

