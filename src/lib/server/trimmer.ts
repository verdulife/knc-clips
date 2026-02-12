import ffmpeg from 'fluent-ffmpeg';
import { getTempPath, getClipPath, ensureDirectories, getThumbTempDir } from './fs';
import path from 'node:path';

// Specific paths for FFmpeg tools on Windows
const FFMPEG_PATH = 'C:/tools/ffmpeg.exe';
const FFPROBE_PATH = 'C:/tools/ffprobe.exe';

ffmpeg.setFfmpegPath(FFMPEG_PATH);
ffmpeg.setFfprobePath(FFPROBE_PATH);

export interface TrimOptions {
  videoId: string;
  clipTitle: string;
  startTime: number;
  endTime: number;
  duration: number;
  outputPrefix?: string;
  transcription?: string;
}

import { generateClickbaitTitle } from './ai';

export function extractTranscriptionFragment(transcription: string, start: number, end: number): string {
  console.log(`[trimmer] Extracting fragment: Requested ${start}s - ${end}s`);

  // Pattern 1: [S] (Absolute seconds) - New format
  // Pattern 2: [HH:MM:SS] or [MM:SS] - Old format
  const pattern = /\[(\d+(?::\d+)*)\]/g;
  interface Marker {
    time: number;
    index: number;
  }
  const matches: Marker[] = [];
  let match;

  while ((match = pattern.exec(transcription)) !== null) {
    const timeStr = match[1];
    let timeInSeconds = 0;

    if (timeStr.includes(':')) {
      const parts = timeStr.split(':').map(Number);
      if (parts.length === 3) {
        timeInSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) {
        timeInSeconds = parts[0] * 60 + parts[1];
      }
    } else {
      timeInSeconds = parseInt(timeStr);
    }

    matches.push({ time: timeInSeconds, index: match.index });
  }

  if (matches.length === 0) {
    console.warn(`[trimmer] WARNING: No transcription markers found! First 200 chars: "${transcription.substring(0, 200)}"`);
  }

  // Add a small buffer (5s) for context at the start and end
  const buffer = 5;
  const bufferedStart = Math.max(0, start - buffer);
  const bufferedEnd = end + buffer;

  // Find start and end indices in the text
  const startMatch = matches.filter((m) => m.time <= bufferedStart).pop();
  const endMatch = matches.filter((m) => m.time >= bufferedEnd).shift();

  const startIndex = startMatch?.index || 0;
  const endIndex = endMatch?.index || transcription.length;

  console.log(`[trimmer] Found ${matches.length} markers. Start @ ${startMatch?.time || 'N/A'}s (idx ${startIndex}), End @ ${endMatch?.time || 'N/A'}s (idx ${endIndex})`);

  const fragment = transcription.substring(startIndex, endIndex).trim();
  console.log(`[trimmer] Fragment extracted length: ${fragment.length} chars.`);

  return fragment;
}

/**
 * Extracts a high-quality frame from a video at a specific timestamp.
 */
export async function extractThumbnail(videoPath: string, timestamp: number, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seek(timestamp)
      .frames(1)
      .outputOptions(['-q:v 2']) // High quality JPG
      .output(outputPath)
      .outputOptions('-y')
      .on('end', () => {
        console.log(`[trimmer] Thumbnail generated at ${timestamp}s: ${outputPath}`);
        resolve();
      })
      .on('error', (err) => {
        console.error('[trimmer] Error generating thumbnail:', err);
        reject(err);
      })
      .run();
  });
}

async function getDuration(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration || 0);
    });
  });
}


export async function createClip(
  options: TrimOptions,
  onProgress?: (percent: number, status?: string) => void
): Promise<{ videoPath: string; clipId: string; aiTitle?: string }> {
  ensureDirectories();

  const inputPath = getTempPath(`${options.videoId}.mp4`);

  // 0. AI Title Generation (Optional)
  let aiTitle: string | undefined = undefined;
  if (options.transcription) {
    console.log(`[trimmer] Triggering AI Title generation...`);
    const fragment = extractTranscriptionFragment(options.transcription, options.startTime, options.endTime);
    aiTitle = await generateClickbaitTitle(fragment, options.clipTitle);
  }

  const safeTitle = options.clipTitle.replace(/[\\/:*?"<>|]/g, '-');
  const prefix = options.outputPrefix ? `[${options.outputPrefix}] - ` : '';
  const baseName = `${prefix}${safeTitle}`;
  const outputVideoPath = getClipPath(`${baseName}.mp4`);

  // Use baseName (prefix + title) as clipId for readability and consistent naming
  const clipId = baseName;
  const thumbDir = getThumbTempDir();

  console.log(`[trimmer] Creating clip: ${baseName}.mp4 (${options.startTime}s for ${options.duration}s)`);

  // 1. Create the video clip with intro and ending
  const introPath = path.join(process.cwd(), 'static', 'intro.mp4');
  const endingPath = path.join(process.cwd(), 'static', 'ending.mp4');

  // Get durations for accurate progress
  const introDuration = await getDuration(introPath).catch(() => 0);
  const endingDuration = await getDuration(endingPath).catch(() => 0);
  const totalDuration = introDuration + options.duration + endingDuration;

  if (onProgress) onProgress(0, 'Merging intro, clip and ending...');

  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg()
      .input(introPath)
      .input(inputPath)
      .inputOptions(['-ss ' + options.startTime, '-t ' + options.duration])
      .input(endingPath)
      .complexFilter([
        // Normalize all to 1080p, 30fps, same timebase to avoid concat issues
        '[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v0]',
        '[1:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v1]',
        '[2:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v2]',
        // Ensure all have audio or generate silence if missing (simplified concat for now assuming audio exists)
        '[v0][0:a][v1][1:a][v2][2:a]concat=n=3:v=1:a=1[v][a]'
      ])
      .map('[v]')
      .map('[a]')
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions(['-preset superfast', '-crf 23', '-movflags +faststart'])
      .output(outputVideoPath)
      .on('start', (cmd) => console.log(`[trimmer] Command: ${cmd}`))
      .on('progress', (progress) => {
        if (onProgress && progress.timemark) {
          const parts = progress.timemark.split(':').map(parseFloat);
          const currentSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
          // 0-90% for merging
          const percent = Math.min(90, (currentSeconds / totalDuration) * 90);
          onProgress(percent, `Rendering video: ${Math.round(percent)}%`);
        }
      })
      .on('end', () => resolve())
      .on('error', (err) => {
        console.error('[trimmer] FFmpeg Concatenation Error:', err);
        reject(err);
      });

    command.run();
  });

  // 2. Automatically generate a single default thumbnail (at 30%)
  if (onProgress) onProgress(91, 'Generating default thumbnail...');
  console.log(`[trimmer] Generating default thumbnail for ${clipId}...`);

  const defaultTimestamp = totalDuration * 0.3;
  const thumbPath = path.join(thumbDir, `${clipId}-thumb-1.jpg`);
  await extractThumbnail(outputVideoPath, defaultTimestamp, thumbPath);

  if (onProgress) onProgress(100, 'Clip created successfully');
  return { videoPath: outputVideoPath, clipId, aiTitle };
}
