import React from 'react';

function PipelinesMockLarge({ isLight }: { isLight: boolean }) {
  const stages = [
    { name: 'Lead', count: 3, value: 8200, deals: [{ title: 'Acme Corp', value: 5000, contact: 'John D.' }, { title: 'Beta Inc', value: 3200, contact: 'Sarah M.' }], color: 'bg-gray-400' },
    { name: 'Qualified', count: 1, value: 12000, deals: [{ title: 'Delta LLC', value: 12000, contact: 'Mike C.' }], color: 'bg-blue-500' },
    { name: 'Proposal', count: 2, value: 23500, deals: [{ title: 'Gamma Co', value: 8500, contact: 'Emma W.' }, { title: 'Omega Ltd', value: 15000, contact: 'James B.' }], color: 'bg-amber-500' },
    { name: 'Won', count: 1, value: 22000, deals: [{ title: 'Alpha Tech', value: 22000, contact: 'Lisa R.' }], color: 'bg-green-500' },
  ];

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val);
  
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {stages.map((stage, i) => (
        <div key={i} className={`flex-shrink-0 w-44 flex flex-col rounded-lg ${isLight ? 'bg-gray-100/50' : 'bg-slate-700/50'}`}>
          {/* Stage Header - matching KanbanBoard.tsx */}
          <div className={`p-2.5 border-b ${isLight ? 'border-gray-200' : 'border-slate-600'} flex items-center justify-between`}>
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
              <span className={`text-sm font-medium ${isLight ? 'text-gray-700' : 'text-slate-200'}`}>{stage.name}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${isLight ? 'bg-gray-200 text-gray-600' : 'bg-slate-600 text-slate-300'}`}>{stage.count}</span>
            </div>
          </div>
          {/* Stage value */}
          <div className={`px-2.5 py-1 text-xs ${isLight ? 'text-gray-500' : 'text-slate-400'}`}>
            {formatCurrency(stage.value)}
          </div>
          {/* Deal cards - matching KanbanBoard.tsx */}
          <div className="p-2 space-y-2 flex-1">
            {stage.deals.map((deal, j) => (
              <div key={j} className={`${isLight ? 'bg-white' : 'bg-slate-800'} rounded-lg p-2.5 shadow-sm border ${isLight ? 'border-gray-200' : 'border-slate-700'} cursor-grab hover:shadow-md transition-shadow`}>
                <p className={`text-sm font-medium mb-1 ${isLight ? 'text-gray-900' : 'text-white'}`}>{deal.title}</p>
                <div className="flex items-center justify-between">
                  <span className={`text-xs ${isLight ? 'text-gray-500' : 'text-slate-400'}`}>{deal.contact}</span>
                  <span className={`text-xs font-medium ${isLight ? 'text-green-600' : 'text-green-400'}`}>{formatCurrency(deal.value)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default PipelinesMockLarge;