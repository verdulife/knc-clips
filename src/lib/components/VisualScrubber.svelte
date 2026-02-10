<script lang="ts">
	import { onMount } from 'svelte';

	let {
		videoElement,
		duration = 0,
		clipId = null
	} = $props<{
		videoElement: HTMLVideoElement | null;
		duration: number;
		clipId: string | null;
	}>();

	let container: HTMLDivElement;
	let hoverTimestamp = $state(0);
	let hoverX = $state(0);
	let isHovering = $state(false);
	let previewImage = $state<string | null>(null);
	let debounceTimer: ReturnType<typeof setTimeout>;

	function handleMouseMove(e: MouseEvent) {
		if (!container || duration <= 0) return;

		const rect = container.getBoundingClientRect();
		const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
		const percent = x / rect.width;

		hoverX = x;
		hoverTimestamp = percent * duration;
		isHovering = true;

		// Debounce thumbnail fetch
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			fetchThumbnail(hoverTimestamp);
		}, 50); // 50ms fast debounce
	}

	function handleMouseLeave() {
		isHovering = false;
		clearTimeout(debounceTimer);
	}

	function handleClick(e: MouseEvent) {
		if (!videoElement || duration <= 0 || !container) return;
		const rect = container.getBoundingClientRect();
		const percent = (e.clientX - rect.left) / rect.width;
		videoElement.currentTime = percent * duration;
	}

	async function fetchThumbnail(time: number) {
		if (!videoElement || !clipId) return;

		try {
			const res = await fetch(
				`/api/preview-thumbnail?clipId=${encodeURIComponent(clipId)}&timestamp=${time}`
			);
			if (res.ok) {
				const blob = await res.blob();
				previewImage = URL.createObjectURL(blob);
			}
		} catch (e) {
			console.error('Preview fetch error', e);
		}
	}

	// Progress bar binding
	let progress = $state(0);
	$effect(() => {
		if (!videoElement) return;

		const update = () => {
			if (duration > 0) {
				progress = (videoElement!.currentTime / duration) * 100;
			}
		};

		// Add listener manually or rely on external update?
		// Let's rely on requestAnimationFrame loop for smooth UI
		let frame: number;
		const loop = () => {
			update();
			frame = requestAnimationFrame(loop);
		};
		loop();

		return () => cancelAnimationFrame(frame);
	});

	function formatTime(seconds: number) {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		const f = Math.floor((seconds % 1) * 30); // 30fps
		return `${m}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
	}
</script>

<!-- Scrubber Container -->
<div
	bind:this={container}
	class="group/scrubber relative flex h-12 w-full cursor-pointer items-center select-none"
	onmousemove={handleMouseMove}
	onmouseleave={handleMouseLeave}
	onclick={handleClick}
>
	<!-- Background Track -->
	<div
		class="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800 transition-all group-hover/scrubber:h-2.5"
	>
		<!-- Progress Fill -->
		<div
			class="h-full bg-brand transition-all duration-75 ease-linear"
			style="width: {progress}%"
		></div>
	</div>

	<!-- Hover Tooltip -->
	{#if isHovering}
		<div
			class="pointer-events-none absolute bottom-full mb-4 flex -translate-x-1/2 flex-col items-center rounded-lg border border-zinc-800 bg-black p-1 shadow-2xl"
			style="left: {hoverX}px;"
		>
			<!-- Preview Image -->
			<div
				class="relative h-[90px] w-[160px] overflow-hidden rounded border border-zinc-800 bg-zinc-900"
			>
				{#if previewImage}
					<img src={previewImage} alt="Preview" class="h-full w-full object-cover" />
				{:else}
					<div class="flex h-full w-full items-center justify-center">
						<span class="size-4 animate-spin rounded-full border-2 border-zinc-600 border-t-white"
						></span>
					</div>
				{/if}
				<div
					class="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent p-1 text-center"
				>
					<span class="font-mono text-[10px] font-bold text-white shadow-black drop-shadow-md">
						{formatTime(hoverTimestamp)}
					</span>
				</div>
			</div>

			<!-- Arrow -->
			<div
				class="absolute -bottom-1 h-2 w-2 rotate-45 border-r border-b border-zinc-800 bg-black"
			></div>
		</div>

		<!-- Hover Line Indicator -->
		<div
			class="pointer-events-none absolute h-full w-px bg-white/50"
			style="left: {hoverX}px;"
		></div>
	{/if}
</div>
