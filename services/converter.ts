
import { ConverterSettings, ExportFormat } from "../types";

export class SvgConverter {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private liveContainer: HTMLDivElement | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    const context = this.canvas.getContext('2d', { 
      willReadFrequently: true,
      alpha: true 
    });
    if (!context) throw new Error("Could not initialize canvas context");
    this.ctx = context;
  }

  private ensureContainer() {
    if (!this.liveContainer) {
      this.liveContainer = document.createElement('div');
      this.liveContainer.style.position = 'fixed';
      this.liveContainer.style.top = '-10000px';
      this.liveContainer.style.left = '-10000px';
      this.liveContainer.style.width = '1px';
      this.liveContainer.style.height = '1px';
      this.liveContainer.style.overflow = 'hidden';
      document.body.appendChild(this.liveContainer);
    }
    return this.liveContainer;
  }

  private async waitForGifshot(): Promise<any> {
    const check = () => (window as any).gifshot;
    if (check()) return check();

    // Try to dynamically inject if it failed to load from HTML
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/gifshot@0.4.5/dist/gifshot.min.js';
      script.onload = () => {
        if (check()) resolve(check());
        else reject(new Error("Gifshot failed to initialize after dynamic load."));
      };
      script.onerror = () => reject(new Error("Failed to load GIF engine from CDN."));
      document.head.appendChild(script);
    });
  }

  async convert(
    svgString: string,
    settings: ConverterSettings,
    onProgress: (percent: number) => void
  ): Promise<Blob> {
    const { width, height } = this.getDimensions(svgString, settings.scale);
    this.canvas.width = width;
    this.canvas.height = height;

    if (settings.format === ExportFormat.GIF) {
      return this.generateGif(svgString, settings, onProgress);
    } else {
      return this.generateVideo(svgString, settings, onProgress);
    }
  }

  private getDimensions(svgString: string, scale: number) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    
    let width = 500;
    let height = 500;

    if (svgEl) {
      width = parseFloat(svgEl.getAttribute('width') || svgEl.viewBox.baseVal.width.toString() || '500');
      height = parseFloat(svgEl.getAttribute('height') || svgEl.viewBox.baseVal.height.toString() || '500');
    }

    return { 
      width: Math.round(width * scale), 
      height: Math.round(height * scale) 
    };
  }

  private async captureFrame(svgString: string, time: number, settings: ConverterSettings): Promise<string> {
    const container = this.ensureContainer();
    container.innerHTML = svgString;
    const liveSvg = container.querySelector('svg');
    if (!liveSvg) throw new Error("Invalid SVG structure");

    // Seek SMIL
    if (typeof liveSvg.setCurrentTime === 'function') {
      try {
        liveSvg.setCurrentTime(time);
      } catch (e) {}
    }

    // Seek CSS Animations
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = `
      * {
        animation-play-state: paused !important;
        animation-delay: -${time}s !important;
        transition: none !important;
      }
    `;
    liveSvg.appendChild(style);

    // Serialize to Image
    const serializer = new XMLSerializer();
    const svgBlob = new Blob([serializer.serializeToString(liveSvg)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

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
      container.innerHTML = ''; // Clean up
    }
  }

  private async generateGif(
    svgString: string, 
    settings: ConverterSettings, 
    onProgress: (percent: number) => void
  ): Promise<Blob> {
    const gs = await this.waitForGifshot();
    
    const totalFrames = Math.ceil(settings.duration * settings.fps);
    const frameDuration = 1 / settings.fps;
    const frames: string[] = [];

    for (let i = 0; i < totalFrames; i++) {
      const dataUrl = await this.captureFrame(svgString, i * frameDuration, settings);
      frames.push(dataUrl);
      onProgress(Math.round((i / totalFrames) * 60));
    }

    return new Promise((resolve, reject) => {
      gs.createGIF({
        images: frames,
        gifWidth: this.canvas.width,
        gifHeight: this.canvas.height,
        interval: frameDuration,
        numFrames: totalFrames,
        progressCallback: (p: number) => onProgress(60 + Math.round(p * 40))
      }, (obj: any) => {
        if (!obj.error) {
          fetch(obj.image).then(res => res.blob()).then(resolve);
        } else {
          reject(new Error("GIF generation failed: " + obj.errorMsg));
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
    const mimeTypes = ['video/mp4;codecs=h264', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
    
    const recorder = new MediaRecorder(stream, {
      mimeType: selectedMime,
      videoBitsPerSecond: 25000000 * settings.quality
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    
    const promise = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: selectedMime }));
    });

    const totalFrames = Math.ceil(settings.duration * settings.fps);
    const frameDuration = 1 / settings.fps;

    recorder.start();

    for (let i = 0; i < totalFrames; i++) {
      await this.captureFrame(svgString, i * frameDuration, settings);
      // Ensure the MediaRecorder frame clock is satisfied
      await new Promise(r => setTimeout(r, (1000 / settings.fps) + 5));
      onProgress(Math.round((i / totalFrames) * 100));
    }

    recorder.stop();
    return promise;
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load SVG frame"));
      img.src = url;
    });
  }
}
