import { youtubeDl, COOKIE_FILE, binPath } from './yt-dlp';
import type { EpisodeMetadata, EpisodeClip } from '../types';

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

    return {
      videoId: output.id,
      title: output.title,
      description: output.description || '',
      seasonNumber,
      episodeNumber,
      clips
    };
  } catch (error) {
    console.error('[video-info] Error extracting metadata:', error);
    throw error;
  }
}
