
export enum ExportFormat {
  GIF = 'GIF',
  MP4 = 'MP4',
  WEBM = 'WEBM'
}

export interface ConverterSettings {
  fps: number;
  duration: number;
  scale: number;
  quality: number;
  format: ExportFormat;
  transparent: boolean;
}

export interface SvgAnalysis {
  hasSmil: boolean;
  hasCssAnimation: boolean;
  viewBox: string | null;
  width: number;
  height: number;
  suggestedDuration: number;
}
