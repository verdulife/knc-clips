import { COHERE_API_KEY } from '$env/static/private';

export async function generateClickbaitTitle(transcriptionFragment: string, originalTitle: string): Promise<string> {
  if (!COHERE_API_KEY) {
    console.warn('[AI] COHERE_API_KEY is not set. Returning original title.');
    return originalTitle;
  }

  try {
    const KNCELADOS_LORE = `Kncelados es un podcast de humor irreverente, anécdotas caóticas y mucha 'tontería' sana. 
El tono es gamberro, cercano (estilo 'charla de bar') y visual. 
Humor absurdo, acertijos y situaciones cotidianas al extremo. 
Lenguaje coloquial español, evitando formalismos.`;

    const response = await fetch('https://api.cohere.com/v2/chat', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${COHERE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'command-a-03-2025',
        messages: [
          {
            role: 'system',
            content: `Eres un experto en marketing viral para YouTube. Generas títulos magnéticos (clickbait ético) para el podcast "Kncelados".
LORE DE KNCELADOS: ${KNCELADOS_LORE}

REGLAS CRÍTICAS DE FORMATO (OBLIGATORIAS):
1. SOLO devuelve el texto del título, sin explicaciones ni etiquetas.
2. MÁXIMO 60 caracteres (esto es vital para que no se corte en móviles).
3. Idioma: Español.
4. Tono: Gamberro, provocativo o curioso (charla de bar).
5. NO uses comillas, almohadillas (#) ni puntos finales.
6. Mantén la coherencia con el tema principal del episodio.`
          },
          {
            role: 'user',
            content: `Título original del episodio: "${originalTitle}"
Transcripción del clip: "${transcriptionFragment}"

Genera un título de alto impacto para este clip:`
          }
        ],
        temperature: 0.8,
      })
    });

    const data = await response.json();
    let aiTitle = data.message?.content?.[0]?.text?.trim() || originalTitle;

    // Clean up
    aiTitle = aiTitle.replace(/^#+\s*/, '').replace(/^["']|["']$/g, '').trim();

    console.log(`[AI] Generated title (v2): "${aiTitle}"`);
    return aiTitle;
  } catch (error) {
    console.error('[AI] v2 Fetch Error:', error);
    return originalTitle;
  }
}
