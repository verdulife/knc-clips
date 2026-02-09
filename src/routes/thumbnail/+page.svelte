<script>
	let {
		image = '/thumbnail.jpg',
		clipTitle = 'Chef Garamendia',
		episodeTitle = '[4x05] Huelve a existo feat Carlon Berlan'
	} = $props();
</script>

<div class="flex min-h-svh items-center justify-center">
	<div id="canvas" class="relative aspect-video min-w-2/3 overflow-clip bg-brand">
		<img class="absolute inset-0 -rotate-5" src="/thumbnail.jpg" alt="thumbnail" />
		<div class="overlay"></div>

		<img class="absolute top-16 left-6 w-[10%]" src="/logo.svg" alt="logo" />

		<div class="content relative z-10">
			<h1>{clipTitle.toUpperCase()}</h1>
			<p>{episodeTitle.toUpperCase()}</p>
		</div>

		<div class="watermark">KNC Clips</div>
	</div>
</div>
