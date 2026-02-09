<script lang="ts">
	let {
		image = '/thumbnail.jpg',
		clipTitle = 'Chef garamendia',
		episodeTitle = '[4x05] Huele a éxito feat Carlon Berlan'
	} = $props();

	const open = $derived(episodeTitle.match(/\[/)?.[0] || '');
	const content = $derived(episodeTitle.match(/\[(.*?)\]/)?.[1] || '');
	const close = $derived(episodeTitle.match(/\]/)?.[0] || '');
	const title = $derived(episodeTitle.match(/\] (.*)/)?.[1] || '');
</script>

<div class="flex min-h-svh items-center justify-center">
	<div id="canvas" class="relative w-7xl h-180 overflow-clip bg-dark">
		<img class="absolute inset-0 -rotate-5 opacity-20 border-y-2 border-brand" src="/thumbnail.jpg" alt="thumbnail" />
		<div class="absolute"></div>

		<img class="absolute right-8 bottom-8 w-[10%]" src="/logo.svg" alt="logo" />

		<div class="absolute inset-0 z-10 flex size-full -rotate-5 flex-col justify-center px-16 gap-4">
			<h1 class="-mt-10 max-w-[85%] {clipTitle.length < 20 ? 'text-9xl' : 'text-8xl'} leading-snug">{clipTitle.toUpperCase()}</h1>
			<p class="pl-2 text-2xl">
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
		padding: 1rem;
	}
</style>
