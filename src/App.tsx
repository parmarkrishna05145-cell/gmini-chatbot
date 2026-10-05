import React, { useState, useEffect, useRef } from 'react';
import {
  BookOpen,
  Sparkles,
  Send,
  Copy,
  Check,
  RotateCcw,
  AlertCircle,
  Loader2,
  Lightbulb,
  Mic,
  MicOff,
  Globe,
  Bookmark,
  BookmarkCheck,
  History,
  Trash2,
  LogIn,
  LogOut,
  ExternalLink,
  ChevronRight,
  X,
} from 'lucide-react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, loginWithGoogle, logout } from './lib/firebase';
import {
  saveStudyNote,
  toggleBookmarkNote,
  removeStudyNote,
  subscribeToUserNotes,
  StudyNoteItem,
} from './lib/studyNotes';

const SAMPLE_QUESTIONS = [
  'Explain photosynthesis in simple terms with an everyday analogy.',
  'What is the difference between speed and velocity?',
  'Why do we have seasons on Earth?',
  'Give me 3 practical study tips to prepare for exams.',
];

/**
 * Helper to render formatted study answers with support for
 * headings, bullet points, bold text, blockquotes, and code blocks.
 */
function FormattedAnswer({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <div className="space-y-3 text-slate-800 leading-relaxed text-base">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={idx} className="h-2" />;
        }

        if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
          return <hr key={idx} className="border-slate-200 my-2" />;
        }

        if (trimmed.startsWith('> ')) {
          return (
            <div
              key={idx}
              className="bg-indigo-50/70 border-l-4 border-indigo-500 text-indigo-950 p-3 rounded-r-lg text-sm font-medium my-2"
            >
              {renderInlineStyles(trimmed.replace(/^>\s+/, ''))}
            </div>
          );
        }

        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={idx} className="text-base font-bold text-slate-900 pt-2">
              {renderInlineStyles(trimmed.replace(/^###\s+/, ''))}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={idx} className="text-lg font-bold text-indigo-950 pt-2 border-b border-indigo-100 pb-1">
              {renderInlineStyles(trimmed.replace(/^##\s+/, ''))}
            </h3>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={idx} className="text-xl font-extrabold text-indigo-950 pt-3">
              {renderInlineStyles(trimmed.replace(/^#\s+/, ''))}
            </h2>
          );
        }

        if (/^[-*•]\s+/.test(trimmed)) {
          const content = trimmed.replace(/^[-*•]\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-2.5 pl-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0" />
              <div className="flex-1">{renderInlineStyles(content)}</div>
            </div>
          );
        }

        const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numberedMatch) {
          return (
            <div key={idx} className="flex items-start gap-2.5 pl-2">
              <span className="font-semibold text-indigo-600 text-sm mt-0.5 shrink-0 min-w-5">
                {numberedMatch[1]}.
              </span>
              <div className="flex-1">{renderInlineStyles(numberedMatch[2])}</div>
            </div>
          );
        }

        if (trimmed.startsWith('```') && trimmed.endsWith('```') && trimmed.length > 6) {
          const code = trimmed.slice(3, -3);
          return (
            <pre key={idx} className="bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto text-xs font-mono">
              <code>{code}</code>
            </pre>
          );
        }

        return <p key={idx}>{renderInlineStyles(line)}</p>;
      })}
    </div>
  );
}

function renderInlineStyles(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={index}
          className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-sm font-mono border border-indigo-100"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<{ title: string; uri: string }[]>([]);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [isCurrentSaved, setIsCurrentSaved] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [useSearch, setUseSearch] = useState(false);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // User saved study notes from Firestore
  const [savedNotes, setSavedNotes] = useState<StudyNoteItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Monitor Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to user study notes from Firestore when user is authenticated
  useEffect(() => {
    if (!user) {
      setSavedNotes([]);
      return;
    }

    const unsubscribe = subscribeToUserNotes(user.uid, (notes) => {
      setSavedNotes(notes);
    });

    return () => unsubscribe();
  }, [user]);

  // Audio Recording with Microphone
  const startRecording = async () => {
    setErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        // Stop audio tracks
        stream.getTracks().forEach((track) => track.stop());

        // Convert to base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Data = (reader.result as string)?.split(',')[1];
          if (!base64Data) return;

          setIsTranscribing(true);
          try {
            const res = await fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioData: base64Data, mimeType: 'audio/webm' }),
            });
            const data = await res.json();
            if (data.transcript) {
              setQuestion((prev) => (prev ? `${prev} ${data.transcript}` : data.transcript));
            } else if (data.error) {
              setErrorMessage(data.error);
            }
          } catch (err: any) {
            setErrorMessage('Audio transcription failed. Please try speaking again.');
          } finally {
            setIsTranscribing(false);
          }
        };
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone error:', err);
      setErrorMessage('Microphone access denied or not supported on this device.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Submit Question to Gemini
  const handleAsk = async (e?: React.FormEvent, customQuestion?: string) => {
    if (e) e.preventDefault();

    const queryToAsk = (customQuestion ?? question).trim();
    if (!queryToAsk) return;

    if (customQuestion) {
      setQuestion(customQuestion);
    }

    setIsLoading(true);
    setErrorMessage(null);
    setAnswer(null);
    setSources([]);
    setCurrentNoteId(null);
    setIsCurrentSaved(false);

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: queryToAsk, useSearch }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch an answer. Please try again.');
      }

      setAnswer(data.answer);
      if (data.sources) {
        setSources(data.sources);
      }

      // Automatically persist to Firestore if user is authenticated
      if (user) {
        try {
          const noteId = await saveStudyNote(user.uid, queryToAsk, data.answer, 'Study Assistant', false);
          if (noteId) {
            setCurrentNoteId(noteId);
          }
        } catch (dbErr) {
          console.warn('Could not save note to Firestore:', dbErr);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Something went wrong while connecting to the assistant.');
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle Bookmark for current note
  const handleToggleCurrentBookmark = async () => {
    if (!user) {
      // Prompt user to sign in
      try {
        await loginWithGoogle();
      } catch {
        return;
      }
      return;
    }

    if (currentNoteId) {
      try {
        await toggleBookmarkNote(currentNoteId, isCurrentSaved);
        setIsCurrentSaved(!isCurrentSaved);
      } catch (err) {
        console.error('Bookmark toggle failed:', err);
      }
    } else if (question && answer) {
      try {
        const noteId = await saveStudyNote(user.uid, question, answer, 'Study Assistant', true);
        if (noteId) {
          setCurrentNoteId(noteId);
          setIsCurrentSaved(true);
        }
      } catch (err) {
        console.error('Save failed:', err);
      }
    }
  };

  const handleCopy = async () => {
    if (!answer) return;
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  const handleReset = () => {
    setQuestion('');
    setAnswer(null);
    setSources([]);
    setCurrentNoteId(null);
    setIsCurrentSaved(false);
    setErrorMessage(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  const selectHistoryNote = (note: StudyNoteItem) => {
    setQuestion(note.question);
    setAnswer(note.answer);
    setCurrentNoteId(note.id);
    setIsCurrentSaved(note.isSaved);
    setShowHistory(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/40 via-slate-50 to-white text-slate-900 flex flex-col justify-between selection:bg-indigo-100 selection:text-indigo-900 font-sans">
      {/* Top Header */}
      <header className="border-b border-indigo-100/80 bg-white/90 backdrop-blur-md sticky top-0 z-20 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg text-slate-900 tracking-tight">AI Study Assistant</h1>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                  Gemini
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Clear explanations, step-by-step guidance & study notes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* History Toggle Button */}
            {user && (
              <button
                onClick={() => setShowHistory(true)}
                className="relative inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-indigo-700 bg-slate-100 hover:bg-indigo-50 px-3 py-1.5 rounded-lg border border-slate-200 transition"
                title="View study history"
              >
                <History className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">My Notes</span>
                {savedNotes.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-bold">
                    {savedNotes.length}
                  </span>
                )}
              </button>
            )}

            {/* Auth Button */}
            {authLoading ? (
              <div className="w-7 h-7 rounded-full bg-slate-200 animate-pulse" />
            ) : user ? (
              <div className="flex items-center gap-2 pl-1 border-l border-slate-200">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    className="w-8 h-8 rounded-full border border-indigo-200 object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
                    {user.email?.charAt(0).toUpperCase()}
                  </div>
                )}
                <button
                  onClick={() => logout()}
                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 transition"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => loginWithGoogle()}
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 px-3 py-1.5 rounded-lg shadow-xs transition"
              >
                <LogIn className="w-3.5 h-3.5 text-indigo-600" />
                <span>Sign in with Google</span>
              </button>
            )}

            {(answer || question) && (
              <button
                onClick={handleReset}
                className="text-xs font-medium text-slate-600 hover:text-indigo-600 p-2 rounded-lg border border-slate-200 hover:border-indigo-200 transition-colors bg-white"
                title="New question"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6">
        {/* Intro Banner */}
        {!answer && !isLoading && (
          <section className="text-center py-2 sm:py-4">
            <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-medium mb-3">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Personalized 24/7 AI study partner</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              What do you want to master today?
            </h2>
            <p className="mt-2 text-sm sm:text-base text-slate-600 max-w-lg mx-auto">
              Ask any homework question, concept explanation, or exam prep topic.
            </p>
          </section>
        )}

        {/* Question Input Card */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 transition hover:shadow-md">
          <form onSubmit={handleAsk} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label htmlFor="question-input" className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <span>Enter your question</span>
              </label>

              <div className="flex items-center gap-2">
                {/* Search Grounding Toggle */}
                <button
                  type="button"
                  onClick={() => setUseSearch(!useSearch)}
                  className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium transition cursor-pointer ${
                    useSearch
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 border border-transparent'
                  }`}
                  title="Search live web data using Google Search Grounding"
                >
                  <Globe className="w-3 h-3 text-blue-600" />
                  <span>Google Search</span>
                </button>
              </div>
            </div>

            <div className="relative">
              <textarea
                id="question-input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. How does photosynthesis work? Explain step-by-step with an analogy."
                rows={3}
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 pr-12 text-slate-800 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-3 focus:ring-indigo-100 outline-none transition text-sm sm:text-base"
                disabled={isLoading}
              />

              {/* Voice / Mic Button */}
              <div className="absolute right-3 bottom-3.5 flex items-center gap-1">
                {isRecording ? (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="p-2 rounded-lg bg-red-500 hover:bg-red-600 text-white animate-pulse shadow-sm transition"
                    title="Stop recording"
                  >
                    <MicOff className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={isTranscribing}
                    className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                    title="Speak your question (Microphone transcription)"
                  >
                    {isTranscribing ? (
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    ) : (
                      <Mic className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {isRecording && (
              <div className="flex items-center gap-2 text-xs font-semibold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                <span>Listening to your question... Click mic again when finished.</span>
              </div>
            )}

            {isTranscribing && (
              <div className="flex items-center gap-2 text-xs font-medium text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Transcribing audio with Gemini...</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>
                  {useSearch ? 'Search Grounding enabled for fresh web facts.' : 'Ask for analogies, summaries, or practice quizzes!'}
                </span>
              </div>

              <button
                type="submit"
                disabled={isLoading || !question.trim()}
                className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium text-sm px-6 py-2.5 rounded-xl shadow-xs transition duration-150 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Thinking...</span>
                  </>
                ) : (
                  <>
                    <span>Ask</span>
                    <Send className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Quick sample prompts when input is empty and no answer is displayed */}
          {!answer && !isLoading && (
            <div className="mt-5 pt-4 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-500 mb-2.5">Try one of these sample questions:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SAMPLE_QUESTIONS.map((sample, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleAsk(undefined, sample)}
                    className="text-left text-xs text-slate-700 bg-slate-50 hover:bg-indigo-50/80 hover:text-indigo-900 border border-slate-200/80 hover:border-indigo-200 p-2.5 rounded-xl transition duration-150 cursor-pointer"
                  >
                    "{sample}"
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Error Alert */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 text-red-800 text-sm">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Could not get an answer</p>
              <p className="text-red-700 text-xs mt-0.5">{errorMessage}</p>
            </div>
            <button
              onClick={() => handleAsk()}
              className="text-xs font-semibold text-red-700 hover:text-red-900 underline shrink-0 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading State Skeleton */}
        {isLoading && (
          <div className="bg-white rounded-2xl border border-indigo-100 p-6 shadow-xs animate-pulse space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
              </div>
              <div className="space-y-1">
                <div className="h-4 w-32 bg-indigo-100 rounded"></div>
                <div className="h-3 w-48 bg-slate-100 rounded"></div>
              </div>
            </div>
            <div className="space-y-2.5 pt-2">
              <div className="h-4 bg-slate-100 rounded w-full"></div>
              <div className="h-4 bg-slate-100 rounded w-5/6"></div>
              <div className="h-4 bg-slate-100 rounded w-4/6"></div>
              <div className="h-4 bg-slate-100 rounded w-3/4"></div>
            </div>
          </div>
        )}

        {/* Answer Display Card */}
        {answer && !isLoading && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-7 relative transition-all">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Study Explanation</h3>
                  <p className="text-xs text-slate-400">
                    Powered by Gemini {useSearch && '• Grounded with Google Search'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Save/Bookmark Note */}
                <button
                  type="button"
                  onClick={handleToggleCurrentBookmark}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition cursor-pointer ${
                    isCurrentSaved
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-slate-50 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border-slate-200'
                  }`}
                  title={user ? 'Save / bookmark this explanation' : 'Sign in to save this note'}
                >
                  {isCurrentSaved ? (
                    <>
                      <BookmarkCheck className="w-3.5 h-3.5 text-amber-600" />
                      <span>Saved</span>
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>Save Note</span>
                    </>
                  )}
                </button>

                {/* Copy Button */}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 border border-slate-200 px-3 py-1.5 rounded-lg transition cursor-pointer"
                  title="Copy explanation"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Answer Content */}
            <FormattedAnswer text={answer} />

            {/* Grounding Sources (if available from Google Search) */}
            {sources.length > 0 && (
              <div className="mt-6 pt-4 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-blue-600" />
                  <span>Verified Search Sources:</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {sources.slice(0, 4).map((source, sIdx) => (
                    <a
                      key={sIdx}
                      href={source.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 bg-indigo-50/70 border border-indigo-100 px-2.5 py-1 rounded-lg transition"
                    >
                      <span className="truncate max-w-[200px]">{source.title}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-up question footer */}
            <div className="mt-8 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-500">
              <span>Have follow-up questions? Edit your query above or ask a new one.</span>
              <button
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  const textarea = document.getElementById('question-input');
                  textarea?.focus();
                }}
                className="text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
              >
                Ask another question ↑
              </button>
            </div>
          </section>
        )}
      </main>

      {/* Slide-out Sidebar for Study History & Saved Notes (Firestore) */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900">My Study History</h3>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {savedNotes.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Bookmark className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium">No saved study notes yet.</p>
                  <p className="text-xs mt-1">Questions you ask while signed in will appear here.</p>
                </div>
              ) : (
                savedNotes.map((note) => (
                  <div
                    key={note.id}
                    className="p-3.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition flex flex-col gap-2 group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() => selectHistoryNote(note)}
                        className="text-left font-semibold text-sm text-slate-800 hover:text-indigo-600 line-clamp-2 cursor-pointer flex-1"
                      >
                        {note.question}
                      </button>
                      <button
                        onClick={() => removeStudyNote(note.id)}
                        className="text-slate-300 hover:text-red-500 p-1 rounded transition opacity-0 group-hover:opacity-100"
                        title="Delete note"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="text-xs text-slate-500 line-clamp-2">{note.answer}</p>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                      <span>{new Date(note.createdAt).toLocaleDateString()}</span>
                      <button
                        onClick={() => toggleBookmarkNote(note.id, note.isSaved)}
                        className="flex items-center gap-1 hover:text-amber-600 transition"
                      >
                        {note.isSaved ? (
                          <BookmarkCheck className="w-3 h-3 text-amber-600" />
                        ) : (
                          <Bookmark className="w-3 h-3" />
                        )}
                        <span>{note.isSaved ? 'Bookmarked' : 'Save'}</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-100 py-4 text-center text-xs text-slate-400">
        AI Study Assistant &bull; Powered by Gemini & Firebase
      </footer>
    </div>
  );
}
