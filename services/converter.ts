
import { ConverterSettings, ExportFormat } from "../types";

export class SvgConverter {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offscreenContainer: HTMLDivElement | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    const context = this.canvas.getContext('2d', { 
      willReadFrequently: true,
      alpha: true 
    });
    if (!context) throw new Error("Canvas 2D context not supported");
    this.ctx = context;
  }

  private getContainer() {
    if (!this.offscreenContainer) {
      this.offscreenContainer = document.createElement('div');
      this.offscreenContainer.style.cssText = 'position:fixed;top:-10000px;left:-10000px;width:1px;height:1px;overflow:hidden;';
      document.body.appendChild(this.offscreenContainer);
    }
    return this.offscreenContainer;
  }

  private async ensureGifshot() {
    const gs = (window as any).gifshot;
    if (gs) return gs;

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/gifshot@0.4.5/dist/gifshot.min.js';
      script.onload = () => resolve((window as any).gifshot);
      script.onerror = () => reject(new Error("Failed to load GIF engine. Check connection."));
      document.head.appendChild(script);
    });
  }

  async convert(
    svgString: string,
    settings: ConverterSettings,
    onProgress: (percent: number) => void
  ): Promise<Blob> {
    const dimensions = this.getDimensions(svgString, settings.scale);
    this.canvas.width = dimensions.width;
    this.canvas.height = dimensions.height;

    if (settings.format === ExportFormat.GIF) {
      return this.generateGif(svgString, settings, onProgress);
    } else {
      return this.generateVideo(svgString, settings, onProgress);
    }
  }

  private getDimensions(svgString: string, scale: number) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    
    let w = 400, h = 400;
    if (svg) {
      w = parseFloat(svg.getAttribute('width') || svg.viewBox?.baseVal?.width?.toString() || '400');
      h = parseFloat(svg.getAttribute('height') || svg.viewBox?.baseVal?.height?.toString() || '400');
    }

    // Ensure even dimensions for video codecs
    const width = Math.floor(w * scale / 2) * 2;
    const height = Math.floor(h * scale / 2) * 2;

    return { width, height };
  }

  private async captureFrame(svgString: string, time: number, settings: ConverterSettings): Promise<string> {
    const container = this.getContainer();
    container.innerHTML = svgString;
    const svg = container.querySelector('svg');
    if (!svg) throw new Error("Invalid SVG");

    // SMIL Seek
    if (typeof (svg as any).setCurrentTime === 'function') {
      try { (svg as any).setCurrentTime(time); } catch (e) {}
    }

    // CSS Animation Seek (Negative Delay Trick)
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = `
      * {
        animation-play-state: paused !important;
        animation-delay: -${time}s !important;
        transition: none !important;
      }
    `;
    svg.appendChild(style);

    const serializer = new XMLSerializer();
    const blob = new Blob([serializer.serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    try {
      const img = await this.loadImage(url);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      
      if (!settings.transparent) {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }
      
      this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
      return this.canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(url);
      container.innerHTML = '';
    }
  }

  private async generateGif(
    svgString: string, 
    settings: ConverterSettings, 
    onProgress: (percent: number) => void
  ): Promise<Blob> {
    const gifshot = await this.ensureGifshot();
    const totalFrames = Math.ceil(settings.duration * settings.fps);
    const frameInterval = 1 / settings.fps;
    const frames: string[] = [];

    for (let i = 0; i < totalFrames; i++) {
      frames.push(await this.captureFrame(svgString, i * frameInterval, settings));
      onProgress(Math.round((i / totalFrames) * 60));
    }

    return new Promise((resolve, reject) => {
      gifshot.createGIF({
        images: frames,
        gifWidth: this.canvas.width,
        gifHeight: this.canvas.height,
        interval: frameInterval,
        numFrames: totalFrames,
        progressCallback: (p: number) => onProgress(60 + Math.round(p * 40))
      }, (obj: any) => {
        if (!obj.error) {
          fetch(obj.image).then(r => r.blob()).then(resolve);
        } else {
          reject(new Error(obj.errorMsg));
        }
      });
    });
  }

  private async generateVideo(
    svgString: string, 
    settings: ConverterSettings, 
    onProgress: (percent: number) => void
  ): Promise<Blob> {
    const stream = this.canvas.captureStream(settings.fps);
    const mimes = ['video/mp4;codecs=h264', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const mime = mimes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
    
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 15000000 * settings.quality
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    
    const result = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    });

    const totalFrames = Math.ceil(settings.duration * settings.fps);
    const frameInterval = 1 / settings.fps;

    recorder.start();

    for (let i = 0; i < totalFrames; i++) {
      await this.captureFrame(svgString, i * frameInterval, settings);
      // Buffer delay for recorder to process the frame
      await new Promise(r => setTimeout(r, (1000 / settings.fps) + 10));
      onProgress(Math.round((i / totalFrames) * 100));
    }

    recorder.stop();
    return result;
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Frame generation error"));
      img.src = url;
    });
  }
}
