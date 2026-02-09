<script lang="ts">
	import { domToPng } from 'modern-screenshot';
	import { onMount } from 'svelte';

	let { image, clipTitle, episodeTitle, save, filename, onComplete = () => {} } = $props();

	const open = $derived(episodeTitle.includes('[') ? '[' : '');
	const close = $derived(episodeTitle.includes(']') ? ']' : '');
	const content = $derived(episodeTitle.match(/\[(.*?)\]/)?.[1] || '');
	const title = $derived(
		(episodeTitle.includes(']') ? episodeTitle.match(/\]\s*(.*)/)?.[1] || '' : episodeTitle)
			.replace(/^KNC\s+\d+x\d+\s*\|\s*/i, '')
			.trim()
	);

	let canvasElement: HTMLElement | null = $state(null);

	async function saveThumbnail() {
		if (!canvasElement) return;

		// Wait a bit to ensure fonts and images are fully rendered
		await new Promise((resolve) => setTimeout(resolve, 800));

		try {
			const dataUrl = await domToPng(canvasElement, {
				width: 1280,
				height: 720,
				scale: 1
			});

			const response = await fetch('/api/save-thumbnail', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ base64: dataUrl, filename })
			});

			const result = await response.json();
			if (result.success) {
				console.log('Thumbnail saved successfully:', result.path);
				onComplete(true, result.path);
			} else {
				console.error('Error saving thumbnail:', result.error);
				onComplete(false, result.error);
			}
		} catch (err) {
			console.error('Failed to capture thumbnail:', err);
			onComplete(false, err);
		}
	}

	onMount(() => {
		if (save) {
			saveThumbnail();
		}
	});

	export { saveThumbnail };
</script>

<div class="relative overflow-visible">
	<div
		bind:this={canvasElement}
		id="canvas"
		class="relative h-[720px] w-[1280px] overflow-clip bg-black"
	>
		<img class="absolute inset-0 -rotate-5" src={image} alt="thumbnail" />
		<div class="absolute inset-0 -rotate-5 bg-linear-to-r from-dark/80 from-50% to-dark/0"></div>

		<img class="absolute right-8 bottom-8 w-[10%]" src="/logo.svg" alt="logo" />

		<div class="absolute inset-0 z-10 flex size-full -rotate-5 flex-col justify-center gap-8 px-16">
			<h1
				class="-mt-10 max-w-[85%] leading-tight text-balance {clipTitle.length < 24
					? 'text-9xl'
					: 'text-8xl'}"
			>
				{clipTitle.toUpperCase()}
			</h1>
			<p class="pl-2 text-2xl font-medium tracking-tight">
				<span class="text-brand">{open}</span>{content}<span class="text-brand">{close}</span>
				{title.toUpperCase()}
			</p>
		</div>
	</div>
</div>

<style>
	@font-face {
		font-family: 'Boldonse';
		src: url('/boldonse.ttf') format('truetype');
		font-weight: normal;
		font-style: normal;
	}

	#canvas {
		font-family: 'Boldonse', sans-serif;
		color: white;
	}
</style>
