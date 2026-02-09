import { create } from 'yt-dlp-exec';

const YT_DLP_PATH = 'C:/tools/yt-dlp.exe';
export const COOKIE_FILE = 'cookies.txt';

// Create a singleton instance with the specific binary path
export const youtubeDl = create(YT_DLP_PATH);
export const binPath = YT_DLP_PATH;
