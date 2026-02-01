import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  updateProfile
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, getDoc, setDoc, addDoc, onSnapshot, updateDoc, deleteDoc, query, where, getDocs
} from 'firebase/firestore';

import { 
  LucideBookOpen, LucideEdit, LucidePlus, LucideTrash, LucideSave, LucideCheckCircle, 
  LucideCircle, LucideLogOut, LucideGraduationCap, LucideChevronRight, LucideYoutube, 
  LucideLayoutDashboard, LucidePenTool, LucideX, LucideCheckSquare, LucideSquare,
  LucideCalendar, LucideListTodo, LucideEraser, LucideSettings, LucideMoreVertical, LucideTrophy,
  LucideImage, LucideFileText, LucideLink, LucideUpload, LucideToggleLeft, LucideToggleRight,
  LucideSparkles, LucideMessageSquare, LucideBrainCircuit, LucideSend, LucideWand2,
  LucideEye, LucideEyeOff, LucideRotateCcw, LucideDownload, LucideShare, LucideLibrary, LucideActivity,
  LucideGlobe, LucideUser, LucideLock, LucideLoader, LucideAlertTriangle, LucideStar, LucideClock, LucideTarget, LucideUserPlus, LucideGamepad2, LucideBarChart3, LucideUsers
} from 'lucide-react';

// --- FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyCtT94ABzf25sxTNtaW9rrJTOuspm1cVG0",
  authDomain: "lernpfad-app-6b1d3.firebaseapp.com",
  projectId: "lernpfad-app-6b1d3",
  storageBucket: "lernpfad-app-6b1d3.firebasestorage.app",
  messagingSenderId: "867889362972",
  appId: "1:867889362972:web:5527c855f8cbad083507d9",
  measurementId: "G-V56J1PD11P"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Fallback für appId falls Umgebungsvariable fehlt
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const STUDENT_EMAIL_SUFFIX = "@student.lernpfad.local"; 

// --- GEMINI API SETUP ---
const apiKey = "AIzaSyDI-ZVJ1gmb0dhMvDiLGLEsBq1LEThTY8o"; 

// --- HELPER FUNCTIONS ---

// Schüler-Bot (Chat)
async function callGemini(prompt, context) {
  const systemPrompt = `Du bist ein freundlicher, motivierender Lern-Tutor für Schüler.
  Kontext: Der Schüler lernt gerade das Thema "${context.topic}".
  Aktuelles Kapitel: "${context.chapter}".
  Erklärungstext im Lehrmaterial: "${context.text}".
   
  Deine Regeln:
  1. Antworte kurz, einfach und kindgerecht.
  2. Nutze Emojis 🌟.
  3. Verrate bei Aufgaben NICHT sofort die Lösung, sondern gib Tipps zur Lösungsfindung.
  4. Wenn gefragt wird "Erkläre es einfacher", nutze anschauliche Metaphern aus dem Alltag.
  5. Wenn gefragt wird "Wofür brauche ich das?", nenne ein cooles Beispiel aus dem Alltag (Gaming, Social Media, Geld, Sport).`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] }
      })
    });
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Entschuldigung, ich habe gerade Verbindungsprobleme. 🤖";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Fehler beim Verbinden mit dem Lern-Buddy. Prüfe dein Internet.";
  }
}

// Lehrer-Generator (Text)
async function generateExplanationText(topicTitle, chapterTitle, customInstruction) {
  const systemPrompt = `Du bist ein erfahrener Lehrer, der Lehrmaterial für Schüler erstellt.
  Deine Aufgabe ist es, einen verständlichen, kindgerechten Erklärungstext für ein neues Kapitel zu schreiben.
   
  Oberthema: "${topicTitle}"
  Kapitel: "${chapterTitle}"
   
  ${customInstruction ? `WICHTIGE LEHRER-ANWEISUNG: "${customInstruction}"` : ""}
   
  Anforderungen:
  1. Erkläre das Konzept einfach und anschaulich.
  2. Nutze UNBEDINGT ein konkretes Beispiel aus dem Alltag.
  3. Sprich den Schüler direkt mit "Du" an.
  4. Halte den Text kompakt (ca. 80-120 Wörter).
  5. Keine Überschriften, nur der reine Fließtext.`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Bitte erstelle den Erklärungstext." }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] }
      })
    });
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } catch (error) {
    console.error("Gemini Gen Error:", error);
    return null;
  }
}

// Lehrer-Generator (Aufgaben)
async function generateTasks(topicTitle, chapterTitle) {
  const prompt = `Erstelle 3 konkrete, abwechslungsreiche Übungsaufgaben für Schüler zum Thema "${topicTitle}: ${chapterTitle}".
  Gib NUR ein valides JSON-Array aus Strings zurück. Keine Formatierung, kein Markdown.
  Beispiel: ["Berechne x wenn 2x = 10", "Nenne drei Beispiele für...", "Ein Auto fährt 100km..."]`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return JSON.parse(text);
  } catch (e) {
    console.error("Task Gen Error", e);
    return [];
  }
}

const DEFAULT_THRESHOLDS = { 1: 90, 2: 75, 3: 60, 4: 45, 5: 20 };

// --- MAIN APP COMPONENT ---
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing');
  const [activeCourse, setActiveCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState(null); 

  useEffect(() => {
    const initAuth = async () => {
      // Warte auf Auth State, kein erzwungener Login hier
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });

    return () => unsubscribe();
  }, []);

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50 text-indigo-600 animate-pulse">Lade Lernpfad...</div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-indigo-100">
      {view === 'landing' && <LandingPage setView={setView} user={user} deferredPrompt={deferredPrompt} />}
      {view === 'auth' && <TeacherAuth setView={setView} />}
      {view === 'student-auth' && <StudentAuth setView={setView} />}
      {view === 'teacher-dash' && <TeacherDashboard user={user} setView={setView} setActiveCourse={setActiveCourse} />}
      {view === 'course-editor' && <CourseEditor user={user} course={activeCourse} setView={setView} />}
      {view === 'teacher-analytics' && <TeacherAnalytics user={user} course={activeCourse} setView={setView} />}
      {view === 'student-enter' && <StudentEntry setView={setView} setActiveCourse={setActiveCourse} user={user} />}
      {view === 'student-view' && <StudentLernpfad user={user} course={activeCourse} setView={setView} />}
    </div>
  );
}

// --- VERBESSERTE TEACHER ANALYTICS MIT ANGEMELDETEN SCHÜLERN ---
function TeacherAnalytics({ user, course, setView }) {
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        const q = query(
            collection(db, 'artifacts', appId, 'public', 'data', 'student_progress'), 
            where("courseId", "==", course.id)
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const studentData = snapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data() 
            }));
            
            // Sortiere nach letztem Update (neueste zuerst)
            studentData.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
            
            setStudents(studentData);
            setLoading(false);
        }, (error) => {
            console.error("Fehler beim Laden der Schüler:", error);
            setLoading(false);
        });
        
        return () => unsubscribe();
    }, [course.id]);
    
    const calculateGrade = (percentage) => {
        const thresholds = course.settings?.gradeThresholds || DEFAULT_THRESHOLDS;
        if (percentage >= thresholds[1]) return 1;
        if (percentage >= thresholds[2]) return 2;
        if (percentage >= thresholds[3]) return 3;
        if (percentage >= thresholds[4]) return 4;
        if (percentage >= thresholds[5]) return 5;
        return 6;
    };
    
    const getStatusColor = (percentage) => {
        if (percentage >= 75) return 'bg-green-100 text-green-700 border-green-200';
        if (percentage >= 50) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
        if (percentage >= 25) return 'bg-orange-100 text-orange-700 border-orange-200';
        return 'bg-red-100 text-red-700 border-red-200';
    };
    
    const formatDate = (timestamp) => {
        if (!timestamp) return 'Noch nicht aktiv';
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Gerade eben';
        if (diffMins < 60) return `Vor ${diffMins} Min.`;
        if (diffHours < 24) return `Vor ${diffHours} Std.`;
        if (diffDays < 7) return `Vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`;
        return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };
    
    const getInitials = (name) => {
        if (!name) return '?';
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    };
    
    const averageProgress = students.length > 0 
        ? Math.round(students.reduce((sum, s) => sum + (s.percentage || 0), 0) / students.length)
        : 0;
    
    return (
        <div className="h-screen flex flex-col bg-slate-50">
            <div className="bg-white border-b px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => setView('teacher-dash')} 
                        className="p-2 hover:bg-slate-100 rounded-full transition"
                    >
                        <LucideChevronRight className="rotate-180" />
                    </button>
                    <div>
                        <h2 className="font-extrabold text-xl text-slate-800 tracking-tight">
                            {course.title}
                        </h2>
                        <p className="text-xs text-slate-500">Kurs-Statistik & Teilnehmer</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <div className="text-xs text-slate-400 font-bold uppercase">Kurscode</div>
                        <div className="text-sm font-mono font-bold text-indigo-600">
                            {course.id.slice(0, 6).toUpperCase()}
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
                {/* Statistik-Übersicht */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-6 rounded-2xl shadow-lg text-white">
                        <div className="flex items-center gap-3 mb-2">
                            <LucideUsers size={24} />
                            <h3 className="font-bold text-sm opacity-90">Teilnehmer</h3>
                        </div>
                        <div className="text-4xl font-black">{students.length}</div>
                        <div className="text-xs opacity-75 mt-1">
                            {students.filter(s => s.percentage > 0).length} aktiv
                        </div>
                    </div>
                    
                    <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 rounded-2xl shadow-lg text-white">
                        <div className="flex items-center gap-3 mb-2">
                            <LucideActivity size={24} />
                            <h3 className="font-bold text-sm opacity-90">Ø Fortschritt</h3>
                        </div>
                        <div className="text-4xl font-black">{averageProgress}%</div>
                        <div className="text-xs opacity-75 mt-1">
                            Durchschnitt aller Schüler
                        </div>
                    </div>
                    
                    <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-6 rounded-2xl shadow-lg text-white">
                        <div className="flex items-center gap-3 mb-2">
                            <LucideTrophy size={24} />
                            <h3 className="font-bold text-sm opacity-90">Top-Note</h3>
                        </div>
                        <div className="text-4xl font-black">
                            {students.length > 0 
                                ? calculateGrade(Math.max(...students.map(s => s.percentage || 0)))
                                : '-'
                            }
                        </div>
                        <div className="text-xs opacity-75 mt-1">
                            Beste Leistung
                        </div>
                    </div>
                </div>
                
                {/* Schüler-Liste */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                        <h3 className="font-bold text-lg flex items-center gap-2">
                            <LucideUsers size={20} className="text-indigo-600" />
                            Angemeldete Schüler
                        </h3>
                    </div>
                    
                    {loading ? (
                        <div className="text-center py-20 text-slate-400">
                            <LucideLoader className="animate-spin mx-auto mb-2" size={32} />
                            Lade Daten...
                        </div>
                    ) : students.length === 0 ? (
                        <div className="text-center py-20">
                            <LucideUserPlus size={48} className="text-slate-300 mx-auto mb-4" />
                            <p className="text-slate-400 font-medium">Noch keine Schüler beigetreten</p>
                            <p className="text-sm text-slate-300 mt-2">
                                Teile den Kurscode <span className="font-mono font-bold text-indigo-500">
                                    {course.id.slice(0, 6).toUpperCase()}
                                </span> mit deinen Schülern
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {students.map((s, idx) => {
                                const percentage = s.percentage || 0;
                                const grade = calculateGrade(percentage);
                                
                                return (
                                    <div 
                                        key={s.id} 
                                        className="px-6 py-4 hover:bg-slate-50 transition flex items-center gap-4"
                                    >
                                        {/* Avatar */}
                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg flex-shrink-0">
                                            {getInitials(s.studentName || 'Unbekannt')}
                                        </div>
                                        
                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-slate-800 truncate">
                                                {s.studentName || 'Unbekannt'}
                                            </div>
                                            <div className="text-xs text-slate-400 flex items-center gap-2">
                                                <LucideClock size={12} />
                                                {formatDate(s.lastUpdated)}
                                            </div>
                                        </div>
                                        
                                        {/* Progress */}
                                        <div className="text-right flex-shrink-0">
                                            <div className="flex items-center gap-3">
                                                {/* Fortschrittsbalken */}
                                                <div className="hidden sm:block w-32">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-[10px] font-bold text-slate-400">
                                                            Fortschritt
                                                        </span>
                                                        <span className="text-xs font-bold text-slate-600">
                                                            {percentage}%
                                                        </span>
                                                    </div>
                                                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                                        <div 
                                                            className={`h-2 rounded-full transition-all duration-500 ${
                                                                percentage >= 75 ? 'bg-green-500' :
                                                                percentage >= 50 ? 'bg-yellow-500' :
                                                                percentage >= 25 ? 'bg-orange-500' : 'bg-red-500'
                                                            }`}
                                                            style={{ width: `${percentage}%` }}
                                                        />
                                                    </div>
                                                </div>
                                                
                                                {/* Note */}
                                                <div className={`px-4 py-2 rounded-xl font-black text-lg border-2 ${getStatusColor(percentage)}`}>
                                                    Note {grade}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function StudentAuth({ setView }) {
    const [isLogin, setIsLogin] = useState(true); const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState("");
    const handleAuth = async (e) => { e.preventDefault(); setError(""); const email = `${username.trim().toLowerCase().replace(/\s+/g, '.')}${STUDENT_EMAIL_SUFFIX}`; try { if (isLogin) { await signInWithEmailAndPassword(auth, email, password); } else { const cred = await createUserWithEmailAndPassword(auth, email, password); await updateProfile(cred.user, { displayName: username }); } setView('student-enter'); } catch (err) { setError("Fehler: " + err.message); } };
    return (<div className="h-screen flex flex-col items-center justify-center p-6 bg-slate-50"><button onClick={() => setView('landing')} className="absolute top-6 left-6 text-slate-400"><LucideChevronRight className="rotate-180"/></button><div className="w-full max-w-sm bg-white p-8 rounded-3xl shadow-xl"><h2 className="text-3xl font-black text-center mb-8">{isLogin ? 'Schüler Login' : 'Konto erstellen'}</h2><form onSubmit={handleAuth} className="space-y-4"><input type="text" required value={username} onChange={e => setUsername(e.target.value)} className="w-full border p-3 rounded-xl" placeholder="Benutzername" /><input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full border p-3 rounded-xl" placeholder="Passwort" /><button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl">{isLogin ? 'Los' : 'Erstellen'}</button></form>{error && <p className="text-red-500 text-sm mt-4 text-center">{error}</p>}<div className="mt-6 text-center"><button onClick={() => setIsLogin(!isLogin)} className="text-sm text-indigo-600 font-bold hover:underline">{isLogin ? 'Konto erstellen' : 'Anmelden'}</button></div></div></div>);
}

function TeacherAuth({ setView }) {
    const [isLogin, setIsLogin] = useState(true); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState("");
    const handleAuth = async (e) => { e.preventDefault(); setError(""); try { if (isLogin) await signInWithEmailAndPassword(auth, email, password); else await createUserWithEmailAndPassword(auth, email, password); setView('teacher-dash'); } catch (err) { setError("Login Fehler"); } };
    return (<div className="h-screen flex flex-col items-center justify-center p-6"><button onClick={() => setView('landing')} className="absolute top-6 left-6 text-slate-400"><LucideChevronRight className="rotate-180"/></button><div className="w-full max-w-sm bg-white p-8 rounded-3xl shadow-xl"><h2 className="text-3xl font-black text-center mb-8">{isLogin ? 'Lehrer Login' : 'Konto erstellen'}</h2><form onSubmit={handleAuth} className="space-y-4"><input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full border p-3 rounded-xl" placeholder="Email" /><input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full border p-3 rounded-xl" placeholder="Passwort" /><button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl">{isLogin ? 'Anmelden' : 'Registrieren'}</button></form>{error && <p className="text-red-500 text-sm mt-4 text-center">{error}</p>}<div className="mt-6 text-center"><button onClick={() => setIsLogin(!isLogin)} className="text-sm text-indigo-600 font-bold hover:underline">{isLogin ? 'Registrieren' : 'Anmelden'}</button></div></div></div>);
}

function LandingPage({ setView, user, deferredPrompt }) {
  const handleInstall = async () => { if (deferredPrompt) { deferredPrompt.prompt(); const { outcome } = await deferredPrompt.userChoice; if (outcome === 'accepted') setDeferredPrompt(null); } else { alert("Zum Home-Bildschirm hinzufügen"); } };
  const startAnonymous = async () => { if (!user) { try { await signInAnonymously(auth); } catch(e) { alert("Fehler: " + e.message); } } setView('student-enter'); };
  return (<div className="flex flex-col items-center justify-center h-screen p-6 text-center bg-slate-50"><h1 className="text-6xl font-black text-indigo-600 mb-4">Lernpfad</h1><div className="flex flex-col gap-4 w-full max-w-sm"><div className="bg-white p-4 rounded-xl shadow-lg"><h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Schüler</h3><button onClick={() => setView('student-auth')} className="w-full bg-indigo-50 text-indigo-600 p-4 rounded-lg font-bold mb-2">Anmelden / Registrieren</button><button onClick={startAnonymous} className="w-full border p-4 rounded-lg font-bold text-slate-600">Als Gast starten</button></div><button onClick={() => setView('auth')} className="bg-slate-900 text-white p-4 rounded-xl font-bold">Lehrer-Login</button></div><button onClick={handleInstall} className="mt-10 text-indigo-600 text-sm font-bold flex gap-2 items-center"><LucideDownload size={16}/> App installieren</button></div>);
}

function TeacherDashboard({ user, setView, setActiveCourse }) {
  const [courses, setCourses] = useState([]); const [showCreateModal, setShowCreateModal] = useState(false); const [newTitle, setNewTitle] = useState("");
  useEffect(() => { if (!user) return; const q = collection(db, 'artifacts', appId, 'public', 'data', 'courses'); const unsubscribe = onSnapshot(q, (snapshot) => { setCourses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(c => c.ownerId === user.uid)); }); return () => unsubscribe(); }, [user]);
  const handleCreate = async () => { if (!newTitle) return; await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'courses'), { title: newTitle, ownerId: user.uid, createdAt: Date.now(), topics: [], settings: { showGrades: true, gradeThresholds: DEFAULT_THRESHOLDS } }); setNewTitle(""); setShowCreateModal(false); };
  const handleDelete = async (id) => { if (confirm("Löschen?")) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'courses', id)); };
  return (<div className="p-6 max-w-4xl mx-auto"><div className="flex justify-between mb-8"><h2 className="text-3xl font-black">Kurse</h2><button onClick={async () => { await signOut(auth); setView('landing'); }} className="text-slate-400"><LucideLogOut/></button></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><button onClick={() => setShowCreateModal(true)} className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-slate-400 flex flex-col items-center justify-center h-40"><LucidePlus size={32}/>Neuer Kurs</button>{courses.map(c => (<div key={c.id} className="bg-white p-6 rounded-2xl shadow-sm border h-40 flex flex-col justify-between"><div><h3 className="font-bold text-lg">{c.title}</h3><div className="text-xs bg-slate-100 px-2 py-1 rounded inline-block font-mono text-slate-500">{c.id.slice(0,6).toUpperCase()}</div></div><div className="flex gap-2"><button onClick={() => { setActiveCourse(c); setView('course-editor'); }} className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-bold">Bearbeiten</button><button onClick={() => { setActiveCourse(c); setView('teacher-analytics'); }} className="bg-indigo-50 text-indigo-600 p-2 rounded-lg"><LucideBarChart3/></button><button onClick={() => handleDelete(c.id)} className="text-slate-300 p-2"><LucideTrash/></button></div></div>))}</div>{showCreateModal && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"><div className="bg-white p-6 rounded-xl w-full max-w-sm"><h3 className="font-bold mb-4">Neuer Kurs</h3><input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full border p-3 rounded-xl mb-4" placeholder="Name" /><div className="flex gap-2"><button onClick={() => setShowCreateModal(false)} className="flex-1 py-3 text-slate-500 font-bold">Abbrechen</button><button onClick={handleCreate} className="flex-1 bg-indigo-600 text-white font-bold rounded-xl">Erstellen</button></div></div></div>)}</div>);
}

function CourseEditor({ user, course, setView }) {
    const [topics, setTopics] = useState(course.topics || []); const [settings, setSettings] = useState(course.settings || { showGrades: true, gradeThresholds: DEFAULT_THRESHOLDS });
    const saveChanges = async () => { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'courses', course.id), { topics, settings }); };
    return (<div className="h-screen flex flex-col bg-slate-100"><div className="bg-white border-b p-4 flex justify-between items-center"><button onClick={() => setView('teacher-dash')}><LucideChevronRight className="rotate-180"/></button><h2 className="font-bold">{course.title}</h2><button onClick={saveChanges} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold">Speichern</button></div><div className="flex-1 overflow-y-auto p-6 flex justify-center text-slate-400">Editor hier (gekürzt)</div></div>);
}

function StudentEntry({ setView, setActiveCourse, user }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  const joinCourse = async () => {
    if(!code) return;
    setIsJoining(true);
    setError("");

    try {
      let currentUser = auth.currentUser;
      if (!currentUser) {
          try {
             const cred = await signInAnonymously(auth);
             currentUser = cred.user;
          } catch(e) {
             throw new Error("Anmeldung fehlgeschlagen: " + e.message);
          }
      }

      const q = collection(db, 'artifacts', appId, 'public', 'data', 'courses');
      
      const snapshot = await new Promise((resolve, reject) => {
          const unsubscribe = onSnapshot(q, (snap) => {
              unsubscribe();
              resolve(snap);
          }, (err) => {
              unsubscribe();
              reject(err);
          });
      });
      
      const courseDoc = snapshot.docs.find(doc => doc.id.toUpperCase().startsWith(code.toUpperCase()));
      
      if (courseDoc) {
        try {
            const studentId = currentUser.uid;
            const studentName = currentUser.displayName || (currentUser.isAnonymous ? "Gast" : currentUser.email.split('@')[0]);
            
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'student_progress', `${courseDoc.id}_${studentId}`), {
                courseId: courseDoc.id,
                studentId: studentId,
                studentName: studentName,
                percentage: 0,
                lastUpdated: Date.now()
            }, { merge: true });
        } catch(e) {
            console.warn("Statistik-Update fehlgeschlagen (ignoriert):", e);
        }

        setActiveCourse({ id: courseDoc.id, ...courseDoc.data() });
        setView('student-view');
      } else { 
          setError("Kurs nicht gefunden."); 
      }
    } catch (e) { 
        console.error(e);
        setError("Fehler beim Beitreten: " + e.message); 
    } finally {
        setIsJoining(false);
    }
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center p-6 bg-slate-900 text-white relative">
      <button onClick={() => setView('landing')} className="absolute top-6 left-6 text-slate-500 hover:text-white"><LucideChevronRight className="rotate-180"/></button>
      
      {user && !user.isAnonymous && (
          <div className="absolute top-6 right-6 flex items-center gap-2">
              <div className="text-right">
                  <div className="text-xs text-slate-400 font-bold uppercase">Angemeldet als</div>
                  <div className="text-sm font-bold text-white">{user.displayName || user.email.split('@')[0]}</div>
              </div>
              <div className="bg-indigo-500 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg">
                  {(user.displayName || user.email || "U")[0].toUpperCase()}
              </div>
          </div>
      )}

      <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-indigo-200 mb-8 tracking-tight">Kurscode</h2>
      <div className="w-full max-w-xs">
        <input 
          type="text" 
          value={code} 
          onChange={(e) => setCode(e.target.value)} 
          placeholder="z.B. 3F8A2C" 
          className="w-full bg-slate-800 border-2 border-slate-700 p-4 rounded-xl text-center text-2xl font-mono tracking-widest uppercase mb-4 focus:border-indigo-500 outline-none text-white placeholder-slate-600" 
        />
        <button onClick={joinCourse} disabled={isJoining} className="w-full bg-indigo-600 py-4 rounded-xl font-bold hover:bg-indigo-500 transition shadow-lg shadow-indigo-900/50 flex justify-center items-center gap-2">
            {isJoining ? <LucideLoader className="animate-spin"/> : "Beitreten 🚀"}
        </button>
        {error && <p className="text-red-400 text-center mt-4 text-sm">{error}</p>}
      </div>
    </div>
  );
}

function StudentLernpfad({ user, course, setView }) {
  const [progress, setProgress] = useState({}); 
  const [activeTopic, setActiveTopic] = useState(null);
  const [activeChapter, setActiveChapter] = useState(null);
  const [activeTaskId, setActiveTaskId] = useState(null); 
  const [showSigModal, setShowSigModal] = useState(false);
  const [examDate, setExamDate] = useState(""); 
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiMessages, setAiMessages] = useState([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [activeTool, setActiveTool] = useState(null); 
  const [homework, setHomework] = useState([]);
  const [events, setEvents] = useState([]);

  const sigCanvasRef = useRef(null);
  const scratchCanvasRef = useRef(null);
  const chatEndRef = useRef(null);
  const showGrades = course.settings?.showGrades !== false;
  const thresholds = course.settings?.gradeThresholds || DEFAULT_THRESHOLDS;

  useEffect(() => {
    const unsubCourse = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'courses', course.id), (doc) => { });
    if(user) {
        const progRef = doc(db, 'artifacts', appId, 'users', user.uid, 'progress', course.id);
        getDoc(progRef).then(snap => { if(snap.exists()) setProgress(snap.data().completed || {}); });
    }
    setHomework(JSON.parse(localStorage.getItem('homework') || '[]'));
    setEvents(JSON.parse(localStorage.getItem('events') || '[]'));
    return () => unsubCourse();
  }, [course.id, user]);

  useEffect(() => {
    if(activeTopic) {
        setExamDate(localStorage.getItem(`exam_date_${course.id}_${activeTopic.id}`) || "");
    }
  }, [activeTopic, course.id]);

  useEffect(() => {
    if(showAiModal && activeChapter && aiMessages.length === 0) {
        setAiMessages([{role: 'model', text: `Hallo! Ich bin dein Lern-Buddy für das Kapitel "${activeChapter.title}". Wo hängst du gerade? 👋`}]);
    }
  }, [showAiModal, activeChapter]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [aiMessages]);

  const calculateGlobalProgress = (currentProgress) => {
      let totalTasks = 0; let doneTasks = 0;
      (course.topics || []).forEach(topic => {
          topic.chapters.forEach(c => {
              const tasks = c.tasks || (c.task ? [{id: c.id, ...c}] : []);
              totalTasks += tasks.length;
              tasks.forEach(t => {
                  const p = currentProgress[t.id];
                  const isDone = (t.requireSign !== false ? !!p?.signature : (t.requireCheck !== false ? !!p?.checked : !!p?.done));
                  if(isDone) doneTasks++;
              });
          });
      });
      return totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);
  };

  const updateTaskProgress = async (taskId, field, value) => {
    const current = progress[taskId] || {};
    const newProgress = { ...progress, [taskId]: { ...current, [field]: value } };
    setProgress(newProgress);
    if (user) {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'progress', course.id), { completed: newProgress }, { merge: true });
        try {
            const globalPerc = calculateGlobalProgress(newProgress);
            const studentName = user.displayName || (user.isAnonymous ? "Gast" : user.email.split('@')[0]);
             await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'student_progress', `${course.id}_${user.uid}`), {
                courseId: course.id, studentId: user.uid, studentName: studentName, percentage: globalPerc, lastUpdated: Date.now()
            }, { merge: true });
        } catch(e) { console.log("Analytics update skipped", e); }
    }
  };

  const resetTaskProgress = async (taskId) => {
    if(!confirm("Aufgabe wirklich zurücksetzen?")) return;
    const newProgress = { ...progress };
    newProgress[taskId] = { done: false, checked: false, signature: null }; 
    setProgress(newProgress);
    if (user) {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'progress', course.id), { completed: newProgress }, { merge: true });
        try {
            const globalPerc = calculateGlobalProgress(newProgress);
             await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'student_progress', `${course.id}_${user.uid}`), { percentage: globalPerc, lastUpdated: Date.now() }, { merge: true });
        } catch(e) { console.log("Analytics update skipped", e); }
    }
  };

  const saveHomework = (newHw) => { setHomework(newHw); localStorage.setItem('homework', JSON.stringify(newHw)); };
  const addHomework = () => { const text = prompt("Aufgabe:"); if(text) saveHomework([...homework, { text, done: false, id: Date.now() }]); };
  const toggleHomework = (id) => saveHomework(homework.map(h => h.id === id ? {...h, done: !h.done} : h));
  const deleteHomework = (id) => saveHomework(homework.filter(h => h.id !== id));
  const saveEvents = (newEv) => { setEvents(newEv); localStorage.setItem('events', JSON.stringify(newEv)); };
  const addEvent = () => { const title = prompt("Termin:"); const date = prompt("Datum (YYYY-MM-DD):"); if(title && date) saveEvents([...events, { title, date, id: Date.now() }]); };
  const deleteEvent = (id) => saveEvents(events.filter(e => e.id !== id));
  const saveExamDate = (date) => { setExamDate(date); localStorage.setItem(`exam_date_${course.id}_${activeTopic.id}`, date); };
  const sendAiMessage = async (textOverride) => { };
  const handleQuickAction = (type) => { };
  const startDrawing = (e, ref) => { };
  const draw = (e, ref) => { };
  const stopDrawing = (ref) => { if(ref.current) ref.current.isDrawing = false; };
  const clearCanvas = (ref) => { const ctx = ref.current.getContext('2d'); ctx.clearRect(0,0,ref.current.width, ref.current.height); };
  const saveSignature = async () => { if(!activeTaskId) return; const data = sigCanvasRef.current.toDataURL(); await updateTaskProgress(activeTaskId, 'signature', data); setShowSigModal(false); setActiveTaskId(null); };
  const isImage = (url) => { if(!url) return false; return url.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i) || url.startsWith('data:image'); };

  if (activeChapter) {
    return (<div className="h-screen flex flex-col bg-slate-50"><div className="p-4 bg-white shadow-sm flex items-center gap-4"><button onClick={() => setActiveChapter(null)} className="p-2 hover:bg-slate-100 rounded-full"><LucideChevronRight className="rotate-180"/></button><h3 className="font-extrabold text-lg truncate text-slate-800 tracking-tight">{activeChapter.title}</h3></div><div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full pb-32">
        <div className="bg-white p-6 rounded-2xl shadow-sm mb-6 relative"><p className="text-slate-700 whitespace-pre-line">{activeChapter.text}</p></div>
        <div className="space-y-6">
             {(activeChapter.tasks || []).map((task) => {
                 const prog = progress[task.id] || {};
                 const isDone = (task.requireSign !== false ? !!prog.signature : (task.requireCheck !== false ? !!prog.checked : !!prog.done));
                 return (
                     <div key={task.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
                        {isDone && <div className="absolute top-0 right-0 bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-bl-xl">Fertig</div>}
                        <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 mb-4 font-medium text-amber-900">{task.text}</div>
                        <div className="space-y-3">
                             <button onClick={() => updateTaskProgress(task.id, 'done', !prog.done)} disabled={isDone} className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-3 transition border-2 ${prog.done ? 'bg-green-50 border-green-500 text-green-700' : 'border-slate-200 text-slate-400'}`}>{prog.done ? <LucideCheckSquare/> : <LucideSquare/>} Bearbeitet</button>
                             {task.requireCheck !== false && <button onClick={() => updateTaskProgress(task.id, 'checked', !prog.checked)} disabled={isDone} className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-3 transition border-2 ${prog.checked ? 'bg-green-50 border-green-500 text-green-700' : 'border-slate-200 text-slate-400'}`}>{prog.checked ? <LucideCheckSquare/> : <LucideSquare/>} Kontrolliert</button>}
                        </div>
                        {isDone && <div className="mt-4 flex justify-end"><button onClick={() => resetTaskProgress(task.id)} className="text-[10px] text-slate-300 hover:text-red-400 font-bold uppercase"><LucideRotateCcw size={12}/> Zurücksetzen</button></div>}
                     </div>
                 );
             })}
        </div>
    </div><ToolsOverlay showMenu={showToolsMenu} setShowMenu={setShowToolsMenu} activeTool={activeTool} setActiveTool={setActiveTool} homework={homework} toggleHomework={toggleHomework} deleteHomework={deleteHomework} addHomework={addHomework} events={events} deleteEvent={deleteEvent} addEvent={addEvent} scratchCanvasRef={scratchCanvasRef} startDrawing={startDrawing} draw={draw} stopDrawing={stopDrawing} clearCanvas={clearCanvas}/></div>);
  }

  if (activeTopic) {
      let totalTasks = 0; let doneTasks = 0;
      activeTopic.chapters.forEach(c => {
          const tasks = c.tasks || (c.task ? [{id: c.id, ...c}] : []);
          totalTasks += tasks.length;
          tasks.forEach(t => {
              const p = progress[t.id];
              const isDone = (t.requireSign !== false ? !!p?.signature : (t.requireCheck !== false ? !!p?.checked : !!p?.done));
              if(isDone) doneTasks++;
          });
      });
      const perc = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);
      const remainingTasks = totalTasks - doneTasks;
      
      return (
        <div className="h-screen flex flex-col bg-slate-50">
            <div className="bg-indigo-600 p-4 text-white pt-6 pb-6 rounded-b-3xl shadow-xl shadow-indigo-200 z-10 relative"> 
                <button onClick={() => setActiveTopic(null)} className="absolute top-4 left-4 text-indigo-200 hover:text-white transition"><LucideChevronRight className="rotate-180" size={20}/></button>
                <div className="mt-2 mb-2 pl-8"> 
                    <h1 className="text-2xl font-black text-white leading-tight">{activeTopic.title}</h1>
                    <p className="text-indigo-200 text-xs font-medium">{activeTopic.chapters?.length || 0} Kapitel</p>
                </div>
                {showGrades && <ProgressBarWithBadges percentage={perc} thresholds={thresholds} variant="header" />}
                <StudyPlannerWidget examDate={examDate} onDateChange={saveExamDate} remainingTasks={remainingTasks} />
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 -mt-4 pt-8 space-y-4 max-w-2xl mx-auto w-full pb-32">
                {(activeTopic.chapters || []).map((chapter, idx) => {
                    const tasks = chapter.tasks || (chapter.task ? [{id: chapter.id, ...chapter}] : []);
                    const totalChapterTasks = tasks.length;
                    let doneChapterTasks = 0;
                    tasks.forEach(t => {
                        const p = progress[t.id];
                        const isDone = (t.requireSign !== false ? !!p?.signature : (t.requireCheck !== false ? !!p?.checked : !!p?.done));
                        if(isDone) doneChapterTasks++;
                    });
                    const chapterPerc = totalChapterTasks === 0 ? 0 : Math.round((doneChapterTasks / totalChapterTasks) * 100);

                    return (
                        <div key={chapter.id || idx} onClick={() => setActiveChapter(chapter)} className="bg-white p-5 rounded-2xl shadow-sm hover:shadow-md transition cursor-pointer border border-slate-100 group">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm">{idx + 1}</div>
                                    <div className="flex-1">
                                        <h3 className="font-bold text-lg text-indigo-900 group-hover:text-indigo-600 transition">{chapter.title}</h3>
                                    </div>
                                </div>
                                <div className="bg-slate-50 p-2 rounded-full group-hover:bg-indigo-50 transition">
                                    <LucideChevronRight size={18} className="text-slate-300 group-hover:text-indigo-400"/>
                                </div>
                            </div>
                            
                            {totalChapterTasks > 0 && (
                                <div className="pl-14">
                                     <div className="flex justify-between items-center mb-1.5">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fortschritt</span>
                                        <span className="text-xs font-bold text-slate-600">
                                            {doneChapterTasks} <span className="text-slate-300">/</span> {totalChapterTasks} <span className="text-[10px] text-slate-400 font-normal">Aufgaben</span>
                                        </span>
                                     </div>
                                     <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                        <div className={`h-1.5 rounded-full transition-all duration-700 ${doneChapterTasks === totalChapterTasks ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{width: `${chapterPerc}%`}}></div>
                                     </div>
                                </div>
                            )}
                        </div>
                    );
                })}
                {(activeTopic.chapters || []).length === 0 && <div className="text-center text-slate-400 mt-10">Keine Kapitel vorhanden.</div>}
            </div>
             <ToolsOverlay showMenu={showToolsMenu} setShowMenu={setShowToolsMenu} activeTool={activeTool} setActiveTool={setActiveTool} homework={homework} toggleHomework={toggleHomework} deleteHomework={deleteHomework} addHomework={addHomework} events={events} deleteEvent={deleteEvent} addEvent={addEvent} scratchCanvasRef={scratchCanvasRef} startDrawing={startDrawing} draw={draw} stopDrawing={stopDrawing} clearCanvas={clearCanvas}/>
        </div>
      );
  }

  const topics = course.topics || [];
  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <div className="bg-indigo-600 p-6 text-white pt-12 pb-8 rounded-b-[2.5rem] shadow-xl shadow-indigo-200 z-10">
         <button onClick={() => setView('landing')} className="text-indigo-200 hover:text-white text-xs mb-4 flex items-center gap-1"><LucideLogOut size={12}/> Verlassen</button>
         <div className="flex justify-between items-start">
             <div><h1 className="text-4xl font-black mb-2 drop-shadow-sm text-white">{course.title}</h1><p className="text-indigo-200 text-sm font-medium">Willkommen zurück!</p></div>
             {user && !user.isAnonymous && (<div className="bg-indigo-500/50 p-2 rounded-xl flex items-center gap-2 border border-indigo-400/30"><div className="w-8 h-8 bg-white text-indigo-600 rounded-full flex items-center justify-center font-bold text-sm">{(user.displayName || user.email || "U")[0].toUpperCase()}</div></div>)}
         </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6 -mt-4 pt-8 space-y-4 max-w-2xl mx-auto w-full pb-32">
         {topics.map((topic, idx) => {
             const total = topic.chapters.length; 
             let totalTasks = 0; let doneTasks = 0;
             topic.chapters.forEach(c => { const tasks = c.tasks || (c.task ? [{id: c.id, ...c}] : []); totalTasks += tasks.length; tasks.forEach(t => { const p = progress[t.id]; const isDone = (t.requireSign !== false ? !!p?.signature : (t.requireCheck !== false ? !!p?.checked : !!p?.done)); if(isDone) doneTasks++; }); });
             const perc = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);
             return (
                 <div key={topic.id || idx} onClick={() => setActiveTopic(topic)} className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition cursor-pointer border border-slate-100">
                    <div className="flex justify-between items-center mb-4"><div className="flex items-center gap-4"><div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg">{topic.title.charAt(0)}</div><div><h3 className="font-extrabold text-xl text-indigo-900 tracking-tight">{topic.title}</h3><p className="text-xs text-slate-400">{total} Kapitel</p></div></div><LucideChevronRight className="text-slate-300"/></div>
                    {showGrades && <ProgressBarWithBadges percentage={perc} thresholds={thresholds} variant="card" />}
                 </div>
             );
         })}
      </div>
      <ToolsOverlay showMenu={showToolsMenu} setShowMenu={setShowToolsMenu} activeTool={activeTool} setActiveTool={setActiveTool} homework={homework} toggleHomework={toggleHomework} deleteHomework={deleteHomework} addHomework={addHomework} events={events} deleteEvent={deleteEvent} addEvent={addEvent} scratchCanvasRef={scratchCanvasRef} startDrawing={startDrawing} draw={draw} stopDrawing={stopDrawing} clearCanvas={clearCanvas}/>
    </div>
  );
}

function StudyPlannerWidget({ examDate, onDateChange, remainingTasks }) {
    const today = new Date(); today.setHours(0,0,0,0);
    let target = null; if(examDate) { const [y, m, d] = examDate.split('-'); target = new Date(y, m - 1, d); }
    let daysLeft = 0; let tasksPerDay = 0; let message = { text: "Datum wählen", color: "bg-slate-800 text-white" };
    if (target) { const diffTime = target - today; daysLeft = Math.round(diffTime / (1000 * 60 * 60 * 24)); if(daysLeft > 0) { tasksPerDay = Math.ceil(remainingTasks / daysLeft); if (tasksPerDay > 5) message = { text: "Gas geben! 🔥", color: "bg-red-500 text-white" }; else if (tasksPerDay > 2) message = { text: "Dranbleiben 💪", color: "bg-yellow-500 text-white" }; else message = { text: "Ganz entspannt 😌", color: "bg-green-500 text-white" }; } else if (daysLeft === 0) { message = { text: "Viel Erfolg! 🍀", color: "bg-indigo-500 text-white" }; } else { message = { text: "Vorbei", color: "bg-slate-500 text-white" }; } }
    return (
        <div className="mt-2 bg-white/10 backdrop-blur-sm p-3 rounded-xl border border-white/20 flex flex-col gap-2">
            <div className="flex justify-between items-center text-white"><div className="flex items-center gap-1.5 font-bold text-xs"><LucideClock size={14} className="text-indigo-200"/><span>Lernplaner</span></div><input type="date" value={examDate} onChange={(e) => onDateChange(e.target.value)} className="bg-white/20 text-white text-[10px] p-1 rounded-md outline-none border border-white/10 focus:bg-white/30 transition font-bold"/></div>
            {target && daysLeft >= 0 && (<div className="flex items-stretch gap-2"><div className="flex-1 bg-white/20 rounded-lg p-1.5 flex flex-col items-center justify-center border border-white/10"><span className="text-[8px] uppercase font-bold text-indigo-200">Noch</span><span className="text-base font-black text-white leading-none">{daysLeft}</span><span className="text-[8px] text-indigo-100">Tage</span></div><div className="flex-1 bg-white/20 rounded-lg p-1.5 flex flex-col items-center justify-center border border-white/10"><span className="text-[8px] uppercase font-bold text-indigo-200">Ziel</span><span className="text-base font-black text-white leading-none">{tasksPerDay}</span><span className="text-[8px] text-indigo-100">Aufg./Tag</span></div><div className={`flex-1 rounded-lg p-1.5 flex flex-col items-center justify-center font-bold text-[10px] text-center shadow-lg leading-tight ${message.color}`}>{message.text}</div></div>)}
        </div>
    );
}

function ProgressBarWithBadges({ percentage, thresholds, variant = 'card' }) {
  const isHeader = variant === 'header'; const sorted = Object.entries(thresholds).sort((a,b) => b[1] - a[1]); 
  let currentGrade = 6; for(let [g, t] of sorted) { if(percentage >= t) { currentGrade = g; break; } }
  const ascending = Object.entries(thresholds).sort((a,b) => a[1] - b[1]); const next = ascending.find(([g, t]) => t > percentage); const missing = next ? next[1] - percentage : 0; const nextGrade = next ? next[0] : null;
  if (isHeader) { return (<div className="mt-2 bg-indigo-800/40 p-3 rounded-xl backdrop-blur-md border border-indigo-500/20 shadow-lg"><div className="flex justify-between items-end mb-2 px-1"><div className="flex flex-col"><span className="text-[9px] font-bold text-indigo-200 uppercase tracking-widest mb-0.5 opacity-70">Dein Level</span><div className="flex items-end gap-2 text-white"><span className="text-3xl font-black drop-shadow-lg leading-none">{currentGrade}</span><div className="flex flex-col mb-0.5"><span className="text-[10px] font-bold opacity-90 leading-none">Note</span><span className="text-[10px] font-bold text-emerald-300 mt-0">{percentage}% geschafft</span></div></div></div><div className="text-right mb-0.5">{nextGrade ? (<div className="flex items-center gap-1.5 bg-indigo-950/50 border border-indigo-400/30 px-2 py-1 rounded-lg text-[10px] font-bold text-indigo-100 shadow-inner"><LucideStar size={10} className="text-yellow-400 fill-yellow-400 animate-pulse"/><span>Noch <span className="text-white">{missing}%</span> bis <span className="text-emerald-300">Note {nextGrade}</span></span></div>) : (<div className="bg-amber-500/20 border border-amber-400/50 px-3 py-1 rounded-lg text-[10px] font-bold text-amber-100 shadow-sm flex items-center gap-1.5"><LucideTrophy size={12} className="text-amber-300"/> Champion!</div>)}</div></div><div className="relative h-2.5 bg-black/20 rounded-full w-full shadow-inner ring-1 ring-white/5"><div className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 rounded-full transition-all duration-1000 shadow-[0_0_20px_rgba(52,211,153,0.3)] relative overflow-hidden" style={{ width: `${percentage}%` }}><div className="absolute inset-0 bg-white/20 skew-x-12 -translate-x-full animate-[shimmer_2s_infinite]"></div></div>{Object.entries(thresholds).map(([g, t]) => { const reached = percentage >= t; const isNext = nextGrade === g; return (<div key={g} className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-500`} style={{ left: `${t}%` }}><div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black border-[1.5px] shadow-lg relative z-10 ${reached ? 'bg-emerald-500 border-white text-white scale-110 shadow-emerald-500/50' : isNext ? 'bg-indigo-900 border-indigo-300 text-indigo-200 ring-2 ring-indigo-400/30' : 'bg-indigo-950 border-indigo-800 text-indigo-700'}`}>{g}</div></div>); })}</div></div>); }
  return (<div className="mt-3"><div className="flex justify-between items-end mb-2"><div className="flex items-baseline gap-1"><div className="text-sm font-black text-slate-400 uppercase tracking-wider">Note:</div><div className="text-2xl font-black text-indigo-900">{currentGrade}</div><div className="text-xs font-bold text-slate-500 ml-1">({percentage}%)</div></div>{nextGrade && <div className="text-[10px] font-bold text-indigo-400 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">noch {missing}%</div>}</div><div className="relative h-2.5 bg-slate-100 rounded-full w-full overflow-visible"><div className="absolute top-0 left-0 h-full bg-indigo-600 rounded-full transition-all duration-1000" style={{ width: `${percentage}%` }}></div>{Object.entries(thresholds).map(([g, t]) => { const reached = percentage >= t; return (<div key={g} className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full border border-white transition-all z-10 ${reached ? 'bg-indigo-600 scale-125' : 'bg-slate-300'}`} style={{ left: `${t}%` }}/>); })}</div></div>);
}

function ToolsOverlay({ showMenu, setShowMenu, activeTool, setActiveTool, homework, toggleHomework, deleteHomework, addHomework, events, deleteEvent, addEvent, scratchCanvasRef, startDrawing, draw, stopDrawing, clearCanvas }) {
    return (<><div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">{showMenu && (<><button onClick={() => setActiveTool('homework')} className="w-12 h-12 bg-white text-indigo-600 rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition"><LucideListTodo/></button><button onClick={() => setActiveTool('calendar')} className="w-12 h-12 bg-white text-orange-500 rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition"><LucideCalendar/></button><button onClick={() => setActiveTool('scratch')} className="w-12 h-12 bg-white text-blue-500 rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition"><LucidePenTool/></button></>)}<button onClick={() => setShowMenu(!showMenu)} className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-white text-2xl transition hover:scale-105 ${showMenu ? 'bg-slate-700 rotate-45' : 'bg-indigo-600'}`}><LucidePlus/></button></div>{activeTool === 'homework' && (<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><div className="bg-white w-full max-w-sm rounded-2xl p-6 h-[60vh] flex flex-col"><div className="flex justify-between items-center mb-4"><h3 className="font-bold text-xl">Hausaufgaben</h3><button onClick={() => setActiveTool(null)}><LucideX/></button></div><div className="flex-1 overflow-y-auto space-y-2 mb-4">{homework.map(h => (<div key={h.id} className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg"><button onClick={() => toggleHomework(h.id)}>{h.done ? <LucideCheckCircle className="text-green-500"/> : <LucideCircle className="text-slate-300"/>}</button><span className={`flex-1 text-sm ${h.done ? 'line-through text-slate-300' : ''}`}>{h.text}</span><button onClick={() => deleteHomework(h.id)} className="text-red-300"><LucideTrash size={14}/></button></div>))}{homework.length === 0 && <div className="text-center text-slate-400 mt-10">Alles erledigt! 🎉</div>}</div><button onClick={addHomework} className="w-full py-3 bg-indigo-100 text-indigo-700 font-bold rounded-xl flex items-center justify-center gap-2"><LucidePlus size={16}/> Eintrag hinzufügen</button></div></div>)}{activeTool === 'calendar' && (<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><div className="bg-white w-full max-w-sm rounded-2xl p-6 h-[60vh] flex flex-col"><div className="flex justify-between items-center mb-4"><h3 className="font-bold text-xl">Termine</h3><button onClick={() => setActiveTool(null)}><LucideX/></button></div><div className="flex-1 overflow-y-auto space-y-2 mb-4">{events.sort((a,b) => new Date(a.date) - new Date(b.date)).map(ev => (<div key={ev.id} className="bg-orange-50 p-3 rounded-lg border border-orange-100 flex justify-between items-center"><div><div className="font-bold text-sm text-orange-900">{ev.title}</div><div className="text-xs text-orange-600">{ev.date}</div></div><button onClick={() => deleteEvent(ev.id)} className="text-orange-300 hover:text-red-500"><LucideTrash size={14}/></button></div>))}</div><button onClick={addEvent} className="w-full py-3 bg-orange-100 text-orange-700 font-bold rounded-xl flex items-center justify-center gap-2"><LucidePlus size={16}/> Termin eintragen</button></div></div>)}{activeTool === 'scratch' && (<div className="fixed inset-0 z-50 bg-white flex flex-col"><div className="bg-blue-600 p-4 text-white flex justify-between items-center shadow-md"><h3 className="font-bold flex items-center gap-2"><LucidePenTool/> Schmierblatt</h3><div className="flex gap-4"><button onClick={() => clearCanvas(scratchCanvasRef)}><LucideEraser/></button><button onClick={() => setActiveTool(null)} className="bg-white/20 px-3 py-1 rounded text-sm">Schließen</button></div></div><div className="flex-1 bg-slate-50 relative"><canvas ref={scratchCanvasRef} width={window.innerWidth} height={window.innerHeight} className="w-full h-full touch-none cursor-crosshair" onMouseDown={(e) => startDrawing(e, scratchCanvasRef)} onMouseMove={(e) => draw(e, scratchCanvasRef)} onMouseUp={() => stopDrawing(scratchCanvasRef)} onTouchStart={(e) => startDrawing(e, scratchCanvasRef)} onTouchMove={(e) => draw(e, scratchCanvasRef)} onTouchEnd={() => stopDrawing(scratchCanvasRef)}></canvas></div></div>)}</>);
}