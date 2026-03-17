import React from 'react';

export const RiskContributionView: React.FC = () => {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-wallstreet-900 font-mono tracking-tighter">
          RISK <span className="text-wallstreet-accent">CONTRIBUTION</span>
        </h2>
        <p className="text-wallstreet-500 mt-2">Analysis of portfolio risk drivers and factor exposures.</p>
      </div>

      <div className="bg-white rounded-xl border border-wallstreet-200 p-12 flex flex-col items-center justify-center min-h-[400px] shadow-sm">
        <div className="w-16 h-16 bg-wallstreet-50 rounded-full flex items-center justify-center mb-4">
          <span className="text-3xl">🛡️</span>
        </div>
        <h3 className="text-xl font-bold text-wallstreet-800 mb-2">Risk Engine Initializing</h3>
        <p className="text-wallstreet-500 text-center max-w-md">
          The Risk Contribution module is currently being configured. This view will soon provide detailed breakdowns of marginal contribution to risk (MCTR) and factor sensitivities.
        </p>
      </div>
    </div>
  );
};
