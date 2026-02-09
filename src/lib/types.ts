export interface EpisodeClip {
  title: string;
  startTime: number; // Duration in seconds
  endTime: number; // Duration in seconds
  duration: number; // Duration in seconds
  selected?: boolean;
}

export interface EpisodeMetadata {
  videoId: string;
  title: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  description: string;
  clips: EpisodeClip[];
}
