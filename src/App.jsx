import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCustomToken,
  signOut
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, getDoc, setDoc, addDoc, onSnapshot, updateDoc, deleteDoc, query, where
} from 'firebase/firestore';

import { 
  LucideBookOpen, LucideEdit, LucidePlus, LucideTrash, LucideSave, LucideCheckCircle, 
  LucideCircle, LucideLogOut, LucideGraduationCap, LucideChevronRight, LucideYoutube, 
  LucideLayoutDashboard, LucidePenTool, LucideX, LucideCheckSquare, LucideSquare,
  LucideCalendar, LucideListTodo, LucideEraser, LucideSettings, LucideMoreVertical, LucideTrophy,
  LucideImage, LucideFileText, LucideLink, LucideUpload, LucideToggleLeft, LucideToggleRight,
  LucideSparkles, LucideMessageSquare, LucideBrainCircuit, LucideSend, LucideWand2,
  LucideEye, LucideEyeOff, LucideRotateCcw, LucideDownload, LucideShare, LucideLibrary, LucideActivity,
  LucideGlobe, LucideUser, LucideLock, LucideLoader, LucideAlertTriangle, LucideStar, LucideClock, LucideTarget
} from 'lucide-react';

// --- FIREBASE CONFIG (Wiederhergestellt für StackBlitz) ---
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

// In StackBlitz nutzen wir eine feste ID oder die Projekt-ID als Fallback
const appId = "default-app-id"; 

// --- GEMINI API SETUP ---
const apiKey = "AIzaSyDI-ZVJ1gmb0dhMvDiLGLEsBq1LEThTY8o"; // Dein ursprünglicher Key

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
    // Einfache Auth-Initialisierung für externe Umgebungen
    const initAuth = async () => {
      // Prüfe, ob bereits ein User eingeloggt ist (persistente Session)
      if (!auth.currentUser) {
         try {
             // Versuche anonymen Login als Fallback
             await signInAnonymously(auth);
         } catch (e) {
             console.error("Auth Error:", e);
         }
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    
    // PWA Install Prompt Listener
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });

    // PWA Meta Tags Injection
    const metaTags = [
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { name: 'apple-mobile-web-app-title', content: 'Lernpfad' },
      { name: 'theme-color', content: '#4f46e5' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover' }
    ];

    metaTags.forEach(tagInfo => {
      let tag = document.querySelector(`meta[name="${tagInfo.name}"]`);
      if (!tag) {
        tag = document.createElement('meta');
        tag.name = tagInfo.name;
        document.head.appendChild(tag);
      }
      tag.content = tagInfo.content;
    });

    return () => unsubscribe();
  }, []);

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50 text-indigo-600 animate-pulse">Lade Lernpfad...</div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-indigo-100">
      {view === 'landing' && <LandingPage setView={setView} user={user} deferredPrompt={deferredPrompt} />}
      {view === 'auth' && <TeacherAuth setView={setView} />}
      {view === 'teacher-dash' && <TeacherDashboard user={user} setView={setView} setActiveCourse={setActiveCourse} />}
      {view === 'course-editor' && <CourseEditor user={user} course={activeCourse} setView={setView} />}
      {view === 'student-enter' && <StudentEntry setView={setView} setActiveCourse={setActiveCourse} />}
      {view === 'student-view' && <StudentLernpfad user={user} course={activeCourse} setView={setView} />}
    </div>
  );
}

// --- NEW: TEACHER AUTH (LOGIN/REGISTER) ---
function TeacherAuth({ setView }) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const handleAuth = async (e) => {
        e.preventDefault();
        setError("");
        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
            setView('teacher-dash'); 
        } catch (err) {
            console.error(err);
            if(err.code === 'auth/invalid-credential') setError("Falsches Passwort oder E-Mail.");
            else if(err.code === 'auth/email-already-in-use') setError("E-Mail wird bereits verwendet.");
            else if(err.code === 'auth/weak-password') setError("Passwort muss mind. 6 Zeichen haben.");
            else if(err.code === 'auth/operation-not-allowed') setError("E-Mail/Passwort Login ist in diesem Projekt nicht aktiviert.");
            else setError("Fehler bei der Anmeldung: " + err.message);
        }
    };

    return (
        <div className="h-screen flex flex-col items-center justify-center p-6">
            <button onClick={() => setView('landing')} className="absolute top-6 left-6 text-slate-400 hover:text-slate-600"><LucideChevronRight className="rotate-180"/></button>
            <div className="w-full max-w-sm bg-white p-8 rounded-3xl shadow-xl">
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br from-slate-800 to-slate-600">{isLogin ? 'Lehrer Login' : 'Konto erstellen'}</h2>
                    <p className="text-slate-400 text-sm mt-1">Verwalte deine Lernpfade</p>
                </div>
                
                <form onSubmit={handleAuth} className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">E-Mail</label>
                        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3">
                            <LucideUser size={18} className="text-slate-400"/>
                            <input 
                                type="email" required 
                                value={email} onChange={e => setEmail(e.target.value)}
                                className="w-full bg-transparent p-3 outline-none text-sm" 
                                placeholder="lehrer@schule.de"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Passwort</label>
                        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3">
                            <LucideLock size={18} className="text-slate-400"/>
                            <input 
                                type="password" required 
                                value={password} onChange={e => setPassword(e.target.value)}
                                className="w-full bg-transparent p-3 outline-none text-sm" 
                                placeholder="••••••"
                            />
                        </div>
                    </div>
                    
                    {error && <div className="text-red-500 text-xs text-center font-bold bg-red-50 p-2 rounded-lg">{error}</div>}
                    
                    <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-200">
                        {isLogin ? 'Anmelden' : 'Registrieren'}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button onClick={() => setIsLogin(!isLogin)} className="text-sm text-indigo-600 font-medium hover:underline">
                        {isLogin ? 'Noch kein Konto? Hier registrieren.' : 'Bereits ein Konto? Anmelden.'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// --- 1. LANDING PAGE ---
function LandingPage({ setView, user, deferredPrompt }) {
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  useEffect(() => {
      // Optional: Logic to redirect if already logged in as teacher could go here
  }, [user]);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setDeferredPrompt(null);
    } else {
      setShowInstallHelp(true); 
    }
  };

  const startStudent = async () => {
      if (!user) {
          try {
              await signInAnonymously(auth);
          } catch(e) {
              alert("Fehler bei der Anmeldung: " + e.message);
          }
      }
      setView('student-enter');
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen p-6 text-center relative bg-gradient-to-br from-slate-50 to-indigo-50/50">
      <div className="w-24 h-24 bg-indigo-600 rounded-[2rem] flex items-center justify-center text-6xl mb-6 shadow-2xl shadow-indigo-300 transform rotate-3">
        <LucideActivity size={48} className="text-white" />
      </div>
      <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600 mb-4 tracking-tighter drop-shadow-sm">Lernpfad</h1>
      <p className="text-slate-500 mb-12 max-w-xs text-lg leading-relaxed">Die moderne Lernplattform für deinen Unterricht.</p>
       
      <div className="grid gap-4 w-full max-w-sm">
        <button onClick={startStudent} className="bg-white border-2 border-slate-200 p-6 rounded-2xl hover:border-indigo-500 hover:shadow-xl transition group text-left flex items-center gap-5 relative overflow-hidden">
          <div className="bg-indigo-50 text-indigo-600 p-4 rounded-xl group-hover:scale-110 transition"><LucideGraduationCap size={28} /></div>
          <div>
              <h3 className="font-bold text-xl text-slate-700">Ich bin Schüler</h3>
              <p className="text-sm text-slate-400 font-medium">Kurscode eingeben</p>
          </div>
        </button>

        <button onClick={() => setView('auth')} className="bg-slate-900 text-white p-6 rounded-2xl hover:bg-slate-800 hover:shadow-xl transition text-left flex items-center gap-5">
          <div className="bg-white/20 p-4 rounded-xl"><LucideLayoutDashboard size={28} /></div>
          <div>
              <h3 className="font-bold text-xl">Lehrer-Login</h3>
              <p className="text-sm text-slate-400 font-medium">Kurse erstellen</p>
          </div>
        </button>
      </div>

      <button onClick={handleInstall} className="mt-10 text-indigo-600 font-bold text-sm flex items-center gap-2 hover:bg-white hover:shadow-sm px-5 py-2.5 rounded-full transition border border-transparent hover:border-indigo-100">
        <LucideDownload size={16}/> Als App installieren
      </button>

      {/* iOS INSTALL INSTRUCTIONS MODAL */}
      {showInstallHelp && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowInstallHelp(false)}>
          <div className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl animate-in slide-in-from-bottom-10" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-xl">App installieren</h3>
              <button onClick={() => setShowInstallHelp(false)} className="bg-slate-100 p-1 rounded-full"><LucideX size={18}/></button>
            </div>
            <ol className="space-y-4 text-sm text-slate-600">
              <li className="flex items-start gap-4">
                <span className="bg-indigo-100 text-indigo-600 w-8 h-8 flex items-center justify-center rounded-full font-bold shrink-0">1</span>
                <span className="pt-1">Tippe auf den <b>Teilen-Button</b> <LucideShare className="inline w-4 h-4 text-blue-500"/> (meist unten oder oben).</span>
              </li>
              <li className="flex items-start gap-4">
                <span className="bg-indigo-100 text-indigo-600 w-8 h-8 flex items-center justify-center rounded-full font-bold shrink-0">2</span>
                <span className="pt-1">Wähle <b>"Zum Home-Bildschirm"</b> <LucidePlus className="inline w-4 h-4 bg-slate-200 rounded p-0.5"/>.</span>
              </li>
              <li className="flex items-start gap-4">
                <span className="bg-indigo-100 text-indigo-600 w-8 h-8 flex items-center justify-center rounded-full font-bold shrink-0">3</span>
                <span className="pt-1">Bestätige mit <b>"Hinzufügen"</b>.</span>
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

// --- 2. TEACHER DASHBOARD ---
function TeacherDashboard({ user, setView, setActiveCourse }) {
  const [courses, setCourses] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    if (!user) return;
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'courses');
    const unsubscribe = onSnapshot(q, (snapshot) => {
        // Show only courses owned by this user
        const myCourses = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(c => c.ownerId === user.uid);
        setCourses(myCourses);
    });
    return () => unsubscribe();
  }, [user]);

  const handleCreate = async () => {
    if (!newTitle) return;
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'courses'), {
      title: newTitle, 
      ownerId: user.uid, 
      createdAt: Date.now(), 
      topics: [], 
      settings: { showGrades: true, gradeThresholds: DEFAULT_THRESHOLDS }
    });
    setNewTitle(""); setShowCreateModal(false);
  };

  const handleDelete = async (id) => {
    if (confirm("Kurs wirklich löschen?")) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'courses', id));
  };
   
  const handleLogout = async () => {
      await signOut(auth);
      setView('landing');
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
            <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-900 to-slate-700 tracking-tight">Deine Kurse</h2>
            <p className="text-slate-500 text-sm font-medium mt-1">{user?.email}</p>
        </div>
        <button onClick={handleLogout} className="text-slate-400 hover:text-red-500 hover:bg-red-50 px-3 py-2 rounded-xl transition flex items-center gap-2 font-bold text-sm">
            <LucideLogOut size={18}/> Abmelden
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <button onClick={() => setShowCreateModal(true)} className="border-2 border-dashed border-slate-300 rounded-2xl p-6 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-500 hover:text-indigo-500 hover:bg-indigo-50 transition min-h-[160px] group">
          <div className="bg-slate-100 p-4 rounded-full mb-3 group-hover:bg-indigo-100 transition"><LucidePlus size={32} /></div>
          <span className="font-bold">Neuer Kurs</span>
        </button>

        {courses.map(course => (
          <div key={course.id} className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-xl transition border border-slate-100 flex flex-col justify-between min-h-[160px] group">
            <div>
              <h3 className="font-extrabold text-xl mb-1 text-slate-700 tracking-tight">{course.title}</h3>
              <div className="bg-slate-100 inline-flex items-center gap-2 px-3 py-1 rounded-lg">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Code</span>
                  <span className="text-sm font-mono font-bold text-slate-600 select-all">{course.id.slice(0,6).toUpperCase()}</span>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button 
                onClick={() => { setActiveCourse(course); setView('course-editor'); }}
                className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 group-hover:shadow-indigo-300 transition"
              >
                <LucideEdit size={16}/> Bearbeiten
              </button>
              <button onClick={() => handleDelete(course.id)} className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition"><LucideTrash size={18}/></button>
            </div>
          </div>
        ))}
      </div>
       
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="font-bold text-xl mb-4">Neuen Kurs erstellen</h3>
            <input autoFocus type="text" placeholder="Name (z.B. Mathe 9b)" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full border-2 border-slate-200 p-3 rounded-xl mb-6 outline-none focus:border-indigo-500" />
            <div className="flex gap-2"><button onClick={() => setShowCreateModal(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl">Abbrechen</button><button onClick={handleCreate} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700">Erstellen</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- 3. COURSE EDITOR (AI, TASKS, SETTINGS, LOCAL STORAGE) ---
function CourseEditor({ user, course, setView }) {
  const [topics, setTopics] = useState(course.topics || []); 
  const [settings, setSettings] = useState(course.settings || { showGrades: true, gradeThresholds: DEFAULT_THRESHOLDS });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showAddTopicModal, setShowAddTopicModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState("");
   
  const [aiGenModal, setAiGenModal] = useState(null); 
  const [customAiPrompt, setCustomAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingTasksFor, setGeneratingTasksFor] = useState(null);

  useEffect(() => { 
      setTopics(course.topics || []); 
      setSettings({
          showGrades: course.settings?.showGrades ?? true,
          gradeThresholds: course.settings?.gradeThresholds || DEFAULT_THRESHOLDS
      });
  }, [course]);

  const saveChanges = async () => {
    setIsSaving(true);
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'courses', course.id), { topics, settings });
    setIsSaving(false);
    setShowSettingsModal(false);
  };

  const handleAddTopic = () => {
    if(!newTopicTitle) return;
    setTopics([...topics, { id: Date.now().toString(), title: newTopicTitle, chapters: [] }]);
    setNewTopicTitle("");
    setShowAddTopicModal(false);
  };

  const addChapterToTopic = (topicIndex) => {
    const newTopics = [...topics];
    newTopics[topicIndex].chapters.push({
      id: Date.now().toString(),
      title: "Neues Unterkapitel",
      text: "",
      tasks: [{ id: Date.now().toString(), text: "Aufgabe 1", requireCheck: true, requireSign: true }],
      video: "",
      media: ""
    });
    setTopics(newTopics);
  };

  const updateChapter = (tIdx, cIdx, field, value) => {
    const newTopics = [...topics];
    newTopics[tIdx].chapters[cIdx][field] = value;
    setTopics(newTopics);
  };

  const addTaskToChapter = (tIdx, cIdx) => {
    const newTopics = [...topics];
    const chapter = newTopics[tIdx].chapters[cIdx];
    if(!chapter.tasks) chapter.tasks = []; 
    chapter.tasks.push({ id: Date.now().toString(), text: "", requireCheck: true, requireSign: true });
    setTopics(newTopics);
  };

  const updateTask = (tIdx, cIdx, taskIdx, field, value) => {
    const newTopics = [...topics];
    const task = newTopics[tIdx].chapters[cIdx].tasks[taskIdx];
    task[field] = value;
    setTopics(newTopics);
  };

  const removeTask = (tIdx, cIdx, taskIdx) => {
    const newTopics = [...topics];
    newTopics[tIdx].chapters[cIdx].tasks.splice(taskIdx, 1);
    setTopics(newTopics);
  };

  const deleteChapter = (tIdx, cIdx) => {
    const newTopics = [...topics];
    newTopics[tIdx].chapters.splice(cIdx, 1);
    setTopics(newTopics);
  };

  const deleteTopic = (tIdx) => {
    if(confirm("Ganzes Thema löschen?")) {
        const newTopics = [...topics];
        newTopics.splice(tIdx, 1);
        setTopics(newTopics);
    }
  };

  // --- LOCAL BASE64 UPLOAD ---
  const handleFileUpload = async (e, tIdx, cIdx) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 800 * 1024) {
        alert("Ohne Cloud-Speicher sind Dateien auf ca. 0.8 MB begrenzt. Bitte nutze kleinere Bilder oder verlinke PDFs.");
        return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
        updateChapter(tIdx, cIdx, 'media', reader.result);
        setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const openAiGenModal = (tIdx, cIdx) => {
      const topic = topics[tIdx];
      const chapter = topic.chapters[cIdx];
      setAiGenModal({ tIdx, cIdx });
      setCustomAiPrompt(""); 
  };

  const executeAiGeneration = async () => {
      if(!aiGenModal) return;
      const { tIdx, cIdx } = aiGenModal;
      setIsGenerating(true);
      const topic = topics[tIdx];
      const chapter = topic.chapters[cIdx];
      const text = await generateExplanationText(topic.title, chapter.title, customAiPrompt);
      if(text) {
          updateChapter(tIdx, cIdx, 'text', text);
          setAiGenModal(null); 
      } else {
          alert("Fehler bei der Generierung.");
      }
      setIsGenerating(false);
  };

  const handleAutoTasks = async (tIdx, cIdx) => {
      const topic = topics[tIdx];
      const chapter = topic.chapters[cIdx];
       
      setGeneratingTasksFor({tIdx, cIdx});
      const generatedTasks = await generateTasks(topic.title, chapter.title);
      setGeneratingTasksFor(null);

      if(generatedTasks && generatedTasks.length > 0) {
          const newTopics = [...topics];
          const chap = newTopics[tIdx].chapters[cIdx];
          if(!chap.tasks) chap.tasks = [];
           
          generatedTasks.forEach(tText => {
              chap.tasks.push({ id: Date.now() + Math.random(), text: tText, requireCheck: true, requireSign: true });
          });
          setTopics(newTopics);
      } else {
          alert("Konnte keine Aufgaben generieren. Versuche es nochmal.");
      }
  };

  const updateThreshold = (grade, value) => {
      setSettings({
          ...settings,
          gradeThresholds: {
              ...settings.gradeThresholds,
              [grade]: parseInt(value) || 0
          }
      });
  };

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      <div className="bg-white border-b px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => setView('teacher-dash')} className="p-2 hover:bg-slate-100 rounded-full"><LucideChevronRight className="rotate-180" /></button>
          <div><h2 className="font-extrabold text-xl text-slate-800 tracking-tight">{course.title}</h2><p className="text-xs text-slate-500">Editor</p></div>
        </div>
        <div className="flex gap-2">
           <button onClick={() => setShowSettingsModal(true)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"><LucideSettings size={20}/></button>
           <button onClick={() => setShowAddTopicModal(true)} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-50 flex items-center gap-2"><LucidePlus size={16}/> Thema</button>
           <button onClick={saveChanges} disabled={isSaving} className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-2 shadow-sm">{isSaving ? '...' : <><LucideSave size={16}/> Speichern</>}</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-8 pb-32">
        {topics.length === 0 && <div className="text-center text-slate-400 py-20 border-2 border-dashed border-slate-300 rounded-xl">Noch keine Themen. Starte mit "+ Thema".</div>}
        
        {topics.map((topic, tIdx) => (
          <div key={topic.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-lg text-indigo-900">{topic.title}</h3>
              <div className="flex gap-2">
                  <button onClick={() => addChapterToTopic(tIdx)} className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1 rounded font-bold hover:bg-indigo-100">+ Unterkapitel</button>
                  <button onClick={() => deleteTopic(tIdx)} className="text-slate-300 hover:text-red-500"><LucideTrash size={16}/></button>
              </div>
            </div>
            <div className="p-4 space-y-4 bg-slate-50/50">
                {topic.chapters.length === 0 && <p className="text-xs text-center text-slate-400 py-4">Keine Unterkapitel.</p>}
                {topic.chapters.map((chapter, cIdx) => (
                    <div key={chapter.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-3">
                             <span className="text-[10px] font-bold text-slate-400 uppercase">Kapitel {cIdx+1}</span>
                             <button onClick={() => deleteChapter(tIdx, cIdx)} className="text-slate-200 hover:text-red-400"><LucideX size={14}/></button>
                        </div>
                        <input type="text" value={chapter.title} onChange={(e) => updateChapter(tIdx, cIdx, 'title', e.target.value)} className="w-full font-bold mb-2 border-b border-transparent focus:border-indigo-500 outline-none bg-transparent" placeholder="Titel (z.B. Dreisatz)" />
                        
                        <div className="mb-4">
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Erklärung</label>
                                <button 
                                    onClick={() => openAiGenModal(tIdx, cIdx)} 
                                    className="text-xs flex items-center gap-1 text-purple-600 font-bold hover:bg-purple-50 px-2 py-1 rounded transition"
                                >
                                    <LucideWand2 size={12}/> ✨ KI-Text generieren
                                </button>
                            </div>
                            <textarea value={chapter.text} onChange={(e) => updateChapter(tIdx, cIdx, 'text', e.target.value)} className="w-full text-sm border p-2 rounded mb-2 min-h-[80px]" placeholder="Hier Erklärung eingeben oder KI fragen..." />
                            
                            <div className="flex gap-2 items-center">
                                {!chapter.showMediaInput && !chapter.media ? (
                                    <button onClick={() => {
                                        const newTopics = [...topics];
                                        newTopics[tIdx].chapters[cIdx].showMediaInput = true;
                                        setTopics(newTopics);
                                    }} className="text-xs flex items-center gap-1 text-slate-500 hover:text-indigo-600 font-bold bg-slate-50 px-2 py-1 rounded border border-slate-200">
                                        <LucideImage size={12}/> + Bild / Datei
                                    </button>
                                ) : (
                                    <div className="flex-1 flex gap-2 items-center bg-slate-50 p-2 rounded border border-slate-200">
                                        {chapter.media ? (
                                            <div className="flex items-center gap-2 flex-1 overflow-hidden">
                                                <span className="text-xs text-green-600 font-bold truncate flex items-center gap-1"><LucideCheckCircle size={12}/> Datei bereit</span>
                                                <button onClick={() => updateChapter(tIdx, cIdx, 'media', '')} className="text-red-400 hover:text-red-600"><LucideTrash size={14}/></button>
                                            </div>
                                        ) : (
                                            <div className="flex flex-1 gap-2 items-center">
                                                <label className={`cursor-pointer flex items-center gap-1 text-xs font-bold text-white px-3 py-1.5 rounded transition shadow-sm ${isUploading ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-500 hover:bg-indigo-600'}`}>
                                                    {isUploading ? <LucideLoader className="animate-spin" size={12}/> : <LucideUpload size={12}/>} 
                                                    {isUploading ? ' Lade hoch...' : ' Hochladen'}
                                                    <input type="file" className="hidden" disabled={isUploading} onChange={(e) => handleFileUpload(e, tIdx, cIdx)} />
                                                </label>
                                                <span className="text-[10px] text-slate-400">oder Link:</span>
                                                <input type="text" value={chapter.media || ""} onChange={(e) => updateChapter(tIdx, cIdx, 'media', e.target.value)} className="flex-1 text-xs bg-transparent outline-none border-b border-slate-200 focus:border-indigo-500" placeholder="https://..." />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 mb-2">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-[10px] font-bold text-amber-700 uppercase block tracking-widest">Aufgabenliste</label>
                            </div>
                            
                            {(chapter.tasks || [{id:1, text: chapter.task || "", requireCheck: true, requireSign: true}]).map((task, taskIdx) => (
                                <div key={task.id || taskIdx} className="mb-3 bg-white p-2 rounded border border-amber-200">
                                    <div className="flex gap-2 mb-2">
                                        <input 
                                            type="text" 
                                            value={task.text} 
                                            onChange={(e) => updateTask(tIdx, cIdx, taskIdx, 'text', e.target.value)} 
                                            className="flex-1 text-xs border p-2 rounded bg-slate-50 text-slate-800" 
                                            placeholder="Aufgabentext..." 
                                        />
                                        <button onClick={() => removeTask(tIdx, cIdx, taskIdx)} className="text-red-300 hover:text-red-500"><LucideX size={14}/></button>
                                    </div>
                                    <div className="flex gap-2 justify-end">
                                        <button 
                                            onClick={() => updateTask(tIdx, cIdx, taskIdx, 'requireCheck', !(task.requireCheck !== false))} 
                                            className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border transition ${task.requireCheck !== false ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
                                        >
                                            <LucideCheckSquare size={10}/> {task.requireCheck !== false ? 'Kontrolle' : 'Keine Kontrolle'}
                                        </button>
                                        <button 
                                            onClick={() => updateTask(tIdx, cIdx, taskIdx, 'requireSign', !(task.requireSign !== false))} 
                                            className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border transition ${task.requireSign !== false ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
                                        >
                                            <LucidePenTool size={10}/> {task.requireSign !== false ? 'Unterschrift' : 'Keine Unterschrift'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                            <div className="flex gap-2 mt-2">
                                <button onClick={() => addTaskToChapter(tIdx, cIdx)} className="text-xs text-amber-600 font-bold flex items-center gap-1 hover:underline"><LucidePlus size={12}/> Aufgabe hinzufügen</button>
                                <button 
                                    onClick={() => handleAutoTasks(tIdx, cIdx)} 
                                    disabled={generatingTasksFor && generatingTasksFor.tIdx === tIdx && generatingTasksFor.cIdx === cIdx}
                                    className="text-xs flex items-center gap-1 text-purple-600 font-bold hover:bg-purple-50 px-2 py-1 rounded transition ml-auto disabled:opacity-50"
                                >
                                    {generatingTasksFor && generatingTasksFor.tIdx === tIdx && generatingTasksFor.cIdx === cIdx ? <LucideWand2 className="animate-spin" size={12}/> : <LucideWand2 size={12}/>} 
                                    ✨ KI-Aufgaben
                                </button>
                            </div>
                        </div>

                        <input type="text" value={chapter.video} onChange={(e) => updateChapter(tIdx, cIdx, 'video', e.target.value)} className="w-full text-xs border p-2 rounded bg-slate-50" placeholder="YouTube Link..." />
                    </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      {showAddTopicModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="font-bold text-xl mb-4">Neues Thema hinzufügen</h3>
            <input autoFocus type="text" placeholder="Titel (z.B. Zuordnungen)" value={newTopicTitle} onChange={(e) => setNewTopicTitle(e.target.value)} className="w-full border-2 border-slate-200 p-3 rounded-xl mb-6 outline-none focus:border-indigo-500" />
            <div className="flex gap-2">
              <button onClick={() => setShowAddTopicModal(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl">Abbrechen</button>
              <button onClick={handleAddTopic} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700">Hinzufügen</button>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl overflow-y-auto max-h-[80vh]">
            <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-xl flex items-center gap-2"><LucideSettings size={20}/> Kurseinstellungen</h3>
                <button onClick={() => setShowSettingsModal(false)}><LucideX/></button>
            </div>
            
            <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                        <div className="font-bold text-slate-700">Noten & Fortschritt</div>
                        <div className="text-xs text-slate-400">Zeige Noten (1-6) und Balken an</div>
                    </div>
                    <button 
                        onClick={() => setSettings({...settings, showGrades: !settings.showGrades})} 
                        className={`text-2xl transition ${settings.showGrades ? 'text-indigo-600' : 'text-slate-300'}`}
                    >
                        {settings.showGrades ? <LucideToggleRight size={32}/> : <LucideToggleLeft size={32}/>}
                    </button>
                </div>

                {settings.showGrades && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <h4 className="font-bold text-sm text-slate-700 mb-3">Notenschlüssel anpassen</h4>
                        <div className="space-y-3">
                            {[1, 2, 3, 4, 5].map(grade => (
                                <div key={grade} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-white border border-slate-200`}>{grade}</div>
                                        <span className="text-sm text-slate-600">ab Prozent:</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <input 
                                            type="number" 
                                            value={settings.gradeThresholds?.[grade] ?? DEFAULT_THRESHOLDS[grade]} 
                                            onChange={(e) => updateThreshold(grade, e.target.value)}
                                            className="w-16 p-1 text-center border rounded text-sm outline-none focus:border-indigo-500"
                                        />
                                        <span className="text-sm text-slate-400">%</span>
                                    </div>
                                </div>
                            ))}
                            <p className="text-[10px] text-slate-400 mt-2 text-center">Note 6 ist alles darunter.</p>
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-6">
                <button onClick={saveChanges} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700">Einstellungen speichern</button>
            </div>
          </div>
        </div>
      )}

      {/* AI GENERATION MODAL */}
      {aiGenModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
                <div className="bg-purple-100 p-2 rounded-lg text-purple-600"><LucideSparkles size={24}/></div>
                <div>
                    <h3 className="font-bold text-lg">Erklärung generieren</h3>
                    <p className="text-xs text-slate-500">Für: {topics[aiGenModal.tIdx].chapters[aiGenModal.cIdx].title}</p>
                </div>
            </div>
            
            <div className="mb-4">
                <label className="block text-xs font-bold text-slate-500 mb-2">Zusätzliche Anweisung (Optional)</label>
                <textarea 
                    value={customAiPrompt}
                    onChange={(e) => setCustomAiPrompt(e.target.value)}
                    placeholder="z.B. 'Nutze Fußball als Beispiel' oder 'Erkläre es für 5. Klasse'"
                    className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:border-purple-500 outline-none h-24 resize-none bg-slate-50"
                />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setAiGenModal(null)} disabled={isGenerating} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl">Abbrechen</button>
              <button onClick={executeAiGeneration} disabled={isGenerating} className="flex-1 bg-purple-600 text-white py-3 rounded-xl font-bold hover:bg-purple-700 flex items-center justify-center gap-2">
                  {isGenerating ? <><LucideWand2 className="animate-spin" size={18}/> Schreibe...</> : <><LucideWand2 size={18}/> Generieren</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- 4. STUDENT ENTRY ---
function StudentEntry({ setView, setActiveCourse }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const joinCourse = async () => {
    try {
      const q = collection(db, 'artifacts', appId, 'public', 'data', 'courses');
      const snapshot = await new Promise(resolve => { const unsub = onSnapshot(q, (snap) => { unsub(); resolve(snap); }); });
      const courseDoc = snapshot.docs.find(doc => doc.id.toUpperCase().startsWith(code.toUpperCase()));
      if (courseDoc) {
        setActiveCourse({ id: courseDoc.id, ...courseDoc.data() });
        setView('student-view');
      } else { setError("Kurs nicht gefunden."); }
    } catch (e) { setError("Fehler."); }
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center p-6 bg-slate-900 text-white">
      <button onClick={() => setView('landing')} className="absolute top-6 left-6 text-slate-500 hover:text-white"><LucideChevronRight className="rotate-180"/></button>
      <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-indigo-200 mb-8 tracking-tight">Kurscode</h2>
      <div className="w-full max-w-xs">
        <input 
          type="text" 
          value={code} 
          onChange={(e) => setCode(e.target.value)} 
          placeholder="z.B. 3F8A2C" 
          className="w-full bg-slate-800 border-2 border-slate-700 p-4 rounded-xl text-center text-2xl font-mono tracking-widest uppercase mb-4 focus:border-indigo-500 outline-none text-white placeholder-slate-600" 
        />
        <button onClick={joinCourse} className="w-full bg-indigo-600 py-4 rounded-xl font-bold hover:bg-indigo-500 transition shadow-lg shadow-indigo-900/50">Beitreten 🚀</button>
        {error && <p className="text-red-400 text-center mt-4 text-sm">{error}</p>}
      </div>
    </div>
  );
}

// --- 5. STUDENT LERNPFAD VIEW (PER TASK) ---
function StudentLernpfad({ user, course, setView }) {
  const [progress, setProgress] = useState({}); // { taskId: { done: bool, checked: bool, signature: string } }
  const [activeTopic, setActiveTopic] = useState(null);
  const [activeChapter, setActiveChapter] = useState(null);
  const [activeTaskId, setActiveTaskId] = useState(null); // For Signature Modal
  const [showSigModal, setShowSigModal] = useState(false);
  const [examDate, setExamDate] = useState(""); 
   
  // AI Chat State
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiMessages, setAiMessages] = useState([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
   
  // Tool Modals
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [activeTool, setActiveTool] = useState(null); 
   
  // Tool Data
  const [homework, setHomework] = useState([]);
  const [events, setEvents] = useState([]);

  const sigCanvasRef = useRef(null);
  const scratchCanvasRef = useRef(null);
  const chatEndRef = useRef(null);

  // Settings
  const showGrades = course.settings?.showGrades !== false;
  const thresholds = course.settings?.gradeThresholds || DEFAULT_THRESHOLDS;

  // Sync Data & LocalStorage
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages]);

  const updateTaskProgress = async (taskId, field, value) => {
    const current = progress[taskId] || {};
    const newProgress = { ...progress, [taskId]: { ...current, [field]: value } };
    setProgress(newProgress);
    if (user) await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'progress', course.id), { completed: newProgress }, { merge: true });
  };

  const resetTaskProgress = async (taskId) => {
    if(!confirm("Aufgabe wirklich zurücksetzen? Alle Haken und Unterschriften für diese Aufgabe werden gelöscht.")) return;
    
    const newProgress = { ...progress };
    newProgress[taskId] = { done: false, checked: false, signature: null }; // Reset fields
    
    setProgress(newProgress);
    if (user) await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'progress', course.id), { completed: newProgress }, { merge: true });
  };

  const saveHomework = (newHw) => { setHomework(newHw); localStorage.setItem('homework', JSON.stringify(newHw)); };
  const addHomework = () => {
    const text = prompt("Aufgabe:");
    if(text) saveHomework([...homework, { text, done: false, id: Date.now() }]);
  };
  const toggleHomework = (id) => saveHomework(homework.map(h => h.id === id ? {...h, done: !h.done} : h));
  const deleteHomework = (id) => saveHomework(homework.filter(h => h.id !== id));

  const saveEvents = (newEv) => { setEvents(newEv); localStorage.setItem('events', JSON.stringify(newEv)); };
  const addEvent = () => {
    const title = prompt("Termin:");
    const date = prompt("Datum (YYYY-MM-DD):");
    if(title && date) saveEvents([...events, { title, date, id: Date.now() }]);
  };
  const deleteEvent = (id) => saveEvents(events.filter(e => e.id !== id));

  const saveExamDate = (date) => {
      setExamDate(date);
      localStorage.setItem(`exam_date_${course.id}_${activeTopic.id}`, date);
  };

  // --- AI LOGIC ---
  const sendAiMessage = async (textOverride) => {
      const text = textOverride || aiInput;
      if (!text.trim() || aiLoading) return;

      const newMsgs = [...aiMessages, { role: 'user', text }];
      setAiMessages(newMsgs);
      setAiInput("");
      setAiLoading(true);

      const context = {
          topic: activeTopic.title,
          chapter: activeChapter.title,
          text: activeChapter.text
      };

      const response = await callGemini(text, context);
      setAiMessages([...newMsgs, { role: 'model', text: response }]);
      setAiLoading(false);
  };

  const handleQuickAction = (type) => {
      setShowAiModal(true);
      if(type === 'simplify') sendAiMessage("Erkläre mir diesen Text bitte einfacher und kindgerecht.");
      if(type === 'quiz') sendAiMessage("Stell mir eine kurze Quizfrage zu diesem Thema.");
      if(type === 'relevance') sendAiMessage("Nenne mir ein cooles Beispiel, wofür ich dieses Thema im echten Leben brauche. Wofür ist es nützlich?");
  };

  const startDrawing = (e, ref) => {
    const canvas = ref.current;
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    ctx.beginPath(); ctx.moveTo(x, y);
    canvas.isDrawing = true;
  };
  const draw = (e, ref) => {
    const canvas = ref.current;
    if(!canvas || !canvas.isDrawing) return;
    e.preventDefault();
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    ctx.lineTo(x, y); ctx.stroke();
  };
  const stopDrawing = (ref) => { if(ref.current) ref.current.isDrawing = false; };
  const clearCanvas = (ref) => { const ctx = ref.current.getContext('2d'); ctx.clearRect(0,0,ref.current.width, ref.current.height); };
   
  const saveSignature = async () => {
      if(!activeTaskId) return;
      const data = sigCanvasRef.current.toDataURL();
      await updateTaskProgress(activeTaskId, 'signature', data);
      setShowSigModal(false);
      setActiveTaskId(null);
  };

  const isImage = (url) => {
      if(!url) return false;
      return url.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i) || url.startsWith('data:image');
  };

  // VIEW 1: CHAPTER DETAIL
  if (activeChapter) {
    const tasksList = activeChapter.tasks || (activeChapter.task ? [{id: activeChapter.id, text: activeChapter.task}] : []);

    return (
      <div className="h-screen flex flex-col bg-slate-50">
         <div className="p-4 bg-white shadow-sm flex items-center gap-4">
             <button onClick={() => setActiveChapter(null)} className="p-2 hover:bg-slate-100 rounded-full"><LucideChevronRight className="rotate-180"/></button>
             <h3 className="font-extrabold text-lg truncate text-slate-800 tracking-tight">{activeChapter.title}</h3>
         </div>
         <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full pb-32">
            <div className="bg-white p-6 rounded-2xl shadow-sm mb-6 relative">
                <div className="flex justify-between items-start mb-2">
                    <h4 className="font-black text-indigo-400 text-xs uppercase tracking-widest">Erklärung</h4>
                    <div className="flex gap-2">
                        <button onClick={() => handleQuickAction('simplify')} className="text-xs flex items-center gap-1 bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full font-bold hover:bg-indigo-100 transition"><LucideSparkles size={12}/> Einfacher erklären</button>
                        <button onClick={() => handleQuickAction('quiz')} className="text-xs flex items-center gap-1 bg-orange-50 text-orange-600 px-2 py-1 rounded-full font-bold hover:bg-orange-100 transition"><LucideBrainCircuit size={12}/> Quiz mich</button>
                    </div>
                </div>
                <p className="text-slate-700 leading-relaxed whitespace-pre-line">{activeChapter.text}</p>
                {activeChapter.media && (
                    <div className="mt-6">
                        {isImage(activeChapter.media) ? (
                            <img src={activeChapter.media} alt="Material" className="rounded-xl w-full shadow-md object-cover border border-slate-100" />
                        ) : (
                            <a href={activeChapter.media} target="_blank" download="Arbeitsmaterial" rel="noopener noreferrer" className="flex items-center gap-3 bg-indigo-50 p-4 rounded-xl border border-indigo-100 hover:bg-indigo-100 transition text-indigo-700 font-bold group">
                                <div className="bg-white p-2 rounded-lg shadow-sm group-hover:scale-110 transition"><LucideFileText size={24}/></div> 
                                <span>📄 Datei öffnen / herunterladen</span>
                            </a>
                        )}
                    </div>
                )}
                {activeChapter.video && activeChapter.video.includes('v=') && (
                    <div className="mt-6 rounded-xl overflow-hidden shadow-lg aspect-video bg-black">
                        <iframe src={`https://www.youtube.com/embed/${activeChapter.video.split('v=')[1].split('&')[0]}`} className="w-full h-full" frameBorder="0" allowFullScreen></iframe>
                    </div>
                )}
            </div>

            <div className="space-y-6">
                <h4 className="font-black text-indigo-400 text-xs uppercase ml-1 tracking-widest">Aufgaben</h4>
                {tasksList.map((task) => {
                    const prog = progress[task.id] || {};
                    const reqCheck = task.requireCheck !== false;
                    const reqSign = task.requireSign !== false;
                    const isDone = reqSign ? !!prog.signature : (reqCheck ? !!prog.checked : !!prog.done);
                    const hasProgress = prog.done || prog.checked || prog.signature;

                    return (
                        <div key={task.id} className="bg-white p-6 rounded-2xl shadow-sm relative overflow-hidden border border-slate-100">
                            {isDone && <div className="absolute top-0 right-0 bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-bl-xl">Fertig</div>}
                            
                            <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 mb-4 font-medium text-amber-900">
                                {task.text}
                            </div>
                            
                            <div className="space-y-3">
                                <button 
                                    onClick={() => updateTaskProgress(task.id, 'done', !prog.done)} 
                                    disabled={isDone} 
                                    className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-3 transition border-2 ${prog.done ? 'bg-green-50 border-green-500 text-green-700' : 'border-slate-200 text-slate-400 hover:border-slate-300'} ${isDone ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    {prog.done ? <LucideCheckSquare/> : <LucideSquare/>} Bearbeitet
                                </button>
                                
                                {reqCheck && (
                                    <button 
                                        onClick={() => updateTaskProgress(task.id, 'checked', !prog.checked)} 
                                        disabled={isDone} 
                                        className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-3 transition border-2 ${prog.checked ? 'bg-green-50 border-green-500 text-green-700' : 'border-slate-200 text-slate-400 hover:border-slate-300'} ${isDone ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {prog.checked ? <LucideCheckSquare/> : <LucideSquare/>} Kontrolliert
                                    </button>
                                )}

                                {reqSign && (
                                    <div className="pt-2">
                                        {prog.signature ? (
                                            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                                                <div className="flex items-center gap-2"><LucidePenTool className="text-green-500" size={16}/><div className="text-xs font-bold uppercase text-slate-400">Unterschrift</div></div>
                                                <img src={prog.signature} className="h-6 opacity-80" alt="Sig" />
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={() => { setActiveTaskId(task.id); setShowSigModal(true); }} 
                                                disabled={!prog.done || (reqCheck && !prog.checked)} 
                                                className={`w-full py-3 bg-slate-800 text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 ${(!prog.done || (reqCheck && !prog.checked)) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-700'}`}
                                            >
                                                <LucidePenTool size={16}/> Lehrer Unterschrift
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {hasProgress && (
                                <div className="mt-4 flex justify-end">
                                    <button 
                                        onClick={() => resetTaskProgress(task.id)}
                                        className="text-[10px] flex items-center gap-1 text-slate-300 hover:text-red-400 font-bold uppercase tracking-wider transition"
                                    >
                                        <LucideRotateCcw size={12}/> Zurücksetzen
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
         </div>
         <ToolsOverlay 
            showMenu={showToolsMenu} setShowMenu={setShowToolsMenu} 
            activeTool={activeTool} setActiveTool={setActiveTool}
            homework={homework} toggleHomework={toggleHomework} deleteHomework={deleteHomework} addHomework={addHomework}
            events={events} deleteEvent={deleteEvent} addEvent={addEvent}
            scratchCanvasRef={scratchCanvasRef} startDrawing={startDrawing} draw={draw} stopDrawing={stopDrawing} clearCanvas={clearCanvas}
         />
         {/* FAB for AI */}
         <div className="fixed bottom-24 right-6 z-40">
             <button onClick={() => setShowAiModal(true)} className="w-12 h-12 bg-white text-indigo-600 rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition border border-indigo-100"><span className="text-xl">🤖</span></button>
         </div>

         {/* AI Modal */}
         {showAiModal && (
             <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
                 <div className="bg-white w-full max-w-md h-[80vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl">
                     <div className="p-4 bg-indigo-600 text-white flex justify-between items-center shadow-md">
                         <div className="flex items-center gap-2">
                             <span className="text-2xl">🤖</span>
                             <div>
                                 <h3 className="font-bold">Lern-Buddy</h3>
                                 <p className="text-xs opacity-75">{activeChapter.title}</p>
                             </div>
                         </div>
                         <button onClick={() => setShowAiModal(false)}><LucideX/></button>
                     </div>
                     <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                         {aiMessages.map((msg, i) => (
                             <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                 <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-sm'}`}>
                                     {msg.text}
                                 </div>
                             </div>
                         ))}
                         {aiLoading && <div className="text-center text-slate-400 text-xs animate-pulse">Lern-Buddy tippt...</div>}
                         <div ref={chatEndRef} />
                     </div>
                     <div className="p-3 border-t bg-white flex gap-2">
                         <input 
                            type="text" 
                            value={aiInput}
                            onChange={(e) => setAiInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && sendAiMessage()}
                            className="flex-1 border p-2 rounded-xl text-sm outline-none focus:border-indigo-500"
                            placeholder="Frag mich etwas..." 
                         />
                         <button onClick={() => sendAiMessage()} disabled={aiLoading} className="bg-indigo-600 text-white p-2 rounded-xl disabled:opacity-50"><LucideSend size={20}/></button>
                     </div>
                 </div>
             </div>
         )}

         {showSigModal && (
            <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-lg rounded-2xl overflow-hidden flex flex-col">
                    <div className="p-4 border-b flex justify-between items-center bg-slate-50"><h3 className="font-bold">Unterschrift Lehrer</h3><button onClick={() => setShowSigModal(false)}><LucideX/></button></div>
                    <div className="p-4 bg-slate-100"><canvas ref={sigCanvasRef} width={400} height={200} className="w-full h-48 bg-white rounded-xl shadow-inner touch-none" onMouseDown={(e) => startDrawing(e, sigCanvasRef)} onMouseMove={(e) => draw(e, sigCanvasRef)} onMouseUp={() => stopDrawing(sigCanvasRef)} onTouchStart={(e) => startDrawing(e, sigCanvasRef)} onTouchMove={(e) => draw(e, sigCanvasRef)} onTouchEnd={() => stopDrawing(sigCanvasRef)}></canvas></div>
                    <div className="p-4 border-t flex justify-between"><button onClick={() => clearCanvas(sigCanvasRef)} className="text-red-400 font-bold px-4">Löschen</button><button onClick={saveSignature} className="bg-green-500 text-white font-bold px-6 py-2 rounded-xl">Speichern</button></div>
                </div>
            </div>
         )}
      </div>
    );
  }

  // VIEW 2: TOPIC DETAIL (CHAPTER LIST) - ADDED THIS VIEW
  if (activeTopic) {
      // Calculate progress for this specific topic
      let totalTasks = 0;
      let doneTasks = 0;
      activeTopic.chapters.forEach(c => {
          const tasks = c.tasks || (c.task ? [{id: c.id, ...c}] : []);
          totalTasks += tasks.length;
          tasks.forEach(t => {
              const p = progress[t.id];
              const reqSign = t.requireSign !== false;
              const reqCheck = t.requireCheck !== false;
              if(reqSign) { if(p?.signature) doneTasks++; }
              else if (reqCheck) { if(p?.checked) doneTasks++; }
              else { if(p?.done) doneTasks++; }
          });
      });

      const perc = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);
      const remainingTasks = totalTasks - doneTasks;
      
      return (
        <div className="h-screen flex flex-col bg-slate-50">
            <div className="bg-indigo-600 p-4 text-white pt-6 pb-6 rounded-b-3xl shadow-xl shadow-indigo-200 z-10 relative"> 
                <button onClick={() => setActiveTopic(null)} className="absolute top-4 left-4 text-indigo-200 hover:text-white transition"><LucideChevronRight className="rotate-180" size={20}/></button>
                <div className="text-center"> {/* Centered title to save space or layout better? No, kept left align as per design but compacted */}
                     {/* Actually, let's keep the layout but tighter */}
                </div>
                
                {/* Adjusted Title Area */}
                <div className="mt-2 mb-2 pl-8"> {/* Added padding-left for the back button space */}
                    <h1 className="text-2xl font-black text-white leading-tight">{activeTopic.title}</h1>
                    <p className="text-indigo-200 text-xs font-medium">{activeTopic.chapters?.length || 0} Kapitel</p>
                </div>
                
                {showGrades && (
                    <ProgressBarWithBadges percentage={perc} thresholds={thresholds} variant="header" />
                )}

                {/* STUDY PLANNER */}
                <StudyPlannerWidget 
                    examDate={examDate} 
                    onDateChange={saveExamDate} 
                    remainingTasks={remainingTasks} 
                />
            </div>
            <div className="flex-1 overflow-y-auto p-6 -mt-4 pt-8 space-y-4 max-w-2xl mx-auto w-full pb-32">
                {(activeTopic.chapters || []).map((chapter, idx) => (
                    <div key={chapter.id || idx} onClick={() => setActiveChapter(chapter)} className="bg-white p-5 rounded-2xl shadow-sm hover:shadow-md transition cursor-pointer border border-slate-100 flex items-center justify-between group">
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
                ))}
                {(activeTopic.chapters || []).length === 0 && <div className="text-center text-slate-400 mt-10">Keine Kapitel vorhanden.</div>}
            </div>
             <ToolsOverlay 
                showMenu={showToolsMenu} setShowMenu={setShowToolsMenu} 
                activeTool={activeTool} setActiveTool={setActiveTool}
                homework={homework} toggleHomework={toggleHomework} deleteHomework={deleteHomework} addHomework={addHomework}
                events={events} deleteEvent={deleteEvent} addEvent={addEvent}
                scratchCanvasRef={scratchCanvasRef} startDrawing={startDrawing} draw={draw} stopDrawing={stopDrawing} clearCanvas={clearCanvas}
             />
        </div>
      );
  }

  const topics = course.topics || [];
  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <div className="bg-indigo-600 p-6 text-white pt-12 pb-8 rounded-b-[2.5rem] shadow-xl shadow-indigo-200 z-10">
         <button onClick={() => setView('landing')} className="text-indigo-200 hover:text-white text-xs mb-4 flex items-center gap-1"><LucideLogOut size={12}/> Verlassen</button>
         <h1 className="text-4xl font-black mb-2 drop-shadow-sm text-white">{course.title}</h1>
         <p className="text-indigo-200 text-sm font-medium">Willkommen zurück!</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6 -mt-4 pt-8 space-y-4 max-w-2xl mx-auto w-full pb-32">
         {topics.map((topic, idx) => {
             const total = topic.chapters.length; // Approximate, ideally count tasks
             
             // Calculate done count based on requirements (recursive count of tasks)
             let totalTasks = 0;
             let doneTasks = 0;
             topic.chapters.forEach(c => {
                 const tasks = c.tasks || (c.task ? [{id: c.id, ...c}] : []);
                 totalTasks += tasks.length;
                 tasks.forEach(t => {
                     const p = progress[t.id];
                     const reqSign = t.requireSign !== false;
                     const reqCheck = t.requireCheck !== false;
                     if(reqSign) { if(p?.signature) doneTasks++; }
                     else if (reqCheck) { if(p?.checked) doneTasks++; }
                     else { if(p?.done) doneTasks++; }
                 });
             });

             const perc = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);
             
             return (
                 <div key={topic.id || idx} onClick={() => setActiveTopic(topic)} className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition cursor-pointer border border-slate-100">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg">{topic.title.charAt(0)}</div>
                            <div><h3 className="font-extrabold text-xl text-indigo-900 tracking-tight">{topic.title}</h3><p className="text-xs text-slate-400">{total} Kapitel</p></div>
                        </div>
                        <LucideChevronRight className="text-slate-300"/>
                    </div>
                    {showGrades && (
                        <ProgressBarWithBadges percentage={perc} thresholds={thresholds} variant="card" />
                    )}
                 </div>
             );
         })}
         {topics.length === 0 && <div className="text-center text-slate-400 mt-10">Dieser Kurs hat noch keine Themen.</div>}
      </div>
      <ToolsOverlay 
            showMenu={showToolsMenu} setShowMenu={setShowToolsMenu} 
            activeTool={activeTool} setActiveTool={setActiveTool}
            homework={homework} toggleHomework={toggleHomework} deleteHomework={deleteHomework} addHomework={addHomework}
            events={events} deleteEvent={deleteEvent} addEvent={addEvent}
            scratchCanvasRef={scratchCanvasRef} startDrawing={startDrawing} draw={draw} stopDrawing={stopDrawing} clearCanvas={clearCanvas}
         />
    </div>
  );
}

// NEW: STUDY PLANNER WIDGET
function StudyPlannerWidget({ examDate, onDateChange, remainingTasks }) {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // Fix: Parse input date as local date to prevent timezone offsets
    let target = null;
    if(examDate) {
        const [y, m, d] = examDate.split('-');
        target = new Date(y, m - 1, d);
    }

    let daysLeft = 0;
    let tasksPerDay = 0;
    let message = { text: "Datum wählen", color: "bg-slate-800 text-white" };

    if (target) {
        const diffTime = target - today;
        // Exact day difference
        daysLeft = Math.round(diffTime / (1000 * 60 * 60 * 24));
        
        if(daysLeft > 0) {
            // daysLeft excludes the exam day itself effectively because diff(Tomorrow - Today) = 1.
            // We have 1 day (Today) to work.
            tasksPerDay = Math.ceil(remainingTasks / daysLeft);
            
            if (tasksPerDay > 5) message = { text: "Gas geben! 🔥", color: "bg-red-500 text-white" };
            else if (tasksPerDay > 2) message = { text: "Dranbleiben 💪", color: "bg-yellow-500 text-white" };
            else message = { text: "Ganz entspannt 😌", color: "bg-green-500 text-white" };
        } else if (daysLeft === 0) {
            message = { text: "Viel Erfolg! 🍀", color: "bg-indigo-500 text-white" };
        } else {
            message = { text: "Vorbei", color: "bg-slate-500 text-white" };
        }
    }

    return (
        <div className="mt-2 bg-white/10 backdrop-blur-sm p-3 rounded-xl border border-white/20 flex flex-col gap-2"> {/* Reduced padding/gap */}
            <div className="flex justify-between items-center text-white">
                <div className="flex items-center gap-1.5 font-bold text-xs">
                    <LucideClock size={14} className="text-indigo-200"/>
                    <span>Lernplaner</span>
                </div>
                <input 
                    type="date" 
                    value={examDate} 
                    onChange={(e) => onDateChange(e.target.value)}
                    className="bg-white/20 text-white text-[10px] p-1 rounded-md outline-none border border-white/10 focus:bg-white/30 transition font-bold"
                />
            </div>

            {target && daysLeft >= 0 && (
                <div className="flex items-stretch gap-2">
                    <div className="flex-1 bg-white/20 rounded-lg p-1.5 flex flex-col items-center justify-center border border-white/10">
                        <span className="text-[8px] uppercase font-bold text-indigo-200">Noch</span>
                        <span className="text-base font-black text-white leading-none">{daysLeft}</span>
                        <span className="text-[8px] text-indigo-100">Tage</span>
                    </div>
                    <div className="flex-1 bg-white/20 rounded-lg p-1.5 flex flex-col items-center justify-center border border-white/10">
                        <span className="text-[8px] uppercase font-bold text-indigo-200">Ziel</span>
                        <span className="text-base font-black text-white leading-none">{tasksPerDay}</span>
                        <span className="text-[8px] text-indigo-100">Aufg./Tag</span>
                    </div>
                    <div className={`flex-1 rounded-lg p-1.5 flex flex-col items-center justify-center font-bold text-[10px] text-center shadow-lg leading-tight ${message.color}`}>
                        {message.text}
                    </div>
                </div>
            )}
        </div>
    );
}

// Helper Component for the Badge Progress Bar
function ProgressBarWithBadges({ percentage, thresholds, variant = 'card' }) {
  const isHeader = variant === 'header';

  // Logic to find next grade
  const sorted = Object.entries(thresholds).sort((a,b) => b[1] - a[1]); // 1:90, 2:75 ...
  
  let currentGrade = 6;
  for(let [g, t] of sorted) {
      if(percentage >= t) { currentGrade = g; break; }
  }

  // Find next target
  const ascending = Object.entries(thresholds).sort((a,b) => a[1] - b[1]);
  const next = ascending.find(([g, t]) => t > percentage);
  
  const missing = next ? next[1] - percentage : 0;
  const nextGrade = next ? next[0] : null;

  if (isHeader) {
      return (
        <div className="mt-2 bg-indigo-800/40 p-3 rounded-xl backdrop-blur-md border border-indigo-500/20 shadow-lg"> {/* Reduced padding/margin */}
            <div className="flex justify-between items-end mb-2 px-1"> {/* Reduced margin */}
                <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-indigo-200 uppercase tracking-widest mb-0.5 opacity-70">Dein Level</span>
                    <div className="flex items-end gap-2 text-white">
                        <span className="text-3xl font-black drop-shadow-lg leading-none">{currentGrade}</span> {/* Smaller Text */}
                        <div className="flex flex-col mb-0.5">
                            <span className="text-[10px] font-bold opacity-90 leading-none">Note</span>
                            <span className="text-[10px] font-bold text-emerald-300 mt-0">{percentage}% geschafft</span>
                        </div>
                    </div>
                </div>
                
                <div className="text-right mb-0.5">
                     {nextGrade ? (
                        <div className="flex items-center gap-1.5 bg-indigo-950/50 border border-indigo-400/30 px-2 py-1 rounded-lg text-[10px] font-bold text-indigo-100 shadow-inner">
                            <LucideStar size={10} className="text-yellow-400 fill-yellow-400 animate-pulse"/>
                            <span>Noch <span className="text-white">{missing}%</span> bis <span className="text-emerald-300">Note {nextGrade}</span></span>
                        </div>
                    ) : (
                        <div className="bg-amber-500/20 border border-amber-400/50 px-3 py-1 rounded-lg text-[10px] font-bold text-amber-100 shadow-sm flex items-center gap-1.5">
                            <LucideTrophy size={12} className="text-amber-300"/> Champion!
                        </div>
                    )}
                </div>
            </div>

            <div className="relative h-2.5 bg-black/20 rounded-full w-full shadow-inner ring-1 ring-white/5"> {/* Thinner bar */}
                <div 
                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 rounded-full transition-all duration-1000 shadow-[0_0_20px_rgba(52,211,153,0.3)] relative overflow-hidden"
                    style={{ width: `${percentage}%` }}
                >
                    <div className="absolute inset-0 bg-white/20 skew-x-12 -translate-x-full animate-[shimmer_2s_infinite]"></div>
                </div>

                {Object.entries(thresholds).map(([g, t]) => {
                    const reached = percentage >= t;
                    const isNext = nextGrade === g;
                    return (
                        <div 
                            key={g}
                            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-500`}
                            style={{ left: `${t}%` }}
                        >
                            <div className={`
                                w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black border-[1.5px] shadow-lg relative z-10
                                ${reached 
                                    ? 'bg-emerald-500 border-white text-white scale-110 shadow-emerald-500/50' 
                                    : isNext 
                                        ? 'bg-indigo-900 border-indigo-300 text-indigo-200 ring-2 ring-indigo-400/30' 
                                        : 'bg-indigo-950 border-indigo-800 text-indigo-700'
                                }
                            `}>
                                {g}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
      );
  }

  // Card Variant (Compact)
  return (
    <div className="mt-3">
        <div className="flex justify-between items-end mb-2">
            <div className="flex items-baseline gap-1">
                <div className="text-sm font-black text-slate-400 uppercase tracking-wider">Note:</div>
                <div className="text-2xl font-black text-indigo-900">{currentGrade}</div>
                <div className="text-xs font-bold text-slate-500 ml-1">({percentage}%)</div>
            </div>
            {nextGrade && <div className="text-[10px] font-bold text-indigo-400 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">noch {missing}%</div>}
        </div>
        
        <div className="relative h-2.5 bg-slate-100 rounded-full w-full overflow-visible">
            <div 
                className="absolute top-0 left-0 h-full bg-indigo-600 rounded-full transition-all duration-1000"
                style={{ width: `${percentage}%` }}
            ></div>
             {Object.entries(thresholds).map(([g, t]) => {
                const reached = percentage >= t;
                return (
                    <div 
                        key={g}
                        className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full border border-white transition-all z-10 ${reached ? 'bg-indigo-600 scale-125' : 'bg-slate-300'}`}
                        style={{ left: `${t}%` }}
                    />
                );
            })}
        </div>
    </div>
  );
}

// --- HELPER COMPONENT: TOOLS OVERLAY ---
function ToolsOverlay({ showMenu, setShowMenu, activeTool, setActiveTool, homework, toggleHomework, deleteHomework, addHomework, events, deleteEvent, addEvent, scratchCanvasRef, startDrawing, draw, stopDrawing, clearCanvas }) {
    return (
        <>
            <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
                {showMenu && (
                    <>
                        <button onClick={() => setActiveTool('homework')} className="w-12 h-12 bg-white text-indigo-600 rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition"><LucideListTodo/></button>
                        <button onClick={() => setActiveTool('calendar')} className="w-12 h-12 bg-white text-orange-500 rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition"><LucideCalendar/></button>
                        <button onClick={() => setActiveTool('scratch')} className="w-12 h-12 bg-white text-blue-500 rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition"><LucidePenTool/></button>
                    </>
                )}
                <button onClick={() => setShowMenu(!showMenu)} className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-white text-2xl transition hover:scale-105 ${showMenu ? 'bg-slate-700 rotate-45' : 'bg-indigo-600'}`}><LucidePlus/></button>
            </div>

            {activeTool === 'homework' && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 h-[60vh] flex flex-col">
                        <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-xl">Hausaufgaben</h3><button onClick={() => setActiveTool(null)}><LucideX/></button></div>
                        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                            {homework.map(h => (
                                <div key={h.id} className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg">
                                    <button onClick={() => toggleHomework(h.id)}>{h.done ? <LucideCheckCircle className="text-green-500"/> : <LucideCircle className="text-slate-300"/>}</button>
                                    <span className={`flex-1 text-sm ${h.done ? 'line-through text-slate-300' : ''}`}>{h.text}</span>
                                    <button onClick={() => deleteHomework(h.id)} className="text-red-300"><LucideTrash size={14}/></button>
                                </div>
                            ))}
                            {homework.length === 0 && <div className="text-center text-slate-400 mt-10">Alles erledigt! 🎉</div>}
                        </div>
                        <button onClick={addHomework} className="w-full py-3 bg-indigo-100 text-indigo-700 font-bold rounded-xl flex items-center justify-center gap-2"><LucidePlus size={16}/> Eintrag hinzufügen</button>
                    </div>
                </div>
            )}

            {activeTool === 'calendar' && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 h-[60vh] flex flex-col">
                        <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-xl">Termine</h3><button onClick={() => setActiveTool(null)}><LucideX/></button></div>
                        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                            {events.sort((a,b) => new Date(a.date) - new Date(b.date)).map(ev => (
                                <div key={ev.id} className="bg-orange-50 p-3 rounded-lg border border-orange-100 flex justify-between items-center">
                                    <div><div className="font-bold text-sm text-orange-900">{ev.title}</div><div className="text-xs text-orange-600">{ev.date}</div></div>
                                    <button onClick={() => deleteEvent(ev.id)} className="text-orange-300 hover:text-red-500"><LucideTrash size={14}/></button>
                                </div>
                            ))}
                        </div>
                        <button onClick={addEvent} className="w-full py-3 bg-orange-100 text-orange-700 font-bold rounded-xl flex items-center justify-center gap-2"><LucidePlus size={16}/> Termin eintragen</button>
                    </div>
                </div>
            )}

            {activeTool === 'scratch' && (
                <div className="fixed inset-0 z-50 bg-white flex flex-col">
                    <div className="bg-blue-600 p-4 text-white flex justify-between items-center shadow-md">
                        <h3 className="font-bold flex items-center gap-2"><LucidePenTool/> Schmierblatt</h3>
                        <div className="flex gap-4">
                            <button onClick={() => clearCanvas(scratchCanvasRef)}><LucideEraser/></button>
                            <button onClick={() => setActiveTool(null)} className="bg-white/20 px-3 py-1 rounded text-sm">Schließen</button>
                        </div>
                    </div>
                    <div className="flex-1 bg-slate-50 relative">
                        <canvas ref={scratchCanvasRef} width={window.innerWidth} height={window.innerHeight} className="w-full h-full touch-none cursor-crosshair"
                            onMouseDown={(e) => startDrawing(e, scratchCanvasRef)} onMouseMove={(e) => draw(e, scratchCanvasRef)} onMouseUp={() => stopDrawing(scratchCanvasRef)}
                            onTouchStart={(e) => startDrawing(e, scratchCanvasRef)} onTouchMove={(e) => draw(e, scratchCanvasRef)} onTouchEnd={() => stopDrawing(scratchCanvasRef)}
                        ></canvas>
                    </div>
                </div>
            )}
        </>
    );
}