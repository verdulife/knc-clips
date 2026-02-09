<script>
	let {
		image = '/thumbnail.jpg',
		clipTitle = 'Chef Garamendia',
		episodeTitle = '[4x05] Huelve a existo feat Carlon Berlan'
	} = $props();
</script>

<div class="design-viewer">
	<div class="canvas" style:background-image="url({image})">
		<div class="overlay"></div>

		<div class="content">
			<h1>{clipTitle.toUpperCase()}</h1>
			<p>{episodeTitle.toUpperCase()}</p>
		</div>

		<div class="watermark">KNC Clips</div>
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background-color: #111;
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 100vh;
		font-family:
			'Inter',
			system-ui,
			-apple-system,
			sans-serif;
	}

	.design-viewer {
		padding: 40px;
	}

	.canvas {
		width: 1280px;
		height: 720px;
		background-size: cover;
		background-position: center;
		position: relative;
		overflow: hidden;
		box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.7);
		color: white;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		text-align: center;
	}

	.overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.8));
		z-index: 1;
	}

	.content {
		position: relative;
		z-index: 2;
		padding: 0 60px;
	}

	.content h1 {
		font-size: 90px;
		margin: 0;
		line-height: 0.9;
		text-transform: uppercase;
		font-weight: 900;
		letter-spacing: -3px;
		text-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
	}

	.content p {
		font-size: 32px;
		font-weight: 500;
		margin-top: 20px;
		opacity: 0.95;
		color: #a855f7; /* Un toque de color para el episodio */
		text-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
	}

	.watermark {
		position: absolute;
		bottom: 40px;
		right: 40px;
		z-index: 2;
		font-weight: 800;
		font-size: 18px;
		letter-spacing: 4px;
		text-transform: uppercase;
		border: 3px solid white;
		padding: 8px 20px;
		background: rgba(0, 0, 0, 0.3);
		backdrop-filter: blur(5px);
	}

	.canvas::before {
		content: '';
		position: absolute;
		inset: 0;
		border: 15px solid rgba(255, 255, 255, 0.05);
		pointer-events: none;
		z-index: 3;
	}
</style>
