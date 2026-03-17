export enum AppState {
  SETUP,
  INTERVIEWING,
  FEEDBACK,
}

export interface Message {
  sender: string;
  text: string;
}

export type InterviewStatus = 'IDLE' | 'LISTENING' | 'SPEAKING' | 'THINKING';

export enum ProficiencyLevel {
  BEGINNER = 'Beginner',
  INTERMEDIATE = 'Intermediate',
  ADVANCED = 'Advanced',
  EXPERT = 'Expert',
}

export interface Skill {
  name: string;
  proficiency: ProficiencyLevel;
}

export interface KPIs {
  confidence: number;
  clarity: number;
  technical: number;
  pacing: number;
}

export interface InterviewRecord {
  id: string;
  topic: string;
  userName: string;
  yearsOfExperience: number | null;
  skills: Skill[];
  interviewDetails?: string;
  date: string;
  score: number | null;
  feedback: string;
  metrics?: KPIs;
  recordingUrl?: string | null;
  resumeText?: string;
  jdText?: string;
  transcript: Message[];
}

export interface DeviceInfo {
  id: string;
  label: string;
}