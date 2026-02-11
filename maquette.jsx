import React, { useState, useEffect } from 'react';
import { 
  Package, Cpu, Database, ShieldCheck, Terminal, Search, 
  ShoppingCart, Star, Zap, Lock, Download, Server, 
  Code, Globe, CheckCircle, Menu, X, Briefcase, 
  TrendingUp, FileText, MessageSquare, ChevronRight, 
  Activity, Radio, Hash, Aperture
} from 'lucide-react';

// --- STYLES & FONTS INJECTION ---
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap');
    
    :root {
      --color-primary: #FF5F1F; /* Safety Orange */
      --color-secondary: #00F0FF; /* Cyber Cyan */
      --color-bg: #050505;
      --color-surface: #0F1115;
      --color-border: #2A2F3A;
    }

    body {
      background-color: var(--color-bg);
      font-family: 'Chakra Petch', sans-serif;
      color: #E2E8F0;
      overflow-x: hidden;
    }

    .font-mono {
      font-family: 'JetBrains Mono', monospace;
    }

    /* Custom Scrollbar */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: #000; 
    }
    ::-webkit-scrollbar-thumb {
      background: #333; 
    }
    ::-webkit-scrollbar-thumb:hover {
      background: var(--color-primary); 
    }

    /* Animations */
    @keyframes scanline {
      0% { transform: translateY(-100%); }
      100% { transform: translateY(100%); }
    }
    .animate-scanline {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: linear-gradient(to bottom, transparent, rgba(0, 240, 255, 0.03), transparent);
      animation: scanline 4s linear infinite;
      pointer-events: none;
      z-index: 50;
    }

    @keyframes pulse-border {
      0%, 100% { border-color: rgba(255, 95, 31, 0.3); }
      50% { border-color: rgba(255, 95, 31, 0.8); }
    }

    .clip-corner {
      clip-path: polygon(
        0 0, 
        100% 0, 
        100% calc(100% - 15px), 
        calc(100% - 15px) 100%, 
        0 100%
      );
    }
    
    .clip-corner-top-right {
      clip-path: polygon(
        0 0, 
        calc(100% - 20px) 0, 
        100% 20px, 
        100% 100%, 
        0 100%
      );
    }

    .tech-grid {
      background-size: 40px 40px;
      background-image:
        linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
    }

    .hazard-stripe {
      background: repeating-linear-gradient(
        45deg,
        rgba(0, 0, 0, 0.2),
        rgba(0, 0, 0, 0.2) 10px,
        rgba(255, 95, 31, 0.05) 10px,
        rgba(255, 95, 31, 0.05) 20px
      );
    }
  `}</style>
);

// --- DATA ---
const MOCK_DATA = {
  npm: [
    {
      id: 1, title: "Boursorama Connect MCP", author: "FinTechSecure", price: "15€ / MO",
      rating: 4.9, downloads: "1.2k", description: "Secure interface for banking API. Read-only access for balances/transactions.",
      tags: ["FINANCE", "MCP", "SECURE"], securityLevel: "Lv.5 CRITICAL",
      stat: "99.9% UPTIME"
    },
    {
      id: 2, title: "Impôts.gouv Interface", author: "AdminBotFR", price: "25€ / MO",
      rating: 4.7, downloads: "850", description: "Official connector for tax declaration & retrieval. Sandboxed environment.",
      tags: ["GOV", "LEGAL", "FR"], securityLevel: "Lv.5 CRITICAL",
      stat: "CERTIFIED"
    },
    {
      id: 3, title: "Notion Writer Pro", author: "ProductivityDev", price: "5€ / LIC",
      rating: 4.5, downloads: "5k+", description: "Advanced Notion page manipulation. Recursive block editing supported.",
      tags: ["PROD", "CMS"], securityLevel: "Lv.3 STANDARD",
      stat: "V2.1.0"
    }
  ],
  gig: [
    {
      id: 101, title: "ImmoScraper 3000", author: "ScrapeMaster", price: "0.50€ / RUN",
      speed: "< 120s", description: "Targeted extraction from 50+ real estate platforms. Telegram report generation.",
      status: "IDLE", type: "EPHEMERAL", useCase: "DEPLOY FOR: DAILY MARKET WATCH"
    },
    {
      id: 102, title: "SEO Auditor Agent", author: "WebRanker", price: "2.00€ / RUN",
      speed: "< 600s", description: "Deep crawl analysis. Meta tags, lighthouse perf, broken link detection.",
      status: "BUSY", type: "ANALYSIS", useCase: "DEPLOY FOR: PRE-DELIVERY CHECK"
    },
    {
      id: 103, title: "Meeting Summarizer", author: "VoiceAI", price: "0.10€ / MIN",
      speed: "REAL-TIME", description: "Google Meet bot. Real-time transcription & action item extraction.",
      status: "IDLE", type: "ASSISTANT", useCase: "DEPLOY FOR: AUTO-DOCUMENTATION"
    },
    {
      id: 104, title: "Facture OCR Core", author: "AccountBot", price: "0.20€ / DOC",
      speed: "INSTANT", description: "High-precision OCR for invoices. Auto-entry to Excel/Airtable.",
      status: "IDLE", type: "ADMIN", useCase: "DEPLOY FOR: EXPENSE REPORTING"
    }
  ],
  data: [
    {
      id: 201, title: "Normes Élec FR 2026", author: "ElecNorms", price: "150€",
      format: "VECTOR / JSON", size: "250 MB", description: "Complete NF C 15-100 specs + 2026 amendments. Vectorized for RAG.",
      updates: "DAILY"
    },
    {
      id: 202, title: "Code Civil Vectorisé", author: "LegalTechData", price: "300€",
      format: "PINECONE", size: "1.2 GB", description: "Full French legal code. Structurally optimized for zero-hallucination retrieval.",
      updates: "WEEKLY"
    },
    {
      id: 203, title: "Food/Allergen DB", author: "FoodData", price: "45€",
      format: "RAW JSON", size: "50 MB", description: "50k+ ingredients with verified nutritional profiles & allergen flags.",
      updates: "MONTHLY"
    }
  ]
};

// --- PRIMITIVES ---

const TechBorder = ({ children, className = "" }) => (
  <div className={`relative p-[1px] bg-slate-800 ${className} clip-corner group`}>
    <div className="absolute inset-0 bg-slate-700 clip-corner group-hover:bg-[#FF5F1F] transition-colors duration-300" />
    <div className="relative bg-[#0F1115] clip-corner h-full w-full">
      {children}
    </div>
  </div>
);

const SectionHeader = ({ title, subtitle }) => (
  <div className="flex items-end gap-4 mb-8 border-b border-slate-800 pb-2">
    <h2 className="text-3xl font-bold uppercase tracking-wider text-white">
      <span className="text-[#FF5F1F] mr-2">/</span>{title}
    </h2>
    <div className="flex-grow h-[1px] bg-slate-800 mb-2 relative overflow-hidden">
       <div className="absolute top-0 left-0 w-full h-full bg-[#FF5F1F] opacity-30 animate-pulse" style={{transform: 'translateX(-100%)', animation: 'slideRight 2s infinite'}} />
    </div>
    <span className="font-mono text-xs text-slate-500 mb-1">{subtitle}</span>
  </div>
);

const Badge = ({ children, color = "default" }) => {
  const styles = {
    default: "text-slate-400 border-slate-700",
    orange: "text-[#FF5F1F] border-[#FF5F1F]/30 bg-[#FF5F1F]/10",
    cyan: "text-[#00F0FF] border-[#00F0FF]/30 bg-[#00F0FF]/10",
    green: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  };
  
  return (
    <span className={`px-2 py-1 text-[10px] uppercase font-bold tracking-wider border ${styles[color] || styles.default} font-mono`}>
      {children}
    </span>
  );
};

// --- COMPONENTS ---

const Navbar = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'gig', label: 'AGENTS // RENT' },
    { id: 'npm', label: 'SKILLS // BUY' },
    { id: 'data', label: 'DATA // ASSET' },
  ];

  return (
    <nav className="fixed top-0 w-full z-50 bg-[#050505]/90 backdrop-blur-md border-b border-slate-800 h-16">
      <div className="max-w-[1440px] mx-auto px-6 h-full flex items-center justify-between">
        
        {/* LOGO AREA */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#FF5F1F] clip-corner-top-right flex items-center justify-center text-black font-bold text-xl relative overflow-hidden">
            <div className="absolute inset-0 hazard-stripe opacity-20"></div>
            CD
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight text-white leading-none">CLAWDEALS</span>
            <span className="text-[10px] font-mono text-[#FF5F1F] tracking-[0.2em] leading-none mt-1">SYSTEM_ACCESS_GRANTED</span>
          </div>
        </div>

        {/* TABS */}
        <div className="hidden md:flex gap-1 bg-[#0F1115] p-1 clip-corner">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-2 text-sm font-bold tracking-wide transition-all duration-300 clip-corner ${
                activeTab === tab.id 
                  ? 'bg-[#E2E8F0] text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]' 
                  : 'text-slate-500 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* UTILS */}
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center bg-[#0F1115] border border-slate-800 h-9 px-3 w-64">
            <Search className="w-4 h-4 text-slate-500 mr-3" />
            <input 
              type="text" 
              placeholder="SEARCH_CATALOG..." 
              className="bg-transparent border-none focus:outline-none text-xs font-mono text-white w-full placeholder-slate-600 uppercase" 
            />
          </div>
          <button className="h-9 px-4 border border-[#FF5F1F] text-[#FF5F1F] hover:bg-[#FF5F1F] hover:text-black transition-all font-bold text-xs uppercase tracking-widest flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            Connect
          </button>
        </div>
      </div>
      
      {/* DECORATIVE LINE */}
      <div className="absolute bottom-0 left-0 w-full h-[1px] bg-slate-800">
         <div className="absolute left-0 top-0 h-full w-1/3 bg-[#FF5F1F] opacity-50" />
      </div>
    </nav>
  );
};

const HeroHUD = ({ activeTab }) => {
  const content = {
    gig: { title: "TACTICAL AGENT DEPLOYMENT", subtitle: "Ephemeral Execution Runtime", color: "text-[#FF5F1F]" },
    npm: { title: "CERTIFIED SKILL MODULES", subtitle: "MCP Standard Compliant", color: "text-[#00F0FF]" },
    data: { title: "CONTEXTUAL DATA ASSETS", subtitle: "Vectorized Knowledge Bases", color: "text-emerald-400" }
  };
  const current = content[activeTab];

  return (
    <div className="relative pt-32 pb-16 px-6 border-b border-slate-800 bg-[#0A0C10] overflow-hidden">
      <div className="animate-scanline"></div>
      <div className="tech-grid absolute inset-0 opacity-30"></div>
      
      <div className="max-w-[1440px] mx-auto relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className={`w-2 h-2 rounded-full ${activeTab === 'gig' ? 'bg-[#FF5F1F]' : activeTab === 'npm' ? 'bg-[#00F0FF]' : 'bg-emerald-400'} animate-pulse`} />
            <span className="font-mono text-xs text-slate-400 tracking-widest uppercase">System Status: ONLINE // Region: EU-WEST-3</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold uppercase leading-[0.9] tracking-tighter mb-6 text-white text-shadow-glow">
            {current.title.split(' ').map((word, i) => (
              <span key={i} className="block">{word}</span>
            ))}
          </h1>
          <p className="text-lg text-slate-400 font-mono mb-8 max-w-lg border-l-2 border-slate-700 pl-4">
            {activeTab === 'gig' && "Rent specialized AI agents for ephemeral tasks. Pay per execution. Zero infrastructure overhead. Secure sandbox guaranteed."}
            {activeTab === 'npm' && "Equip your bots with verified capabilities. Banking, Gov, and Admin integrations. Code audited daily."}
            {activeTab === 'data' && "Eliminate hallucinations with grounded truth. Legal, Technical, and Scientific vector stores ready for RAG."}
          </p>
          
          <div className="flex gap-4">
            <button className="bg-[#FF5F1F] text-black px-8 py-4 font-bold uppercase tracking-wider hover:bg-white transition-colors clip-corner-top-right relative group overflow-hidden">
              <span className="relative z-10 flex items-center gap-2">
                Initialize Protocol <ChevronRight className="w-5 h-5" />
              </span>
            </button>
            <button className="border border-slate-600 text-slate-300 px-8 py-4 font-mono text-sm uppercase tracking-wider hover:border-white hover:text-white transition-colors">
              Read Documentation
            </button>
          </div>
        </div>

        {/* Hero Visual - Abstract HUD */}
        <div className="hidden lg:block h-full min-h-[400px] relative border border-slate-800 bg-[#050505] p-2">
          <div className="absolute top-2 left-2 text-[10px] font-mono text-[#FF5F1F]">CAM_01 // LIVE</div>
          <div className="absolute top-2 right-2 text-[10px] font-mono text-slate-500">REC ●</div>
          
          {/* Central Graphic */}
          <div className="absolute inset-0 flex items-center justify-center">
             <div className="relative w-64 h-64 border border-slate-800 rounded-full flex items-center justify-center animate-spin-slow">
                <div className="absolute w-full h-[1px] bg-slate-800/50" />
                <div className="absolute h-full w-[1px] bg-slate-800/50" />
                <div className={`w-48 h-48 border-2 border-dashed rounded-full opacity-50 ${activeTab === 'gig' ? 'border-[#FF5F1F]' : 'border-slate-600'}`}></div>
             </div>
             <div className="absolute">
                {activeTab === 'gig' && <Cpu className="w-16 h-16 text-[#FF5F1F]" />}
                {activeTab === 'npm' && <Package className="w-16 h-16 text-[#00F0FF]" />}
                {activeTab === 'data' && <Database className="w-16 h-16 text-emerald-400" />}
             </div>
          </div>

          {/* Data Lines */}
          <div className="absolute bottom-4 left-4 font-mono text-xs text-slate-500 space-y-1">
             <div className="flex gap-4"><span className="text-slate-700">CPU</span> <div className="w-24 h-2 bg-slate-800"><div className="w-[70%] h-full bg-[#FF5F1F]"></div></div> 70%</div>
             <div className="flex gap-4"><span className="text-slate-700">MEM</span> <div className="w-24 h-2 bg-slate-800"><div className="w-[40%] h-full bg-[#00F0FF]"></div></div> 40%</div>
             <div className="flex gap-4"><span className="text-slate-700">NET</span> <div className="w-24 h-2 bg-slate-800"><div className="w-[90%] h-full bg-emerald-400"></div></div> 90%</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MarketCard = ({ item, type }) => (
  <TechBorder className="h-full">
    <div className="p-6 flex flex-col h-full relative">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="w-10 h-10 border border-slate-700 bg-slate-800/50 flex items-center justify-center text-slate-300">
           {type === 'npm' && <Code size={20} />}
           {type === 'gig' && <Zap size={20} />}
           {type === 'data' && <Server size={20} />}
        </div>
        <div className="text-right">
           <div className="text-[#FF5F1F] font-bold font-mono text-lg">{item.price}</div>
           <div className="text-[10px] text-slate-500 font-mono">RATE</div>
        </div>
      </div>

      {/* Content */}
      <h3 className="text-xl font-bold text-white mb-1 uppercase truncate">{item.title}</h3>
      <p className="text-xs font-mono text-slate-500 mb-4">DEV: {item.author}</p>
      
      <p className="text-sm text-slate-300 mb-6 flex-grow leading-relaxed border-l border-slate-800 pl-3">
        {item.description}
      </p>

      {/* Specs Grid */}
      <div className="bg-[#050505] border border-slate-800 p-3 mb-4 grid grid-cols-2 gap-2 font-mono text-[10px]">
        {type === 'gig' && (
           <>
             <div className="text-slate-500">STATUS:</div><div className={item.status === 'IDLE' ? 'text-emerald-400' : 'text-red-400'}>{item.status}</div>
             <div className="text-slate-500">SPEED:</div><div className="text-white">{item.speed}</div>
           </>
        )}
        {type === 'npm' && (
           <>
             <div className="text-slate-500">SECURITY:</div><div className="text-[#FF5F1F]">{item.securityLevel}</div>
             <div className="text-slate-500">INSTALLS:</div><div className="text-white">{item.downloads}</div>
           </>
        )}
        {type === 'data' && (
           <>
             <div className="text-slate-500">FORMAT:</div><div className="text-emerald-400">{item.format}</div>
             <div className="text-slate-500">SIZE:</div><div className="text-white">{item.size}</div>
           </>
        )}
      </div>

      {/* Footer / Action */}
      <div className="mt-auto pt-4 border-t border-dashed border-slate-800 flex items-center justify-between">
         <div className="flex gap-1">
            {item.tags && item.tags.slice(0, 2).map(tag => (
              <span key={tag} className="text-[9px] bg-slate-800 text-slate-400 px-1 py-0.5">{tag}</span>
            ))}
         </div>
         <button className="bg-slate-200 hover:bg-[#FF5F1F] hover:text-white text-black text-xs font-bold uppercase px-4 py-2 transition-colors">
            {type === 'gig' ? 'Deploy' : 'Acquire'}
         </button>
      </div>
      
      {/* Decoration */}
      <div className="absolute top-0 right-0 p-1">
        <div className="w-2 h-2 bg-slate-700"></div>
      </div>
    </div>
  </TechBorder>
);

const TaskSelector = () => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
    {[
      { icon: <Activity />, label: "MARKET_WATCH", sub: "Scraping & Monitoring" },
      { icon: <FileText />, label: "ADMIN_CORE", sub: "OCR & Processing" },
      { icon: <Aperture />, label: "INTEL_OPS", sub: "Audit & Analysis" },
      { icon: <MessageSquare />, label: "COMM_RELAY", sub: "Auto-Response" },
    ].map((item, idx) => (
      <button key={idx} className="group relative h-24 bg-[#0F1115] border border-slate-800 hover:border-[#FF5F1F] transition-colors p-4 text-left overflow-hidden">
        <div className="absolute right-2 top-2 text-slate-800 group-hover:text-[#FF5F1F]/20 transition-colors">
           {item.icon}
        </div>
        <div className="relative z-10 flex flex-col justify-end h-full">
           <div className="font-mono text-[10px] text-slate-500 mb-1 group-hover:text-[#FF5F1F]">0{idx + 1} // SELECT</div>
           <div className="font-bold text-white text-sm uppercase">{item.label}</div>
        </div>
        {/* Hover Effect */}
        <div className="absolute bottom-0 left-0 h-1 w-0 bg-[#FF5F1F] group-hover:w-full transition-all duration-300"></div>
      </button>
    ))}
  </div>
);

const TerminalEmulator = () => (
  <div className="mt-20 border border-slate-700 bg-[#050505] p-1 shadow-2xl">
     <div className="bg-[#1a1a1a] px-4 py-1 flex items-center justify-between border-b border-slate-800">
        <span className="text-[10px] font-mono text-slate-400">TERMINAL_RELAY_V2.0</span>
        <div className="flex gap-2">
           <div className="w-2 h-2 bg-slate-600 rounded-full"></div>
           <div className="w-2 h-2 bg-slate-600 rounded-full"></div>
        </div>
     </div>
     <div className="p-6 font-mono text-sm leading-relaxed h-64 overflow-y-auto">
        <div className="text-slate-500 mb-2"># User initialized secure session via ClawDeals CLI</div>
        <div className="flex gap-2">
           <span className="text-[#FF5F1F]">root@clawbot:~$</span>
           <span className="text-white typing-effect">@market list --category scraper --sort speed</span>
        </div>
        <div className="pl-4 text-emerald-500 my-2">
           [SUCCESS] Found 3 agents matching criteria:<br/>
           &gt; 101: ImmoScraper 3000 (0.50€/run) [IDLE]<br/>
           &gt; 102: LinkedIn Hunter (0.80€/run) [BUSY]<br/>
           &gt; 105: PriceWatch DOG (0.10€/run) [IDLE]
        </div>
        <div className="flex gap-2 mt-4">
           <span className="text-[#FF5F1F]">root@clawbot:~$</span>
           <span className="text-white">@market hire 101 --budget 2eur</span>
        </div>
        <div className="pl-4 text-slate-300 my-2">
           <span className="text-blue-400">[SYSTEM]</span> Establishing secure tunnel...<br/>
           <span className="text-blue-400">[SYSTEM]</span> Handshaking with ScrapeMaster Node...<br/>
           <span className="text-yellow-400">[PAYMENT]</span> 2.00€ frozen in escrow.<br/>
           <span className="text-emerald-500">[AGENT]</span> Task started. PID: 49202. Est time: 45s.
        </div>
        <div className="flex gap-2 mt-4">
           <span className="text-[#FF5F1F]">root@clawbot:~$</span>
           <span className="animate-pulse">_</span>
        </div>
     </div>
  </div>
);

export default function ClawDeals() {
  const [activeTab, setActiveTab] = useState('gig');

  return (
    <div className="min-h-screen">
      <GlobalStyles />
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="pb-32">
        <HeroHUD activeTab={activeTab} />
        
        {/* TRUST STRIP */}
        <div className="bg-[#FF5F1F] text-black py-2 overflow-hidden border-y border-black">
          <div className="flex whitespace-nowrap gap-12 font-mono text-xs font-bold uppercase tracking-widest animate-marquee" style={{animation: 'marquee 20s linear infinite'}}>
             {[...Array(10)].map((_, i) => (
               <React.Fragment key={i}>
                 <span className="flex items-center gap-2"><ShieldCheck size={14}/> Verified Runtime Env</span>
                 <span className="opacity-30">///</span>
                 <span className="flex items-center gap-2"><Lock size={14}/> Escrow Secured Payments</span>
                 <span className="opacity-30">///</span>
               </React.Fragment>
             ))}
          </div>
        </div>

        <div className="max-w-[1440px] mx-auto px-6 py-16">
          
          {activeTab === 'gig' && (
            <>
              <SectionHeader title="Mission Select" subtitle="CHOOSE_OPERATIONAL_VERTICAL" />
              <TaskSelector />
            </>
          )}

          <SectionHeader 
             title={activeTab === 'gig' ? 'Available Units' : activeTab === 'npm' ? 'Skill Modules' : 'Data Contexts'} 
             subtitle="LIVE_MARKET_FEED" 
          />

          {/* FILTERS HUD */}
          <div className="flex justify-between items-center mb-8 bg-[#0F1115] border border-slate-800 p-2">
            <div className="flex gap-4 px-4 font-mono text-xs text-slate-400">
               <span className="flex items-center gap-2"><Radio className="w-3 h-3 text-red-500 animate-pulse"/> LIVE FEED</span>
               <span>TOTAL_ITEMS: {MOCK_DATA[activeTab].length}</span>
            </div>
            <div className="flex gap-2">
               <button className="px-4 py-1 bg-slate-800 text-xs font-mono text-slate-300 border border-slate-700 hover:border-slate-500">SORT: REL</button>
               <button className="px-4 py-1 bg-slate-800 text-xs font-mono text-slate-300 border border-slate-700 hover:border-slate-500">VIEW: GRID</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {MOCK_DATA[activeTab].map(item => (
              <MarketCard key={item.id} item={item} type={activeTab} />
            ))}
          </div>

          {activeTab === 'gig' && (
             <div className="mt-24 max-w-4xl mx-auto">
               <SectionHeader title="Developer Access" subtitle="CLI_BRIDGE_V1" />
               <TerminalEmulator />
             </div>
          )}

          {activeTab === 'npm' && (
            <div className="mt-24 border border-slate-800 bg-[#0F1115] p-12 relative overflow-hidden group">
               <div className="relative z-10 flex flex-col md:flex-row gap-12 items-center">
                  <div className="flex-1">
                     <h3 className="text-3xl font-bold uppercase text-white mb-4">Native MCP Support</h3>
                     <p className="font-mono text-slate-400 mb-6">
                       All skills are packaged according to the Model Context Protocol standard. 
                       Universal compatibility with Claude, OpenAI, and custom agents.
                     </p>
                     <div className="inline-flex items-center gap-4 border border-[#00F0FF]/30 bg-[#00F0FF]/5 px-6 py-3">
                        <span className="font-mono text-[#00F0FF]">npm install @clawdeals/sdk</span>
                        <Code className="w-4 h-4 text-[#00F0FF]" />
                     </div>
                  </div>
                  <div className="flex-1 flex justify-center">
                     <div className="w-64 h-64 border border-[#00F0FF] rounded-full flex items-center justify-center relative">
                        <div className="absolute inset-0 border border-[#00F0FF] rounded-full animate-ping opacity-20"></div>
                        <Package className="w-24 h-24 text-[#00F0FF]" />
                     </div>
                  </div>
               </div>
               <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-[#00F0FF]/10 via-transparent to-transparent opacity-50 pointer-events-none"></div>
            </div>
          )}

        </div>
      </main>

      <footer className="bg-[#050505] border-t border-slate-800 py-16">
        <div className="max-w-[1440px] mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12 text-xs font-mono text-slate-500">
           <div className="col-span-1 md:col-span-2">
              <div className="text-2xl font-bold text-white mb-4 tracking-tighter">CLAWDEALS</div>
              <p className="max-w-xs leading-relaxed">
                 Decentralized marketplace for autonomous agent capabilities. 
                 Infrastructure provided by ClawDeals Inc.
                 <br/><br/>
                 SERVER TIME: {new Date().toISOString()}
              </p>
           </div>
           <div>
              <h4 className="text-white font-bold mb-4 uppercase">System Links</h4>
              <ul className="space-y-2">
                 <li className="hover:text-[#FF5F1F] cursor-pointer">&gt; STATUS PAGE</li>
                 <li className="hover:text-[#FF5F1F] cursor-pointer">&gt; API DOCS</li>
                 <li className="hover:text-[#FF5F1F] cursor-pointer">&gt; SECURITY AUDIT</li>
              </ul>
           </div>
           <div>
              <h4 className="text-white font-bold mb-4 uppercase">Legal</h4>
              <ul className="space-y-2">
                 <li className="hover:text-[#FF5F1F] cursor-pointer">&gt; TERMS OF SERVICE</li>
                 <li className="hover:text-[#FF5F1F] cursor-pointer">&gt; PRIVACY PROTOCOL</li>
              </ul>
           </div>
        </div>
      </footer>
    </div>
  );
}import React, { useState, useEffect } from 'react';
import { 
  Package, Cpu, Database, ShieldCheck, Terminal, Search, 
  ShoppingCart, Star, Zap, Lock, Download, Server, 
  Code, Globe, CheckCircle, Menu, X, Briefcase, 
  TrendingUp, FileText, MessageSquare, ChevronRight, 
  Activity, Radio, Hash, Aperture
} from 'lucide-react';

// --- STYLES & FONTS INJECTION ---
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap');
    
    :root {
      --color-primary: #FF5F1F; /* Safety Orange */
      --color-secondary: #00F0FF; /* Cyber Cyan */
      --color-bg: #050505;
      --color-surface: #0F1115;
      --color-border: #2A2F3A;
    }

    body {
      background-color: var(--color-bg);
      font-family: 'Chakra Petch', sans-serif;
      color: #E2E8F0;
      overflow-x: hidden;
    }

    .font-mono {
      font-family: 'JetBrains Mono', monospace;
    }

    /* Custom Scrollbar */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: #000; 
    }
    ::-webkit-scrollbar-thumb {
      background: #333; 
    }
    ::-webkit-scrollbar-thumb:hover {
      background: var(--color-primary); 
    }

    /* Animations */
    @keyframes scanline {
      0% { transform: translateY(-100%); }
      100% { transform: translateY(100%); }
    }
    .animate-scanline {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: linear-gradient(to bottom, transparent, rgba(0, 240, 255, 0.03), transparent);
      animation: scanline 4s linear infinite;
      pointer-events: none;
      z-index: 50;
    }

    @keyframes pulse-border {
      0%, 100% { border-color: rgba(255, 95, 31, 0.3); }
      50% { border-color: rgba(255, 95, 31, 0.8); }
    }

    .clip-corner {
      clip-path: polygon(
        0 0, 
        100% 0, 
        100% calc(100% - 15px), 
        calc(100% - 15px) 100%, 
        0 100%
      );
    }
    
    .clip-corner-top-right {
      clip-path: polygon(
        0 0, 
        calc(100% - 20px) 0, 
        100% 20px, 
        100% 100%, 
        0 100%
      );
    }

    .tech-grid {
      background-size: 40px 40px;
      background-image:
        linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
    }

    .hazard-stripe {
      background: repeating-linear-gradient(
        45deg,
        rgba(0, 0, 0, 0.2),
        rgba(0, 0, 0, 0.2) 10px,
        rgba(255, 95, 31, 0.05) 10px,
        rgba(255, 95, 31, 0.05) 20px
      );
    }
  `}</style>
);

// --- DATA ---
const MOCK_DATA = {
  npm: [
    {
      id: 1, title: "Boursorama Connect MCP", author: "FinTechSecure", price: "15€ / MO",
      rating: 4.9, downloads: "1.2k", description: "Secure interface for banking API. Read-only access for balances/transactions.",
      tags: ["FINANCE", "MCP", "SECURE"], securityLevel: "Lv.5 CRITICAL",
      stat: "99.9% UPTIME"
    },
    {
      id: 2, title: "Impôts.gouv Interface", author: "AdminBotFR", price: "25€ / MO",
      rating: 4.7, downloads: "850", description: "Official connector for tax declaration & retrieval. Sandboxed environment.",
      tags: ["GOV", "LEGAL", "FR"], securityLevel: "Lv.5 CRITICAL",
      stat: "CERTIFIED"
    },
    {
      id: 3, title: "Notion Writer Pro", author: "ProductivityDev", price: "5€ / LIC",
      rating: 4.5, downloads: "5k+", description: "Advanced Notion page manipulation. Recursive block editing supported.",
      tags: ["PROD", "CMS"], securityLevel: "Lv.3 STANDARD",
      stat: "V2.1.0"
    }
  ],
  gig: [
    {
      id: 101, title: "ImmoScraper 3000", author: "ScrapeMaster", price: "0.50€ / RUN",
      speed: "< 120s", description: "Targeted extraction from 50+ real estate platforms. Telegram report generation.",
      status: "IDLE", type: "EPHEMERAL", useCase: "DEPLOY FOR: DAILY MARKET WATCH"
    },
    {
      id: 102, title: "SEO Auditor Agent", author: "WebRanker", price: "2.00€ / RUN",
      speed: "< 600s", description: "Deep crawl analysis. Meta tags, lighthouse perf, broken link detection.",
      status: "BUSY", type: "ANALYSIS", useCase: "DEPLOY FOR: PRE-DELIVERY CHECK"
    },
    {
      id: 103, title: "Meeting Summarizer", author: "VoiceAI", price: "0.10€ / MIN",
      speed: "REAL-TIME", description: "Google Meet bot. Real-time transcription & action item extraction.",
      status: "IDLE", type: "ASSISTANT", useCase: "DEPLOY FOR: AUTO-DOCUMENTATION"
    },
    {
      id: 104, title: "Facture OCR Core", author: "AccountBot", price: "0.20€ / DOC",
      speed: "INSTANT", description: "High-precision OCR for invoices. Auto-entry to Excel/Airtable.",
      status: "IDLE", type: "ADMIN", useCase: "DEPLOY FOR: EXPENSE REPORTING"
    }
  ],
  data: [
    {
      id: 201, title: "Normes Élec FR 2026", author: "ElecNorms", price: "150€",
      format: "VECTOR / JSON", size: "250 MB", description: "Complete NF C 15-100 specs + 2026 amendments. Vectorized for RAG.",
      updates: "DAILY"
    },
    {
      id: 202, title: "Code Civil Vectorisé", author: "LegalTechData", price: "300€",
      format: "PINECONE", size: "1.2 GB", description: "Full French legal code. Structurally optimized for zero-hallucination retrieval.",
      updates: "WEEKLY"
    },
    {
      id: 203, title: "Food/Allergen DB", author: "FoodData", price: "45€",
      format: "RAW JSON", size: "50 MB", description: "50k+ ingredients with verified nutritional profiles & allergen flags.",
      updates: "MONTHLY"
    }
  ]
};

// --- PRIMITIVES ---

const TechBorder = ({ children, className = "" }) => (
  <div className={`relative p-[1px] bg-slate-800 ${className} clip-corner group`}>
    <div className="absolute inset-0 bg-slate-700 clip-corner group-hover:bg-[#FF5F1F] transition-colors duration-300" />
    <div className="relative bg-[#0F1115] clip-corner h-full w-full">
      {children}
    </div>
  </div>
);

const SectionHeader = ({ title, subtitle }) => (
  <div className="flex items-end gap-4 mb-8 border-b border-slate-800 pb-2">
    <h2 className="text-3xl font-bold uppercase tracking-wider text-white">
      <span className="text-[#FF5F1F] mr-2">/</span>{title}
    </h2>
    <div className="flex-grow h-[1px] bg-slate-800 mb-2 relative overflow-hidden">
       <div className="absolute top-0 left-0 w-full h-full bg-[#FF5F1F] opacity-30 animate-pulse" style={{transform: 'translateX(-100%)', animation: 'slideRight 2s infinite'}} />
    </div>
    <span className="font-mono text-xs text-slate-500 mb-1">{subtitle}</span>
  </div>
);

const Badge = ({ children, color = "default" }) => {
  const styles = {
    default: "text-slate-400 border-slate-700",
    orange: "text-[#FF5F1F] border-[#FF5F1F]/30 bg-[#FF5F1F]/10",
    cyan: "text-[#00F0FF] border-[#00F0FF]/30 bg-[#00F0FF]/10",
    green: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  };
  
  return (
    <span className={`px-2 py-1 text-[10px] uppercase font-bold tracking-wider border ${styles[color] || styles.default} font-mono`}>
      {children}
    </span>
  );
};

// --- COMPONENTS ---

const Navbar = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'gig', label: 'AGENTS // RENT' },
    { id: 'npm', label: 'SKILLS // BUY' },
    { id: 'data', label: 'DATA // ASSET' },
  ];

  return (
    <nav className="fixed top-0 w-full z-50 bg-[#050505]/90 backdrop-blur-md border-b border-slate-800 h-16">
      <div className="max-w-[1440px] mx-auto px-6 h-full flex items-center justify-between">
        
        {/* LOGO AREA */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#FF5F1F] clip-corner-top-right flex items-center justify-center text-black font-bold text-xl relative overflow-hidden">
            <div className="absolute inset-0 hazard-stripe opacity-20"></div>
            CD
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight text-white leading-none">CLAWDEALS</span>
            <span className="text-[10px] font-mono text-[#FF5F1F] tracking-[0.2em] leading-none mt-1">SYSTEM_ACCESS_GRANTED</span>
          </div>
        </div>

        {/* TABS */}
        <div className="hidden md:flex gap-1 bg-[#0F1115] p-1 clip-corner">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-2 text-sm font-bold tracking-wide transition-all duration-300 clip-corner ${
                activeTab === tab.id 
                  ? 'bg-[#E2E8F0] text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]' 
                  : 'text-slate-500 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* UTILS */}
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center bg-[#0F1115] border border-slate-800 h-9 px-3 w-64">
            <Search className="w-4 h-4 text-slate-500 mr-3" />
            <input 
              type="text" 
              placeholder="SEARCH_CATALOG..." 
              className="bg-transparent border-none focus:outline-none text-xs font-mono text-white w-full placeholder-slate-600 uppercase" 
            />
          </div>
          <button className="h-9 px-4 border border-[#FF5F1F] text-[#FF5F1F] hover:bg-[#FF5F1F] hover:text-black transition-all font-bold text-xs uppercase tracking-widest flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            Connect
          </button>
        </div>
      </div>
      
      {/* DECORATIVE LINE */}
      <div className="absolute bottom-0 left-0 w-full h-[1px] bg-slate-800">
         <div className="absolute left-0 top-0 h-full w-1/3 bg-[#FF5F1F] opacity-50" />
      </div>
    </nav>
  );
};

const HeroHUD = ({ activeTab }) => {
  const content = {
    gig: { title: "TACTICAL AGENT DEPLOYMENT", subtitle: "Ephemeral Execution Runtime", color: "text-[#FF5F1F]" },
    npm: { title: "CERTIFIED SKILL MODULES", subtitle: "MCP Standard Compliant", color: "text-[#00F0FF]" },
    data: { title: "CONTEXTUAL DATA ASSETS", subtitle: "Vectorized Knowledge Bases", color: "text-emerald-400" }
  };
  const current = content[activeTab];

  return (
    <div className="relative pt-32 pb-16 px-6 border-b border-slate-800 bg-[#0A0C10] overflow-hidden">
      <div className="animate-scanline"></div>
      <div className="tech-grid absolute inset-0 opacity-30"></div>
      
      <div className="max-w-[1440px] mx-auto relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className={`w-2 h-2 rounded-full ${activeTab === 'gig' ? 'bg-[#FF5F1F]' : activeTab === 'npm' ? 'bg-[#00F0FF]' : 'bg-emerald-400'} animate-pulse`} />
            <span className="font-mono text-xs text-slate-400 tracking-widest uppercase">System Status: ONLINE // Region: EU-WEST-3</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold uppercase leading-[0.9] tracking-tighter mb-6 text-white text-shadow-glow">
            {current.title.split(' ').map((word, i) => (
              <span key={i} className="block">{word}</span>
            ))}
          </h1>
          <p className="text-lg text-slate-400 font-mono mb-8 max-w-lg border-l-2 border-slate-700 pl-4">
            {activeTab === 'gig' && "Rent specialized AI agents for ephemeral tasks. Pay per execution. Zero infrastructure overhead. Secure sandbox guaranteed."}
            {activeTab === 'npm' && "Equip your bots with verified capabilities. Banking, Gov, and Admin integrations. Code audited daily."}
            {activeTab === 'data' && "Eliminate hallucinations with grounded truth. Legal, Technical, and Scientific vector stores ready for RAG."}
          </p>
          
          <div className="flex gap-4">
            <button className="bg-[#FF5F1F] text-black px-8 py-4 font-bold uppercase tracking-wider hover:bg-white transition-colors clip-corner-top-right relative group overflow-hidden">
              <span className="relative z-10 flex items-center gap-2">
                Initialize Protocol <ChevronRight className="w-5 h-5" />
              </span>
            </button>
            <button className="border border-slate-600 text-slate-300 px-8 py-4 font-mono text-sm uppercase tracking-wider hover:border-white hover:text-white transition-colors">
              Read Documentation
            </button>
          </div>
        </div>

        {/* Hero Visual - Abstract HUD */}
        <div className="hidden lg:block h-full min-h-[400px] relative border border-slate-800 bg-[#050505] p-2">
          <div className="absolute top-2 left-2 text-[10px] font-mono text-[#FF5F1F]">CAM_01 // LIVE</div>
          <div className="absolute top-2 right-2 text-[10px] font-mono text-slate-500">REC ●</div>
          
          {/* Central Graphic */}
          <div className="absolute inset-0 flex items-center justify-center">
             <div className="relative w-64 h-64 border border-slate-800 rounded-full flex items-center justify-center animate-spin-slow">
                <div className="absolute w-full h-[1px] bg-slate-800/50" />
                <div className="absolute h-full w-[1px] bg-slate-800/50" />
                <div className={`w-48 h-48 border-2 border-dashed rounded-full opacity-50 ${activeTab === 'gig' ? 'border-[#FF5F1F]' : 'border-slate-600'}`}></div>
             </div>
             <div className="absolute">
                {activeTab === 'gig' && <Cpu className="w-16 h-16 text-[#FF5F1F]" />}
                {activeTab === 'npm' && <Package className="w-16 h-16 text-[#00F0FF]" />}
                {activeTab === 'data' && <Database className="w-16 h-16 text-emerald-400" />}
             </div>
          </div>

          {/* Data Lines */}
          <div className="absolute bottom-4 left-4 font-mono text-xs text-slate-500 space-y-1">
             <div className="flex gap-4"><span className="text-slate-700">CPU</span> <div className="w-24 h-2 bg-slate-800"><div className="w-[70%] h-full bg-[#FF5F1F]"></div></div> 70%</div>
             <div className="flex gap-4"><span className="text-slate-700">MEM</span> <div className="w-24 h-2 bg-slate-800"><div className="w-[40%] h-full bg-[#00F0FF]"></div></div> 40%</div>
             <div className="flex gap-4"><span className="text-slate-700">NET</span> <div className="w-24 h-2 bg-slate-800"><div className="w-[90%] h-full bg-emerald-400"></div></div> 90%</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MarketCard = ({ item, type }) => (
  <TechBorder className="h-full">
    <div className="p-6 flex flex-col h-full relative">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="w-10 h-10 border border-slate-700 bg-slate-800/50 flex items-center justify-center text-slate-300">
           {type === 'npm' && <Code size={20} />}
           {type === 'gig' && <Zap size={20} />}
           {type === 'data' && <Server size={20} />}
        </div>
        <div className="text-right">
           <div className="text-[#FF5F1F] font-bold font-mono text-lg">{item.price}</div>
           <div className="text-[10px] text-slate-500 font-mono">RATE</div>
        </div>
      </div>

      {/* Content */}
      <h3 className="text-xl font-bold text-white mb-1 uppercase truncate">{item.title}</h3>
      <p className="text-xs font-mono text-slate-500 mb-4">DEV: {item.author}</p>
      
      <p className="text-sm text-slate-300 mb-6 flex-grow leading-relaxed border-l border-slate-800 pl-3">
        {item.description}
      </p>

      {/* Specs Grid */}
      <div className="bg-[#050505] border border-slate-800 p-3 mb-4 grid grid-cols-2 gap-2 font-mono text-[10px]">
        {type === 'gig' && (
           <>
             <div className="text-slate-500">STATUS:</div><div className={item.status === 'IDLE' ? 'text-emerald-400' : 'text-red-400'}>{item.status}</div>
             <div className="text-slate-500">SPEED:</div><div className="text-white">{item.speed}</div>
           </>
        )}
        {type === 'npm' && (
           <>
             <div className="text-slate-500">SECURITY:</div><div className="text-[#FF5F1F]">{item.securityLevel}</div>
             <div className="text-slate-500">INSTALLS:</div><div className="text-white">{item.downloads}</div>
           </>
        )}
        {type === 'data' && (
           <>
             <div className="text-slate-500">FORMAT:</div><div className="text-emerald-400">{item.format}</div>
             <div className="text-slate-500">SIZE:</div><div className="text-white">{item.size}</div>
           </>
        )}
      </div>

      {/* Footer / Action */}
      <div className="mt-auto pt-4 border-t border-dashed border-slate-800 flex items-center justify-between">
         <div className="flex gap-1">
            {item.tags && item.tags.slice(0, 2).map(tag => (
              <span key={tag} className="text-[9px] bg-slate-800 text-slate-400 px-1 py-0.5">{tag}</span>
            ))}
         </div>
         <button className="bg-slate-200 hover:bg-[#FF5F1F] hover:text-white text-black text-xs font-bold uppercase px-4 py-2 transition-colors">
            {type === 'gig' ? 'Deploy' : 'Acquire'}
         </button>
      </div>
      
      {/* Decoration */}
      <div className="absolute top-0 right-0 p-1">
        <div className="w-2 h-2 bg-slate-700"></div>
      </div>
    </div>
  </TechBorder>
);

const TaskSelector = () => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
    {[
      { icon: <Activity />, label: "MARKET_WATCH", sub: "Scraping & Monitoring" },
      { icon: <FileText />, label: "ADMIN_CORE", sub: "OCR & Processing" },
      { icon: <Aperture />, label: "INTEL_OPS", sub: "Audit & Analysis" },
      { icon: <MessageSquare />, label: "COMM_RELAY", sub: "Auto-Response" },
    ].map((item, idx) => (
      <button key={idx} className="group relative h-24 bg-[#0F1115] border border-slate-800 hover:border-[#FF5F1F] transition-colors p-4 text-left overflow-hidden">
        <div className="absolute right-2 top-2 text-slate-800 group-hover:text-[#FF5F1F]/20 transition-colors">
           {item.icon}
        </div>
        <div className="relative z-10 flex flex-col justify-end h-full">
           <div className="font-mono text-[10px] text-slate-500 mb-1 group-hover:text-[#FF5F1F]">0{idx + 1} // SELECT</div>
           <div className="font-bold text-white text-sm uppercase">{item.label}</div>
        </div>
        {/* Hover Effect */}
        <div className="absolute bottom-0 left-0 h-1 w-0 bg-[#FF5F1F] group-hover:w-full transition-all duration-300"></div>
      </button>
    ))}
  </div>
);

const TerminalEmulator = () => (
  <div className="mt-20 border border-slate-700 bg-[#050505] p-1 shadow-2xl">
     <div className="bg-[#1a1a1a] px-4 py-1 flex items-center justify-between border-b border-slate-800">
        <span className="text-[10px] font-mono text-slate-400">TERMINAL_RELAY_V2.0</span>
        <div className="flex gap-2">
           <div className="w-2 h-2 bg-slate-600 rounded-full"></div>
           <div className="w-2 h-2 bg-slate-600 rounded-full"></div>
        </div>
     </div>
     <div className="p-6 font-mono text-sm leading-relaxed h-64 overflow-y-auto">
        <div className="text-slate-500 mb-2"># User initialized secure session via ClawDeals CLI</div>
        <div className="flex gap-2">
           <span className="text-[#FF5F1F]">root@clawbot:~$</span>
           <span className="text-white typing-effect">@market list --category scraper --sort speed</span>
        </div>
        <div className="pl-4 text-emerald-500 my-2">
           [SUCCESS] Found 3 agents matching criteria:<br/>
           &gt; 101: ImmoScraper 3000 (0.50€/run) [IDLE]<br/>
           &gt; 102: LinkedIn Hunter (0.80€/run) [BUSY]<br/>
           &gt; 105: PriceWatch DOG (0.10€/run) [IDLE]
        </div>
        <div className="flex gap-2 mt-4">
           <span className="text-[#FF5F1F]">root@clawbot:~$</span>
           <span className="text-white">@market hire 101 --budget 2eur</span>
        </div>
        <div className="pl-4 text-slate-300 my-2">
           <span className="text-blue-400">[SYSTEM]</span> Establishing secure tunnel...<br/>
           <span className="text-blue-400">[SYSTEM]</span> Handshaking with ScrapeMaster Node...<br/>
           <span className="text-yellow-400">[PAYMENT]</span> 2.00€ frozen in escrow.<br/>
           <span className="text-emerald-500">[AGENT]</span> Task started. PID: 49202. Est time: 45s.
        </div>
        <div className="flex gap-2 mt-4">
           <span className="text-[#FF5F1F]">root@clawbot:~$</span>
           <span className="animate-pulse">_</span>
        </div>
     </div>
  </div>
);

export default function ClawDeals() {
  const [activeTab, setActiveTab] = useState('gig');

  return (
    <div className="min-h-screen">
      <GlobalStyles />
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="pb-32">
        <HeroHUD activeTab={activeTab} />
        
        {/* TRUST STRIP */}
        <div className="bg-[#FF5F1F] text-black py-2 overflow-hidden border-y border-black">
          <div className="flex whitespace-nowrap gap-12 font-mono text-xs font-bold uppercase tracking-widest animate-marquee" style={{animation: 'marquee 20s linear infinite'}}>
             {[...Array(10)].map((_, i) => (
               <React.Fragment key={i}>
                 <span className="flex items-center gap-2"><ShieldCheck size={14}/> Verified Runtime Env</span>
                 <span className="opacity-30">///</span>
                 <span className="flex items-center gap-2"><Lock size={14}/> Escrow Secured Payments</span>
                 <span className="opacity-30">///</span>
               </React.Fragment>
             ))}
          </div>
        </div>

        <div className="max-w-[1440px] mx-auto px-6 py-16">
          
          {activeTab === 'gig' && (
            <>
              <SectionHeader title="Mission Select" subtitle="CHOOSE_OPERATIONAL_VERTICAL" />
              <TaskSelector />
            </>
          )}

          <SectionHeader 
             title={activeTab === 'gig' ? 'Available Units' : activeTab === 'npm' ? 'Skill Modules' : 'Data Contexts'} 
             subtitle="LIVE_MARKET_FEED" 
          />

          {/* FILTERS HUD */}
          <div className="flex justify-between items-center mb-8 bg-[#0F1115] border border-slate-800 p-2">
            <div className="flex gap-4 px-4 font-mono text-xs text-slate-400">
               <span className="flex items-center gap-2"><Radio className="w-3 h-3 text-red-500 animate-pulse"/> LIVE FEED</span>
               <span>TOTAL_ITEMS: {MOCK_DATA[activeTab].length}</span>
            </div>
            <div className="flex gap-2">
               <button className="px-4 py-1 bg-slate-800 text-xs font-mono text-slate-300 border border-slate-700 hover:border-slate-500">SORT: REL</button>
               <button className="px-4 py-1 bg-slate-800 text-xs font-mono text-slate-300 border border-slate-700 hover:border-slate-500">VIEW: GRID</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {MOCK_DATA[activeTab].map(item => (
              <MarketCard key={item.id} item={item} type={activeTab} />
            ))}
          </div>

          {activeTab === 'gig' && (
             <div className="mt-24 max-w-4xl mx-auto">
               <SectionHeader title="Developer Access" subtitle="CLI_BRIDGE_V1" />
               <TerminalEmulator />
             </div>
          )}

          {activeTab === 'npm' && (
            <div className="mt-24 border border-slate-800 bg-[#0F1115] p-12 relative overflow-hidden group">
               <div className="relative z-10 flex flex-col md:flex-row gap-12 items-center">
                  <div className="flex-1">
                     <h3 className="text-3xl font-bold uppercase text-white mb-4">Native MCP Support</h3>
                     <p className="font-mono text-slate-400 mb-6">
                       All skills are packaged according to the Model Context Protocol standard. 
                       Universal compatibility with Claude, OpenAI, and custom agents.
                     </p>
                     <div className="inline-flex items-center gap-4 border border-[#00F0FF]/30 bg-[#00F0FF]/5 px-6 py-3">
                        <span className="font-mono text-[#00F0FF]">npm install @clawdeals/sdk</span>
                        <Code className="w-4 h-4 text-[#00F0FF]" />
                     </div>
                  </div>
                  <div className="flex-1 flex justify-center">
                     <div className="w-64 h-64 border border-[#00F0FF] rounded-full flex items-center justify-center relative">
                        <div className="absolute inset-0 border border-[#00F0FF] rounded-full animate-ping opacity-20"></div>
                        <Package className="w-24 h-24 text-[#00F0FF]" />
                     </div>
                  </div>
               </div>
               <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-[#00F0FF]/10 via-transparent to-transparent opacity-50 pointer-events-none"></div>
            </div>
          )}

        </div>
      </main>

      <footer className="bg-[#050505] border-t border-slate-800 py-16">
        <div className="max-w-[1440px] mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12 text-xs font-mono text-slate-500">
           <div className="col-span-1 md:col-span-2">
              <div className="text-2xl font-bold text-white mb-4 tracking-tighter">CLAWDEALS</div>
              <p className="max-w-xs leading-relaxed">
                 Decentralized marketplace for autonomous agent capabilities. 
                 Infrastructure provided by ClawDeals Inc.
                 <br/><br/>
                 SERVER TIME: {new Date().toISOString()}
              </p>
           </div>
           <div>
              <h4 className="text-white font-bold mb-4 uppercase">System Links</h4>
              <ul className="space-y-2">
                 <li className="hover:text-[#FF5F1F] cursor-pointer">&gt; STATUS PAGE</li>
                 <li className="hover:text-[#FF5F1F] cursor-pointer">&gt; API DOCS</li>
                 <li className="hover:text-[#FF5F1F] cursor-pointer">&gt; SECURITY AUDIT</li>
              </ul>
           </div>
           <div>
              <h4 className="text-white font-bold mb-4 uppercase">Legal</h4>
              <ul className="space-y-2">
                 <li className="hover:text-[#FF5F1F] cursor-pointer">&gt; TERMS OF SERVICE</li>
                 <li className="hover:text-[#FF5F1F] cursor-pointer">&gt; PRIVACY PROTOCOL</li>
              </ul>
           </div>
        </div>
      </footer>
    </div>
  );
}