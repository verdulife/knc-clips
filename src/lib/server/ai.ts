import { COHERE_API_KEY } from '$env/static/private';

export async function generateClickbaitTitle(transcriptionFragment: string, originalTitle: string): Promise<string> {
  if (!COHERE_API_KEY) {
    console.warn('[AI] COHERE_API_KEY is not set. Returning original title.');
    return originalTitle;
  }

  try {
    const response = await fetch('https://api.cohere.ai/v1/generate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${COHERE_API_KEY}`,
        'Content-Type': 'application/json',
        'Cohere-Version': '2022-12-06'
      },
      body: JSON.stringify({
        model: 'command-xlarge-nightly',
        prompt: `Como experto en marketing y YouTube, genera un título corto, impactante y con alto CTR (clickbait) para el siguiente fragmento de un podcast en español.
        
Contexto (transcripción):
${transcriptionFragment}

Título original de referencia: "${originalTitle}"

REGLAS:
- Devuelve SOLO el texto del título.
- Máximo 60 caracteres.
- En español.
- No uses comillas.
- Que sea provocativo o curioso pero relacionado con el contenido.

Título sugerido:`,
        max_tokens: 50,
        temperature: 0.8,
        k: 0,
        stop_sequences: ['\n'],
        return_likelihoods: 'NONE'
      })
    });

    const data = await response.json();
    const aiTitle = data.generations?.[0]?.text?.trim() || originalTitle;
    console.log(`[AI] Generated title: "${aiTitle}"`);
    return aiTitle;
  } catch (error) {
    console.error('[AI] Error generating title:', error);
    return originalTitle;
  }
}
