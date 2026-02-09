<script lang="ts">
	import type { EpisodeMetadata, EpisodeClip } from '$lib/types';
	import Thumbnail from '$lib/components/Thumbnail.svelte';

	// State for the UI
	let youtubeUrl = $state('https://www.youtube.com/watch?v=CHL1sJbUytg');
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
				selectedThumb?: number;
				masteredFilename?: string;
		  }[]
		| null
	>(null);
	let previewVideoUrl = $state<string | null>(null);
	let videoElement = $state<HTMLVideoElement | null>(null);
	let zoomedThumb = $state<{
		clipId: string;
		index: number | string;
		masteredFilename?: string;
	} | null>(null);
	let generatingThumb = $state<{
		image: string;
		clipTitle: string;
		episodeTitle: string;
		filename: string;
		resultIndex: number;
		thumbIndex: number;
	} | null>(null);

	function handlePreview(clipId: string) {
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
						image: data.thumbUrl,
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
					prefix: formattedIdentifier
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
								clipId: data.clipId
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
			image: imgPath,
			clipTitle: result.title,
			episodeTitle: formattedIdentifier
				? `[${formattedIdentifier}] ${metadata.title}`
				: metadata.title,
			filename: `${formattedIdentifier} - ${result.title}.png`,
			resultIndex,
			thumbIndex: typeof thumbIndex === 'number' ? thumbIndex : 99
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

	function formatTime(seconds: number) {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);
		return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
	}
</script>

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
		<div class="h-[45%] shrink-0 border-b border-zinc-900 bg-black p-8">
			<div class="flex h-full flex-col">
				<div class="mb-4 flex shrink-0 items-center justify-between">
					<div class="flex items-center gap-3">
						<div
							class="size-1.5 {previewVideoUrl
								? 'animate-pulse bg-brand'
								: 'bg-zinc-800'} rounded-full"
						></div>
						<h3 class="text-[10px] font-black tracking-[0.4em] text-zinc-400 uppercase">
							Studio Monitor // {previewVideoUrl ? 'Live Feed' : 'No Signal'}
						</h3>
					</div>
					<div class="flex items-center gap-4">
						{#if previewVideoUrl}
							<button
								onclick={handleCapture}
								class="flex items-center gap-2 border border-brand/30 bg-brand/10 px-3 py-1 text-[9px] font-black text-brand uppercase transition-all hover:bg-brand hover:text-white"
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
								class="text-[9px] font-black text-zinc-600 uppercase transition-colors hover:text-white"
							>
								Eject Master [X]
							</button>
						{/if}
					</div>
				</div>

				<div
					class="group relative min-h-0 w-full flex-1 overflow-hidden border border-zinc-900 bg-zinc-950 shadow-inner"
				>
					{#if previewVideoUrl}
						<video
							bind:this={videoElement}
							src={previewVideoUrl}
							controls
							autoplay
							class="h-full w-full object-contain"
						>
							<track kind="captions" />
						</video>
					{:else}
						<div class="flex h-full flex-col items-center justify-center space-y-4 opacity-20">
							<div class="h-px w-12 bg-zinc-500"></div>
							<p class="text-[10px] font-black tracking-[0.5em] text-zinc-500 uppercase italic">
								Awaiting Master Feed
							</p>
							<div class="h-px w-12 bg-zinc-500"></div>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Bottom: Studio Output (Switchable Content, Scrollable 55%) -->
		<div class="custom-scrollbar flex-1 overflow-y-auto p-12">
			{#if trimResults && trimResults.length > 0}
				<div class="animate-in fade-in mx-auto max-w-6xl space-y-12 pb-24 duration-700">
					<div class="flex items-center gap-6">
						<h3
							class="text-xs font-black tracking-[0.5em] whitespace-nowrap text-zinc-500 uppercase"
						>
							Mastered Output Selection
						</h3>
						<div class="h-px flex-1 bg-zinc-900"></div>
					</div>

					<div class="grid grid-cols-1 gap-12">
						{#each trimResults as result, i}
							<div
								class="group animate-in slide-in-from-bottom-4 space-y-8 border-l border-zinc-900 pl-8 transition-colors duration-500 hover:border-zinc-700"
							>
								<div class="flex items-center justify-between">
									<div class="space-y-1">
										<p class="text-[9px] font-black tracking-widest text-zinc-600 uppercase">
											Output Node #{i + 1}
										</p>
										<h4 class="text-xl font-black tracking-tight text-white uppercase">
											{result.title}
										</h4>
									</div>
									<div class="flex items-center gap-6">
										<div class="flex items-center gap-4">
											{#if result.success && result.clipId}
												<button
													onclick={() => handlePreview(result.clipId!)}
													class="text-[9px] font-black tracking-widest text-zinc-500 uppercase transition-colors hover:text-white"
												>
													Preview
												</button>
												<div class="h-4 w-px bg-zinc-900"></div>
												<button
													onclick={() => handleDownload(result.clipId!, result.title)}
													class="text-[9px] font-black tracking-widest text-zinc-400 uppercase transition-colors hover:text-white"
												>
													Export MP4
												</button>
												{#if result.masteredFilename}
													<div class="h-4 w-px bg-zinc-900"></div>
													<button
														onclick={() => handleDownloadThumbnail(result.masteredFilename!)}
														class="text-[9px] font-black tracking-widest text-brand uppercase transition-colors hover:text-white"
													>
														Export PNG
													</button>
												{/if}
												<div class="ml-2 h-4 w-px bg-zinc-900"></div>
											{/if}
										</div>

										<div class="text-right">
											<p class="text-[9px] font-bold text-zinc-700 uppercase">Status</p>
											<p
												class="text-[10px] font-black tracking-widest uppercase {result.success
													? 'text-green-500'
													: 'text-red-500'}"
											>
												{result.success ? 'Validated' : 'Error'}
											</p>
										</div>
										<div class="h-10 w-px bg-zinc-900"></div>
										<div class="text-right">
											<p class="text-[9px] font-bold text-zinc-700 uppercase">Format</p>
											<p class="text-[10px] font-black tracking-widest text-white uppercase">
												1080P HEVC
											</p>
										</div>
									</div>
								</div>

								{#if result.success && result.clipId}
									<div class="space-y-4">
										<div class="flex items-center gap-3">
											<p class="text-[9px] font-black tracking-widest text-brand uppercase">
												Master Portrait
											</p>
											<div class="h-px flex-1 bg-zinc-950"></div>
										</div>
										<div class="flex gap-6">
											<div
												class="group relative aspect-video w-64 overflow-hidden border border-zinc-900 bg-black transition-all hover:border-white {result.selectedThumb
													? 'border-brand ring-1 ring-brand'
													: ''}"
											>
												<img
													src={result.masteredFilename
														? `/api/proxy/video/${encodeURIComponent(result.masteredFilename)}`
														: result.selectedThumb === 99
															? `/api/proxy/thumbnail/${result.clipId}-thumb-custom.jpg`
															: `/api/proxy/thumbnail/${result.clipId}-thumb-1.jpg`}
													alt="Master Thumbnail"
													class="h-full w-full object-cover transition-all"
												/>

												{#if result.selectedThumb}
													<div
														class="pointer-events-none absolute inset-0 flex items-end bg-brand/5"
													>
														<span
															class="w-full bg-brand py-1 text-center text-[8px] font-black text-white uppercase"
														>
															MASTER ASSET READY
														</span>
													</div>
												{/if}

												<button
													onclick={() =>
														(zoomedThumb = {
															clipId: result.clipId!,
															index: result.selectedThumb === 99 ? 99 : 1,
															masteredFilename: result.masteredFilename
														})}
													class="absolute top-2 right-2 bg-black/80 p-1.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white hover:text-black"
													title="Preview Large"
												>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														width="12"
														height="12"
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

											<div class="flex flex-col justify-center space-y-3">
												<p
													class="max-w-xs text-[9px] leading-relaxed tracking-widest text-zinc-600 uppercase"
												>
													High-quality frame captured at 30% of duration. Use the Master Monitor to
													select a custom frame if required.
												</p>
												<button
													onclick={() => handleSelectThumbnail(result.clipId!, 1, i)}
													class="w-fit border border-zinc-800 px-4 py-2 text-[8px] font-black tracking-widest text-zinc-400 uppercase transition-all hover:border-white hover:text-white"
												>
													Remaster Default
												</button>
											</div>
										</div>
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
		>
			<button
				onclick={() => (zoomedThumb = null)}
				class="absolute top-10 right-10 text-[10px] font-black tracking-[0.3em] text-zinc-500 uppercase transition-colors hover:text-white"
			>
				Back to Studio [Esc]
			</button>

			<div
				class="relative aspect-video w-full max-w-6xl overflow-hidden border border-zinc-800 shadow-[0_0_100px_rgba(0,0,0,1)]"
			>
				<img
					src={zoomedThumb.masteredFilename
						? `/api/proxy/video/${encodeURIComponent(zoomedThumb.masteredFilename)}`
						: zoomedThumb.index === 99
							? `/api/proxy/thumbnail/${zoomedThumb.clipId}-thumb-custom.jpg`
							: `/api/proxy/thumbnail/${zoomedThumb.clipId}-thumb-${zoomedThumb.index}.jpg`}
					alt="Preview"
					class="h-full w-full object-contain"
				/>
			</div>

			<div class="mt-12 flex gap-8">
				<button
					onclick={() => {
						const resIdx = trimResults?.findIndex(
							(r: { clipId?: string }) => r.clipId === zoomedThumb?.clipId
						);
						if (resIdx !== undefined && resIdx !== -1) {
							handleSelectThumbnail(zoomedThumb!.clipId, zoomedThumb!.index, resIdx);
						}
						zoomedThumb = null;
					}}
					class="bg-white px-12 py-5 text-[10px] font-black tracking-[0.5em] text-black uppercase transition-all hover:bg-brand hover:text-white"
				>
					COMMIT SELECTION
				</button>
				<button
					onclick={() => (zoomedThumb = null)}
					class="border border-zinc-800 px-12 py-5 text-[10px] font-black tracking-[0.5em] text-white uppercase transition-all hover:bg-zinc-900"
				>
					ABORT
				</button>
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
				save={true}
				onComplete={(success: boolean) => {
					if (success && generatingThumb) {
						const { resultIndex, thumbIndex, filename } = generatingThumb;
						if (trimResults?.[resultIndex]) {
							trimResults[resultIndex].selectedThumb = thumbIndex;
							trimResults[resultIndex].masteredFilename = filename;
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
