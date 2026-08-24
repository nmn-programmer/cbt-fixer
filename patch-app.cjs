const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Add import
if (!content.includes('SettingsModal')) {
  content = content.replace(
    'import { AutoPdfConverterModal } from \'./components/AutoPdfConverterModal\';',
    'import { AutoPdfConverterModal } from \'./components/AutoPdfConverterModal\';\nimport { SettingsModal } from \'./components/SettingsModal\';'
  );
}

// Add state and effect
if (!content.includes('const [isSettingsOpen, setIsSettingsOpen]')) {
  content = content.replace(
    'export default function App() {',
    'export default function App() {\n  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);\n\n  React.useEffect(() => {\n    const handleOpen = () => setIsSettingsOpen(true);\n    window.addEventListener("open-settings", handleOpen);\n    return () => window.removeEventListener("open-settings", handleOpen);\n  }, []);\n'
  );
}

// Add component
if (!content.includes('<SettingsModal')) {
  content = content.replace(
    '<AutoPdfConverterModal />',
    '<AutoPdfConverterModal />\n      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />'
  );
}

fs.writeFileSync('src/App.tsx', content);
