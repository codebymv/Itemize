import React from 'react';
import { Users, TrendingUp, CheckSquare } from 'lucide-react';

function DashboardMock() {
  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Contacts', value: '2,847', icon: Users },
          { label: 'Pipeline', value: '$124K', icon: TrendingUp },
          { label: 'Tasks', value: '12', icon: CheckSquare },
        ].map((stat, i) => (
          <div key={i} className="bg-gray-50 dark:bg-slate-700 rounded-lg p-3 text-center border border-gray-200 dark:border-slate-700">
            <div className="text-lg font-bold text-gray-900 dark:text-white">{stat.value}</div>
            <div className="text-xs text-gray-500 dark:text-slate-400 flex items-center justify-center gap-1">
              <stat.icon className="h-3 w-3" />
              {stat.label}
            </div>
          </div>
        ))}
      </div>
      {/* Mini Pipeline */}
      <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-3 border border-gray-200 dark:border-slate-700">
        <div className="text-xs font-medium mb-2 text-gray-700 dark:text-slate-300">Sales Pipeline</div>
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
      <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-3 border border-gray-200 dark:border-slate-700">
        <div className="text-xs font-medium mb-2 text-gray-700 dark:text-slate-300">Recent Activity</div>
        <div className="space-y-2">
          {[
            { text: 'New contact: Sarah J.', color: 'bg-blue-500' },
            { text: 'Deal moved: $5K', color: 'bg-green-500' },
            { text: 'Task completed', color: 'bg-violet-500' },
          ].map((item, i) => (
            <div key={i} className="text-xs text-gray-600 dark:text-slate-400 flex items-center gap-2">
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
