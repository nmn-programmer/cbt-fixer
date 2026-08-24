const fs = require('fs');
let content = fs.readFileSync('src/components/AutoPdfConverterModal.tsx', 'utf8');

// replace local apiKey state with store state
content = content.replace(
  'const { isPdfConverterModalOpen, setPdfConverterModalOpen, addArchive } = useCbtStore();',
  'const { isPdfConverterModalOpen, setPdfConverterModalOpen, addArchive, geminiApiKey } = useCbtStore();'
);

content = content.replace(
  "const [apiKey, setApiKey] = useState(() => localStorage.getItem('user_gemini_api_key') || '');",
  ""
);

content = content.replace(
  'Authorization\`: `Bearer ${apiKey}`',
  'Authorization\`: `Bearer ${geminiApiKey}`'
);

// We need to change the UI inside the modal. Instead of the API key input, we can just check if geminiApiKey exists, and if not, show a warning.
content = content.replace(
  `                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Gemini API Key</label>
                    <input
                      type="password"
                      placeholder="AIzaSy..."
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        localStorage.setItem('user_gemini_api_key', e.target.value);
                      }}
                      className="w-full bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                    <p className="text-xs text-slate-500">Your key is stored locally in your browser and used only for this extraction.</p>
                  </div>
                  
                  <button
                    onClick={processPDF}
                    disabled={!apiKey.trim()}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-xl font-semibold shadow-md transition-colors flex justify-center items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Convert to CBT ZIP Automatically
                  </button>`,
  `                  {!geminiApiKey ? (
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                      <p className="text-amber-400 text-sm flex gap-2 items-start">
                        <span className="shrink-0 mt-0.5">⚠️</span>
                        <span>Gemini API key is required. Please set it in the global <strong>Settings</strong> menu (top right) before proceeding.</span>
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={processPDF}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold shadow-md transition-colors flex justify-center items-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      Convert to CBT ZIP Automatically
                    </button>
                  )}`
);

fs.writeFileSync('src/components/AutoPdfConverterModal.tsx', content);
