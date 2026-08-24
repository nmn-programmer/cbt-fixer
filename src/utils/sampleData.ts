import {
  ImageAttachment,
  PdfDataPart,
  QuestionData,
  QuestionPaperArchive,
  SectionData,
  SubjectData,
} from '../types/cbt';
import { buildImageFileName, generateId } from './constants';

/**
 * Creates an SVG Blob for sample questions with realistic physics/chemistry/maths formulas and diagrams
 */
function createQuestionSvgBlob(title: string, subtitle: string, color: string = '#1e293b'): Blob {
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="240" viewBox="0 0 680 240" fill="none">
    <rect width="680" height="240" rx="8" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
    <rect x="0" y="0" width="680" height="36" fill="#f8fafc" rx="8"/>
    <line x1="0" y1="36" x2="680" y2="36" stroke="#e2e8f0" stroke-width="1.5"/>
    <circle cx="20" cy="18" r="5" fill="#ef4444"/>
    <circle cx="36" cy="18" r="5" fill="#f59e0b"/>
    <circle cx="52" cy="18" r="5" fill="#10b981"/>
    <text x="75" y="22" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="600" fill="#64748b">CBT QUESTION SLICE PREVIEW</text>
    
    <!-- Question Content -->
    <text x="32" y="72" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="600" fill="${color}">${title}</text>
    <text x="32" y="100" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#475569">${subtitle}</text>
    
    <!-- Options or Formula Diagram -->
    <g transform="translate(32, 120)">
      <rect x="0" y="0" width="140" height="36" rx="4" fill="#f1f5f9" stroke="#cbd5e1"/>
      <text x="12" y="22" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="500" fill="#334155">(A) 2.50 × 10⁻³ J</text>
      
      <rect x="155" y="0" width="140" height="36" rx="4" fill="#f1f5f9" stroke="#cbd5e1"/>
      <text x="167" y="22" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="500" fill="#334155">(B) 4.25 × 10⁻³ J</text>
      
      <rect x="310" y="0" width="140" height="36" rx="4" fill="#f1f5f9" stroke="#cbd5e1"/>
      <text x="322" y="22" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="500" fill="#334155">(C) 8.10 × 10⁻³ J</text>
      
      <rect x="465" y="0" width="140" height="36" rx="4" fill="#f1f5f9" stroke="#cbd5e1"/>
      <text x="477" y="22" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="500" fill="#334155">(D) None of these</text>
    </g>

    <!-- Footer info -->
    <text x="32" y="210" font-family="monospace" font-size="11" fill="#94a3b8">Cropped Slice • 300 DPI Rendering • Coordinate Bounding Box Sized</text>
  </svg>`;

  return new Blob([svgString], { type: 'image/svg+xml' });
}

/**
 * Creates SVG Blob representing a realistic paragraph table slice (Part 1 of Comprehension question)
 */
function createPassageTableSvgBlob(): Blob {
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="230" viewBox="0 0 700 230" fill="none">
    <rect width="700" height="230" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
    <rect x="0" y="0" width="700" height="30" rx="8" fill="#f8fafc"/>
    <text x="24" y="20" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="bold" fill="#0f766e">PARAGRAPH FOR QUESTION NOS. (33-34)</text>
    
    <text x="24" y="54" font-family="system-ui, -apple-system, sans-serif" font-size="13.5" font-weight="500" fill="#1e293b">
      For a chemical reaction <tspan font-weight="bold" fill="#0f172a">A + B → Products</tspan>, the order is one with respect to each <tspan font-weight="bold">A</tspan> and <tspan font-weight="bold">B</tspan>.
    </text>
    
    <!-- Table -->
    <g transform="translate(24, 75)">
      <rect width="650" height="110" rx="4" fill="#ffffff" stroke="#94a3b8" stroke-width="1"/>
      <rect width="650" height="32" rx="4" fill="#f1f5f9"/>
      <line x1="0" y1="32" x2="650" y2="32" stroke="#94a3b8" stroke-width="1"/>
      <line x1="0" y1="58" x2="650" y2="58" stroke="#e2e8f0" stroke-width="1"/>
      <line x1="0" y1="84" x2="650" y2="84" stroke="#e2e8f0" stroke-width="1"/>
      
      <line x1="220" y1="0" x2="220" y2="110" stroke="#94a3b8" stroke-width="1"/>
      <line x1="435" y1="0" x2="435" y2="110" stroke="#94a3b8" stroke-width="1"/>
      
      <!-- Headers -->
      <text x="110" y="21" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#334155" text-anchor="middle">Rate (mol L⁻¹ s⁻¹)</text>
      <text x="327" y="21" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#334155" text-anchor="middle">[A] (mol L⁻¹)</text>
      <text x="542" y="21" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#334155" text-anchor="middle">[B] (mol L⁻¹)</text>
      
      <!-- Row 1 -->
      <text x="110" y="49" font-family="system-ui, sans-serif" font-size="12.5" fill="#1e293b" text-anchor="middle">0.10</text>
      <text x="327" y="49" font-family="system-ui, sans-serif" font-size="12.5" fill="#1e293b" text-anchor="middle">0.20</text>
      <text x="542" y="49" font-family="system-ui, sans-serif" font-size="12.5" fill="#1e293b" text-anchor="middle">0.05</text>
      
      <!-- Row 2 -->
      <text x="110" y="75" font-family="system-ui, sans-serif" font-size="12.5" fill="#1e293b" text-anchor="middle">0.40</text>
      <text x="327" y="75" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#0369a1" text-anchor="middle">x</text>
      <text x="542" y="75" font-family="system-ui, sans-serif" font-size="12.5" fill="#1e293b" text-anchor="middle">0.05</text>
      
      <!-- Row 3 -->
      <text x="110" y="101" font-family="system-ui, sans-serif" font-size="12.5" fill="#1e293b" text-anchor="middle">0.80</text>
      <text x="327" y="101" font-family="system-ui, sans-serif" font-size="12.5" fill="#1e293b" text-anchor="middle">0.40</text>
      <text x="542" y="101" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#b91c1c" text-anchor="middle">y</text>
    </g>

    <text x="24" y="210" font-family="system-ui, sans-serif" font-size="10.5" fill="#64748b">Part 1 of 2: Comprehension Passage &amp; Kinetic Experimental Data</text>
  </svg>`;

  return new Blob([svgString], { type: 'image/svg+xml' });
}

/**
 * Creates SVG Blob representing a realistic question prompt slice (Part 2 of Comprehension question)
 */
function createQuestionPromptSvgBlob(questionNo: number, promptText: string): Blob {
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="110" viewBox="0 0 700 110" fill="none">
    <rect width="700" height="110" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
    <text x="24" y="55" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="#0f172a">
      ${questionNo}. ${promptText}
    </text>
    <text x="24" y="90" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">
      Part 2 of 2: Numerical Answer Prompt (Enter non-negative value)
    </text>
  </svg>`;

  return new Blob([svgString], { type: 'image/svg+xml' });
}

/**
 * Creates a sample flawed archive for testing all linter rules and auto-fixers!
 */
export function createFlawedSampleArchive(): QuestionPaperArchive {
  const rawFilesMap = new Map<string, { blob: Blob; url: string; size: number }>();

  function registerImage(fileName: string, blob: Blob): ImageAttachment {
    const url = URL.createObjectURL(blob);
    rawFilesMap.set(fileName, { blob, url, size: blob.size });
    return {
      id: generateId(),
      partIndex: 1,
      fileName,
      blobUrl: url,
      rawBlob: blob,
      mimeType: blob.type,
      sizeBytes: blob.size,
    };
  }

  // Physics Section 1 (Single Correct MCQs)
  const pSec1Name = 'Physics Section 1';
  const pQ1Img = registerImage(
    buildImageFileName(pSec1Name, 1, 1, 'png'),
    createQuestionSvgBlob('Q1: Electromagnetic Induction', 'A uniform magnetic field B(t) = B₀(1 - αt) passes through a loop...', '#0369a1')
  );
  const pQ2Img = registerImage(
    buildImageFileName(pSec1Name, 2, 1, 'png'),
    createQuestionSvgBlob('Q2: Rotational Dynamics', 'A rigid cylinder of mass M and radius R rolls without slipping on an inclined plane...', '#0369a1')
  );
  const pQ3Img = registerImage(
    buildImageFileName(pSec1Name, 3, 1, 'png'),
    createQuestionSvgBlob('Q3: Thermodynamics Carnot Cycle', 'An ideal gas undergoes a quasi-static cyclic process with efficiency η = 40%...', '#0369a1')
  );

  // Intentional Flaw: Malformed filename for Q4
  const malformedFileName = 'Math_Sec1_Q3.png';
  const pQ4ImgMalformed = registerImage(
    malformedFileName,
    createQuestionSvgBlob('Q4: Wave Optics Interference', 'In a Young double-slit experiment, source wavelength is λ = 589 nm...', '#0369a1')
  );

  // Intentional Flaw: Duplicate question 4
  const pQ4DupImg = registerImage(
    buildImageFileName(pSec1Name, 4, 1, 'png'),
    createQuestionSvgBlob('Q4 (Duplicate): Modern Physics Photoelectric', 'Light of frequency 1.5 ν₀ is incident on a photosensitive surface...', '#0369a1')
  );

  // Intentional Flaw: Non-sequential jump (Q10 to Q12)
  const pQ10Img = registerImage(
    buildImageFileName(pSec1Name, 10, 1, 'png'),
    createQuestionSvgBlob('Q10: Electrostatics Gauss Law', 'A solid dielectric sphere of radius R has non-uniform charge density ρ(r) = kr...', '#0369a1')
  );
  const pQ12Img = registerImage(
    buildImageFileName(pSec1Name, 12, 1, 'png'),
    createQuestionSvgBlob('Q12: SHM & Coupled Oscillators', 'Two identical springs of constant k support mass m in horizontal configuration...', '#0369a1')
  );

  // Intentional Flaw: Orphaned Image in archive that is not linked in data.json!
  registerImage(
    'Physics Section 1__--__99__--__1.png',
    createQuestionSvgBlob('Orphaned File: Unlinked Question #99', 'This binary was left over from a previous crop export and is not linked.', '#b91c1c')
  );

  // Chemistry Section 2 (Multi Correct MSQ)
  const cSec2Name = 'Chemistry Section 2';
  const cQ5Img = registerImage(
    buildImageFileName(cSec2Name, 5, 1, 'png'),
    createQuestionSvgBlob('Q5 (MSQ): Coordination Chemistry', 'Which of the following octahedral complexes exhibits optical isomerism and low spin?', '#047857')
  );

  // Intentional Flaw: Multi-part question with missing Part 2 image!
  const cQ6Part1 = registerImage(
    buildImageFileName(cSec2Name, 6, 1, 'png'),
    createQuestionSvgBlob('Q6 (Part 1 of 2): Organic Reaction Mechanism', 'Identify all major products (P, Q, R) formed in the sequence shown below:', '#047857')
  );
  // Notice we DO NOT register Chemistry Section 2__--__6__--__2.png in rawFilesMap, but we declare it in pdfData!

  const chemistryQuestions: QuestionData[] = [
    {
      id: generateId(),
      key: '5',
      que: 5,
      type: 'msq',
      marks: { cm: 4, im: 0, pm: 0, max: 4 }, // Flaw: MSQ with pm: 0 and im: 0!
      answerOptions: '1,2,4',
      pdfData: [{ page: 2, x1: 50, y1: 100, x2: 450, y2: 300, filename: cQ5Img.fileName }],
      images: [cQ5Img],
    },
    {
      id: generateId(),
      key: '6',
      que: 6,
      type: 'msq',
      marks: { cm: 4, im: -2, pm: 1, max: 4 },
      answerOptions: '2,3',
      pdfData: [
        { page: 2, x1: 50, y1: 320, x2: 450, y2: 500, filename: cQ6Part1.fileName },
        { page: 2, x1: 50, y1: 510, x2: 450, y2: 700, filename: buildImageFileName(cSec2Name, 6, 2, 'png') }, // Missing part!
      ],
      images: [cQ6Part1], // Only part 1 present!
    },
  ];

  const physicsQuestions: QuestionData[] = [
    {
      id: generateId(),
      key: '1',
      que: 1,
      type: 'mcq',
      marks: { cm: 3, im: -1, pm: 0, max: 3 },
      answerOptions: '2',
      pdfData: [{ page: 1, x1: 0, y1: 0, x2: 500, y2: 300, filename: pQ1Img.fileName }],
      images: [pQ1Img],
    },
    {
      id: generateId(),
      key: '2',
      que: 2,
      type: 'mcq',
      marks: { cm: 3, im: -1, pm: 0, max: 3 },
      answerOptions: '1',
      pdfData: [{ page: 1, x1: 0, y1: 310, x2: 500, y2: 600, filename: pQ2Img.fileName }],
      images: [pQ2Img],
    },
    {
      id: generateId(),
      key: '3',
      que: 3,
      type: 'mcq',
      marks: { cm: 3, im: -1, pm: 0, max: 3 },
      answerOptions: '3',
      pdfData: [{ page: 1, x1: 0, y1: 610, x2: 500, y2: 900, filename: pQ3Img.fileName }],
      images: [pQ3Img],
    },
    {
      id: generateId(),
      key: '4',
      que: 4,
      type: 'mcq',
      marks: { cm: 3, im: -1, pm: 0, max: 3 },
      answerOptions: '4',
      pdfData: [{ page: 1, x1: 520, y1: 0, x2: 1000, y2: 300, filename: malformedFileName }],
      images: [pQ4ImgMalformed],
    },
    {
      id: generateId(),
      key: '4_dup',
      que: 4, // Duplicate que index!
      type: 'mcq',
      marks: { cm: 3, im: -1, pm: 0, max: 3 },
      answerOptions: '2',
      pdfData: [{ page: 1, x1: 520, y1: 310, x2: 1000, y2: 600, filename: pQ4DupImg.fileName }],
      images: [pQ4DupImg],
    },
    {
      id: generateId(),
      key: '10',
      que: 10,
      type: 'nat',
      marks: { cm: 4, im: 0, pm: 0, max: 4 },
      answerOptions: '12.5',
      pdfData: [{ page: 2, x1: 0, y1: 0, x2: 500, y2: 300, filename: pQ10Img.fileName }],
      images: [pQ10Img],
    },
    {
      id: generateId(),
      key: '12',
      que: 12, // Gap from 10 to 12!
      type: 'nat',
      marks: { cm: 4, im: 0, pm: 0, max: 4 },
      answerOptions: '5',
      pdfData: [{ page: 2, x1: 0, y1: 320, x2: 500, y2: 600, filename: pQ12Img.fileName }],
      images: [pQ12Img],
    },
  ];

  const subjects: SubjectData[] = [
    {
      id: generateId(),
      name: 'Physics',
      sections: [
        {
          id: generateId(),
          name: pSec1Name,
          questions: physicsQuestions,
        },
      ],
    },
    {
      id: generateId(),
      name: 'Chemistry',
      sections: [
        {
          id: generateId(),
          name: cSec2Name,
          questions: chemistryQuestions,
        },
      ],
    },
  ];

  return {
    id: generateId(),
    fileName: 'JEE_Adv_2025_Paper1_Flawed_Sample.zip',
    title: 'JEE Advanced 2025 Paper 1 (Diagnostic Test Archive)',
    format: 'pdfCropper',
    metadata: {
      pdfFileHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      additionalData: { shift: 'Morning', testDuration: 180 },
      appVersion: '2.6.0',
      generatedBy: 'pdfCropperPage',
      testTitle: 'JEE Advanced 2025 Paper 1',
      createdAt: new Date().toISOString(),
    },
    subjects,
    rawFiles: rawFilesMap,
    isDirty: false,
    lastModified: Date.now(),
  };
}

/**
 * Creates a clean, pristine full JEE Main mock paper
 */
export function createCleanSampleArchive(): QuestionPaperArchive {
  const rawFilesMap = new Map<string, { blob: Blob; url: string; size: number }>();

  function registerImage(fileName: string, blob: Blob): ImageAttachment {
    const url = URL.createObjectURL(blob);
    rawFilesMap.set(fileName, { blob, url, size: blob.size });
    return {
      id: generateId(),
      partIndex: 1,
      fileName,
      blobUrl: url,
      rawBlob: blob,
      mimeType: blob.type,
      sizeBytes: blob.size,
    };
  }

  const subjectsConfig = [
    { name: 'Physics', sec: 'Physics Section A', color: '#0284c7', count: 5 },
    { name: 'Chemistry', sec: 'Chemistry Section A', color: '#059669', count: 5 },
    { name: 'Mathematics', sec: 'Mathematics Section A', color: '#7c3aed', count: 5 },
  ];

  const subjects: SubjectData[] = subjectsConfig.map((sub) => {
    const questions: QuestionData[] = [];
    for (let q = 1; q <= sub.count; q++) {
      const fileName = buildImageFileName(sub.sec, q, 1, 'png');
      const blob = createQuestionSvgBlob(
        `${sub.name} Q${q}: Standard JEE Main Problem`,
        `Question prompt and conditions for ${sub.name} test item ${q}. Select correct option.`,
        sub.color
      );
      const img = registerImage(fileName, blob);
      questions.push({
        id: generateId(),
        key: `${q}`,
        que: q,
        type: q <= 3 ? 'mcq' : 'nat',
        marks: { cm: 4, im: -1, pm: 0, max: 4 },
        answerOptions: q <= 3 ? String((q % 4) + 1) : '25.0',
        pdfData: [{ page: 1, x1: 0, y1: (q - 1) * 150, x2: 500, y2: q * 150, filename: fileName }],
        images: [img],
      });
    }

    return {
      id: generateId(),
      name: sub.name,
      sections: [
        {
          id: generateId(),
          name: sub.sec,
          questions,
        },
      ],
    };
  });

  return {
    id: generateId(),
    fileName: 'JEE_Main_2025_Clean_Standard.zip',
    title: 'JEE Main 2025 Complete Model Paper',
    format: 'pdfCropper',
    metadata: {
      pdfFileHash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      additionalData: { targetYear: 2025 },
      appVersion: '2.6.0',
      generatedBy: 'CBTQuestionPaperStudio',
      testTitle: 'JEE Main 2025 Complete Model Paper',
      createdAt: new Date().toISOString(),
    },
    subjects,
    rawFiles: rawFilesMap,
    isDirty: false,
    lastModified: Date.now(),
  };
}

/**
 * Creates the exact JEE Advanced Chemistry archive with real Paragraph Passages
 * and Multi-Part Slices matching the user's provided structure (Chemistry Section 4, Q34 parts 1 & 2).
 */
export function createJeeAdvChemistrySampleArchive(): QuestionPaperArchive {
  const rawFilesMap = new Map<string, { blob: Blob; url: string; size: number }>();

  function registerImage(fileName: string, blob: Blob, partIdx: number = 1): ImageAttachment {
    const url = URL.createObjectURL(blob);
    rawFilesMap.set(fileName, { blob, url, size: blob.size });
    return {
      id: generateId(),
      partIndex: partIdx,
      fileName,
      blobUrl: url,
      rawBlob: blob,
      mimeType: blob.type,
      sizeBytes: blob.size,
    };
  }

  // --- Section 1: Single Correct MCQs (Q18 - Q21) (+3 / -1) ---
  const sec1Name = 'Chemistry Section 1';
  const sec1Questions: QuestionData[] = [
    {
      id: generateId(),
      key: '18',
      que: 18,
      type: 'mcq',
      marks: { cm: 3, im: -1, pm: 0, max: 3 },
      answerOptions: '4',
      pdfData: [{ page: 1, x1: 50, y1: 100, x2: 500, y2: 260, filename: buildImageFileName(sec1Name, 18, 1, 'png') }],
      images: [
        registerImage(
          buildImageFileName(sec1Name, 18, 1, 'png'),
          createQuestionSvgBlob('Q18: Chemical Thermodynamics', 'Calculate the standard Gibbs free energy change ΔG° for the gaseous equilibrium at 298 K...', '#059669')
        ),
      ],
    },
    {
      id: generateId(),
      key: '19',
      que: 19,
      type: 'mcq',
      marks: { cm: 3, im: -1, pm: 0, max: 3 },
      answerOptions: '4',
      pdfData: [{ page: 1, x1: 50, y1: 270, x2: 500, y2: 430, filename: buildImageFileName(sec1Name, 19, 1, 'png') }],
      images: [
        registerImage(
          buildImageFileName(sec1Name, 19, 1, 'png'),
          createQuestionSvgBlob('Q19: Coordination Isomerism', 'The total number of stereoisomers possible for [Co(en)₂Cl₂]⁺ complex ion is...', '#059669')
        ),
      ],
    },
    {
      id: generateId(),
      key: '20',
      que: 20,
      type: 'mcq',
      marks: { cm: 3, im: -1, pm: 0, max: 3 },
      answerOptions: '4',
      pdfData: [{ page: 1, x1: 50, y1: 440, x2: 500, y2: 600, filename: buildImageFileName(sec1Name, 20, 1, 'png') }],
      images: [
        registerImage(
          buildImageFileName(sec1Name, 20, 1, 'png'),
          createQuestionSvgBlob('Q20: Aldol Condensation', 'Predict the major aromatic product formed in the base-catalyzed intramolecular cross-condensation...', '#059669')
        ),
      ],
    },
    {
      id: generateId(),
      key: '21',
      que: 21,
      type: 'mcq',
      marks: { cm: 3, im: -1, pm: 0, max: 3 },
      answerOptions: '4',
      pdfData: [{ page: 1, x1: 50, y1: 610, x2: 500, y2: 770, filename: buildImageFileName(sec1Name, 21, 1, 'png') }],
      images: [
        registerImage(
          buildImageFileName(sec1Name, 21, 1, 'png'),
          createQuestionSvgBlob('Q21: Electrochemistry Nernst Equation', 'For the cell Zn|Zn²⁺(0.1M) || Cu²⁺(0.01M)|Cu, the cell EMF at 298 K is closest to...', '#059669')
        ),
      ],
    },
  ];

  // --- Section 2: One or More Correct MSQs (Q22 - Q24) (+4 / -2 / partial +1) ---
  const sec2Name = 'Chemistry Section 2';
  const sec2Questions: QuestionData[] = [
    {
      id: generateId(),
      key: '22',
      que: 22,
      type: 'msq',
      marks: { cm: 4, im: -2, pm: 1, max: 4 },
      answerOptions: '1,2,4',
      pdfData: [{ page: 2, x1: 50, y1: 100, x2: 500, y2: 300, filename: buildImageFileName(sec2Name, 22, 1, 'png') }],
      images: [
        registerImage(
          buildImageFileName(sec2Name, 22, 1, 'png'),
          createQuestionSvgBlob('Q22 (MSQ): Qualitative Salt Analysis', 'Which of the following cations produce a black precipitate with H₂S in acidic medium (Group II)?', '#0d9488')
        ),
      ],
    },
    {
      id: generateId(),
      key: '23',
      que: 23,
      type: 'msq',
      marks: { cm: 4, im: -2, pm: 1, max: 4 },
      answerOptions: '2,3',
      pdfData: [{ page: 2, x1: 50, y1: 310, x2: 500, y2: 510, filename: buildImageFileName(sec2Name, 23, 1, 'png') }],
      images: [
        registerImage(
          buildImageFileName(sec2Name, 23, 1, 'png'),
          createQuestionSvgBlob('Q23 (MSQ): Molecular Orbital Theory', 'According to MOT, choose the correct statements regarding O₂⁺ and N₂⁻ species...', '#0d9488')
        ),
      ],
    },
    {
      id: generateId(),
      key: '24',
      que: 24,
      type: 'msq',
      marks: { cm: 4, im: -2, pm: 1, max: 4 },
      answerOptions: '1,3,4',
      pdfData: [{ page: 2, x1: 50, y1: 520, x2: 500, y2: 720, filename: buildImageFileName(sec2Name, 24, 1, 'png') }],
      images: [
        registerImage(
          buildImageFileName(sec2Name, 24, 1, 'png'),
          createQuestionSvgBlob('Q24 (MSQ): Aromatic Electrophilic Substitution', 'Identify the reagents that will convert Nitrobenzene into 1,3,5-tribromobenzene...', '#0d9488')
        ),
      ],
    },
  ];

  // --- Section 3: Numerical / NAT (Q25 - Q30) (+4 / 0) ---
  const sec3Name = 'Chemistry Section 3';
  const sec3Questions: QuestionData[] = [
    {
      id: generateId(),
      key: '25',
      que: 25,
      type: 'nat',
      marks: { cm: 4, im: 0, pm: 0, max: 4 },
      answerOptions: '6',
      pdfData: [{ page: 3, x1: 50, y1: 80, x2: 500, y2: 240, filename: buildImageFileName(sec3Name, 25, 1, 'png') }],
      images: [
        registerImage(
          buildImageFileName(sec3Name, 25, 1, 'png'),
          createQuestionSvgBlob('Q25 (NAT): Coordination Number', 'Find the total number of unpaired electrons in octahedral high-spin [Fe(H₂O)₆]²⁺ ion.', '#0284c7')
        ),
      ],
    },
    {
      id: generateId(),
      key: '26',
      que: 26,
      type: 'nat',
      marks: { cm: 4, im: 0, pm: 0, max: 4 },
      answerOptions: '4.50',
      pdfData: [{ page: 3, x1: 50, y1: 250, x2: 500, y2: 410, filename: buildImageFileName(sec3Name, 26, 1, 'png') }],
      images: [
        registerImage(
          buildImageFileName(sec3Name, 26, 1, 'png'),
          createQuestionSvgBlob('Q26 (NAT): Buffer pH Calculation', 'The pH of a buffer solution prepared by mixing 50 mL of 0.2 M CH₃COOH with 25 mL of 0.2 M CH₃COONa is...', '#0284c7')
        ),
      ],
    },
    {
      id: generateId(),
      key: '27',
      que: 27,
      type: 'nat',
      marks: { cm: 4, im: 0, pm: 0, max: 4 },
      answerOptions: '12',
      pdfData: [
        { page: 3, x1: 50, y1: 420, x2: 500, y2: 560, filename: buildImageFileName(sec3Name, 27, 1, 'png') },
        { page: 3, x1: 50, y1: 570, x2: 500, y2: 710, filename: buildImageFileName(sec3Name, 27, 2, 'png') },
      ],
      images: [
        registerImage(
          buildImageFileName(sec3Name, 27, 1, 'png'),
          createQuestionSvgBlob('Q27 (Part 1 of 2): Crystal Lattice Geometry', 'A face-centered cubic (FCC) unit cell consists of atoms A at corners and B at face centers...', '#0284c7'),
          1
        ),
        registerImage(
          buildImageFileName(sec3Name, 27, 2, 'png'),
          createQuestionPromptSvgBlob(27, 'If two face-centered atoms along one axis are removed, determine the empirical stoichiometry number (A_x B_y).'),
          2
        ),
      ],
    },
    {
      id: generateId(),
      key: '29',
      que: 29,
      type: 'nat',
      marks: { cm: 4, im: 0, pm: 0, max: 4 },
      answerOptions: '3',
      pdfData: [{ page: 4, x1: 50, y1: 80, x2: 500, y2: 240, filename: buildImageFileName(sec3Name, 29, 1, 'png') }],
      images: [
        registerImage(
          buildImageFileName(sec3Name, 29, 1, 'png'),
          createQuestionSvgBlob('Q29 (NAT): Colligative Properties', 'Van\'t Hoff factor i for K₃[Fe(CN)₆] at 80% degree of dissociation is...', '#0284c7')
        ),
      ],
    },
    {
      id: generateId(),
      key: '30',
      que: 30,
      type: 'nat',
      marks: { cm: 4, im: 0, pm: 0, max: 4 },
      answerOptions: '2.40',
      pdfData: [{ page: 4, x1: 50, y1: 250, x2: 500, y2: 410, filename: buildImageFileName(sec3Name, 30, 1, 'png') }],
      images: [
        registerImage(
          buildImageFileName(sec3Name, 30, 1, 'png'),
          createQuestionSvgBlob('Q30 (NAT): Surface Chemistry Langmuir Isotherm', 'At high gas pressures, the mass of gas adsorbed per gram of charcoal reaches the limiting value...', '#0284c7')
        ),
      ],
    },
  ];

  // --- Section 4: Paragraph & Comprehension NATs (Q31 - Q34) (+3 / 0) ---
  const sec4Name = 'Chemistry Section 4';
  
  // Create the exact multi-part image slices for Question 34
  const q34ImgPart1 = registerImage(
    buildImageFileName(sec4Name, 34, 1, 'png'),
    createPassageTableSvgBlob(),
    1
  );
  const q34ImgPart2 = registerImage(
    buildImageFileName(sec4Name, 34, 2, 'png'),
    createQuestionPromptSvgBlob(34, "The value of 'y' is ___."),
    2
  );

  const q33ImgPart1 = registerImage(
    buildImageFileName(sec4Name, 33, 1, 'png'),
    createPassageTableSvgBlob(),
    1
  );
  const q33ImgPart2 = registerImage(
    buildImageFileName(sec4Name, 33, 2, 'png'),
    createQuestionPromptSvgBlob(33, "The value of 'x' is ___."),
    2
  );

  const sec4Questions: QuestionData[] = [
    {
      id: generateId(),
      key: '31',
      que: 31,
      type: 'nat',
      marks: { cm: 3, im: 0, pm: 0, max: 3 },
      answerOptions: '8',
      pdfData: [{ page: 5, x1: 50, y1: 80, x2: 500, y2: 240, filename: buildImageFileName(sec4Name, 31, 1, 'png') }],
      images: [
        registerImage(
          buildImageFileName(sec4Name, 31, 1, 'png'),
          createQuestionSvgBlob('Q31 (NAT): Radioactivity Half-Life', 'A radioactive sample has a half-life of 20 minutes. After 1 hour, the fraction decayed is...', '#475569')
        ),
      ],
    },
    {
      id: generateId(),
      key: '32',
      que: 32,
      type: 'nat',
      marks: { cm: 3, im: 0, pm: 0, max: 3 },
      answerOptions: '5',
      pdfData: [{ page: 5, x1: 50, y1: 250, x2: 500, y2: 410, filename: buildImageFileName(sec4Name, 32, 1, 'png') }],
      images: [
        registerImage(
          buildImageFileName(sec4Name, 32, 1, 'png'),
          createQuestionSvgBlob('Q32 (NAT): Quantum Numbers', 'Find the total number of orbitals with principal quantum number n = 4 and magnetic quantum number m = 0.', '#475569')
        ),
      ],
    },
    {
      id: generateId(),
      key: '33',
      que: 33,
      type: 'nat',
      marks: { cm: 3, im: 0, pm: 0, max: 3 },
      answerOptions: '0.80',
      pdfData: [
        { page: 5, x1: 40, y1: 430, x2: 520, y2: 600, filename: q33ImgPart1.fileName },
        { page: 5, x1: 40, y1: 610, x2: 520, y2: 700, filename: q33ImgPart2.fileName },
      ],
      images: [q33ImgPart1, q33ImgPart2],
    },
    {
      id: generateId(),
      key: '34',
      que: 34,
      type: 'nat',
      marks: { cm: 3, im: 0, pm: 0, max: 3 },
      answerOptions: '0.20',
      pdfData: [
        { page: 5, x1: 40, y1: 430, x2: 520, y2: 600, filename: q34ImgPart1.fileName },
        { page: 5, x1: 40, y1: 610, x2: 520, y2: 700, filename: q34ImgPart2.fileName },
      ],
      images: [q34ImgPart1, q34ImgPart2],
    },
  ];

  const chemistrySubject: SubjectData = {
    id: generateId(),
    name: 'Chemistry',
    sections: [
      { id: generateId(), name: sec1Name, questions: sec1Questions },
      { id: generateId(), name: sec2Name, questions: sec2Questions },
      { id: generateId(), name: sec3Name, questions: sec3Questions },
      { id: generateId(), name: sec4Name, questions: sec4Questions },
    ],
  };

  return {
    id: generateId(),
    fileName: 'JEE_Adv_Chemistry_Kinetics_Sample.zip',
    title: 'JEE Advanced Chemistry (Kinetics Passage & Multi-Part Slices)',
    format: 'pdfCropper',
    metadata: {
      pdfFileHash: 'c4ca4238a0b923820dcc509a6f75849b',
      additionalData: { paper: 'Paper-1', year: 2025 },
      appVersion: '2.6.0',
      generatedBy: 'pdfCropperPage',
      testTitle: 'JEE Advanced Chemistry (Paper 1)',
      createdAt: new Date().toISOString(),
    },
    subjects: [chemistrySubject],
    rawFiles: rawFilesMap,
    isDirty: false,
    lastModified: Date.now(),
  };
}
