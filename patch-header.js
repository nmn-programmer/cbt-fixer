const fs = require('fs');
let content = fs.readFileSync('src/components/Header.tsx', 'utf8');
content = content.replace(
  '<span>Export ZIP</span>\n            </button>\n          )}',
  '<span>Export ZIP</span>\n            </button>\n          )}\n          <button onClick={() => window.dispatchEvent(new CustomEvent("open-settings"))} className="flex items-center justify-center p-1.5 ml-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors" title="Settings">\n            <Settings className="w-4 h-4" />\n          </button>'
);
if (!content.includes('import { Settings')) {
  content = content.replace('import {', 'import { Settings,');
}
fs.writeFileSync('src/components/Header.tsx', content);
