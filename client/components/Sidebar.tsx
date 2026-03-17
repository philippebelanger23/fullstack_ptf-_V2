import { LayoutDashboard, FileText, Upload, PieChart, Network, BarChart2, Globe, TrendingUp } from 'lucide-react';
import { ViewState } from '../types';

interface SidebarProps {
  currentView: ViewState;
  setView: (view: ViewState) => void;
  hasData: boolean;
  isAssetSpecsComplete: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, hasData, isAssetSpecsComplete }) => {
  const navItemClass = (view: ViewState, disabled: boolean) => `
    flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200
    ${disabled ? 'opacity-30 cursor-not-allowed grayscale pointer-events-none' : 'cursor-pointer hover:bg-wallstreet-700 hover:text-wallstreet-text'}
    ${currentView === view ? 'bg-wallstreet-700 text-wallstreet-accent border-l-4 border-wallstreet-accent' : 'text-wallstreet-500'}
  `;

  // Determine if non-upload tabs should be locked
  const isLocked = !isAssetSpecsComplete;

  return (
    <div className="w-64 h-screen bg-wallstreet-900 border-r border-wallstreet-700 flex flex-col sticky top-0 shadow-sm print-hide">
      <div className="p-6 border-b border-wallstreet-700">
        <h1 className="text-xl font-bold font-mono text-wallstreet-text tracking-tighter">
          <span className="text-wallstreet-accent">PTF</span> DEEP DIVE
        </h1>
        <p className="text-xs text-wallstreet-500 mt-1 uppercase tracking-widest">Institutional Grade</p>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        <div onClick={() => setView(ViewState.UPLOAD)} className={navItemClass(ViewState.UPLOAD, false)}>
          <Upload size={20} />
          <span className="font-medium">Data Import</span>
        </div>

        <div onClick={() => hasData && !isLocked && setView(ViewState.DASHBOARD)} className={navItemClass(ViewState.DASHBOARD, !hasData || isLocked)}>
          <PieChart size={20} />
          <span className="font-medium">Holdings </span>
        </div>

        <div onClick={() => !isLocked && setView(ViewState.INDEX)} className={navItemClass(ViewState.INDEX, isLocked)}>
          <Globe size={20} />
          <span className="font-medium">Index Breakdown</span>
        </div>

        <div onClick={() => hasData && !isLocked && setView(ViewState.ATTRIBUTION)} className={navItemClass(ViewState.ATTRIBUTION, !hasData || isLocked)}>
          <BarChart2 size={20} />
          <span className="font-medium">Return Contribution</span>
        </div>

        <div onClick={() => hasData && !isLocked && setView(ViewState.RISK_CONTRIBUTION)} className={navItemClass(ViewState.RISK_CONTRIBUTION, !hasData || isLocked)}>
          <TrendingUp size={20} className="rotate-90" />
          <span className="font-medium">Risk Contribution</span>
        </div>

        <div onClick={() => hasData && !isLocked && setView(ViewState.PERFORMANCE)} className={navItemClass(ViewState.PERFORMANCE, !hasData || isLocked)}>
          <TrendingUp size={20} />
          <span className="font-medium">Relative Performance</span>
        </div>

        <div className={navItemClass(ViewState.CORRELATION, true)} title="Module currently disabled">
          <Network size={20} />
          <span className="font-medium">Correlation Matrix</span>
        </div>

        <div className={navItemClass(ViewState.ANALYSIS, true)} title="Module currently disabled">
          <FileText size={20} />
          <span className="font-medium">Portfolio Deep Dive</span>
        </div>
      </nav>
    </div>
  );
};
