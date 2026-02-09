<script lang="ts">
	import type { EpisodeMetadata, EpisodeClip } from '$lib/types';

	// State for the UI
	let youtubeUrl = $state('https://www.youtube.com/watch?v=CHL1sJbUytg');
	let downloadProgress = $state(0);
	let downloadSpeed = $state<string | null>(null);
	let downloadEta = $state<string | null>(null);
	let metadata = $state<EpisodeMetadata | null>(null);
	let isExtracting = $state(false);
	let isDownloading = $state(false);
	let isTrimming = $state(false);
	let error = $state<string | null>(null);
	let trimResults = $state<
		{ title: string; success: boolean; clipId?: string; selectedThumb?: number }[] | null
	>(null);
	let zoomedThumb = $state<{ clipId: string; index: number } | null>(null);

	let downloadEventSource: EventSource | null = null;

	async function handleExtract() {
		if (!youtubeUrl) return;

		isExtracting = true;
		error = null;
		metadata = null;
		handleCancelDownload(); // Cancel any existing download

		try {
			const response = await fetch('/api/extract', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: youtubeUrl })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to extract metadata');
			}

			const data: EpisodeMetadata = await response.json();
			// Initialize selection state for each clip (unselected by default)
			data.clips = data.clips.map((clip) => ({ ...clip, selected: false }));
			metadata = data;

			// Trigger download in parallel
			startDownload(data.videoId, youtubeUrl);
		} catch (e: any) {
			error = e.message;
			console.error('Extraction error:', e);
		} finally {
			isExtracting = false;
		}
	}

	function startDownload(videoId: string, url: string) {
		downloadProgress = 0;
		downloadSpeed = null;
		downloadEta = null;
		isDownloading = true;

		if (downloadEventSource) downloadEventSource.close();

		downloadEventSource = new EventSource(
			`/api/download?videoId=${videoId}&url=${encodeURIComponent(url)}`
		);

		downloadEventSource.addEventListener('progress', (event) => {
			const data = JSON.parse(event.data);
			downloadProgress = Math.round(data.percent);
			downloadSpeed = data.speed || null;
			downloadEta = data.eta || null;
		});

		downloadEventSource.addEventListener('complete', () => {
			downloadProgress = 100;
			downloadSpeed = null;
			downloadEta = null;
			isDownloading = false;
			downloadEventSource?.close();
			downloadEventSource = null;
		});

		downloadEventSource.addEventListener('error', (event) => {
			console.error('Download SSE error:', event);
			if (isDownloading) {
				error = 'Download failed. Check server console.';
				isDownloading = false;
			}
			downloadEventSource?.close();
			downloadEventSource = null;
		});
	}

	function handleCancelDownload() {
		if (downloadEventSource) {
			downloadEventSource.close();
			downloadEventSource = null;
		}
		isDownloading = false;
		downloadProgress = 0;
		downloadSpeed = null;
		downloadEta = null;
	}

	async function handleCreateClips() {
		if (!metadata) return;
		const selectedClips = metadata.clips.filter((c) => c.selected);
		if (selectedClips.length === 0) return;

		isTrimming = true;
		error = null;
		trimResults = null;

		try {
			const response = await fetch('/api/trim', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					videoId: metadata.videoId,
					clips: selectedClips,
					prefix: formattedIdentifier // Using the derived 1x01 format
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to process clips');
			}

			const data = await response.json();
			trimResults = data.results;
		} catch (e: any) {
			error = e.message;
			console.error('Trimming error:', e);
		} finally {
			isTrimming = false;
		}
	}

	async function handleSelectThumbnail(clipId: string, thumbIndex: number, resultIndex: number) {
		if (!metadata || !trimResults) return;
		const result = trimResults[resultIndex];

		try {
			const response = await fetch('/api/trim/select-thumbnail', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					clipId,
					thumbIndex: thumbIndex.toString(),
					finalName: `${formattedIdentifier} - ${result.title}`,
					branding: {
						clipTitle: result.title,
						episodeTitle: metadata.title,
						identifier: formattedIdentifier
					}
				})
			});

			if (!response.ok) throw new Error('Failed to select thumbnail');

			// Update UI state
			trimResults[resultIndex].selectedThumb = thumbIndex;
		} catch (e: any) {
			error = 'Failed to save thumbnail selection';
			console.error(e);
		}
	}

	// Helper to format season/episode
	const formattedIdentifier = $derived(
		metadata && metadata.seasonNumber !== null
			? `${metadata.seasonNumber}x${metadata.episodeNumber?.toString().padStart(2, '0')}`
			: ''
	);

	function formatTime(seconds: number) {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);
		return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
	}
</script>

<main class="mx-auto max-w-3xl px-6 py-20 font-sans selection:bg-zinc-800 selection:text-white">
	<header class="mb-12 space-y-2">
		<h1 class="text-3xl font-bold tracking-tighter text-white uppercase">KNCELADOS AUTOMATOR</h1>
		<p class="text-sm tracking-widest text-zinc-500 uppercase">YouTube Clip Extraction Engine</p>
	</header>

	<section class="space-y-12">
		<!-- URL Input Section -->
		<div class="space-y-4">
			<label for="url" class="block text-xs font-medium tracking-widest text-zinc-500 uppercase">
				YouTube URL
			</label>
			<div class="flex gap-2">
				<input
					type="text"
					id="url"
					bind:value={youtubeUrl}
					placeholder="https://www.youtube.com/watch?v=..."
					class="w-full border-b border-zinc-800 bg-transparent py-2 text-sm text-white outline-hidden transition-colors focus:border-white"
				/>
				<button
					onclick={handleExtract}
					disabled={isExtracting || !youtubeUrl}
					class="border border-zinc-800 px-6 py-2 text-xs font-bold tracking-widest text-white uppercase transition-all hover:bg-white hover:text-black disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-white"
				>
					{isExtracting ? 'Extracting...' : 'Process'}
				</button>
			</div>
			{#if error}
				<p class="text-[10px] tracking-widest text-red-500 uppercase">{error}</p>
			{/if}
		</div>

		{#if metadata}
			<div class="animate-in fade-in slide-in-from-bottom-2 duration-700">
				<p class="mb-1 text-[10px] tracking-[0.2em] text-zinc-600 uppercase">
					{formattedIdentifier}
				</p>
				<h2 class="text-xl leading-tight font-bold tracking-tight text-white uppercase">
					{metadata.title}
				</h2>
			</div>
		{/if}

		<!-- Progress Section (Hidden when no download is active) -->
		{#if downloadProgress > 0 || isDownloading}
			<div class="animate-in fade-in space-y-4 duration-700">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-3">
						<span class="block text-xs font-medium tracking-widest text-zinc-500 uppercase">
							Download Progress
						</span>
						{#if isDownloading}
							<button
								onclick={handleCancelDownload}
								class="border border-red-900 px-1.5 py-0.5 text-[9px] tracking-tighter text-red-500 uppercase transition-colors hover:text-red-400"
							>
								Cancel
							</button>
						{/if}
					</div>
					<div class="flex items-center gap-4 font-mono text-[10px] text-zinc-500">
						{#if downloadSpeed}
							<span class="animate-pulse">{downloadSpeed}</span>
						{/if}
						{#if downloadEta}
							<span class="text-zinc-600"> {downloadEta}</span>
						{/if}
						<span class="text-white">
							{downloadProgress === 100 ? 'READY' : `${downloadProgress}%`}
						</span>
					</div>
				</div>
				<div class="h-1 w-full overflow-hidden bg-zinc-900">
					<div
						class="h-full bg-white transition-all duration-500 ease-out"
						style="width: {downloadProgress}%"
					></div>
				</div>
			</div>
		{/if}

		<!-- Clips Selection Section -->
		{#if metadata && metadata.clips.length > 0}
			<div class="animate-in fade-in space-y-6 duration-700">
				<p class="block text-xs font-medium tracking-widest text-zinc-500 uppercase">
					Clips Selector ({metadata.clips.length} found)
				</p>

				<div
					class="custom-scrollbar max-h-96 divide-y divide-zinc-900 overflow-y-auto border-y border-zinc-900 pr-2"
				>
					{#each metadata.clips as clip, i}
						<div
							class="group flex items-center justify-between py-4 transition-colors hover:bg-zinc-950/50"
						>
							<div class="flex items-center gap-4">
								<input
									type="checkbox"
									id="clip-{i}"
									bind:checked={clip.selected}
									class="size-4 cursor-pointer appearance-none border border-zinc-700 bg-black transition-all checked:border-white checked:bg-white"
								/>
								<label for="clip-{i}" class="cursor-pointer">
									<p class="text-sm font-medium text-white">{clip.title}</p>
									<p class="text-[10px] tracking-tighter text-zinc-500 uppercase">
										{formatTime(clip.startTime)} — {formatTime(clip.endTime)}
										<span class="ml-2 font-mono text-zinc-400">[{formatTime(clip.duration)}]</span>
									</p>
								</label>
							</div>
							<div
								class="font-mono text-[10px] text-zinc-600 uppercase opacity-0 transition-opacity group-hover:opacity-100"
							>
								READY TO TRIM
							</div>
						</div>
					{/each}
				</div>

				<!-- Action Button -->
				<div class="space-y-6 pt-4">
					<button
						onclick={handleCreateClips}
						disabled={isTrimming ||
							metadata.clips.filter((c) => c.selected).length === 0 ||
							(downloadProgress < 100 && isDownloading)}
						class="w-full bg-white py-4 text-sm font-black tracking-[0.2em] text-black uppercase transition-all hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-black"
					>
						{isTrimming
							? `Trimming ${metadata.clips.filter((c) => c.selected).length} Clips...`
							: `Create ${metadata.clips.filter((c) => c.selected).length} Clips`}
					</button>

					{#if trimResults}
						<div class="animate-in fade-in space-y-2 duration-700">
							<p class="text-[10px] font-bold tracking-[0.2em] text-white uppercase">
								Trim Results
							</p>
							<div class="space-y-1">
								{#each trimResults as result, i}
									<div class="space-y-4 border-b border-zinc-900 py-6">
										<div class="flex items-center justify-between">
											<p class="text-[10px] font-bold text-zinc-400 uppercase">
												{result.title}
											</p>
											<span
												class="text-[9px] font-bold tracking-tighter uppercase {result.success
													? 'text-green-500'
													: 'text-red-500'}"
											>
												{result.success ? 'VIDEO SAVED' : 'FAILED'}
											</span>
										</div>

										{#if result.success && result.clipId}
											<div class="space-y-3">
												<p class="text-[9px] tracking-widest text-zinc-600 uppercase">
													{result.selectedThumb
														? 'Thumbnail Selected'
														: 'Pick a thumbnail to finalize'}
												</p>
												<div class="grid grid-cols-5 gap-2">
													{#each Array(5) as _, thumbIdx}
														<div
															class="group relative aspect-video overflow-hidden border border-zinc-800 transition-all hover:border-white {result.selectedThumb ===
															thumbIdx + 1
																? 'border-green-500 ring-1 ring-green-500'
																: ''}"
														>
															<button
																onclick={() =>
																	handleSelectThumbnail(result.clipId!, thumbIdx + 1, i)}
																class="h-full w-full"
															>
																<img
																	src="/api/proxy/thumbnail/{result.clipId}/thumb-{thumbIdx +
																		1}.jpg"
																	alt="Variant {thumbIdx + 1}"
																	class="h-full w-full object-cover grayscale transition-all group-hover:grayscale-0 {result.selectedThumb ===
																	thumbIdx + 1
																		? 'grayscale-0'
																		: ''}"
																/>
															</button>

															<!-- Selection UI -->
															{#if result.selectedThumb === thumbIdx + 1}
																<div
																	class="pointer-events-none absolute inset-0 flex items-center justify-center bg-green-500/10"
																>
																	<span
																		class="bg-green-500 px-1.5 py-0.5 text-[8px] font-black text-black uppercase"
																		>KEEP</span
																	>
																</div>
															{/if}

															<!-- Zoom Button (Overlay) -->
															<button
																onclick={() =>
																	(zoomedThumb = { clipId: result.clipId!, index: thumbIdx + 1 })}
																class="absolute right-1 bottom-1 bg-black/80 p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white hover:text-black"
																title="Preview Large"
															>
																<svg
																	xmlns="http://www.w3.org/2000/svg"
																	width="10"
																	height="10"
																	viewBox="0 0 24 24"
																	fill="none"
																	stroke="currentColor"
																	stroke-width="3"
																	stroke-linecap="round"
																	stroke-linejoin="round"
																	><circle cx="11" cy="11" r="8" /><line
																		x1="21"
																		y1="21"
																		x2="16.65"
																		y2="16.65"
																	/></svg
																>
															</button>
														</div>
													{/each}
												</div>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if downloadProgress < 100 && isDownloading}
						<p class="text-center text-[9px] tracking-widest text-zinc-500 uppercase">
							Waiting for full download to finish before trimming...
						</p>
					{/if}
				</div>
			</div>
		{:else if metadata}
			<p
				class="border border-dashed border-zinc-900 py-10 text-center text-xs tracking-widest text-zinc-600 uppercase"
			>
				No chapters found in this video.
			</p>
		{/if}
	</section>

	<footer class="mt-20 border-t border-zinc-900 pt-8">
		<p class="font-mono text-[10px] tracking-widest text-zinc-700 uppercase">
			v0.0.1 // Bun + Svelte 5 + FFmpeg
		</p>
	</footer>

	<!-- Fullscreen Preview Overlay -->
	{#if zoomedThumb}
		<div
			class="animate-in fade-in fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 p-4 duration-300"
		>
			<button
				onclick={() => {
					zoomedThumb = null;
				}}
				class="absolute top-8 right-8 text-xs tracking-widest text-white uppercase hover:text-zinc-400"
			>
				Close [Esc]
			</button>

			<div class="relative aspect-video w-full max-w-5xl overflow-hidden border border-zinc-800">
				<img
					src="/api/proxy/thumbnail/{zoomedThumb.clipId}/thumb-{zoomedThumb.index}.jpg"
					alt="Preview"
					class="h-full w-full object-contain"
				/>
			</div>

			<div class="mt-8 flex gap-6">
				<button
					onclick={() => {
						const resIdx = trimResults?.findIndex((r) => r.clipId === zoomedThumb?.clipId);
						if (resIdx !== undefined && resIdx !== -1) {
							handleSelectThumbnail(zoomedThumb!.clipId, zoomedThumb!.index, resIdx);
						}
						zoomedThumb = null;
					}}
					class="bg-white px-8 py-3 text-xs font-black tracking-[0.2em] text-black uppercase transition-all hover:bg-zinc-200"
				>
					Select this Thumbnail
				</button>
				<button
					onclick={() => (zoomedThumb = null)}
					class="border border-zinc-700 px-8 py-3 text-xs font-black tracking-[0.2em] text-white uppercase transition-all hover:bg-zinc-900"
				>
					Cancel
				</button>
			</div>
		</div>
	{/if}
</main>

<style>
	:global(body) {
		cursor: crosshair;
		background-color: #000;
	}

	.custom-scrollbar::-webkit-scrollbar {
		width: 2px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: #09090b;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: #27272a;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background: #52525b;
	}
</style>
