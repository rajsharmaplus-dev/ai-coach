import React from 'react';
import type { InterviewRecord } from '../types';
import { HistoryIcon } from './icons';

interface PastInterviewListProps {
  interviews: InterviewRecord[];
  onView: (interview: InterviewRecord) => void;
}

const PastInterviewList: React.FC<PastInterviewListProps> = ({ interviews, onView }) => {
  if (interviews.length === 0) {
    return (
      <div className="glass-rich p-8 text-center animate-fade-slide">
        <div className="flex justify-center mb-4">
          <HistoryIcon className="w-10 h-10 text-primary-muted opacity-30" />
        </div>
        <p className="text-text-dim font-medium uppercase tracking-widest text-xs">Vocal History Empty</p>
        <p className="text-text-muted mt-2 text-sm italic">Your future performance reports will appear here.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-slide">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <HistoryIcon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-text-main tracking-tight leading-none">Vocal History</h2>
          <p className="text-[10px] text-text-dim uppercase tracking-wider font-bold mt-1">Intelligence Archives</p>
        </div>
      </div>
      
      <div className="space-y-4 max-h-[420px] overflow-y-auto pr-3 custom-scrollbar">
        {interviews.map((interview, index) => (
          <button
            key={interview.id}
            onClick={() => onView(interview)}
            className="w-full text-left glass-rich p-4 hover:border-primary/50 transition-all duration-300 group relative overflow-hidden animate-fade-slide"
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary transform -translate-x-full group-hover:translate-x-0 transition-transform duration-300" />
            
            <div className="flex justify-between items-start gap-4">
              <div className="flex-grow min-w-0">
                <p className="font-bold text-text-main truncate group-hover:text-primary transition-colors duration-300">{interview.topic}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] font-black uppercase text-text-dim bg-white/5 px-1.5 py-0.5 rounded border border-white/5">{interview.userName}</span>
                  <span className="text-[10px] text-text-muted font-medium">
                    {new Date(interview.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>
              
              {interview.score !== null ? (
                <div className="flex flex-col items-end">
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-xl font-black text-text-main group-hover:text-primary transition-colors">{interview.score}</span>
                    <span className="text-[10px] font-bold text-text-dim">/10</span>
                  </div>
                  <div className={`w-12 h-1 rounded-full mt-1.5 ${
                    interview.score >= 8 ? 'bg-green-500/50' :
                    interview.score >= 6 ? 'bg-yellow-500/50' : 'bg-red-500/50'
                  }`} />
                </div>
              ) : (
                <div className="px-2 py-1 rounded bg-white/5 border border-white/5">
                  <span className="text-[9px] font-black uppercase text-text-dim">Analysis Pending</span>
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default PastInterviewList;