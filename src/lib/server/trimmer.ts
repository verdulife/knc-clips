import ffmpeg from 'fluent-ffmpeg';
import { getTempPath, getClipPath, ensureDirectories, getThumbTempDir } from './fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execAsync = promisify(exec);

// Specific paths for FFmpeg tools on Windows
const FFMPEG_PATH = 'C:/tools/ffmpeg.exe';
const FFPROBE_PATH = 'C:/tools/ffprobe.exe';

ffmpeg.setFfmpegPath(FFMPEG_PATH);
ffmpeg.setFfprobePath(FFPROBE_PATH);

export interface TrimOptions {
  videoId: string;
  clipTitle: string;
  startTime: number;
  duration: number;
  outputPrefix?: string;
}

/**
 * Finds the timestamp of the loudest moment (Peak) within a video file.
 */
async function getLoudestTimestamp(inputPath: string): Promise<number> {
  try {
    // Prepare path for FFmpeg filter (amovie requires special escaping for colons and backslashes)
    const filterPath = inputPath.replace(/\\/g, '/').replace(/:/g, '\\:');

    const command = `"${FFPROBE_PATH}" -v error -f lavfi -i "amovie='${filterPath}',ebur128=metadata=1" -show_entries frame=pkt_pts_time:frame_tags=lavfi.r128.M -of csv=p=0`;

    const { stdout } = await execAsync(command);
    const lines = stdout.trim().split('\n');

    let maxLoudness = -100; // dBFS (approx)
    let peakTime = 0;

    for (const line of lines) {
      const [timeStr, loudnessStr] = line.split(',');
      const time = parseFloat(timeStr);
      const loudness = parseFloat(loudnessStr);

      if (!isNaN(time) && !isNaN(loudness) && loudness > maxLoudness) {
        maxLoudness = loudness;
        peakTime = time;
      }
    }

    return peakTime;
  } catch (error) {
    console.error('[trimmer] Error detecting loudest timestamp:', error);
    return 0; // Fallback to start of clip
  }
}

/**
 * Extracts a high-quality frame from a video at a specific timestamp.
 */
async function extractThumbnail(videoPath: string, timestamp: number, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(timestamp)
      .frames(1)
      .outputOptions(['-q:v 2']) // High quality JPG
      .output(outputPath)
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

export async function createClip(options: TrimOptions): Promise<{ videoPath: string; clipId: string }> {
  ensureDirectories();

  const inputPath = getTempPath(`${options.videoId}.mp4`);
  const safeTitle = options.clipTitle.replace(/[\\/:*?"<>|]/g, '-');
  const prefix = options.outputPrefix ? `[${options.outputPrefix}] - ` : '';
  const baseName = `${prefix}${safeTitle}`;
  const outputVideoPath = getClipPath(`${baseName}.mp4`);

  // Create a unique ID for this clip processing session to avoid collisions
  const clipId = Buffer.from(`${options.videoId}-${safeTitle}`).toString('hex').slice(0, 12);
  const thumbDir = getThumbTempDir(clipId);

  console.log(`[trimmer] Creating clip: ${baseName}.mp4 (${options.startTime}s for ${options.duration}s)`);

  // 1. Create the video clip
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(options.startTime)
      .setDuration(options.duration)
      .output(outputVideoPath)
      .videoCodec('copy')
      .audioCodec('copy')
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });

  // 2. Automatically generate multiple thumbnails in the temp folder
  console.log(`[trimmer] Generating 5 thumbnail variants in temp...`);

  const timestamps: { label: string; time: number }[] = [];

  // Option 1: Loudest peak
  const peakTime = await getLoudestTimestamp(outputVideoPath);
  timestamps.push({ label: 'peak', time: peakTime });

  // Options 2-5: Distributed points (20%, 40%, 60%, 80%)
  const percentages = [0.2, 0.4, 0.6, 0.8];
  percentages.forEach((p, i) => {
    timestamps.push({ label: `v${i + 1}`, time: options.duration * p });
  });

  // Generate thumbnails in parallel
  await Promise.all(
    timestamps.map((t, index) => {
      const thumbPath = path.join(thumbDir, `thumb-${index + 1}.jpg`);
      return extractThumbnail(outputVideoPath, t.time, thumbPath);
    })
  );

  return { videoPath: outputVideoPath, clipId };
}
