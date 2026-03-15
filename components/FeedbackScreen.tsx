
import React from 'react';
import type { Message } from '../types';
import { jsPDF } from 'jspdf';
import { DownloadIcon } from './icons';

interface FeedbackScreenProps {
  feedback: string;
  messages: Message[];
  topic: string;
  onStartNew: () => void;
  userName: string;
  recordingUrl: string | null;
}

const FeedbackSection: React.FC<{ title: string; content: React.ReactNode }> = ({ title, content }) => (
  <div className="bg-white dark:bg-gray-800/50 p-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm transition-all hover:shadow-md">
    <h3 className="text-xl font-semibold text-purple-600 dark:text-purple-300 mb-3">{title}</h3>
    <div className="text-gray-700 dark:text-gray-300 space-y-2 leading-relaxed">{content}</div>
  </div>
);

const ScoreDisplay: React.FC<{ score: number }> = ({ score }) => {
  let colorClass = 'text-gray-800 dark:text-gray-200';
  let strokeClass = 'text-gray-200 dark:text-gray-700';
  let pathClass = 'text-purple-500';
  let bgClass = 'bg-white dark:bg-gray-800/50';
  let borderClass = 'border-gray-200 dark:border-gray-700';

  if (score >= 8) {
    colorClass = 'text-green-600 dark:text-green-400';
    pathClass = 'text-green-500 dark:text-green-400';
    bgClass = 'bg-green-50/50 dark:bg-green-900/10';
    borderClass = 'border-green-200 dark:border-green-800/30';
  } else if (score >= 6) {
    colorClass = 'text-yellow-600 dark:text-yellow-400';
    pathClass = 'text-yellow-500 dark:text-yellow-400';
    bgClass = 'bg-yellow-50/50 dark:bg-yellow-900/10';
    borderClass = 'border-yellow-200 dark:border-yellow-800/30';
  } else {
    colorClass = 'text-red-600 dark:text-red-400';
    pathClass = 'text-red-500 dark:text-red-400';
    bgClass = 'bg-red-50/50 dark:bg-red-900/10';
    borderClass = 'border-red-200 dark:border-red-800/30';
  }

  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 10) * circumference;

  return (
    <div className={`flex flex-col items-center justify-center p-8 rounded-2xl border ${borderClass} ${bgClass} mb-8 transform transition-all shadow-sm`}>
      <h3 className="text-lg font-bold text-gray-500 dark:text-gray-400 mb-6 uppercase tracking-widest">Performance Score</h3>
      <div className="relative w-40 h-40 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90 drop-shadow-lg">
          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke="currentColor"
            strokeWidth="10"
            fill="none"
            className="text-gray-200 dark:text-gray-700 opacity-50"
          />
          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke="currentColor"
            strokeWidth="10"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={`${pathClass} transition-all duration-1000 ease-out`}
            style={{ strokeDashoffset }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-5xl font-extrabold ${colorClass}`}>{score}</span>
          <span className="text-sm text-gray-400 dark:text-gray-500 font-medium mt-1">out of 10</span>
        </div>
      </div>
    </div>
  );
};

const MarkdownRenderer: React.FC<{ text: string }> = ({ text }) => {
    const renderContent = (content: string) => {
        return content
            .split('\n')
            .map((line, i) => {
                if (line.startsWith('* ')) {
                    return <li key={i} className="ml-5 list-disc pl-1 marker:text-purple-500 dark:marker:text-purple-400">{line.substring(2)}</li>;
                }
                if (line.startsWith('- ')) {
                    return <li key={i} className="ml-5 list-disc pl-1 marker:text-purple-500 dark:marker:text-purple-400">{line.substring(2)}</li>;
                }
                if (line.startsWith('• ')) {
                    return <li key={i} className="ml-5 list-disc pl-1 marker:text-purple-500 dark:marker:text-purple-400">{line.substring(2)}</li>;
                }
                if (line.trim() === '') {
                    return <br key={i}/>;
                }
                const parts = line.split('**');
                return (
                    <p key={i}>
                        {parts.map((part, index) => 
                            index % 2 === 1 ? <strong key={index} className="font-bold text-gray-900 dark:text-white">{part}</strong> : part
                        )}
                    </p>
                );
            }).filter(Boolean);
    };
    
    const sections = text.split('---').map(s => s.trim()).filter(Boolean);
    
    // Identify Score Section
    const scoreSectionIndex = sections.findIndex(s => {
        const lines = s.split('\n');
        return lines[0].toLowerCase().includes('performance score');
    });

    let score = 0;
    let scoreSectionFound = false;
    let filteredSections = sections;

    if (scoreSectionIndex !== -1) {
        scoreSectionFound = true;
        const scoreSection = sections[scoreSectionIndex];
        // Extract numeric score
        const match = scoreSection.match(/(\d+)\/10/);
        if (match) {
            score = parseInt(match[1], 10);
        }
        // Remove score section from list to render it separately
        filteredSections = sections.filter((_, i) => i !== scoreSectionIndex);
    }

    return (
        <div className="space-y-6">
            {scoreSectionFound && <ScoreDisplay score={score} />}
            
            <div className="grid grid-cols-1 gap-6">
                {filteredSections.map((section, index) => {
                    const lines = section.split('\n');
                    const title = lines.shift() || '';
                    // Skip if title is just "Interview Analysis: Topic" and content is empty
                    const content = lines.join('\n').trim();

                    if (title && (content || title.toLowerCase().includes('analysis'))) {
                        return <FeedbackSection key={index} title={title} content={renderContent(content)} />;
                    }
                    return null;
                })}
            </div>
        </div>
    );
};


const TranscriptSection: React.FC<{ messages: Message[] }> = ({ messages }) => (
    <div className="bg-white dark:bg-gray-800/50 p-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mt-8">
        <h3 className="text-xl font-semibold text-purple-600 dark:text-purple-300 mb-4 flex items-center gap-2">
            <span>Full Interview Transcript</span>
            <span className="text-xs font-normal text-gray-500 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full">{messages.length} turns</span>
        </h3>
        <div className="space-y-4 max-h-96 overflow-y-auto pr-4 custom-scrollbar">
            {messages.map((msg, index) => (
                <div key={index} className={`p-3 rounded-lg ${msg.sender === 'Synthia' ? 'bg-purple-50 dark:bg-purple-900/20' : 'bg-gray-50 dark:bg-gray-700/30'}`}>
                    <p className={`font-bold text-sm mb-1 ${msg.sender === 'Synthia' ? 'text-purple-600 dark:text-purple-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                        {msg.sender}
                    </p>
                    <p className="text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                </div>
            ))}
        </div>
    </div>
);


const FeedbackScreen: React.FC<FeedbackScreenProps> = ({ feedback, messages, topic, onStartNew, userName, recordingUrl }) => {

  const handleDownloadPdfReport = () => {
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    const margin = 15;
    let y = margin;

    const addTextWithWrap = (text: string, options: any = {}) => {
        const splitText = doc.splitTextToSize(text, pageWidth - margin * 2);
        const textHeight = splitText.length * (options.fontSize || 10) * 0.35; 
        
        if (y + textHeight > pageHeight - margin) {
            doc.addPage();
            y = margin;
        }
        
        doc.setFontSize(options.fontSize || 11).setFont(options.font || 'helvetica', options.style || 'normal');
        doc.text(splitText, margin, y);
        y += textHeight + (options.marginBottom || 0);
    };

    // --- Header ---
    addTextWithWrap('Synthia Performance Report', { fontSize: 22, style: 'bold', marginBottom: 5 });
    addTextWithWrap(`Candidate: ${userName}`, { fontSize: 14, marginBottom: 2 });
    addTextWithWrap(`Topic: ${topic}`, { fontSize: 14, marginBottom: 5 });
    
    // --- Score ---
    const scoreMatch = feedback.match(/Performance Score: (\d+)\/10/);
    if (scoreMatch) {
        const score = parseInt(scoreMatch[1], 10);
        let scoreColor = '#111827'; // default dark gray
        if (score >= 8) scoreColor = '#166534'; // green
        else if (score >= 6) scoreColor = '#a16207'; // yellow
        else scoreColor = '#991b1b'; // red
        
        doc.setFontSize(16).setFont('helvetica', 'bold');
        const scoreText = `Overall Score: `;
        const scoreTextWidth = doc.getTextWidth(scoreText);
        doc.text(scoreText, margin, y);
        
        doc.setTextColor(scoreColor);
        doc.text(`${score} / 10`, margin + scoreTextWidth, y);
        
        doc.setTextColor('#111827'); // reset color
        y += 10;
    }


    // --- Analysis Section ---
    addTextWithWrap('Performance Analysis', { fontSize: 18, style: 'bold' });
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;

    const sections = feedback.split('---').map(s => s.trim()).filter(Boolean);
    sections.forEach(section => {
        const lines = section.split('\n');
        const title = lines.shift() || '';
        const content = lines.join('\n').trim().replace(/(\* |- )/g, '• ');

        if (title && !title.toLowerCase().startsWith('performance score')) {
            addTextWithWrap(title, { fontSize: 14, style: 'bold', marginBottom: 3 });
            addTextWithWrap(content, { fontSize: 11, marginBottom: 8 });
        }
    });

    // --- Transcript Section ---
    if (y > pageHeight - 80) { // Check for enough space for the next section
        doc.addPage();
        y = margin;
    }
    addTextWithWrap('Full Interview Transcript', { fontSize: 18, style: 'bold' });
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;

    messages.forEach(msg => {
        addTextWithWrap(`${msg.sender}:`, { style: 'bold' });
        addTextWithWrap(msg.text, { marginBottom: 6 });
    });

    const sanitizedTopic = topic.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    doc.save(`Synthia_Report_${sanitizedTopic}.pdf`);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-8">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-indigo-500 dark:from-purple-400 dark:to-indigo-400 mb-2">
          Interview Complete
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
            Analysis for <span className="font-semibold text-gray-900 dark:text-white">{userName}</span> on <span className="font-semibold text-gray-900 dark:text-white">{topic}</span>
        </p>
      </div>

      <div className="mb-12">
         <MarkdownRenderer text={feedback} />
         {messages.length > 0 && <TranscriptSection messages={messages} />}
      </div>

       <div className="flex flex-col sm:flex-row justify-center gap-4 mb-12">
        <button
          onClick={handleDownloadPdfReport}
          className="bg-white dark:bg-gray-800 text-gray-800 dark:text-white border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 font-semibold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
        >
          <DownloadIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" /> 
          <span>Download PDF Report</span>
        </button>
        {recordingUrl && (
            <a
                href={recordingUrl}
                download={`Synthia-Interview-${topic.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.webm`}
                className="bg-white dark:bg-gray-800 text-gray-800 dark:text-white border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 font-semibold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
            >
                <DownloadIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> 
                <span>Download Video</span>
            </a>
        )}
      </div>

      <div className="text-center">
        <button
          onClick={onStartNew}
          className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold py-4 px-10 rounded-full hover:from-purple-700 hover:to-indigo-700 transition-all duration-300 transform hover:scale-105 shadow-xl hover:shadow-2xl shadow-purple-500/20"
        >
          Start a New Interview
        </button>
      </div>
    </div>
  );
};

export default FeedbackScreen;
