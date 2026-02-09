import { youtubeDl, COOKIE_FILE } from './yt-dlp';
import { getTempPath, ensureDirectories, cleanTempFiles } from './fs';

export interface DownloadProgress {
  percent: number;
  speed?: string;
  eta?: string;
}

export interface DownloadOptions {
  onProgress?: (progress: DownloadProgress) => void;
  signal?: AbortSignal;
}

export async function downloadVideo(url: string, videoId: string, options?: DownloadOptions) {
  ensureDirectories();
  cleanTempFiles(); // Always clean before starting a new one

  const outputPath = getTempPath(`${videoId}.mp4`);

  console.log(`[download] Starting download: ${url} -> ${outputPath} (Max 1080p)`);

  // Quality preference: Best MP4 up to 1080p
  const format = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';

  const subprocess = youtubeDl.exec(url, {
    format,
    output: outputPath,
    noCheckCertificate: true,
    cookies: COOKIE_FILE,
    newline: true
  });

  // Handle cancellation
  if (options?.signal) {
    if (options.signal.aborted) {
      subprocess.kill();
    }
    options.signal.addEventListener('abort', () => {
      console.log(`[download] Aborting download for ${videoId}`);
      subprocess.kill();
    });
  }

  // Handle progress from stdout
  subprocess.stdout?.on('data', (data: Buffer) => {
    const line = data.toString();
    // yt-dlp progress line example: [download]  45.0% of 100.00MiB at 10.00MiB/s ETA 00:05
    const match = line.match(/\[download\]\s+(\d+\.\d+)%\s+of\s+[\d.]+\w+\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/);

    if (match && options?.onProgress) {
      options.onProgress({
        percent: parseFloat(match[1]),
        speed: match[2],
        eta: match[3]
      });
    } else {
      // Fallback for simpler progress lines
      const simpleMatch = line.match(/\[download\]\s+(\d+\.\d+)%/);
      if (simpleMatch && options?.onProgress) {
        options.onProgress({
          percent: parseFloat(simpleMatch[1])
        });
      }
    }
  });

  // Wait for process to complete
  try {
    await subprocess;
    console.log(`[download] Completed: ${outputPath}`);
    return outputPath;
  } catch (error: any) {
    // If it was aborted, we don't want to throw a scary error
    if (options?.signal?.aborted) {
      console.log(`[download] Process terminated by user.`);
      return null;
    }
    console.error('[download] Error during download:', error);
    throw error;
  }
}
