# KNCELADOS AUTOMATOR 🎬

Herramienta profesional para la extracción de clips de YouTube con motor de branding automático para miniaturas de marketing.

## 🚀 Requisitos Previos (Windows)

Este proyecto depende de herramientas externas que deben estar instaladas en rutas específicas para su correcto funcionamiento en Windows.

### 1. Binarios de sistema

Crea una carpeta en `C:\tools` y coloca allí los siguientes ejecutables:

| Herramienta | Ruta requerida         | Descarga                                            |
| :---------- | :--------------------- | :-------------------------------------------------- |
| **FFmpeg**  | `C:\tools\ffmpeg.exe`  | [Gyan.dev](https://www.gyan.dev/ffmpeg/builds/)     |
| **FFprobe** | `C:\tools\ffprobe.exe` | Incluido en el pack de FFmpeg                       |
| **yt-dlp**  | `C:\tools\yt-dlp.exe`  | [GitHub](https://github.com/yt-dlp/yt-dlp/releases) |

### 2. Runtime

- **Bun**: El proyecto utiliza [Bun](https://bun.sh/) como gestor de paquetes y runtime. Instálalo con:
  ```powershell
  powershell -c "irm bun.sh/install.ps1 | iex"
  ```

---

## 🛠️ Instalación

1.  **Clonar el repositorio**:

    ```bash
    git clone <url-del-repo>
    cd knc-clips
    ```

2.  **Instalar dependencias**:

    ```bash
    bun install
    ```

3.  **Cookies de YouTube (Opcional pero Recomendado)**:
    Si hay vídeos con restricciones de edad o región, crea un archivo `cookies.txt` en la raíz del proyecto con tus cookies de YouTube (formato Netscape).

---

## 🎨 Configuración del Branding

El motor de diseño automático utiliza los archivos situados en la carpeta `static/`:

- **Logo**: `static/logo.svg`
- **Tipografía**: `static/boldonse.ttf`

Para ajustar posiciones, colores o rotaciones, puedes editar directamente el objeto `DESIGN_CONFIG` en:
`src/lib/server/branding.ts`

---

## 🏃‍♂️ Ejecución

Inicia el servidor de desarrollo:

```bash
bun dev
```

Abre [http://localhost:5173](http://localhost:5173) en tu navegador.

---

## 📁 Estructura de Salida

- **/temp**: Archivos temporales de descarga y variantes de miniaturas.
- **/clips**: **Tus clips finales.** Aquí encontrarás el vídeo `.mp4` y su miniatura brandeada `.jpg` con el mismo nombre.

---

## ✅ Flujo de trabajo

1.  Pega la URL del vídeo de YouTube.
2.  Pulsa **Process** para obtener los capítulos.
3.  Selecciona los clips que quieras exportar. (El vídeo se descarga en paralelo).
4.  Pulsa **Create Clips**.
5.  **Elige tu miniatura**: Haz clic en una de las 5 variantes generadas para cada clip para aplicar el diseño de marca automáticamente.
