import React from 'react';
import type { InterviewRecord } from '../types';
import { HistoryIcon } from './icons';

interface PastInterviewListProps {
  interviews: InterviewRecord[];
  onView: (interview: InterviewRecord) => void;
}

const PastInterviewList: React.FC<PastInterviewListProps> = ({ interviews, onView }) => {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
        <HistoryIcon className="w-6 h-6 text-gray-500 dark:text-gray-400" />
        Interview History
      </h2>
      <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
        {interviews.map((interview) => (
          <button
            key={interview.id}
            onClick={() => onView(interview)}
            className="w-full text-left p-4 bg-white dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex justify-between items-center gap-4 border border-gray-200 dark:border-transparent shadow-sm"
          >
            <div className="flex-grow min-w-0">
              <p className="font-semibold text-gray-800 dark:text-white truncate">{interview.topic}</p>
              <p className="text-sm text-indigo-500 dark:text-indigo-300 font-medium mt-1">{interview.userName}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {new Date(interview.date).toLocaleString()}
              </p>
            </div>
            {interview.score !== null ? (
              <div className={`flex-shrink-0 text-center p-3 rounded-lg ${
                  interview.score >= 8 ? 'bg-green-500/10 text-green-600 dark:text-green-300' :
                  interview.score >= 6 ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-300' : 'bg-red-500/10 text-red-500 dark:text-red-400'
              }`}>
                <span className="text-2xl font-bold">{interview.score}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 block">/ 10</span>
              </div>
            ) : <div className="text-sm text-gray-500 flex-shrink-0">No score</div>}
          </button>
        ))}
      </div>
    </div>
  );
};

export default PastInterviewList;