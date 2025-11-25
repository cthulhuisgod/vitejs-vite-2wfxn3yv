// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, addDoc, query, orderBy, 
  onSnapshot, doc, setDoc, getDoc, serverTimestamp 
} from 'firebase/firestore';
import * as LucideIcons from 'lucide-react';

// --- 1. CONFIGURATION ---

// [A] DATABASE CONFIG (Firebase)
const firebaseConfig = {
  apiKey: "AIzaSyBXCksPYgrLRjTruAqEf6G6w5HB6O5kiGk",
  authDomain: "hallowed-hand-console.firebaseapp.com",
  projectId: "hallowed-hand-console",
  storageBucket: "hallowed-hand-console.firebasestorage.app",
  messagingSenderId: "836495554412",
  appId: "1:836495554412:web:80dc2734be6bda0927a549",
  measurementId: "G-0G0GS2SYNY"
};

// [B] AI BRAIN CONFIG (Gemini)
const GEMINI_API_KEY = "AIzaSyCI5OoLiqoW4l4OZ78LjeTC28ZeOxBR99c";

// Initialize Firebase
let db;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  console.log("Firebase initialized successfully");
} catch (e) { 
  console.error("Firebase Initialization Error:", e); 
}

// --- 2. TYPES ---
enum AppState {
  LOGIN = 'LOGIN',
  MAIN = 'MAIN'
}

// --- 3. SERVICES (Merged from ./services) ---
const DEFAULT_AGENTS = [
  { id: 'shop-admin', name: 'Shop Manager', role: 'Operations', icon: 'Briefcase', systemPrompt: "You are the Shop Manager. You know shop minimums ($100), deposit policies (non-refundable), and consent forms." },
  { id: 'gmail-assistant', name: 'Inbox Zero', role: 'Email Asst', icon: 'Mail', systemPrompt: "You are an Executive Assistant. When I paste an email below, categorize it (Booking, Spam, Question) and draft a polite, professional reply based on standard tattoo shop etiquette." },
  { id: 'social-hype', name: 'Hype Man', role: 'Social Media', icon: 'Sparkles', systemPrompt: "You are a Social Media expert for Tattoo Artists. Create captions, reel ideas, and hashtag sets." },
  { id: 'seo-wizard', name: 'SEO Wizard', role: 'Marketing', icon: 'PenTool', systemPrompt: "You are an SEO Specialist. Write blog posts and Google My Business replies to help us rank locally." },
  { id: 'lead-hunter', name: 'The Scout', role: 'Leads', icon: 'Search', systemPrompt: "You are a Business Scout. Find conventions, partnerships, and client outreach opportunities." }
];

const initializeShop = async (shopId) => {
  if (!db) return;
  try {
    const shopRef = doc(db, 'shops', shopId);
    const snap = await getDoc(shopRef);
    if (!snap.exists()) {
      await setDoc(shopRef, { agents: DEFAULT_AGENTS });
    }
  } catch (e) {
    console.error("Error initializing shop:", e);
  }
};

const subscribeToAgents = (shopId, callback) => {
  if (!db) return () => {};
  return onSnapshot(doc(db, 'shops', shopId), (docSnap) => {
    if (docSnap.exists() && docSnap.data().agents) {
      callback(docSnap.data().agents);
    } else {
      callback(DEFAULT_AGENTS);
    }
  });
};

const subscribeToMessages = (shopId, agentId, callback) => {
  if (!db) return () => {};
  const q = query(collection(db, 'shops', shopId, 'messages'), orderBy('timestamp', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const allMsgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    // Filter client-side to keep it simple
    callback(allMsgs.filter(m => m.agentId === agentId));
  });
};

const sendMessageToFirestore = async (shopId, message) => {
  if (!db) return;
  await addDoc(collection(db, 'shops', shopId, 'messages'), message);
};

const updateAgentPrompt = async (shopId, agents) => {
  if (!db) return;
  await setDoc(doc(db, 'shops', shopId), { agents }, { merge: true });
};

const generateAgentResponse = async (systemPrompt, history, userMsg) => {
  // Use Hardcoded Key OR Local Storage
  const apiKey = GEMINI_API_KEY || localStorage.getItem('nexus_gemini_key');
  
  if (!apiKey) return "Please set your Gemini API Key in System Config (or in the code).";
  
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nUser: ${userMsg}` }] }]
      })
    });
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Error from AI.";
  } catch (e) {
    return "Network Error: " + e.message;
  }
};

// --- 4. COMPONENTS (Merged from ./components) ---
const DynamicIcon = ({ name, className, size = 20 }) => {
  const Icon = LucideIcons[name] || LucideIcons.Bot;
  return <Icon size={size} className={className} />;
};

const LoginScreen = ({ onLogin }) => {
  const [input, setInput] = useState('');
  return (
    <div className="flex h-screen items-center justify-center bg-slate-950 text-white p-4">
      <div className="w-full max-w-md p-8 bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl">
        <div className="flex justify-center mb-6 text-amber-500"><LucideIcons.Layout size={48} /></div>
        <h1 className="text-2xl font-bold text-center mb-2 text-amber-500 tracking-widest uppercase">Hallowed Hand</h1>
        <p className="text-center text-slate-400 mb-6 text-sm">Enter Shop ID</p>
        <input 
          value={input} onChange={e => setInput(e.target.value)}
          placeholder="e.g. builttolast"
          className="w-full bg-black border border-slate-700 rounded-lg p-3 mb-4 text-white focus:border-amber-500 outline-none"
        />
        <button onClick={() => onLogin(input)} className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-lg transition-colors">
          Jack In
        </button>
      </div>
    </div>
  );
};

const SettingsModal = ({ isOpen, onClose, agents, onUpdateAgentPrompt }) => {
  if (!isOpen) return null;
  const [apiKey, setApiKey] = useState(localStorage.getItem('nexus_gemini_key') || GEMINI_API_KEY);
  const [editingAgent, setEditingAgent] = useState(null);

  const saveKey = () => {
    localStorage.setItem('nexus_gemini_key', apiKey);
    alert('API Key Saved');
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 w-full max-w-2xl rounded-xl border border-slate-700 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between mb-6">
          <h2 className="text-xl font-bold text-white">System Configuration</h2>
          <button onClick={onClose}><LucideIcons.X className="text-slate-400" /></button>
        </div>

        <div className="mb-8">
          <label className="text-xs font-bold text-slate-500 uppercase">Gemini API Key</label>
          <div className="flex gap-2 mt-2">
            <input 
              type="password" 
              value={apiKey} 
              onChange={e => setApiKey(e.target.value)} 
              placeholder={GEMINI_API_KEY ? "Key Hardcoded in Code" : "Paste Key Here"}
              className="flex-1 bg-black border border-slate-700 rounded p-2 text-white" 
            />
            <button onClick={saveKey} className="bg-amber-600 text-white px-4 rounded font-bold">Save</button>
          </div>
        </div>

        <div>
           <label className="text-xs font-bold text-slate-500 uppercase mb-4 block">Agent Training</label>
           <div className="space-y-4">
             {agents.map(a => (
               <div key={a.id} className="bg-slate-950 p-4 rounded border border-slate-800">
                 <div className="flex justify-between items-center mb-2">
                   <span className="font-bold text-amber-500">{a.name}</span>
                   <button onClick={() => setEditingAgent(editingAgent?.id === a.id ? null : a)} className="text-xs text-slate-400 underline">
                     {editingAgent?.id === a.id ? 'Close' : 'Edit Prompt'}
                   </button>
                 </div>
                 {editingAgent?.id === a.id ? (
                   <div>
                     <textarea 
                       className="w-full bg-black text-slate-300 text-sm p-3 rounded border border-slate-700 h-32"
                       value={editingAgent.systemPrompt}
                       onChange={e => setEditingAgent({...editingAgent, systemPrompt: e.target.value})}
                     />
                     <button 
                       onClick={() => { onUpdateAgentPrompt(a.id, editingAgent.systemPrompt); setEditingAgent(null); }}
                       className="mt-2 bg-green-600 text-white text-xs px-3 py-1 rounded"
                     >
                       Save Training
                     </button>
                   </div>
                 ) : (
                   <p className="text-xs text-slate-500 truncate">{a.systemPrompt}</p>
                 )}
               </div>
             ))}
           </div>
        </div>
      </div>
    </div>
  );
};

// --- 5. MAIN APP COMPONENT (The logic you pasted) ---
const App = () => {
  const [appState, setAppState] = useState(AppState.LOGIN);
  const [shopId, setShopId] = useState('');
  const [agents, setAgents] = useState([]);
  const [activeAgentId, setActiveAgentId] = useState(null);
  const [messages, setMessages] = useState([]);
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const storedShopId = localStorage.getItem('inkcommand_shopId');
    if (storedShopId === 'builttolast' || (storedShopId && storedShopId.length > 3)) {
      handleLogin(storedShopId);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (appState === AppState.MAIN && shopId) {
      return subscribeToAgents(shopId, (fetchedAgents) => {
        setAgents(fetchedAgents);
        if (!activeAgentId && fetchedAgents.length > 0) setActiveAgentId(fetchedAgents[0].id);
      });
    }
  }, [appState, shopId, activeAgentId]);

  useEffect(() => {
    if (appState === AppState.MAIN && shopId && activeAgentId) {
      return subscribeToMessages(shopId, activeAgentId, setMessages);
    }
  }, [appState, shopId, activeAgentId]);

  const handleLogin = async (id) => {
    setShopId(id);
    localStorage.setItem('inkcommand_shopId', id);
    await initializeShop(id);
    setAppState(AppState.MAIN);
  };

  const handleLogout = () => {
    localStorage.removeItem('inkcommand_shopId');
    setShopId('');
    setAppState(AppState.LOGIN);
  };

  const handleUpdateAgentPrompt = async (agentId, newPrompt) => {
    const updatedAgents = agents.map(a => a.id === agentId ? { ...a, systemPrompt: newPrompt } : a);
    await updateAgentPrompt(shopId, updatedAgents);
  };

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!inputText.trim() || !activeAgentId) return;

    const currentAgent = agents.find(a => a.id === activeAgentId);
    if (!currentAgent) return;

    const userMsgText = inputText;
    setInputText('');

    await sendMessageToFirestore(shopId, {
      text: userMsgText, sender: 'user', agentId: activeAgentId, timestamp: Date.now()
    });

    setIsTyping(true);
    const responseText = await generateAgentResponse(currentAgent.systemPrompt, messages, userMsgText);
    setIsTyping(false);

    await sendMessageToFirestore(shopId, {
      text: responseText, sender: 'ai', agentId: activeAgentId, timestamp: Date.now()
    });
  };

  if (appState === AppState.LOGIN) return <LoginScreen onLogin={handleLogin} />;

  const activeAgent = agents.find(a => a.id === activeAgentId);

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden text-gray-200 font-sans">
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`fixed md:static inset-y-0 left-0 z-30 w-72 bg-slate-900 border-r border-slate-700 transform transition-transform duration-300 ease-in-out flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
          <h1 className="text-xl font-bold text-amber-500 tracking-tight uppercase">HALLOWED HAND</h1>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-gray-400"><DynamicIcon name="X" /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Agents</h3>
          {agents.map(agent => (
            <button key={agent.id} onClick={() => { setActiveAgentId(agent.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all duration-200 border ${activeAgentId === agent.id ? 'bg-slate-800 border-amber-500/50 text-white shadow-lg' : 'border-transparent text-gray-400 hover:bg-slate-800 hover:text-gray-200'}`}
            >
              <DynamicIcon name={agent.icon} className={activeAgentId === agent.id ? 'text-amber-500' : 'text-gray-500'} />
              <div className="text-left">
                <div className="font-medium text-sm">{agent.name}</div>
                <div className="text-[10px] opacity-60 truncate max-w-[140px]">{agent.role}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-slate-700 space-y-2">
          <button onClick={() => setSettingsOpen(true)} className="w-full flex items-center gap-3 p-3 rounded-lg text-gray-400 hover:bg-slate-800 hover:text-white transition-colors">
            <DynamicIcon name="Settings" size={18} /> <span className="text-sm font-medium">System Config</span>
          </button>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 p-3 rounded-lg text-red-900/60 hover:text-red-500 hover:bg-red-950/30 transition-colors">
            <DynamicIcon name="LogOut" size={18} /> <span className="text-sm font-medium">Jack Out</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full relative">
        <header className="h-16 bg-slate-900/50 backdrop-blur border-b border-slate-700 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden text-gray-400"><DynamicIcon name="Menu" /></button>
            {activeAgent && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500"><DynamicIcon name={activeAgent.icon} size={18} /></div>
                <div>
                  <h2 className="font-bold text-gray-100">{activeAgent.name}</h2>
                  <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span><span className="text-xs text-green-500 font-mono">ONLINE</span></div>
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-4">
              <DynamicIcon name="Bot" size={48} className="opacity-20" />
              <p>Initialize conversation with {activeAgent?.name || 'Agent'}...</p>
            </div>
          )}
          {messages.map((msg, idx) => {
            const isUser = msg.sender === 'user';
            return (
              <div key={msg.id || idx} className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl p-4 shadow-sm ${isUser ? 'bg-amber-600 text-black rounded-tr-none' : 'bg-slate-800 border border-slate-700 text-gray-200 rounded-tl-none'}`}>
                  <p className="whitespace-pre-wrap text-sm md:text-base leading-relaxed">{msg.text}</p>
                </div>
              </div>
            );
          })}
          {isTyping && <div className="text-slate-500 text-xs animate-pulse ml-4">Agent is thinking...</div>}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-slate-900 border-t border-slate-700">
          <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto relative flex items-center gap-2">
            <input value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder={`Message ${activeAgent?.name || 'Agent'}...`} className="flex-1 bg-slate-950 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-amber-500/50 transition-colors shadow-inner" />
            <button type="submit" disabled={!inputText.trim()} className="bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 disabled:text-gray-600 text-black rounded-xl p-3 transition-all transform hover:scale-105 active:scale-95"><DynamicIcon name="Send" size={20} /></button>
          </form>
        </div>
      </main>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} agents={agents} onUpdateAgentPrompt={handleUpdateAgentPrompt} />
    </div>
  );
};

export default App;