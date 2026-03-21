import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { PortfolioItem } from '../types';
import { analyzeCorrelations } from '../services/geminiService';
import { RefreshCw, AlertOctagon, BrainCircuit } from 'lucide-react';

interface CorrelationData {
  tickers: string[];
  matrix: number[][];
  analysis: string;
}

interface CorrelationViewProps {
  data: PortfolioItem[];
  result: CorrelationData | null;
  status: 'idle' | 'analyzing' | 'complete' | 'error';
  setResult: (data: CorrelationData) => void;
  setStatus: (status: 'idle' | 'analyzing' | 'complete' | 'error') => void;
}

export const CorrelationView: React.FC<CorrelationViewProps> = ({ data, result, status, setResult, setStatus }) => {
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [hoveredCell, setHoveredCell] = useState<{row: number, col: number} | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('Initializing...');
  const progressInterval = useRef<any>(null);

  const runAnalysis = async () => {
    setStatus('analyzing');
    setErrorMsg('');
    setLoadingProgress(0);
    setLoadingText('Preparing data...');

    const steps = [
      { pct: 10, text: 'Filtering active positions...' },
      { pct: 25, text: 'Excluding cash equivalents...' },
      { pct: 40, text: 'Sorting by portfolio weight...' },
      { pct: 55, text: 'Retrieving historical volatility...' },
      { pct: 70, text: 'Calculating beta coefficients...' },
      { pct: 85, text: 'Constructing correlation matrix...' },
      { pct: 90, text: 'Finalizing diversification analysis...' },
    ];

    let stepIndex = 0;
    if (progressInterval.current) clearInterval(progressInterval.current);
    
    progressInterval.current = setInterval(() => {
      if (stepIndex < steps.length) {
        setLoadingProgress(steps[stepIndex].pct);
        setLoadingText(steps[stepIndex].text);
        stepIndex++;
      }
    }, 1200);

    try {
      const dates = Array.from(new Set(data.map(d => d.date))).sort();
      const latestDate = dates[dates.length - 1];

      const activeHoldings = data.filter(item => {
        const isCurrent = item.date === latestDate;
        const hasWeight = item.weight > 0;
        const isNotCash = !item.ticker.toUpperCase().includes('CASH') && !item.ticker.includes('$');
        return isCurrent && hasWeight && isNotCash;
      });

      if (activeHoldings.length === 0) throw new Error("No active equity holdings found for the latest date.");
      activeHoldings.sort((a, b) => b.weight - a.weight);

      const jsonStr = await analyzeCorrelations(activeHoldings);
      
      if (progressInterval.current) clearInterval(progressInterval.current);
      setLoadingProgress(100);
      setLoadingText('Analysis Complete');

      const parsed = JSON.parse(jsonStr) as CorrelationData;
      setResult(parsed);
      setStatus('complete');
    } catch (e: any) {
      if (progressInterval.current) clearInterval(progressInterval.current);
      setStatus('error');
      setErrorMsg(e.message || "Failed to generate correlation matrix.");
    }
  };

  useEffect(() => {
    if (status === 'idle' && data.length > 0 && !result) runAnalysis();
    return () => { if (progressInterval.current) clearInterval(progressInterval.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getCellColor = (value: number) => {
    if (value >= 0) {
      const intensity = value; 
      const r = Math.round(255 - (252 * intensity));
      const g = Math.round(255 - (150 * intensity));
      const b = Math.round(255 - (94 * intensity));
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      const intensity = Math.abs(value);
      const r = 255;
      const g = Math.round(255 - (217 * intensity));
      const b = Math.round(255 - (217 * intensity));
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  const getTextColor = (value: number) => Math.abs(value) > 0.6 ? '#ffffff' : '#0f172a';

  return (
    <div className="w-full max-w-[1800px] mx-auto p-6 h-full flex flex-col">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-bold font-mono text-wallstreet-text">Correlation Matrix</h2>
          <p className="text-wallstreet-500 text-sm mt-1">Implied Historical Correlations & Diversification Check</p>
        </div>
        <button onClick={runAnalysis} disabled={status === 'analyzing'} className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-bold transition-colors shadow-sm ${status === 'analyzing' ? 'bg-wallstreet-700 text-wallstreet-500 cursor-not-allowed' : 'bg-wallstreet-accent text-white hover:bg-sky-600'}`}>
          <RefreshCw size={16} className={status === 'analyzing' ? 'animate-spin' : ''} />
          {status === 'analyzing' ? 'Calculating...' : 'Recalculate'}
        </button>
      </header>

      {status === 'analyzing' && (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-center">
          <div className="w-full max-w-md space-y-8 bg-wallstreet-800 p-8 rounded-xl border border-wallstreet-700 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-wallstreet-accent to-sky-400"></div>
            <div className="flex justify-center mb-6">
               <div className="relative">
                 <div className="absolute inset-0 bg-wallstreet-accent blur-xl opacity-20 animate-pulse"></div>
                 <BrainCircuit size={56} className="text-wallstreet-accent relative z-10 animate-bounce" />
               </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono font-bold text-wallstreet-500 uppercase tracking-widest">
                <span>{loadingText}</span>
                <span>{loadingProgress}%</span>
              </div>
              <div className="h-3 bg-wallstreet-900 rounded-full overflow-hidden border border-wallstreet-700">
                <div className="h-full bg-gradient-to-r from-wallstreet-accent to-sky-400 transition-all duration-700 ease-out shadow-[0_0_10px_rgba(3,105,161,0.5)]" style={{ width: `${loadingProgress}%` }} />
              </div>
            </div>
            <p className="text-xs text-wallstreet-500 font-mono opacity-70">Analysing sector beta, historical variance, and covariance factors...</p>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl flex items-start gap-4 text-red-600">
          <AlertOctagon size={24} className="mt-1 flex-shrink-0" />
          <div>
            <h3 className="font-bold mb-1">Calculation Failed</h3>
            <p>{errorMsg}</p>
          </div>
        </div>
      )}

      {status === 'complete' && result && (
        <div className="flex flex-col gap-8 pb-12 animate-in fade-in duration-500 slide-in-from-bottom-4">
            <div className="bg-wallstreet-800 p-6 rounded-xl border border-wallstreet-700 shadow-lg w-full">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-mono font-bold text-wallstreet-text">Correlation Heatmap</h3>
                    <div className="flex items-center gap-2 text-xs font-mono text-wallstreet-500">
                        <span>Neg (-1)</span>
                        <div className="w-24 h-3 rounded bg-gradient-to-r from-red-600 via-white to-sky-700 border border-wallstreet-700"></div>
                        <span>Pos (+1)</span>
                    </div>
                </div>
                
                <div className="w-full overflow-x-auto">
                    <div className="grid gap-1 min-w-[800px]" style={{ gridTemplateColumns: `auto repeat(${result.tickers.length}, 1fr)` }}>
                        <div className="h-28"></div> 
                        {result.tickers.map((t, i) => (
                            <div key={i} className="flex items-end justify-center pb-3 overflow-hidden h-28 relative group">
                                <span className="text-[10px] sm:text-xs font-mono font-bold text-wallstreet-500 -rotate-45 origin-bottom-left translate-x-3 whitespace-nowrap group-hover:text-wallstreet-accent transition-colors">{t}</span>
                            </div>
                        ))}
                        {result.matrix.map((row, rIndex) => (
                            <React.Fragment key={rIndex}>
                                <div className="flex items-center justify-end pr-3 h-10 sticky left-0 bg-wallstreet-800 z-20 group">
                                    <span className="text-[10px] sm:text-xs font-mono font-bold text-wallstreet-text whitespace-nowrap group-hover:text-wallstreet-accent transition-colors">{result.tickers[rIndex]}</span>
                                </div>
                                {row.map((val, cIndex) => {
                                    if (cIndex > rIndex) return <div key={`${rIndex}-${cIndex}`} className="h-10 w-full bg-transparent"></div>;
                                    return (
                                        <div 
                                            key={`${rIndex}-${cIndex}`}
                                            className="h-10 w-full rounded flex items-center justify-center relative cursor-default transition-all duration-200 hover:z-10 hover:shadow-lg hover:scale-110 border border-white/10"
                                            style={{ backgroundColor: getCellColor(val) }}
                                            onMouseEnter={() => setHoveredCell({row: rIndex, col: cIndex})}
                                            onMouseLeave={() => setHoveredCell(null)}
                                        >
                                            <span className="text-[9px] sm:text-[10px] font-mono font-bold truncate px-0.5" style={{ color: getTextColor(val) }}>{val.toFixed(2)}</span>
                                            {hoveredCell?.row === rIndex && hoveredCell?.col === cIndex && (
                                                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs p-2 rounded shadow-xl whitespace-nowrap z-50 pointer-events-none">
                                                    <div className="font-bold border-b border-white/20 pb-1 mb-1">{result.tickers[rIndex]} vs {result.tickers[cIndex]}</div>
                                                    <div>Correlation: <span className="font-bold text-sky-400">{val.toFixed(2)}</span></div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-wallstreet-800 p-6 rounded-xl border border-wallstreet-700 shadow-lg">
                <h3 className="text-lg font-mono font-bold text-wallstreet-text mb-4 border-b border-wallstreet-700 pb-2">Diversification Analysis</h3>
                <div className="prose prose-sm prose-slate max-w-none">
                    <ReactMarkdown
                        components={{
                            p: ({node, ...props}) => <p className="mb-6 text-wallstreet-text leading-relaxed text-base" {...props} />,
                            strong: ({node, ...props}) => <strong className="text-wallstreet-accent font-bold text-sm tracking-wide block mb-1 mt-4" {...props} />,
                            li: ({node, ...props}) => <li className="mb-2" {...props} />,
                            ul: ({node, ...props}) => <ul className="mb-6 list-disc pl-5" {...props} />
                        }}
                    >
                        {result.analysis}
                    </ReactMarkdown>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};