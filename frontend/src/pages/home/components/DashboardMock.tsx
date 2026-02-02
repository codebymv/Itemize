import React from 'react';
import { Users, TrendingUp, CheckSquare } from 'lucide-react';

function DashboardMock({ isLight }: { isLight: boolean }) {
  const cardBg = isLight ? 'bg-white' : 'bg-slate-800';
  const innerCardBg = isLight ? 'bg-gray-50' : 'bg-slate-700';
  const borderColor = isLight ? 'border-gray-200' : 'border-slate-700';
  
  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Contacts', value: '2,847', icon: Users },
          { label: 'Pipeline', value: '$124K', icon: TrendingUp },
          { label: 'Tasks', value: '12', icon: CheckSquare },
        ].map((stat, i) => (
          <div key={i} className={`${innerCardBg} rounded-lg p-3 text-center border ${borderColor}`}>
            <div className={`text-lg font-bold ${isLight ? 'text-gray-900' : 'text-white'}`}>{stat.value}</div>
            <div className={`text-xs ${isLight ? 'text-gray-500' : 'text-slate-400'} flex items-center justify-center gap-1`}>
              <stat.icon className="h-3 w-3" />
              {stat.label}
            </div>
          </div>
        ))}
      </div>
      {/* Mini Pipeline */}
      <div className={`${innerCardBg} rounded-lg p-3 border ${borderColor}`}>
        <div className={`text-xs font-medium mb-2 ${isLight ? 'text-gray-700' : 'text-slate-300'}`}>Sales Pipeline</div>
        <div className="flex gap-1">
          {[
            { stage: 'Lead', width: '25%', color: 'bg-gray-400' },
            { stage: 'Qualified', width: '20%', color: 'bg-blue-500' },
            { stage: 'Proposal', width: '35%', color: 'bg-amber-500' },
            { stage: 'Won', width: '20%', color: 'bg-green-500' },
          ].map((s, i) => (
            <div key={i} className={`h-2 rounded-full ${s.color}`} style={{ width: s.width }} title={s.stage} />
          ))}
        </div>
      </div>
      {/* Recent Activity */}
      <div className={`${innerCardBg} rounded-lg p-3 border ${borderColor}`}>
        <div className={`text-xs font-medium mb-2 ${isLight ? 'text-gray-700' : 'text-slate-300'}`}>Recent Activity</div>
        <div className="space-y-2">
          {[
            { text: 'New contact: Sarah J.', color: 'bg-blue-500' },
            { text: 'Deal moved: $5K', color: 'bg-green-500' },
            { text: 'Task completed', color: 'bg-violet-500' },
          ].map((item, i) => (
            <div key={i} className={`text-xs ${isLight ? 'text-gray-600' : 'text-slate-400'} flex items-center gap-2`}>
              <div className={`w-1.5 h-1.5 rounded-full ${item.color}`} />
              {item.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DashboardMock;