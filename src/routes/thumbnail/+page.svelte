<script lang="ts">
	import Thumbnail from '$lib/components/Thumbnail.svelte';
	import { page } from '$app/state';

	let clipTitle = $derived(page.url.searchParams.get('clipTitle') || 'La llegada de la burger');
	let episodeTitle = $derived(
		page.url.searchParams.get('episodeTitle') || '[4x05] Huele a éxito feat Carlon Berlan'
	);
	let image = $derived(page.url.searchParams.get('image') || '/thumbnail.jpg');
	let save = $derived(page.url.searchParams.get('save') === 'true');
	let filename = $derived(page.url.searchParams.get('filename') || 'thumbnail.png');
</script>

<div class="flex min-h-svh items-center justify-center bg-gray-950 p-8">
	<Thumbnail {clipTitle} {episodeTitle} {image} {save} {filename} />
</div>
