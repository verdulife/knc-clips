<script lang="ts">
	import type { EpisodeMetadata, EpisodeClip } from '$lib/types';
	import Thumbnail from '$lib/components/Thumbnail.svelte';
	import VisualScrubber from '$lib/components/VisualScrubber.svelte';

	// State for the UI
	let youtubeUrl = $state('');
	let downloadProgress = $state(0);
	let downloadSpeed = $state<string | null>(null);
	let downloadEta = $state<string | null>(null);
	let metadata = $state<EpisodeMetadata | null>(null);
	let isExtracting = $state(false);
	let isDownloading = $state(false);
	let isTrimming = $state(false);
	let trimProgress = $state(0);
	let trimStatus = $state<string | null>(null);
	let error = $state<string | null>(null);
	let trimResults = $state<
		| {
				title: string;
				success: boolean;
				clipId?: string;
				aiTitle?: string;
				selectedThumb?: number;
				masteredFilename?: string;
				lastUpdated?: number;
				flipped?: boolean;
		  }[]
		| null
	>(null);
	let previewVideoUrl = $state<string | null>(null);
	let previewClipId = $state<string | null>(null);
	let videoElement = $state<HTMLVideoElement | null>(null);
	let videoDuration = $state(0);
	let isPaused = $state(true);
	let zoomedThumb = $state<{
		clipId: string;
		index: number | string;
		masteredFilename?: string;
		flipped?: boolean;
	} | null>(null);
	let generatingThumb = $state<{
		image: string;
		clipTitle: string;
		episodeTitle: string;
		filename: string;
		resultIndex: number;
		thumbIndex: number;
		flipped?: boolean;
	} | null>(null);
	let showControls = $state(true);
	let currentTime = $state(0);
	let isRerolling = $state<Record<string, boolean>>({});
	let controlsTimeout: ReturnType<typeof setTimeout>;

	function resetControlsTimeout() {
		showControls = true;
		clearTimeout(controlsTimeout);
		if (!isPaused) {
			controlsTimeout = setTimeout(() => {
				showControls = false;
			}, 3000);
		}
	}

	$effect(() => {
		if (isPaused) {
			showControls = true;
			clearTimeout(controlsTimeout);
		} else {
			resetControlsTimeout();
		}
	});

	// Keyboard Shortcuts
	function handleKeydown(e: KeyboardEvent) {
		if (!videoElement) return;

		// Don't trigger if user is typing in an input
		if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

		const step = 1 / 30; // Default to 30fps

		switch (e.key.toLowerCase()) {
			case 'k':
			case ' ':
				e.preventDefault();
				if (videoElement.paused) videoElement.play();
				else videoElement.pause();
				break;
			case 'j':
				e.preventDefault();
				videoElement.currentTime -= 10;
				break;
			case 'l':
				e.preventDefault();
				videoElement.currentTime += 10;
				break;
			case ',':
				e.preventDefault();
				videoElement.currentTime = Math.max(0, videoElement.currentTime - step);
				break;
			case '.':
				e.preventDefault();
				videoElement.currentTime = Math.min(videoElement.duration, videoElement.currentTime + step);
				break;
		}
	}

	function handlePreview(clipId: string) {
		previewClipId = clipId;
		previewVideoUrl = `/api/proxy/video/${encodeURIComponent(clipId)}.mp4`;
	}

	function handleDownload(clipId: string, title: string) {
		const url = `/api/proxy/video/${encodeURIComponent(clipId)}.mp4`;
		const a = document.createElement('a');
		a.href = url;
		a.download = `${title}.mp4`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	function handleDownloadThumbnail(filename: string) {
		const url = `/api/proxy/video/${encodeURIComponent(filename)}`;
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	async function handleCapture() {
		if (!videoElement || !previewVideoUrl) return;

		const clipId = previewVideoUrl.split('/').pop()?.replace('.mp4', '');
		if (!clipId) return;

		const timestamp = videoElement.currentTime;

		try {
			const response = await fetch('/api/capture-frame', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ clipId: decodeURIComponent(clipId), timestamp })
			});

			const data = await response.json();
			if (data.success) {
				const resIdx = trimResults?.findIndex((r) => r.clipId === decodeURIComponent(clipId));
				if (resIdx !== undefined && resIdx !== -1) {
					generatingThumb = {
						image: `${data.thumbUrl}?t=${Date.now()}`,
						clipTitle: trimResults![resIdx].title,
						episodeTitle: formattedIdentifier
							? `[${formattedIdentifier}] ${metadata!.title}`
							: metadata!.title,
						filename: `${formattedIdentifier} - ${trimResults![resIdx].title}.png`,
						resultIndex: resIdx,
						thumbIndex: 99 // Custom capture index
					};
				}
			}
		} catch (e) {
			console.error('Capture error:', e);
		}
	}

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
		trimResults = [];
		trimProgress = 0;
		trimStatus = 'Starting...';

		try {
			const response = await fetch('/api/trim', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					videoId: metadata.videoId,
					clips: selectedClips,
					prefix: formattedIdentifier,
					transcription: metadata.transcription
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to process clips');
			}

			const reader = response.body?.getReader();
			if (!reader) throw new Error('No readable stream');

			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.trim()) continue;
					const eventMatch = line.match(/event: (.*)\ndata: (.*)/);
					if (!eventMatch) continue;

					const event = eventMatch[1];
					const data = JSON.parse(eventMatch[2]);

					if (event === 'clip-start') {
						trimStatus = `Processing: ${data.title} (${data.index + 1}/${data.total})`;
					} else if (event === 'clip-progress') {
						trimProgress = Math.round(data.percent);
						if (data.status) {
							trimStatus = `${data.status} (${data.index + 1}/${metadata.clips.filter((c) => c.selected).length})`;
						}
					} else if (event === 'clip-complete') {
						trimResults = [
							...trimResults!,
							{
								title: data.title,
								success: true,
								clipId: data.clipId,
								aiTitle: data.aiTitle
							}
						];
					} else if (event === 'clip-error') {
						trimResults = [
							...trimResults!,
							{
								title: data.title,
								success: false
							}
						];
					} else if (event === 'all-complete') {
						trimStatus = 'Finished';
						// Auto-trigger mastering for the first successful result
						const firstSuccessIdx = trimResults?.findIndex((r) => r.success);
						if (firstSuccessIdx !== undefined && firstSuccessIdx !== -1) {
							const firstClip = trimResults![firstSuccessIdx];
							handleSelectThumbnail(firstClip.clipId!, 1, firstSuccessIdx);
						}
					}
				}
			}
		} catch (e: any) {
			error = e.message;
			console.error('Trimming error:', e);
		} finally {
			isTrimming = false;
			trimStatus = null;
		}
	}

	async function handleSelectThumbnail(
		clipId: string,
		thumbIndex: number | string,
		resultIndex: number
	) {
		if (!metadata || !trimResults) return;
		const result = trimResults[resultIndex];

		const imgPath =
			thumbIndex === 99
				? `/api/proxy/thumbnail/${clipId}-thumb-custom.jpg`
				: `/api/proxy/thumbnail/${clipId}-thumb-${thumbIndex}.jpg`;

		generatingThumb = {
			image: `${imgPath}?t=${Date.now()}`,
			clipTitle: result.title,
			episodeTitle: formattedIdentifier
				? `[${formattedIdentifier}] ${metadata.title}`
				: metadata.title,
			filename: `${formattedIdentifier} - ${result.title}.png`,
			resultIndex,
			thumbIndex: typeof thumbIndex === 'number' ? thumbIndex : 99,
			flipped: result.flipped
		};
	}

	function onThumbnailGenerated(success: boolean, pathOrError: string) {
		if (success && generatingThumb) {
			trimResults![generatingThumb.resultIndex].selectedThumb = -1; // Temporary state? or just index
			// Actually we can use thumbIndex if we passed it
		}
		generatingThumb = null;
	}

	// Helper to format season/episode
	const formattedIdentifier = $derived(
		metadata && metadata.seasonNumber !== null
			? `${metadata.seasonNumber}x${metadata.episodeNumber?.toString().padStart(2, '0')}`
			: ''
	);

	async function handleReroll(resultIndex: number) {
		if (!trimResults || !metadata) return;
		const result = trimResults[resultIndex];
		const clip = metadata.clips.find((c) => c.title === result.title);
		if (!clip) return;

		isRerolling[result.clipId!] = true;
		try {
			const response = await fetch('/api/ai/reroll', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					transcription: metadata.transcription,
					startTime: clip.startTime,
					endTime: clip.endTime,
					originalTitle: result.title
				})
			});

			if (!response.ok) throw new Error('Reroll failed');
			const data = await response.json();

			// Update the result in the list
			const updatedResults = [...trimResults];
			updatedResults[resultIndex] = {
				...updatedResults[resultIndex],
				aiTitle: data.aiTitle
			};
			trimResults = updatedResults;
		} catch (e) {
			console.error('Reroll error:', e);
		} finally {
			isRerolling[result.clipId!] = false;
		}
	}

	function formatTime(seconds: number) {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);
		const f = Math.floor((seconds % 1) * 30); // 30fps
		return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<main
	class="grid h-screen grid-cols-[450px_1fr] overflow-hidden font-sans selection:bg-zinc-800 selection:text-white"
>
	<!-- Left Sidebar: Controls, Info & Library -->
	<aside class="flex flex-col overflow-hidden border-r border-zinc-900 bg-black pt-8">
		<header class="mb-8 shrink-0 space-y-2 px-8">
			<h1 class="text-2xl font-black tracking-tighter text-white uppercase italic">
				🎞️ KNC STUDIO
			</h1>
			<p class="text-[9px] font-black tracking-[0.4em] text-zinc-600 uppercase">
				Hardware Accelerated Engine
			</p>
		</header>

		<div class="flex min-h-0 flex-1 flex-col">
			<!-- Controls Section -->
			<div class="mb-8 shrink-0 space-y-6 px-8">
				<div class="space-y-4">
					<label
						for="url"
						class="block text-[9px] font-black tracking-widest text-zinc-500 uppercase"
					>
						Master Source (YouTube)
					</label>
					<div class="flex gap-2">
						<input
							type="text"
							id="url"
							bind:value={youtubeUrl}
							placeholder="Paste URL..."
							class="w-full border-b border-zinc-800 bg-transparent py-2 text-sm text-white outline-hidden transition-colors focus:border-white"
						/>
						<button
							onclick={handleExtract}
							disabled={isExtracting || !youtubeUrl}
							class="border border-zinc-800 px-4 py-2 text-[10px] font-black tracking-widest text-white uppercase transition-all hover:bg-white hover:text-black disabled:opacity-30"
						>
							{isExtracting ? '...' : 'LOAD'}
						</button>
					</div>
					{#if error}
						<p class="text-[9px] font-bold tracking-widest text-red-500 uppercase">{error}</p>
					{/if}
				</div>

				{#if metadata}
					<div class="animate-in fade-in slide-in-from-left-2 space-y-2 duration-700">
						<p class="text-[9px] font-black tracking-[0.3em] text-brand uppercase">
							{formattedIdentifier || 'SINGLE PRODUCTION'}
						</p>
						<h2
							class="line-clamp-2 text-base leading-snug font-black tracking-tight text-white uppercase"
						>
							{metadata.title}
						</h2>
					</div>
				{/if}
			</div>

			<!-- Independent Scrollable Clip Library -->
			{#if metadata}
				<div class="flex min-h-0 flex-1 flex-col border-t border-zinc-900 bg-zinc-950/30">
					<div
						class="flex shrink-0 items-center justify-between border-b border-zinc-900 bg-zinc-950 px-8 py-4"
					>
						<h3 class="text-[10px] font-black tracking-[0.3em] text-zinc-500 uppercase">
							Clip Library <span class="text-zinc-700">({metadata.clips.length})</span>
						</h3>
						<div class="flex gap-4">
							<button
								class="text-[8px] font-black text-zinc-600 uppercase transition-colors hover:text-white"
								onclick={() => metadata!.clips.forEach((c) => (c.selected = true))}>ALL</button
							>
							<button
								class="text-[8px] font-black text-zinc-600 uppercase transition-colors hover:text-white"
								onclick={() => metadata!.clips.forEach((c) => (c.selected = false))}>NONE</button
							>
						</div>
					</div>

					<div class="custom-scrollbar flex-1 overflow-y-auto">
						<div class="divide-y divide-zinc-900">
							{#each metadata.clips as clip, i}
								<div
									class="group relative flex items-center justify-between px-8 py-4 transition-all hover:bg-black {clip.selected
										? 'bg-zinc-950/50'
										: ''}"
								>
									<div class="flex items-center gap-4">
										<input
											type="checkbox"
											id="clip-{i}"
											bind:checked={clip.selected}
											class="size-4 cursor-pointer appearance-none border border-zinc-800 bg-black transition-all checked:border-brand checked:bg-brand"
										/>
										<label for="clip-{i}" class="cursor-pointer space-y-0.5">
											<p class="line-clamp-1 text-xs font-bold tracking-tight text-white uppercase">
												{clip.title}
											</p>
											<div
												class="flex items-center gap-2 font-mono text-[9px] text-zinc-500 uppercase"
											>
												<span>{formatTime(clip.startTime)}</span>
												<span class="text-zinc-800">→</span>
												<span>{formatTime(clip.duration)}</span>
											</div>
										</label>
									</div>
									{#if clip.selected}
										<div
											class="animate-pulse text-[8px] font-black tracking-widest text-brand uppercase italic"
										>
											Queued
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Sticky Sidebar Footer: Progress & Render -->
		<div class="mt-auto shrink-0 space-y-6 border-t border-zinc-900 bg-black p-8 shadow-2xl">
			{#if isTrimming}
				<div class="animate-in fade-in mb-2 space-y-3 border border-zinc-900 bg-zinc-950 p-4">
					<div class="flex items-center justify-between">
						<span class="animate-pulse text-[9px] font-black tracking-widest text-brand uppercase">
							{trimStatus || 'Processing...'}
						</span>
						<span class="font-mono text-[10px] text-white">
							{trimProgress}%
						</span>
					</div>
					<div class="h-1 w-full overflow-hidden bg-zinc-900">
						<div
							class="h-full bg-brand transition-all duration-300"
							style="width: {trimProgress}%"
						></div>
					</div>
				</div>
			{/if}

			{#if downloadProgress > 0 && downloadProgress < 100}
				<div class="mb-2 space-y-2 border border-zinc-900 bg-zinc-950 p-3">
					<div class="flex items-center justify-between">
						<span class="text-[8px] font-black tracking-widest text-zinc-500 uppercase"
							>Caching Master</span
						>
						<span class="font-mono text-[9px] text-white">{downloadProgress}%</span>
					</div>
					<div class="h-0.5 w-full bg-zinc-900">
						<div class="h-full bg-white" style="width: {downloadProgress}%"></div>
					</div>
				</div>
			{/if}

			<button
				onclick={handleCreateClips}
				disabled={isTrimming ||
					!metadata ||
					metadata.clips.filter((c) => c.selected).length === 0 ||
					(downloadProgress < 100 && isDownloading)}
				class="w-full bg-white py-4 text-xs font-black tracking-[0.3em] text-black uppercase transition-all hover:bg-brand hover:text-white active:scale-[0.98] disabled:opacity-20"
			>
				{isTrimming ? 'Rendering Batch...' : 'Begin Production Run'}
			</button>

			<div class="flex items-center justify-between opacity-40">
				<p class="font-mono text-[8px] tracking-widest text-zinc-500 uppercase">
					KNC STUDIO STACK // 0.0.1
				</p>
			</div>
		</div>
	</aside>

	<!-- Main Content: Studio Output -->
	<!-- Main Content: Studio Monitor & Output stack -->
	<section class="flex h-full flex-col overflow-hidden bg-[#030303]">
		<!-- Top: Master Monitor (Fixed 45%) -->
		<div class="h-[50%] shrink-0 border-b border-zinc-900 bg-black">
			<div
				class="group relative h-full overflow-hidden shadow-2xl transition-all hover:border-zinc-700"
				onmousemove={resetControlsTimeout}
				role="none"
			>
				<!-- Monitor Header Overlay -->
				<div
					class="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-center justify-between p-6"
				>
					<div class="flex items-center gap-3">
						<div
							class="size-1.5 {previewVideoUrl
								? 'animate-pulse bg-brand'
								: 'bg-zinc-800'} rounded-full"
						></div>
						<h3 class="text-[10px] font-black tracking-[0.4em] text-zinc-400/80 uppercase">
							Studio Monitor // {previewVideoUrl ? 'Live Feed' : 'No Signal'}
						</h3>
					</div>
					<div class="pointer-events-auto flex items-center gap-4">
						{#if previewVideoUrl}
							<button
								onclick={handleCapture}
								class="flex items-center gap-2 border border-brand/30 bg-black/50 px-3 py-1 text-[9px] font-black text-brand uppercase backdrop-blur-md transition-all hover:bg-brand hover:text-white"
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
									><path
										d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
									/><circle cx="12" cy="13" r="4" /></svg
								>
								Capture & Master Frame
							</button>
							<button
								onclick={() => (previewVideoUrl = null)}
								class="text-[9px] font-black text-zinc-600/50 uppercase transition-colors hover:text-white"
							>
								Eject Master [X]
							</button>
						{/if}
					</div>
				</div>

				{#if previewVideoUrl}
					<div class="relative h-full w-full bg-black">
						<video
							bind:this={videoElement}
							bind:duration={videoDuration}
							bind:paused={isPaused}
							bind:currentTime
							src={previewVideoUrl}
							class="h-full w-full object-contain"
							onclick={() => (isPaused = !isPaused)}
						>
							<track kind="captions" />
						</video>

						<!-- Gradient Scrim (YouTube style) -->
						<div
							class="pointer-events-none absolute inset-0 bg-linear-to-t from-black/90 via-transparent to-transparent transition-opacity duration-300 {showControls
								? 'opacity-100'
								: 'opacity-0'}"
						></div>

						<!-- Controls Overlay -->
						<div
							class="absolute inset-0 flex flex-col justify-end p-4 transition-opacity duration-300 {showControls
								? 'opacity-100'
								: 'opacity-0'}"
						>
							<!-- Visual Scrubber (Integrated into overlay) -->
							<div class="mb-2">
								<VisualScrubber {videoElement} duration={videoDuration} clipId={previewClipId} />
							</div>

							<!-- Control Bar -->
							<div class="flex items-center gap-6">
								<div class="flex items-center gap-4">
									<!-- Play/Pause -->
									<button
										onclick={() => (isPaused = !isPaused)}
										class="group/btn relative flex size-8 items-center justify-center text-white transition-transform active:scale-95"
										title={isPaused ? 'Play (k)' : 'Pause (k)'}
									>
										{#if isPaused}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="24"
												height="24"
												viewBox="0 0 24 24"
												fill="currentColor"><path d="M8 5.14v14l11-7-11-7z" /></svg
											>
										{:else}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="24"
												height="24"
												viewBox="0 0 24 24"
												fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg
											>
										{/if}
									</button>

									<!-- Frame Navigation -->
									<div class="flex items-center gap-2">
										<button
											onclick={() => videoElement && (videoElement.currentTime -= 1 / 30)}
											class="text-zinc-400 transition-colors hover:text-white"
											title="Prev Frame (,)"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="18"
												height="18"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2.5"
												stroke-linecap="round"
												stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg
											>
										</button>
										<button
											onclick={() => videoElement && (videoElement.currentTime += 1 / 30)}
											class="text-zinc-400 transition-colors hover:text-white"
											title="Next Frame (.)"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="18"
												height="18"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2.5"
												stroke-linecap="round"
												stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg
											>
										</button>
									</div>

									<!-- Time Display -->
									<div class="flex items-center gap-1 font-mono text-[11px] font-medium text-white">
										<span>{formatTime(currentTime)}</span>
										<span class="text-zinc-500">/</span>
										<span class="text-zinc-400">{formatTime(videoDuration)}</span>
									</div>
								</div>

								<div class="flex-1"></div>

								<!-- Quick Actions (Start/End) -->
								<div class="flex items-center gap-4">
									<button
										onclick={() => videoElement && (videoElement.currentTime = 0)}
										class="text-zinc-500 transition-colors hover:text-white"
										title="Jump to Start"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2.5"
											stroke-linecap="round"
											stroke-linejoin="round"
											><polygon points="19 20 9 12 19 4 19 20" /><line
												x1="5"
												y1="19"
												x2="5"
												y2="5"
											/></svg
										>
									</button>
									<button
										onclick={() =>
											videoElement && (videoElement.currentTime = videoElement.duration)}
										class="text-zinc-500 transition-colors hover:text-white"
										title="Jump to End"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2.5"
											stroke-linecap="round"
											stroke-linejoin="round"
											><polygon points="5 4 15 12 5 20 5 4" /><line
												x1="19"
												y1="5"
												x2="19"
												y2="19"
											/></svg
										>
									</button>
								</div>
							</div>
						</div>
					</div>
				{:else}
					<div class="flex h-full flex-col items-center justify-center p-12">
						<div class="relative mb-8">
							<div class="absolute -inset-8 animate-pulse rounded-full bg-brand/5 blur-3xl"></div>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="48"
								height="48"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="text-zinc-800"
							>
								<path d="M12 2v20M2 12h20" />
							</svg>
						</div>
						<p
							class="text-center font-mono text-[9px] font-black tracking-[0.5em] text-zinc-600 uppercase"
						>
							Awaiting Input Source...
						</p>
					</div>
				{/if}
			</div>
		</div>

		<!-- Bottom: Studio Output (Switchable Content, Scrollable 55%) -->
		<div class="custom-scrollbar flex-1 overflow-y-auto p-8">
			{#if trimResults && trimResults.length > 0}
				<div class="animate-in fade-in space-y-12 pb-24 duration-700">
					<div class="grid grid-cols-1 gap-6">
						{#each trimResults as result, i}
							<div
								class="group animate-in slide-in-from-bottom-4 flex cursor-pointer items-center gap-8 border-l border-zinc-900 pl-8 transition-colors duration-500 hover:border-brand hover:bg-zinc-950/30"
								onclick={() => result.success && result.clipId && handlePreview(result.clipId)}
								role="button"
								tabindex="0"
								onkeydown={(e) =>
									e.key === 'Enter' &&
									result.success &&
									result.clipId &&
									handlePreview(result.clipId)}
							>
								{#if result.success && result.clipId}
									<!-- Thumbnail Left -->
									<div
										class="group/thumb relative aspect-video w-48 shrink-0 overflow-hidden border border-zinc-900 bg-black transition-all hover:border-white {result.selectedThumb
											? 'border-brand ring-1 ring-brand'
											: ''}"
									>
										<img
											src={result.masteredFilename
												? `/api/proxy/video/${encodeURIComponent(result.masteredFilename)}?t=${result.lastUpdated || 0}`
												: result.selectedThumb === 99
													? `/api/proxy/thumbnail/${result.clipId}-thumb-custom.jpg?t=${result.lastUpdated || 0}`
													: `/api/proxy/thumbnail/${result.clipId}-thumb-1.jpg?t=${result.lastUpdated || 0}`}
											alt="Master Thumbnail"
											class="h-full w-full object-cover transition-all"
										/>

										<div
											class="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover/thumb:opacity-100"
										>
											<button
												onclick={(e) => {
													e.stopPropagation();
													const updated = [...trimResults!];
													updated[i].flipped = !updated[i].flipped;
													trimResults = updated;
													handleSelectThumbnail(
														result.clipId!,
														result.selectedThumb === 99 ? 99 : 1,
														i
													);
												}}
												class="bg-black/80 p-1.5 transition-all hover:bg-brand hover:text-white"
												title="Mirror Frame"
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
													><path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path
														d="M12 4v1m0 14v1m8-7h1M3 12h1m15.66-6.66-.71.71M6.05 17.95l-.71.71m12.72 0-.71-.71M6.05 6.05l-.71-.71"
													/></svg
												>
											</button>
											<button
												onclick={(e) => {
													e.stopPropagation();
													zoomedThumb = {
														clipId: result.clipId!,
														index: result.selectedThumb === 99 ? 99 : 1,
														masteredFilename: result.masteredFilename,
														flipped: result.flipped
													};
												}}
												class="bg-black/80 p-1.5 transition-all hover:bg-white hover:text-black"
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
												>
													<circle cx="11" cy="11" r="8" /><line
														x1="21"
														y1="21"
														x2="16.65"
														y2="16.65"
													/>
												</svg>
											</button>
										</div>
									</div>

									<!-- Info & Actions Right -->
									<div class="flex-1 space-y-3">
										<div class="flex items-center justify-between">
											<div class="flex flex-col gap-0.5">
												<div class="flex items-center gap-2">
													<span
														class="text-[8px] font-black tracking-widest text-brand/60 uppercase"
													>
														{result.aiTitle ? '✨ AI SUGGESTION' : 'ORIGINAL'}
													</span>
													{#if result.aiTitle}
														<button
															onclick={(e) => {
																e.stopPropagation();
																handleReroll(i);
															}}
															disabled={isRerolling[result.clipId!]}
															class="group/reroll flex items-center gap-1 transition-colors hover:text-brand disabled:opacity-30"
															title="Regenerate Title"
														>
															<svg
																xmlns="http://www.w3.org/2000/svg"
																width="8"
																height="8"
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																stroke-width="3"
																stroke-linecap="round"
																stroke-linejoin="round"
																class={isRerolling[result.clipId!] ? 'animate-spin' : ''}
																><path
																	d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
																/><path d="M3 3v5h5" /><path
																	d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"
																/><path d="M16 16h5v5" /></svg
															>
															<span class="text-[7px] font-black tracking-widest uppercase"
																>{isRerolling[result.clipId!] ? '...' : 'Reroll'}</span
															>
														</button>
													{/if}
												</div>
												<h4
													class="text-sm font-black tracking-tight text-white transition-colors group-hover:text-brand"
												>
													{result.aiTitle || result.title}
												</h4>
												{#if result.aiTitle}
													<p class="text-[10px] font-bold text-zinc-500 uppercase italic">
														Original: {result.title}
													</p>
												{/if}
											</div>
											<p
												class="mt-auto font-mono text-[9px] font-black tracking-widest text-zinc-700 uppercase"
											>
												1080P HEVC
											</p>
										</div>

										<div class="flex items-center gap-6">
											<div class="flex items-center gap-4">
												<button
													onclick={(e) => {
														e.stopPropagation();
														handleDownload(result.clipId!, result.title);
													}}
													class="text-[9px] font-black tracking-widest text-zinc-400 uppercase transition-colors hover:text-white"
												>
													Export MP4
												</button>
												{#if result.masteredFilename}
													<div class="h-3 w-px bg-zinc-900"></div>
													<button
														onclick={(e) => {
															e.stopPropagation();
															handleDownloadThumbnail(result.masteredFilename!);
														}}
														class="text-[9px] font-black tracking-widest text-brand uppercase transition-colors hover:text-white"
													>
														Export PNG
													</button>
												{/if}
												<div class="h-3 w-px bg-zinc-900"></div>
												<button
													onclick={(e) => {
														e.stopPropagation();
														const cleanEpisodeTitle = metadata!.title.replace(
															/^KNC\s+\d+[xX]\d+\s*\|\s*/i,
															''
														);
														const displayTitle = result.aiTitle || result.title;
														const fullTitle = displayTitle;
														navigator.clipboard.writeText(fullTitle);
													}}
													class="text-[9px] font-black tracking-widest text-zinc-500 uppercase transition-colors hover:text-brand"
												>
													Copy Title
												</button>
												<div class="h-3 w-px bg-zinc-900"></div>
												<button
													onclick={(e) => {
														e.stopPropagation();
														if (!metadata?.description) return;

														// Filter out timestamps and "temas:"
														let lines = metadata.description
															.split('\n')
															.filter(
																(line) =>
																	!/\d{1,2}:\d{2}/.test(line) &&
																	!line.toLowerCase().includes('temas:')
															);

														// Find where the links/social section starts
														// We look for common keywords or the first line with http
														let splitIndex = lines.findIndex(
															(line) =>
																line.match(/https?:\/\//i) ||
																line.match(/SÍGUENOS|SIGUENOS|REDES|INSTAGRAM|TWITTER|TIKTOK/i)
														);

														if (splitIndex === -1) splitIndex = lines.length;

														const narrative = lines.slice(0, splitIndex).join('\n').trim();
														const links = lines.slice(splitIndex).join('\n').trim();

														const callToAction = `¡DISFRUTA DEL EPISODIO COMPLETO AQUÍ!:\n${youtubeUrl}`;

														const finalDesc = [narrative, callToAction, links]
															.filter(Boolean)
															.join('\n\n')
															.trim();

														navigator.clipboard.writeText(finalDesc);
													}}
													class="text-[9px] font-black tracking-widest text-zinc-500 uppercase transition-colors hover:text-white"
												>
													Copy Desc
												</button>
											</div>
										</div>
									</div>
								{:else}
									<div class="flex h-24 items-center gap-4 text-red-500">
										<div class="size-1 rounded-full bg-red-500"></div>
										<p class="text-[10px] font-black tracking-widest uppercase">
											Failed: {result.title}
										</p>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{:else if metadata}
				<div class="flex h-full items-center justify-center">
					<div class="max-w-md space-y-4 text-center">
						<p class="text-xs font-black tracking-[0.4em] text-zinc-700 uppercase">System Idle</p>
						<p class="text-[10px] leading-relaxed text-zinc-500 uppercase">
							No chapters found in the master file. <br />
							Manual selection system coming soon.
						</p>
					</div>
				</div>
			{:else}
				<div class="flex h-full items-center justify-center">
					<div class="max-w-md space-y-6 text-center">
						<div class="mx-auto flex size-12 items-center justify-center border border-zinc-900">
							<span class="animate-pulse font-mono text-xl text-zinc-800">_</span>
						</div>
						<div class="space-y-2">
							<p class="text-xs font-black tracking-[0.4em] text-zinc-700 uppercase">
								Awaiting Input
							</p>
							<p class="text-[10px] leading-relaxed text-zinc-500 uppercase">
								Enter a valid YouTube URL in the sidebar <br />
								to begin automated asset extraction.
							</p>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</section>

	<!-- Overlays -->
	{#if zoomedThumb}
		<div
			class="animate-in fade-in fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/98 p-12 duration-300"
			onclick={() => (zoomedThumb = null)}
			tabindex="-1"
			onkeydown={(e) => e.key === 'Escape' && (zoomedThumb = null)}
		>
			<button
				onclick={(e) => {
					e.stopPropagation();
					zoomedThumb = null;
				}}
				class="absolute top-10 right-10 text-[10px] font-black tracking-[0.3em] text-zinc-500 uppercase transition-colors hover:text-white"
			>
				Back to Studio [Esc]
			</button>

			<div
				class="relative aspect-video w-full max-w-6xl overflow-hidden border border-zinc-800 shadow-[0_0_100px_rgba(0,0,0,1)]"
				onclick={(e) => e.stopPropagation()}
			>
				<img
					src={zoomedThumb!.masteredFilename
						? `/api/proxy/video/${encodeURIComponent(zoomedThumb!.masteredFilename)}`
						: zoomedThumb!.index === 99
							? `/api/proxy/thumbnail/${zoomedThumb!.clipId}-thumb-custom.jpg`
							: `/api/proxy/thumbnail/${zoomedThumb!.clipId}-thumb-${zoomedThumb!.index}.jpg`}
					alt="Preview"
					class="h-full w-full object-contain"
					class:scale-x-[-1]={zoomedThumb!.flipped && !zoomedThumb!.masteredFilename}
				/>
			</div>
		</div>
	{/if}

	{#if generatingThumb}
		<div class="pointer-events-none fixed top-0 left-0 -z-50 h-0 w-0 overflow-hidden opacity-0">
			<Thumbnail
				image={generatingThumb.image}
				clipTitle={generatingThumb.clipTitle}
				episodeTitle={generatingThumb.episodeTitle}
				filename={generatingThumb.filename}
				flipped={generatingThumb.flipped}
				save={true}
				onComplete={(success: boolean) => {
					if (success && generatingThumb) {
						const { resultIndex, thumbIndex, filename } = generatingThumb;
						if (trimResults?.[resultIndex]) {
							// Update with a timestamp to force image refresh in the UI
							const updatedResults = [...trimResults];
							updatedResults[resultIndex] = {
								...updatedResults[resultIndex],
								selectedThumb: thumbIndex,
								masteredFilename: filename,
								lastUpdated: Date.now()
							};
							trimResults = updatedResults;
						}
					}
					generatingThumb = null;
				}}
			/>
		</div>

		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md">
			<div class="space-y-8 text-center">
				<div class="mx-auto size-16 animate-spin rounded-full border-l-2 border-brand"></div>
				<div class="space-y-3">
					<p
						class="animate-pulse text-[10px] font-black tracking-[0.5em] text-white uppercase italic"
					>
						Mastering Image Buffer...
					</p>
					<p class="font-mono text-[9px] text-zinc-600 uppercase italic opacity-50">
						{generatingThumb.filename}
					</p>
				</div>
			</div>
		</div>
	{/if}
</main>

<style>
	:global(body) {
		cursor: crosshair;
		background-color: #000;
		overflow: hidden;
	}

	.custom-scrollbar::-webkit-scrollbar {
		width: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: #111;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background: #e3321f;
	}
</style>
