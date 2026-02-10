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

function extractTranscriptionFragment(transcription: string, start: number, end: number): string {
  // Simple fragment extractor based on [mm:ss] markers
  const pattern = /\[(\d+):(\d+)\]/g;
  const matches = [];
  let match;

  while ((match = pattern.exec(transcription)) !== null) {
    const timeInSeconds = parseInt(match[1]) * 60 + parseInt(match[2]);
    matches.push({ time: timeInSeconds, index: match.index });
  }

  // Find start and end indices in the text
  const startIndex = matches.filter((m: any) => m.time <= start).pop()?.index || 0;
  const endIndex = matches.filter((m: any) => m.time >= end).shift()?.index || transcription.length;

  return transcription.substring(startIndex, endIndex).trim();
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
