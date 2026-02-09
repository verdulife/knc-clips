import sharp from 'sharp';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

/**
 * CONFIGURACIÓN DE DISEÑO (Edítame aquí)
 * -------------------------------------------
 * Puedes cambiar posiciones, tamaños y ángulos.
 */
const DESIGN_CONFIG = {
  dimensions: { width: 1920, height: 1080 },
  branding: {
    color: '#e3321f', // Color corporativo (Rojo KNC)
    rotation: -4      // Rotación global (grados)
  },
  logo: {
    top: 140,
    left: 100,
    width: 190,
    height: 190
  },
  title: {
    top: 480,
    left: 100,
    width: 1400,
    fontSize: 125,
    spacing: -2,
    color: 'white'
  },
  subtitle: {
    top: 860,
    left: 100,
    fontSize: 44,
    color: 'white'
  },
  shadow: {
    opacity: 1
  }
};

const STATIC_DIR = path.join(process.cwd(), 'static');
const LOGO_PATH = path.join(STATIC_DIR, 'logo.svg');
const FONT_PATH = path.join(STATIC_DIR, 'boldonse.ttf');

export interface BrandingOptions {
  inputPath: string;
  outputPath: string;
  clipTitle: string;
  episodeTitle: string;
  identifier: string;
}

/**
 * Helper to ensure a Sharp instance is returned as a valid PNG buffer.
 * This prevents the "unsupported image format" error between composite steps.
 */
async function toPngBuffer(instance: sharp.Sharp) {
  return instance.png().toBuffer();
}

export async function applyBranding(options: BrandingOptions) {
  const { inputPath, outputPath, clipTitle, episodeTitle, identifier } = options;
  const { dimensions, branding, logo, title, subtitle, shadow } = DESIGN_CONFIG;

  console.log(`[branding] Procesando miniatura: ${clipTitle}`);

  // 1. Capa de Vídeo (Rotada y ajustada)
  const videoLayer = await toPngBuffer(
    sharp(inputPath)
      .resize(dimensions.width, dimensions.height, { fit: 'cover' })
      .rotate(branding.rotation, { background: branding.color })
      .resize(dimensions.width, dimensions.height, { fit: 'cover' })
  );

  // 2. Logo (Convertido a PNG para estabilidad)
  let logoBuffer: Buffer;
  if (existsSync(LOGO_PATH)) {
    const rawSvg = readFileSync(LOGO_PATH, 'utf-8')
      .replace(/<\?xml[^>]*\?>/i, '')
      .replace(/<svg[^>]*>/i, `<svg width="${logo.width}" height="${logo.height}" viewBox="0 0 191.64 191.64" xmlns="http://www.w3.org/2000/svg">`);

    logoBuffer = await toPngBuffer(sharp(Buffer.from(rawSvg)));
  } else {
    logoBuffer = await toPngBuffer(sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }));
  }

  // 3. Título (Renderizado nativo con Sharp)
  const titleBuffer = await toPngBuffer(
    sharp({
      text: {
        text: `<span foreground="${title.color}">${clipTitle.toUpperCase()}</span>`,
        font: `Boldonse ${title.fontSize}`, // <-- Se añade el tamaño aquí
        fontfile: FONT_PATH,
        width: title.width,
        rgba: true,
        align: 'left',
        spacing: title.spacing
      }
    })
  );

  // 4. Sombras y Subtítulo (SVG)
  const overlayAssetsSvg = `
		<svg width="${dimensions.width}" height="${dimensions.height}" xmlns="http://www.w3.org/2000/svg">
			<defs>
				<radialGradient id="grad" cx="20%" cy="75%" r="85%" fx="20%" fy="75%">
					<stop offset="0%" style="stop-color:black;stop-opacity:${shadow.opacity}" />
					<stop offset="100%" style="stop-color:black;stop-opacity:0" />
				</radialGradient>
			</defs>
			<rect width="100%" height="100%" fill="url(#grad)" />
			<text x="${subtitle.left}" y="${subtitle.top}" style="font-family: 'Boldonse'; font-size: ${subtitle.fontSize}px; fill: ${subtitle.color}; text-transform: uppercase;">
				<tspan fill="${branding.color}">[</tspan>${identifier}<tspan fill="${branding.color}">]</tspan> ${episodeTitle}
			</text>
		</svg>
	`;
  const assetsBuffer = await toPngBuffer(sharp(Buffer.from(overlayAssetsSvg), { fontfile: FONT_PATH }));

  // 5. Montaje Final
  // Componemos todas las piezas sobre un lienzo inicial
  await sharp({
    create: {
      width: dimensions.width,
      height: dimensions.height,
      channels: 4,
      background: branding.color
    }
  })
    .composite([
      { input: videoLayer, top: 0, left: 0 },
      { input: assetsBuffer, top: 0, left: 0 },
      { input: logoBuffer, top: logo.top, left: logo.left },
      { input: titleBuffer, top: title.top, left: title.left }
    ])
    .jpeg({ quality: 100 })
    .toFile(outputPath);

  console.log(`[branding] Miniatura guardada con éxito en: ${outputPath}`);
}
