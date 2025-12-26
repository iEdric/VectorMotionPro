
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { analyzeSvg } from './services/geminiService';
import { SvgConverter } from './services/converter';
import { ExportFormat, ConverterSettings, SvgAnalysis } from './types';

const SidebarItem: React.FC<{ icon: string; label: string; active?: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex items-center space-x-3 w-full p-3 rounded-xl transition-all ${active ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-100'}`}
  >
    <i className={`fas ${icon} w-5 text-center`}></i>
    <span className="font-medium">{label}</span>
  </button>
);

const App: React.FC = () => {
  const [svgCode, setSvgCode] = useState<string>(`<svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="400" height="400" fill="#f8fafc" />
  <g transform="translate(200,200)">
    <!-- Rotating background ring -->
    <circle r="120" fill="none" stroke="#e2e8f0" stroke-width="20" stroke-dasharray="20 10">
      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="10s" repeatCount="indefinite" />
    </circle>
    
    <!-- Pulsing central circle -->
    <circle r="60" fill="#6366f1">
      <animate attributeName="r" values="60;80;60" dur="2s" repeatCount="indefinite" />
      <animate attributeName="fill" values="#6366f1;#8b5cf6;#6366f1" dur="3s" repeatCount="indefinite" />
    </circle>

    <!-- Orbiting square -->
    <g>
      <rect x="90" y="-15" width="30" height="30" rx="6" fill="#f43f5e">
        <animateTransform attributeName="transform" type="rotate" from="0" to="-360" dur="4s" repeatCount="indefinite" />
      </rect>
      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="4s" repeatCount="indefinite" />
    </g>
  </g>
</svg>`);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analysis, setAnalysis] = useState<SvgAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<ConverterSettings>({
    fps: 30,
    duration: 4,
    scale: 1.5,
    quality: 1.0,
    format: ExportFormat.MP4,
    transparent: false
  });

  const converterRef = useRef<SvgConverter>(null);

  useEffect(() => {
    // @ts-ignore
    converterRef.current = new SvgConverter();
  }, []);

  const handleSvgChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSvgCode(e.target.value);
    setResultUrl(null);
  };

  const runAnalysis = useCallback(async () => {
    if (!svgCode.trim()) return;
    setIsAnalyzing(true);
    try {
      const res = await analyzeSvg(svgCode);
      setAnalysis(res);
      setSettings(prev => ({ 
        ...prev, 
        duration: res.suggestedDuration > 0 ? Math.min(res.suggestedDuration, 10) : 4 
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  }, [svgCode]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setSvgCode(content);
        setResultUrl(null);
      };
      reader.readAsText(file);
    }
  };

  const startConversion = async () => {
    setIsProcessing(true);
    setProgress(0);
    setError(null);
    setResultUrl(null);
    
    try {
      if (!converterRef.current) throw new Error("Converter not ready");
      const blob = await converterRef.current.convert(svgCode, settings, (p) => setProgress(p));
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
    } catch (err: any) {
      setError(err.message || "Conversion failed. Ensure your SVG is valid.");
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadResult = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    const ext = settings.format.toLowerCase();
    a.download = `vector-motion-export.${ext}`;
    a.click();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col p-6 space-y-8 z-10 shadow-sm overflow-y-auto">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 p-2 rounded-lg shadow-indigo-200 shadow-lg">
            <i className="fas fa-play-circle text-white text-xl"></i>
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">
            VectorMotion <span className="text-indigo-600">Pro</span>
          </h1>
        </div>

        <nav className="flex-1 space-y-6">
          <section>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-3">Output Format</p>
            <div className="grid grid-cols-3 gap-2 px-1">
              {[ExportFormat.MP4, ExportFormat.GIF, ExportFormat.WEBM].map(f => (
                <button
                  key={f}
                  onClick={() => setSettings({...settings, format: f})}
                  className={`py-2 rounded-lg text-xs font-bold transition-all border ${settings.format === f ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300'}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </section>
          
          <section className="space-y-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 px-3">Render Settings</p>
            
            <div className="space-y-4 px-3">
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-600">Frame Rate</label>
                  <span className="text-xs font-mono text-indigo-600 font-bold">{settings.fps} FPS</span>
                </div>
                <input 
                  type="range" min="15" max="60" step="5" 
                  value={settings.fps}
                  onChange={(e) => setSettings({...settings, fps: parseInt(e.target.value)})}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-600">Time to Capture</label>
                  <span className="text-xs font-mono text-indigo-600 font-bold">{settings.duration}s</span>
                </div>
                <input 
                  type="range" min="1" max="10" step="0.5" 
                  value={settings.duration}
                  onChange={(e) => setSettings({...settings, duration: parseFloat(e.target.value)})}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-600">Scaling</label>
                  <span className="text-xs font-mono text-indigo-600 font-bold">{settings.scale}x</span>
                </div>
                <input 
                  type="range" min="1" max="3" step="0.5" 
                  value={settings.scale}
                  onChange={(e) => setSettings({...settings, scale: parseFloat(e.target.value)})}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>
              
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                <label htmlFor="trans-toggle" className="text-xs font-bold text-slate-600">Alpha Background</label>
                <input 
                  type="checkbox" 
                  id="trans-toggle"
                  checked={settings.transparent}
                  onChange={(e) => setSettings({...settings, transparent: e.target.checked})}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
              </div>
            </div>
          </section>
        </nav>

        <div className="pt-4 border-t border-slate-100">
          <button 
            onClick={startConversion}
            disabled={isProcessing}
            className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center space-x-2 transition-all shadow-xl ${isProcessing ? 'bg-indigo-50 text-indigo-300 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-black active:scale-95'}`}
          >
            {isProcessing ? (
              <div className="flex items-center space-x-3">
                <i className="fas fa-sync fa-spin"></i>
                <span>Capturing {progress}%</span>
              </div>
            ) : (
              <>
                <i className="fas fa-video text-indigo-400"></i>
                <span>Start Render</span>
              </>
            )}
          </button>
          <p className="text-[9px] text-center text-slate-400 mt-4 font-medium leading-tight">
            Advanced Seek-and-Serialize engine ensures<br/>perfect animation capture.
          </p>
        </div>
      </aside>

      <main className="flex-1 flex flex-col p-8 space-y-6 overflow-y-auto bg-slate-50">
        <header className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center space-x-4">
            <div className="h-10 w-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
              <i className="fas fa-terminal"></i>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 leading-none">Animation Editor</h2>
              <p className="text-slate-400 text-xs mt-1">Live SMIL and CSS animation preview</p>
            </div>
          </div>
          <div className="flex space-x-2">
             <label className="cursor-pointer bg-slate-50 text-slate-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-100 transition-colors border border-slate-200 flex items-center">
              <i className="fas fa-upload mr-2"></i>
              Import
              <input type="file" accept=".svg" onChange={handleFileUpload} className="hidden" />
            </label>
            <button 
              onClick={runAnalysis}
              className={`bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-100 transition-colors border border-indigo-100 flex items-center ${isAnalyzing ? 'animate-pulse' : ''}`}
            >
              <i className="fas fa-magic mr-2"></i>
              Smart Detect
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 flex-1 min-h-0">
          <div className="flex flex-col bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden ring-1 ring-slate-100">
            <div className="bg-slate-800 px-6 py-3 flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-slate-400 tracking-widest uppercase">Source Code</span>
            </div>
            <textarea 
              value={svgCode}
              onChange={handleSvgChange}
              spellCheck={false}
              className="flex-1 p-8 font-mono text-sm bg-slate-900 text-indigo-100 resize-none outline-none selection:bg-indigo-500/30 leading-relaxed"
            />
          </div>

          <div className="flex flex-col space-y-6">
            <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-200 p-8 flex flex-col relative overflow-hidden">
              <div className="absolute top-6 left-6 z-10 bg-indigo-600 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                Real-time Preview
              </div>
              
              <div className="flex-1 flex items-center justify-center bg-slate-100 rounded-2xl border-2 border-dashed border-slate-200 relative overflow-hidden">
                <div className="absolute inset-0 opacity-[0.05]" style={{backgroundImage: 'conic-gradient(#000 0.25turn, #fff 0.25turn 0.5turn, #000 0.5turn 0.75turn, #fff 0.75turn)', backgroundSize: '40px 40px'}}></div>
                <div 
                  className="relative z-10 max-w-full max-h-full transition-all duration-300"
                  dangerouslySetInnerHTML={{ __html: svgCode }}
                />
              </div>

              {analysis && (
                <div className="mt-6 grid grid-cols-3 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[9px] uppercase text-slate-400 font-bold mb-1">Canvas</p>
                    <p className="text-xs font-bold text-slate-700">{Math.round(analysis.width * settings.scale)}px</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[9px] uppercase text-slate-400 font-bold mb-1">Capture</p>
                    <p className="text-xs font-bold text-slate-700">{settings.duration}s Loop</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[9px] uppercase text-slate-400 font-bold mb-1">Type</p>
                    <p className="text-xs font-bold text-indigo-600">Animated</p>
                  </div>
                </div>
              )}
            </div>

            {resultUrl && (
              <div className="bg-slate-900 rounded-3xl shadow-2xl p-8 text-white animate-in zoom-in-95 duration-300">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-xl">
                      <i className="fas fa-check"></i>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">Export Ready</h3>
                      <p className="text-slate-400 text-xs">High-compatibility {settings.format} generated</p>
                    </div>
                  </div>
                </div>
                
                <div className="flex space-x-3">
                  <button 
                    onClick={downloadResult}
                    className="flex-1 bg-white text-slate-900 py-4 rounded-2xl font-bold text-base hover:bg-indigo-50 transition-all flex items-center justify-center space-x-2"
                  >
                    <i className="fas fa-download"></i>
                    <span>Download File</span>
                  </button>
                  <button 
                    onClick={() => window.open(resultUrl, '_blank')}
                    className="px-6 bg-slate-800 text-white rounded-2xl font-bold text-sm hover:bg-slate-700 transition-all border border-slate-700"
                  >
                    View
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-rose-50 border border-rose-100 p-6 rounded-3xl text-rose-600 flex items-start space-x-4 animate-in fade-in">
                <i className="fas fa-exclamation-circle mt-1"></i>
                <div>
                  <h4 className="font-bold text-sm">Error</h4>
                  <p className="text-xs mt-1">{error}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-3">
             <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600"><i className="fas fa-shield-alt"></i></div>
             <p className="text-xs text-slate-500">
               <span className="text-slate-900 font-bold">Stable Device Compatibility:</span> This tool uses frame-accurate serialization. The generated MP4 uses <span className="font-mono">H.264</span> which works on all iOS, Android, and Windows devices.
             </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
