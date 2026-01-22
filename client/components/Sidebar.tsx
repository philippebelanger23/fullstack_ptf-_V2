import { LayoutDashboard, FileText, Upload, PieChart, Network, BarChart2, Globe, TrendingUp } from 'lucide-react';
import { ViewState } from '../types';

interface SidebarProps {
  currentView: ViewState;
  setView: (view: ViewState) => void;
  hasData: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, hasData }) => {
  const navItemClass = (view: ViewState, disabled: boolean) => `
    flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200
    ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-wallstreet-700 hover:text-wallstreet-text'}
    ${currentView === view ? 'bg-wallstreet-700 text-wallstreet-accent border-l-4 border-wallstreet-accent' : 'text-wallstreet-500'}
  `;

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

        <div onClick={() => hasData && setView(ViewState.DASHBOARD)} className={navItemClass(ViewState.DASHBOARD, !hasData)}>
          <PieChart size={20} />
          <span className="font-medium">Holdings </span>
        </div>

        <div onClick={() => setView(ViewState.INDEX)} className={navItemClass(ViewState.INDEX, false)}>
          <Globe size={20} />
          <span className="font-medium">Index Breakdown</span>
        </div>

        <div onClick={() => hasData && setView(ViewState.ATTRIBUTION)} className={navItemClass(ViewState.ATTRIBUTION, !hasData)}>
          <BarChart2 size={20} />
          <span className="font-medium">Attribution</span>
        </div>

        <div onClick={() => hasData && setView(ViewState.PERFORMANCE)} className={navItemClass(ViewState.PERFORMANCE, !hasData)}>
          <TrendingUp size={20} />
          <span className="font-medium">Performance</span>
        </div>

        <div onClick={() => hasData && setView(ViewState.CORRELATION)} className={navItemClass(ViewState.CORRELATION, !hasData)}>
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
