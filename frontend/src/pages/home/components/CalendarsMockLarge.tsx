import React from 'react';

function CalendarsMockLarge() {
  const calendars = [
    { name: 'Sales Calls', color: '#3B82F6', duration: '30 min', upcoming: 5 },
    { name: 'Product Demo', color: '#10B981', duration: '45 min', upcoming: 3 },
    { name: 'Team Sync', color: '#8B5CF6', duration: '30 min', upcoming: 2 },
  ];

  const events = [
    { time: '9:00 AM', title: 'Strategy Call with Sarah', color: '#3B82F6' },
    { time: '11:30 AM', title: 'Product Demo - Acme Corp', color: '#10B981' },
    { time: '2:00 PM', title: 'Team Sync', color: '#8B5CF6' },
  ];

  return (
    <div className="space-y-4">
      {/* Calendar cards grid - matching CalendarsPage.tsx */}
      <div className="grid grid-cols-3 gap-3">
        {calendars.map((cal, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden hover:shadow-md transition-shadow"
          >
            <div className="h-1" style={{ backgroundColor: cal.color }} />
            <div className="p-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{cal.name}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 dark:border-slate-600 dark:text-slate-400">{cal.duration}</span>
                <span className="text-xs text-gray-400 dark:text-slate-500">{cal.upcoming} upcoming</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Today's schedule */}
      <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Today's Schedule</span>
          <span className="text-xs text-gray-500 dark:text-slate-400">Jan 23</span>
        </div>
        <div className="space-y-2">
          {events.map((event, i) => (
            <div key={i} className="flex items-center gap-3 p-2 rounded bg-white dark:bg-slate-800">
              <div className="w-1 h-8 rounded-full" style={{ backgroundColor: event.color }} />
              <div>
                <p className="text-sm text-gray-500 dark:text-slate-400">{event.time}</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{event.title}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CalendarsMockLarge;
