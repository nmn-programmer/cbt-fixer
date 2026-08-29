import express from 'express';
import path from 'path';
import { GoogleGenAI, Type, Schema } from '@google/genai';
import { executeGeminiWithFallback, isAuthError, isTransientError, formatAiErrorMessage } from './src/utils/aiModelConfig';

export const app = express();
const PORT = 3000;

app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Helper to determine HTTP status code from error
function getErrorStatusCode(err: any): number {
  if (isAuthError(err)) return 401;
  const msg = String(err?.message || '').toLowerCase();
  const status = err?.status || err?.code || err?.statusCode;
  if (status === 503 || msg.includes('503') || msg.includes('high demand') || msg.includes('unavailable') || msg.includes('overloaded')) {
    return 503;
  }
  if (isTransientError(err)) return 429;
  return 500;
}

// API Route to extract test paper instructions blueprint & question ranges from Cover / Instructions page
app.post('/api/extract-test-blueprint', async (req, res) => {
  try {
    const { image, images, text, documentSummary, model: requestedModel } = req.body;
    const rawImages: string[] = images && Array.isArray(images) && images.length > 0
      ? images
      : (image ? [image] : []);

    if (rawImages.length === 0 && !text && !documentSummary) {
      return res.status(400).json({ error: 'Instruction page image or text is required' });
    }

    const authHeader = req.headers.authorization;
    const clientApiKey = authHeader ? authHeader.replace('Bearer ', '').trim() : null;
    const apiKey = clientApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(401).json({ error: 'Gemini API key is required. Please set it in Settings.' });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    const blueprintSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        testTitle: { type: Type.STRING, description: "Official test name/title from cover or instructions" },
        durationMinutes: { type: Type.INTEGER, description: "Total test duration in minutes (e.g. 60, 180, 200)" },
        totalMarks: { type: Type.INTEGER, description: "Maximum aggregate marks (e.g. 96, 300, 360, 720)" },
        totalQuestions: { type: Type.INTEGER, description: "Total number of questions in booklet (e.g. 24, 75, 90, 180)" },
        hasInstructedMarkingScheme: { type: Type.BOOLEAN, description: "True if explicit marking scheme rules are written in the instructions" },
        markingSchemeSummary: { type: Type.STRING, description: "Concise human-readable summary of the exact instructed marking scheme (e.g., 'MCQ: +4/-1, Numerical: +4/0, MSQ: +4/-2 with partial marks')" },
        defaultMarkingScheme: {
          type: Type.OBJECT,
          properties: {
            cm: { type: Type.NUMBER, description: "Default correct marks, e.g. 4 or 3" },
            im: { type: Type.NUMBER, description: "Default incorrect/negative marks, e.g. -1 or 0" },
            pm: { type: Type.NUMBER, description: "Default partial marks, e.g. 0 or 1" },
            max: { type: Type.NUMBER, description: "Default max marks per question, e.g. 4" }
          },
          required: ["cm", "im"]
        },
        sections: {
          type: Type.ARRAY,
          description: "List of subject and section question ranges parsed strictly from instructions",
          items: {
            type: Type.OBJECT,
            properties: {
              subjectName: { type: Type.STRING, description: "Standard Subject Name: Physics, Chemistry, Mathematics, Biology, Botany, Zoology, etc." },
              sectionName: { type: Type.STRING, description: "Section name, e.g. Section 1 (MCQ), Section 2 (Numerical), Part A, etc." },
              fromQNo: { type: Type.INTEGER, description: "Starting question number (inclusive), e.g. 1" },
              toQNo: { type: Type.INTEGER, description: "Ending question number (inclusive), e.g. 8" },
              type: { type: Type.STRING, description: "Question type: 'mcq' (single correct), 'msq' (multiple correct), 'nat' (numerical), 'msm' (matrix match)" },
              marks: {
                type: Type.OBJECT,
                properties: {
                  cm: { type: Type.NUMBER, description: "Exact instructed correct marks, e.g. 4, 3" },
                  im: { type: Type.NUMBER, description: "Exact instructed negative marks (negative number e.g. -1, -2 or 0)" },
                  pm: { type: Type.NUMBER, description: "Exact instructed partial marks if specified for MSQ (e.g. 1), else 0" },
                  max: { type: Type.NUMBER, description: "Maximum marks per question e.g. 4" }
                },
                required: ["cm", "im"]
              }
            },
            required: ["subjectName", "sectionName", "fromQNo", "toQNo", "type", "marks"]
          }
        }
      },
      required: ["sections", "defaultMarkingScheme"]
    };

    const prompt = `You are a test paper booklet blueprint & marking scheme specialist.
Examine this Instructions / Cover page or text thoroughly.

CRITICAL DIRECTIVE ON MARKING SCHEME EXTRACTION:
1. Examine the General Instructions or Marking Scheme table carefully:
   - Identify the exact marks awarded for correct answers (+4, +3, +1, etc.).
   - Identify the exact negative marks deducted for wrong answers (-1, -2, -0.5, 0, etc.).
   - Note if certain sections have different marking rules (e.g. Section 1 Single Correct: +4/-1; Section 2 Numerical: +4/0; Section 3 Multiple Correct: +4/-2 with partial marks).
   - If the instructions specify no negative marking for numerical questions, set im = 0 for those ranges.
   - Summarize the marking scheme clearly in "markingSchemeSummary".
   - Put global defaults into "defaultMarkingScheme" and section-specific rules into each section's "marks".

2. Extract Test Title, Duration (in minutes), Total Maximum Marks, and Total Number of Questions.

3. Extract the exact Subject and Section breakdown:
   - Subject Names (e.g. Physics, Chemistry, Mathematics, Biology).
   - Question Ranges for each subject/section (e.g. Physics: Q1 to Q8, Chemistry: Q9 to Q16, Mathematics: Q17 to Q24).
   - Question Types:
     * 'mcq' for Single Correct Choice
     * 'msq' for Multiple Correct Choice (One or More than One Correct)
     * 'nat' for Numerical Value / Integer Answer
     * 'msm' for Matrix Match / List Match
   - Ensure all questions from 1 to Total Questions are mapped without gaps or overlapping ranges.`;

    const contents: any[] = [];
    rawImages.forEach((imgStr, i) => {
      const isJpeg = imgStr.startsWith('data:image/jpeg');
      contents.push({
        inlineData: {
          data: imgStr.replace(/^data:image\/\w+;base64,/, ''),
          mimeType: isJpeg ? 'image/jpeg' : 'image/png'
        }
      });
    });

    if (documentSummary) {
      contents.push({ text: `DOCUMENT CONTEXT & PAGE ASSIGNMENTS:\n${documentSummary}` });
    }
    if (text) {
      contents.push({ text: `Instructions Text:\n${text}` });
    }
    contents.push({ text: prompt });

    const blueprintResult = await executeGeminiWithFallback(ai, {
      contents,
      schema: blueprintSchema,
      temperature: 0.1,
      preferredModel: requestedModel,
      label: 'Server Extract Test Blueprint'
    });

    res.json(blueprintResult);
  } catch (error: any) {
    console.error('Error extracting test blueprint:', error);
    res.status(getErrorStatusCode(error)).json({ error: formatAiErrorMessage(error) });
  }
});

// Stream B: API Route for Gemini Multi-modal Answer Key extraction
app.post('/api/extract-answer-key', async (req, res) => {
  try {
    const { images, text, manifest, model: requestedModel } = req.body;
    if ((!images || !images.length) && !text) {
      return res.status(400).json({ error: 'Answer key page images or text is required' });
    }

    const authHeader = req.headers.authorization;
    const clientApiKey = authHeader ? authHeader.replace('Bearer ', '').trim() : null;
    const apiKey = clientApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(401).json({ error: 'Gemini API key is required. Please set it in Settings.' });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    const answerKeySchema: Schema = {
      type: Type.OBJECT,
      properties: {
        totalExpectedQuestions: { type: Type.INTEGER, description: "Total count of answer key entries present (e.g. 90, 180, 200)" },
        testTitle: { type: Type.STRING, description: "Test title if printed on answer key sheet" },
        answerKeys: {
          type: Type.ARRAY,
          description: "Structured list of all question numbers and official correct options or numerical values",
          items: {
            type: Type.OBJECT,
            properties: {
              qNo: { type: Type.INTEGER, description: "Question number (e.g., 1, 2, 3...)" },
              answer: { type: Type.STRING, description: "Official answer: option letter 'A'/'B'/'C'/'D', multiple 'A,B', or NAT value e.g. '4.5'" },
              natValue: { type: Type.NUMBER, description: "Numeric decimal value if numerical/NAT type" },
              subject: { type: Type.STRING, description: "Subject if listed (Physics, Chemistry, Math, etc.)" },
              type: { type: Type.STRING, description: "Inferred type: MCQ, MSQ, NAT, MSM" }
            },
            required: ["qNo", "answer"]
          }
        },
        sections: {
          type: Type.ARRAY,
          description: "Subject ranges inferred from answer key grid headers if present",
          items: {
            type: Type.OBJECT,
            properties: {
              subjectName: { type: Type.STRING },
              fromQNo: { type: Type.INTEGER },
              toQNo: { type: Type.INTEGER }
            },
            required: ["subjectName", "fromQNo", "toQNo"]
          }
        }
      },
      required: ["answerKeys"]
    };

    let prompt = `You are an Answer Key & Ground-Truth Extraction Specialist.
Examine the provided Answer Key table, grid, OMR key, or solutions pages carefully.

CRITICAL INSTRUCTIONS:
1. Extract EVERY question number (1, 2, 3...) and its official correct answer option (A, B, C, D, 1, 2, 3, 4, or numerical value).
2. For Numerical / NAT questions, extract the exact numeric decimal answer (e.g., "40.5", "3.14") into both "answer" and "natValue".
3. For Multiple Choice with multiple options (e.g. A and C), format as "A,C".
4. Count total expected questions in the answer key.
5. If subject headers (Physics, Chemistry, Mathematics) are present above answer key columns, extract section ranges.`;

    if (manifest) {
      prompt += `\n\nGLOBAL BLUEPRINT MANIFEST:
- Test Title: ${manifest.testTitle || 'N/A'}
- Total Expected Questions: ${manifest.totalExpectedQuestions || 'N/A'}
- Subject Section Ranges: ${JSON.stringify(manifest.sections || [])}
Use this blueprint to map question numbers accurately to subjects and verify expected answer key entries.`;
    }

    const contents: any[] = [];
    if (images && Array.isArray(images)) {
      images.forEach((base64: string) => {
        const isJpeg = base64.startsWith('data:image/jpeg');
        contents.push({
          inlineData: {
            data: base64.replace(/^data:image\/\w+;base64,/, ''),
            mimeType: isJpeg ? 'image/jpeg' : 'image/png'
          }
        });
      });
    }
    if (text) {
      contents.push({ text: `Answer Key Text:\n${text}` });
    }
    contents.push({ text: prompt });

    const keyResult = await executeGeminiWithFallback(ai, {
      contents,
      schema: answerKeySchema,
      temperature: 0.1,
      preferredModel: requestedModel,
      label: 'Server Extract Answer Key (Stream B)'
    });

    res.json(keyResult);
  } catch (error: any) {
    console.error('Error extracting answer key:', error);
    res.status(getErrorStatusCode(error)).json({ error: formatAiErrorMessage(error) });
  }
});

// API Route for Gemini Multi-modal PDF analysis
app.post('/api/extract-pdf-structure', async (req, res) => {
  try {
    const { images, pageOffset = 0, options = {}, model: requestedModel } = req.body;
    const { hasAnswerKey = true, extractEnglishOnly = false, manifest = null, targetQNos = null } = options;
    
    if (!images || !images.length) {
      return res.status(400).json({ error: 'No images provided' });
    }

    const authHeader = req.headers.authorization;
    const clientApiKey = authHeader ? authHeader.replace('Bearer ', '').trim() : null;
    const apiKey = clientApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(401).json({ error: 'Gemini API key is required. Please set it in Settings.' });
    }

    const ai = new GoogleGenAI({ 
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const contents = images.map((base64: string) => {
      const isJpeg = base64.startsWith('data:image/jpeg');
      return {
        inlineData: {
          data: base64.replace(/^data:image\/\w+;base64,/, ''),
          mimeType: isJpeg ? 'image/jpeg' : 'image/png'
        }
      };
    });

    // Define the schema for structured output with split questions and option completeness support
    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        testTitle: { type: Type.STRING, description: "Title of the test paper if found" },
        durationMinutes: { type: Type.INTEGER, description: "Duration in minutes if found" },
        totalMarks: { type: Type.INTEGER, description: "Maximum marks if found" },
        questions: {
          type: Type.ARRAY,
          description: "List of all questions found in the images in sequential order",
          items: {
            type: Type.OBJECT,
            properties: {
              pageIndex: { type: Type.INTEGER, description: "0-based index of the page within this batch where question starts" },
              qNo: { type: Type.INTEGER, description: "The printed question number (e.g. 1, 2, 3...)" },
              subject: { type: Type.STRING, description: "Subject of the question (e.g., Physics, Chemistry, Mathematics, Biology, General)" },
              type: { type: Type.STRING, description: "Type of the question: MCQ_SINGLE, MCQ_MULTIPLE, NUMERICAL, MATRIX_MATCH" },
              box: {
                type: Type.ARRAY,
                description: "Primary bounding box [ymin, xmin, ymax, xmax] normalized between 0.0 and 1.0",
                items: { type: Type.NUMBER }
              },
              optionsFound: {
                type: Type.ARRAY,
                description: "List of option labels detected inside this question, e.g. ['(A)', '(B)', '(C)', '(D)'] or ['(1)', '(2)', '(3)', '(4)']",
                items: { type: Type.STRING }
              },
              completeness: {
                type: Type.STRING,
                description: "'complete' (all options/stems present), 'split' (spills over into next column/page), 'missing_options' (options could not be located)"
              },
              isSplit: { type: Type.BOOLEAN, description: "True if question is split across columns or pages" },
              splitParts: {
                type: Type.ARRAY,
                description: "Ordered bounding boxes for multi-column or multi-page split parts",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    pageIndex: { type: Type.INTEGER, description: "0-based index of the page for this part" },
                    box: {
                      type: Type.ARRAY,
                      description: "[ymin, xmin, ymax, xmax] normalized bounds for this part",
                      items: { type: Type.NUMBER }
                    },
                    partLabel: { type: Type.STRING, description: "e.g. 'Part 1 (Stem & Diagram)', 'Part 2 (Options A-D)'" }
                  },
                  required: ["pageIndex", "box"]
                }
              },
              isOrphanContinuation: {
                type: Type.BOOLEAN,
                description: "True if this block was found at the top of a column/page continuing the previous question"
              },
              continuationForQNo: {
                type: Type.INTEGER,
                description: "If this block contains orphaned options from previous column/page, the question number it belongs to"
              }
            },
            required: ["pageIndex", "qNo", "subject", "type", "box"]
          }
        },
        answerKeys: {
          type: Type.ARRAY,
          description: "Extracted answer keys if present in these pages. Omit if not found.",
          items: {
            type: Type.OBJECT,
            properties: {
              qNo: { type: Type.INTEGER },
              answer: { type: Type.STRING, description: "Correct option(s) or numerical value" }
            },
            required: ["qNo", "answer"]
          }
        }
      },
      required: ["questions"]
    };

    const prompt = `You are an expert exam layout parser specializing in JEE / NEET / CBSE test papers.
Analyze the provided page images (up to 2-3 pages per batch).
The document is an official exam paper with printed question numbers and formulas.

CRITICAL BOUNDING BOX & COLUMN PROTOCOL (3-LINE STRUCTURAL & Q_n -> Q_n+1 PAIRING):

1. 3-LINE STRUCTURAL BOUNDARY LOCK (X-Axis Zero Clipping):
   - Locate the 3 vertical boundary lines across the page canvas: Left Margin Line (~0.035), Central Column Divider Line (~0.500), and Right Margin Line (~0.965).
   - Left Column Questions:
     * xmin MUST start to the LEFT of the printed question number label (e.g., "15.", "Q.15") at or near the Left Margin Line (xmin <= 0.035).
     * xmax MUST extend to and clamp PRECISELY at the Central Column Divider (xmax <= 0.490). NEVER bleed into the right column text.
   - Right Column Questions:
     * xmin MUST start PRECISELY past the Central Column Divider (xmin >= 0.510).
     * xmax MUST extend to the Right Margin Line (xmax >= 0.965).
   - Full-Width Banners / Spanning Diagrams Override:
     * If a question, table, or physics/chemistry diagram spans across the central divider, set xmin <= 0.035 and xmax >= 0.965 (full page width).

2. VERTICAL QUESTION-PAIR PAIRING (Y-Axis Q_n to Q_n+1 Protocol):
   - Y_MIN: Upper bound MUST start immediately before the start of Question Q_n label (e.g. "Q.15", "15.").
   - Y_MAX: Lower bound MUST extend down to immediately before the start of the next question label Q_(n+1) in the same column/page.
   - For the LAST question in a column/page, Y_MAX extends down to the column bottom margin line before the page footer.

3. DYNAMIC COLUMN OVERFLOW & MULTI-PAGE SPLIT EXCEPTION:
   - If Question Q_n ends before listing all options (or Q_(n+1) is in a different column or next page):
     * Mark "isSplit": true, "completeness": "split".
     * Set Part 1 Y_MAX to the bottom line of the current column.
     * Locate Part 2 at the top of the next column or next page (from top margin line down to Q_(n+1) label).
   - If the top of a column starts with orphaned options without a new Q-number, mark "isOrphanContinuation": true and "continuationForQNo" to preceding Q-number.

${extractEnglishOnly ? 'BILINGUAL PAPER: Extract ONLY the English version of questions and options.' : ''}

${manifest ? `GLOBAL BLUEPRINT MANIFEST DIRECTIVE:
- Total Expected Questions: ${manifest.totalExpectedQuestions || 'Unknown'}
- Subject Section Ranges: ${JSON.stringify(manifest.sections || [])}
- Marking Rules Summary: ${JSON.stringify(manifest.markingSchemeSummary || manifest.rules || 'Standard JEE/NEET')}
Strictly enforce subject categorization (Physics/Chemistry/Mathematics/Biology/General) and question ranges for each extracted question based on this blueprint.` : ''}

${targetQNos && Array.isArray(targetQNos) && targetQNos.length > 0 ? `PINPOINT RESCAN DIRECTIVE:
Specifically search for missing question(s) Q${targetQNos.join(', Q')}.
Focus on column margins, top/bottom boundaries, or unnumbered diagrams to locate and extract these specific question numbers!` : ''}

Output normalized bounding box [ymin, xmin, ymax, xmax] between 0.0 and 1.0 for each question.
${hasAnswerKey ? 'Extract printed answer key table if present on these pages.' : ''}`;

    const parsed = await executeGeminiWithFallback(ai, {
      contents: [...contents, { text: prompt }],
      schema: responseSchema,
      temperature: 0.1,
      preferredModel: requestedModel,
      label: 'Server Extract PDF Structure (Pass 1)'
    });

    // PASS 2 GAP-FILL & SEQUENCE AUDIT RESCAN (NON-DESTRUCTIVE)
    if (options.enableDoublePass !== false && parsed.questions && parsed.questions.length > 0) {
      try {
        const detectedQNums = parsed.questions.map((q: any) => q.qNo).filter(Boolean);
        const rescanPrompt = `PASS 2 AUDIT & GAP-FILL RESCAN:
Pass 1 detected questions: [${detectedQNums.join(', ')}].

AUDIT TASKS:
1. SEQUENCE CHECK: Verify if any printed question was skipped in this page batch (e.g. Q1, Q2, Q4 were found but Q3 was missed). If any question was missed, output that missing question with its exact bounding box [ymin, xmin, ymax, xmax] and metadata.
2. SPLIT/CONTINUATION VERIFICATION: If any question was incomplete (missing options C/D or split across columns/pages), verify and provide its complete splitParts.
3. ORPHAN OPTIONS RECOVERY: If any options at the top of a column were missed or detached, connect them to the preceding question.
Return the complete audited list including any recovered missing questions.`;

        const audited = await executeGeminiWithFallback(ai, {
          contents: [...contents, { text: rescanPrompt }],
          schema: responseSchema,
          temperature: 0.0,
          preferredModel: requestedModel,
          label: 'Server Pass 2 Audit'
        });

        if (audited && audited.questions && Array.isArray(audited.questions)) {
          const pass1Map = new Map<number, any>();
          parsed.questions.forEach((q: any) => {
            if (q.qNo != null) pass1Map.set(q.qNo, q);
          });

          // Non-destructive merge: preserve Pass 1's high-precision visual boxes, insert missing questions from Pass 2
          audited.questions.forEach((auditedQ: any) => {
            if (!auditedQ || auditedQ.qNo == null) return;
            const existing = pass1Map.get(auditedQ.qNo);
            if (!existing) {
              parsed.questions.push(auditedQ);
              pass1Map.set(auditedQ.qNo, auditedQ);
            } else {
              // If Pass 2 identified splitParts that Pass 1 missed, enrich it
              if (auditedQ.isSplit && auditedQ.splitParts && (!existing.splitParts || existing.splitParts.length <= 1)) {
                existing.isSplit = true;
                existing.splitParts = auditedQ.splitParts;
              }
              if (auditedQ.optionsFound && (!existing.optionsFound || auditedQ.optionsFound.length > existing.optionsFound.length)) {
                existing.optionsFound = auditedQ.optionsFound;
              }
            }
          });

          if (audited.testTitle && !parsed.testTitle) parsed.testTitle = audited.testTitle;
          if (audited.answerKeys && (!parsed.answerKeys || parsed.answerKeys.length === 0)) parsed.answerKeys = audited.answerKeys;
        }
      } catch (e) {
        console.warn('Pass 2 verification audit skipped:', e);
      }
    }

    // Adjust pageIndex by pageOffset for seamless chunk merging (for both main question and splitParts)
    if (parsed.questions && Array.isArray(parsed.questions)) {
      parsed.questions = parsed.questions.map((q: any) => ({
        ...q,
        pageIndex: (typeof q.pageIndex === 'number' ? q.pageIndex : 0) + pageOffset,
        splitParts: Array.isArray(q.splitParts)
          ? q.splitParts.map((sp: any) => ({
              ...sp,
              pageIndex: (typeof sp.pageIndex === 'number' ? sp.pageIndex : 0) + pageOffset
            }))
          : q.splitParts
      }));
    }

    res.json(parsed);
  } catch (error: any) {
    console.error('Error extracting PDF structure:', error);
    res.status(getErrorStatusCode(error)).json({ error: formatAiErrorMessage(error) });
  }
});

// API Route for Unified AI Question Ingestion (Pass 1 Single-Page / Batch Extraction)
app.post('/api/extract-questions-pass1', async (req, res) => {
  try {
    const {
      image,
      pageIndex = 1,
      documentName,
      blueprint,
      answerKeyContext,
      pageAssignmentsSummary,
      instructionText,
      expectedQuestions,
      targetQNos,
      options = {},
      model: requestedModel
    } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Page image is required' });
    }

    const authHeader = req.headers.authorization;
    const clientApiKey = authHeader ? authHeader.replace('Bearer ', '').trim() : null;
    const apiKey = clientApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(401).json({ error: 'Gemini API key is required. Please set it in Settings.' });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    const isJpeg = image.startsWith('data:image/jpeg');
    const inlineData = {
      data: image.replace(/^data:image\/\w+;base64,/, ''),
      mimeType: isJpeg ? 'image/jpeg' : 'image/png'
    };

    const pass1Schema: Schema = {
      type: Type.OBJECT,
      properties: {
        questions: {
          type: Type.ARRAY,
          description: "List of all questions detected on this page image",
          items: {
            type: Type.OBJECT,
            properties: {
              pageIndex: { type: Type.INTEGER, description: "Page number where question is located" },
              qNo: { type: Type.INTEGER, description: "Question number (e.g. 1, 2, 3...)" },
              subject: { type: Type.STRING, description: "Subject name (Physics, Chemistry, Mathematics, Biology, etc.)" },
              type: { type: Type.STRING, description: "mcq, msq, nat, msm" },
              box: {
                type: Type.ARRAY,
                description: "Bounding box [ymin, xmin, ymax, xmax] normalized between 0.0 and 1.0",
                items: { type: Type.NUMBER }
              },
              optionsFound: {
                type: Type.ARRAY,
                description: "Option labels found, e.g. ['A', 'B', 'C', 'D'] or ['1', '2', '3', '4']",
                items: { type: Type.STRING }
              },
              completeness: {
                type: Type.STRING,
                description: "'complete' (all options present), 'split' (spills over into next column/page), 'continuation_only'"
              },
              isSplit: { type: Type.BOOLEAN, description: "True if question spills across column or page" },
              splitParts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    pageIndex: { type: Type.INTEGER },
                    box: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                    partLabel: { type: Type.STRING }
                  },
                  required: ["pageIndex", "box"]
                }
              },
              isOrphanContinuation: { type: Type.BOOLEAN },
              continuationForQNo: { type: Type.INTEGER },
              hasDiagram: { type: Type.BOOLEAN, description: "True if question contains a diagram, figure, circuit, or graph" }
            },
            required: ["pageIndex", "qNo", "subject", "type", "box"]
          }
        },
        answerKeys: {
          type: Type.ARRAY,
          description: "Extracted answer keys if present on this page",
          items: {
            type: Type.OBJECT,
            properties: {
              qNo: { type: Type.INTEGER },
              answer: { type: Type.STRING }
            },
            required: ["qNo", "answer"]
          }
        }
      },
      required: ["questions"]
    };

    const prompt = `You are a world-class exam layout & question detection specialist for JEE / NEET / CBSE test papers.
Analyze Page ${pageIndex} of ${documentName || 'the document'}.

CRITICAL BOUNDING BOX & COLUMN PROTOCOL (3-LINE STRUCTURAL & Q_n -> Q_n+1 PAIRING):

1. 3-LINE STRUCTURAL BOUNDARY LOCK (X-Axis Zero Clipping):
   - Locate the 3 vertical boundary lines across the page: Left Margin Line (~0.035), Central Column Divider Line (~0.500), and Right Margin Line (~0.965).
   - Left Column Questions:
     * xmin MUST start to the LEFT of the printed question number label (e.g., "15.", "Q.15") at or near the Left Margin Line (xmin <= 0.035).
     * xmax MUST extend to and clamp PRECISELY at the Central Column Divider (xmax <= 0.490). NEVER bleed into the right column text.
   - Right Column Questions:
     * xmin MUST start PRECISELY past the Central Column Divider (xmin >= 0.510).
     * xmax MUST extend to the Right Margin Line (xmax >= 0.965).
   - Full-Width Banners / Spanning Diagrams:
     * If a question, table, or physics/chemistry diagram spans across the central divider, set xmin <= 0.035 and xmax >= 0.965 (full page width).

2. VERTICAL QUESTION-PAIR PAIRING (Y-Axis Q_n to Q_n+1 Protocol):
   - Y_MIN: Upper bound MUST start immediately before the start of Question Q_n label (e.g. "Q.15", "15.").
   - Y_MAX: Lower bound MUST extend down to immediately before the start of the next question label Q_(n+1) in the same column/page.
   - For the LAST question in a column/page, Y_MAX extends down to the column bottom margin line before the page footer.

3. DYNAMIC COLUMN OVERFLOW & MULTI-PAGE SPLIT EXCEPTION:
   - If Question Q_n ends before listing all options (or Q_(n+1) is in a different column or next page):
     * Mark "isSplit": true, "completeness": "split".
     * Set Part 1 Y_MAX to the bottom line of the current column.
   - If the top of a column starts with orphaned options without a new Q-number, mark "isOrphanContinuation": true and "continuationForQNo" to preceding Q-number.

${pageAssignmentsSummary ? `DOCUMENT CONTEXT & PAGE ROLES:
${pageAssignmentsSummary}` : ''}

${instructionText ? `EXAM INSTRUCTIONS & MARKING SCHEME CONTEXT:
${instructionText}` : ''}

${blueprint ? `GLOBAL BLUEPRINT SECTION RANGES:
${JSON.stringify(blueprint, null, 2)}
Enforce the correct Subject (e.g., Physics, Chemistry, Mathematics, Biology) and question Type (mcq, nat, msq, msm) based on this blueprint.` : ''}

${answerKeyContext ? `REFERENCE ANSWER KEY MAPPINGS:
${JSON.stringify(answerKeyContext).slice(0, 1200)}
Cross-verify that detected question numbers match this answer key sequence.` : ''}

${expectedQuestions && expectedQuestions.length > 0 ? `EXPECTED QUESTIONS ON THIS PAGE:
${JSON.stringify(expectedQuestions)}` : ''}

${targetQNos && targetQNos.length > 0 ? `TARGET RESCAN DIRECTIVE:
Specifically search for missing question(s) Q${targetQNos.join(', Q')}.` : ''}

Output normalized bounding box [ymin, xmin, ymax, xmax] between 0.0 and 1.0 for each detected question.`;

    let parsed = await executeGeminiWithFallback(ai, {
      contents: [{ inlineData }, { text: prompt }],
      schema: pass1Schema,
      temperature: 0.1,
      preferredModel: requestedModel || options.model,
      label: `Server Extract Questions Pass 1 (Page ${pageIndex})`
    });

    // PASS 2 GAP-FILL & SEQUENCE AUDIT RESCAN (NON-DESTRUCTIVE)
    if (options.enableDoublePass !== false && parsed.questions && parsed.questions.length > 0) {
      try {
        const detectedQNums = parsed.questions.map((q: any) => q.qNo).filter(Boolean);
        const rescanPrompt = `PASS 2 AUDIT & GAP-FILL RESCAN FOR PAGE ${pageIndex}:
Pass 1 detected questions: [${detectedQNums.join(', ')}].

AUDIT TASKS:
1. SEQUENCE CHECK: Verify if any printed question was skipped on this page (e.g. Q1, Q2, Q4 were found but Q3 was missed). If any question was missed, output that missing question with its exact bounding box [ymin, xmin, ymax, xmax] and metadata.
2. BOUNDARY INTEGRITY: Ensure diagrams, formulas, and options (A-D) are fully enclosed without clipping.
3. ORPHAN OPTIONS RECOVERY: Connect orphaned options to the appropriate question.
Return the complete audited list including any recovered missing questions.`;

        const audited = await executeGeminiWithFallback(ai, {
          contents: [{ inlineData }, { text: rescanPrompt }],
          schema: pass1Schema,
          temperature: 0.0,
          preferredModel: requestedModel || options.model,
          label: `Server Pass 2 Audit (Page ${pageIndex})`
        });

        if (audited && audited.questions && Array.isArray(audited.questions)) {
          const pass1Map = new Map<number, any>();
          parsed.questions.forEach((q: any) => {
            if (q.qNo != null) pass1Map.set(q.qNo, q);
          });

          audited.questions.forEach((auditedQ: any) => {
            if (!auditedQ || auditedQ.qNo == null) return;
            const existing = pass1Map.get(auditedQ.qNo);
            if (!existing) {
              parsed.questions.push(auditedQ);
              pass1Map.set(auditedQ.qNo, auditedQ);
            } else {
              if (auditedQ.isSplit && auditedQ.splitParts && (!existing.splitParts || existing.splitParts.length <= 1)) {
                existing.isSplit = true;
                existing.splitParts = auditedQ.splitParts;
              }
              if (auditedQ.optionsFound && (!existing.optionsFound || auditedQ.optionsFound.length > existing.optionsFound.length)) {
                existing.optionsFound = auditedQ.optionsFound;
              }
            }
          });
        }
      } catch (e) {
        console.warn(`Pass 2 verification audit on page ${pageIndex} skipped:`, e);
      }
    }

    if (parsed.questions && Array.isArray(parsed.questions)) {
      parsed.questions = parsed.questions.map((q: any) => ({
        ...q,
        pageIndex: typeof q.pageIndex === 'number' ? q.pageIndex : pageIndex
      }));
    }

    res.json(parsed);
  } catch (error: any) {
    console.error('Error in extract-questions-pass1:', error);
    res.status(getErrorStatusCode(error)).json({ error: formatAiErrorMessage(error) });
  }
});

// API Route to detect the precise bounding box of a single question on a page image
app.post('/api/detect-question-box', async (req, res) => {
  try {
    const { image, qNo, promptHint = '', model: requestedModel } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Page image is required' });
    }

    const authHeader = req.headers.authorization;
    const clientApiKey = authHeader ? authHeader.replace('Bearer ', '').trim() : null;
    const apiKey = clientApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(401).json({ error: 'Gemini API key is required. Please set it in Settings.' });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    const isJpeg = image.startsWith('data:image/jpeg');
    const inlineData = {
      data: image.replace(/^data:image\/\w+;base64,/, ''),
      mimeType: isJpeg ? 'image/jpeg' : 'image/png'
    };

    const detectSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        found: { type: Type.BOOLEAN, description: "Whether the requested question was found on this page image" },
        box: {
          type: Type.ARRAY,
          description: "Normalized bounding box [ymin, xmin, ymax, xmax] between 0.0 and 1.0 enclosing the entire question (question text, math equations, diagrams, and options)",
          items: { type: Type.NUMBER }
        },
        detectedQNo: { type: Type.INTEGER, description: "The question number identified" },
        subject: { type: Type.STRING, description: "Detected subject name" },
        type: { type: Type.STRING, description: "One of: MCQ_SINGLE, MCQ_MULTIPLE, NUMERICAL, MATRIX_MATCH" }
      },
      required: ["found", "box"]
    };

    const prompt = `You are a precision layout detection specialist for exam papers.
Locate Question ${qNo ? `Number ${qNo}` : 'the primary question'} on this page image.
${promptHint ? `User guidance: "${promptHint}".` : ''}
Exclude headers, footers, page numbering, or adjacent questions.
Output the precise normalized bounding box [ymin, xmin, ymax, xmax] (0.0 to 1.0) enclosing ALL parts of this question: text, formulas, diagrams, and options A/B/C/D or 1/2/3/4.`;

    const resultData = await executeGeminiWithFallback(ai, {
      contents: [{ inlineData }, { text: prompt }],
      schema: detectSchema,
      temperature: 0.1,
      preferredModel: requestedModel,
      label: 'Server Detect Question Box'
    });

    res.json(resultData);
  } catch (error: any) {
    console.error('Error in detect-question-box:', error);
    res.status(getErrorStatusCode(error)).json({ error: formatAiErrorMessage(error) });
  }
});

// API Route to analyze & repair a question image slice (OCR, Question Type, Answer Key, Marking Scheme)
app.post('/api/analyze-question-image', async (req, res) => {
  try {
    const { images, image, currentQuestion = {}, qNo, currentType, model: requestedModel } = req.body;
    const rawImages = images && Array.isArray(images) && images.length > 0 ? images : (image ? [image] : []);
    if (!rawImages.length) {
      return res.status(400).json({ error: 'Question image is required' });
    }

    const authHeader = req.headers.authorization;
    const clientApiKey = authHeader ? authHeader.replace('Bearer ', '').trim() : null;
    const apiKey = clientApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(401).json({ error: 'Gemini API key is required. Please set it in Settings.' });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    const contents = rawImages.map((base64: string) => {
      const isJpeg = base64.startsWith('data:image/jpeg');
      return {
        inlineData: {
          data: base64.replace(/^data:image\/\w+;base64,/, ''),
          mimeType: isJpeg ? 'image/jpeg' : 'image/png'
        }
      };
    });

    const repairSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        detectedType: { 
          type: Type.STRING, 
          description: "Strictly one of: mcq (Single Correct), msq (Multiple Correct), nat (Numerical / Integer), msm (Matrix Match)" 
        },
        detectedQNo: { type: Type.INTEGER, description: "Question sequence number if visible" },
        detectedAnswer: { type: Type.STRING, description: "Detected answer key or options (e.g. '3', '1,3,4', '24.5', 'A->P,Q; B->R') if discernible from solution/marking, else empty string" },
        marks: {
          type: Type.OBJECT,
          properties: {
            cm: { type: Type.NUMBER, description: "Correct marks (e.g. 4 or 3)" },
            im: { type: Type.NUMBER, description: "Negative marks (e.g. -1 or -2)" },
            pm: { type: Type.NUMBER, description: "Partial marks per option" },
            max: { type: Type.NUMBER, description: "Max marks" }
          },
          required: ["cm", "im"]
        },
        latexSummary: { type: Type.STRING, description: "Clean LaTeX / text representation of the question statement and formulas" },
        optionsList: {
          type: Type.ARRAY,
          description: "List of options (A, B, C, D) if MCQ/MSQ",
          items: { type: Type.STRING }
        },
        qualityIssues: {
          type: Type.ARRAY,
          description: "Any detected quality problems (e.g., 'Clipped diagram at bottom', 'Low scan resolution', 'Bilingual overlapping text', 'Cutoff option D')",
          items: { type: Type.STRING }
        },
        isClean: { type: Type.BOOLEAN, description: "Whether the question image is complete and clear" },
        recommendations: { type: Type.STRING, description: "Helpful recommendations for the teacher/editor" }
      },
      required: ["detectedType", "marks", "latexSummary", "isClean"]
    };

    const targetContext = { ...currentQuestion, qNo: qNo || currentQuestion.que, currentType: currentType || currentQuestion.type };

    const prompt = `You are a senior exam paper reviewer and OCR specialist for JEE Advanced / NEET / CBT exams.
Examine this question slice carefully.
Current question metadata: ${JSON.stringify(targetContext)}.

Perform a thorough diagnostic:
1. Determine the EXACT Question Type:
   - 'mcq' for Single Correct Choice (Options 1, 2, 3, 4 or A, B, C, D)
   - 'msq' for Multiple Correct Options (One or More than One Correct)
   - 'nat' for Numerical Answer Type (Integer, Decimal or Range)
   - 'msm' for Matrix Match / List Match (Column I -> Column II)
2. Transcribe the question and options into crisp LaTeX.
3. Check for any flaws: is any part of the question text or options clipped off? Is the diagram incomplete?
4. Recommend standard marking scheme for this exam type.`;

    const resultData = await executeGeminiWithFallback(ai, {
      contents: [...contents, { text: prompt }],
      schema: repairSchema,
      temperature: 0.1,
      preferredModel: requestedModel,
      label: 'Server Analyze Question Image'
    });

    res.json(resultData);
  } catch (error: any) {
    console.error('Error in analyze-question-image:', error);
    res.status(getErrorStatusCode(error)).json({ error: formatAiErrorMessage(error) });
  }
});

// API Route to extract Answer Key table & verify types from single or multi-page Answer Key PDF images
app.post('/api/extract-answer-key-pdf', async (req, res) => {
  try {
    const { images, text = '', context = {}, model: requestedModel } = req.body;
    if ((!images || !images.length) && !text) {
      return res.status(400).json({ error: 'Answer key page image or text is required' });
    }

    const authHeader = req.headers.authorization;
    const clientApiKey = authHeader ? authHeader.replace('Bearer ', '').trim() : null;
    const apiKey = clientApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(401).json({ error: 'Gemini API key is required. Please set it in Settings.' });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    const contents: any[] = [];
    if (images && Array.isArray(images)) {
      images.forEach((img: string) => {
        const isJpeg = img.startsWith('data:image/jpeg');
        contents.push({
          inlineData: {
            data: img.replace(/^data:image\/\w+;base64,/, ''),
            mimeType: isJpeg ? 'image/jpeg' : 'image/png'
          }
        });
      });
    }

    if (text) {
      contents.push({ text: `Raw Answer Key Text / OCR:\n${text}` });
    }

    const keySchema: Schema = {
      type: Type.OBJECT,
      properties: {
        answers: {
          type: Type.ARRAY,
          description: "Extracted question-to-answer mappings with verified question types",
          items: {
            type: Type.OBJECT,
            properties: {
              qNo: { type: Type.INTEGER, description: "Question sequence number (1, 2, 3...)" },
              answer: { type: Type.STRING, description: "Raw answer string as printed (e.g. 'A', 'B,D', '32', '3.14', 'A->P; B->Q')" },
              normalizedAnswer: { type: Type.STRING, description: "Standard CBT answer string: 1-based index for MCQ ('1','2','3','4'), comma-separated indices for MSQ ('1,3'), exact numerical for NAT ('32'), or mapping for MSM ('A->P; B->Q')" },
              letterAnswer: { type: Type.STRING, description: "Standard letter format (e.g. 'A', 'A,C', '32', 'A->P; B->Q')" },
              inferredType: { 
                type: Type.STRING, 
                description: "Question type inferred from answer: 'mcq' (Single option A/B/C/D or 1/2/3/4), 'msq' (Multiple options e.g. A,C or 1,3), 'nat' (Numerical integer/decimal value e.g. 24 or 3.14), 'msm' (Matrix match mapping e.g. A->P; B->Q)" 
              },
              subject: { type: Type.STRING, description: "Subject name (Physics, Chemistry, Mathematics, Biology) if indicated" },
              confidence: { type: Type.NUMBER, description: "Detection confidence score between 0 and 100" }
            },
            required: ["qNo", "answer", "normalizedAnswer", "inferredType"]
          }
        },
        tableName: { type: Type.STRING, description: "Title or header of the answer key table (e.g. 'Official Answer Key - JEE Advanced Paper 1')" },
        totalQuestionsDetected: { type: Type.INTEGER, description: "Total number of answer entries identified" },
        summary: { type: Type.STRING, description: "Concise summary of detected subjects, total answers, and type breakdown" }
      },
      required: ["answers"]
    };

    const prompt = `You are an expert exam key parser and question type validator for JEE Advanced, JEE Main, NEET, and CBT exam papers.
Analyze this Answer Key document / page images thoroughly.

CRITICAL PARSING & INFERENCE RULES:
1. Extract ALL question numbers and their corresponding answer keys.
2. Inferred Question Type:
   - If answer is a SINGLE letter option (A, B, C, D) or single digit (1, 2, 3, 4) -> 'mcq'
   - If answer contains MULTIPLE letter options (e.g. "A, C", "ACD", "1, 3", "B, D") -> 'msq'
   - If answer is a NUMERICAL value (integer e.g. "45", decimal e.g. "3.14", negative e.g. "-12", or range e.g. "5.20 to 5.40") -> 'nat'
   - If answer contains COLUMN / MATRIX MATCH mappings (e.g. "A-p,r; B-q; C-s; D-p") -> 'msm'
3. Normalization:
   - For MCQ: convert letter A->1, B->2, C->3, D->4
   - For MSQ: convert letter list "A,C" -> "1,3", "B,C,D" -> "2,3,4"
   - For NAT: keep the exact numeric value string (e.g. "40", "3.14")
4. Support multi-column tables, grids, and page headers. Do not skip any question number.
${context?.totalQuestions ? `Expected Question Count in Paper: ${context.totalQuestions}.` : ''}
${context?.subjects ? `Expected Subjects: ${JSON.stringify(context.subjects)}.` : ''}`;

    contents.push({ text: prompt });

    let resultData = await executeGeminiWithFallback(ai, {
      contents,
      schema: keySchema,
      temperature: 0.1,
      preferredModel: requestedModel,
      label: 'Server Extract Answer Key PDF'
    });

    // PASS 2: VERIFICATION RESCAN AUDIT PASS FOR HIGH ACCURACY
    if (req.body.options?.enableDoublePass !== false && resultData.answers && resultData.answers.length > 0) {
      try {
        const auditPrompt = `PASS 2 VERIFICATION & RESCAN AUDIT FOR MAXIMUM ACCURACY:
Below is the initial raw answer key extracted from Pass 1:
${JSON.stringify(resultData.answers.slice(0, 150))}

CRITICAL VERIFICATION TASKS FOR PASS 2:
1. MISSING QUESTION DETECTIVE: Scan the image/text to ensure NO question numbers were skipped in the sequence (e.g. Q1 to Q100). If any question number is missing, locate it in adjacent columns/tables and add it.
2. OPTION & TYPE AUDIT:
   - MCQ: Normalize A->1, B->2, C->3, D->4
   - MSQ: Ensure multi-option keys (e.g. A,C -> 1,3) are accurate and comma-separated without character typos.
   - NAT: Ensure exact integers, decimals, or numeric range strings (e.g. '5.20 to 5.40').
   - MSM: Ensure column/matrix mappings are retained.
3. FIX OCR TYPOS: Correct common OCR confusion: 'O'->'0', 'I'->'1', 'B'->'8', 'S'->'5', 'BD'->'B,D'.
Return the complete, audited and verified answer key mapping.`;

        const auditContents = [
          ...contents.filter((c: any) => c.inlineData || c.text?.startsWith('Raw Answer Key Text')),
          { text: auditPrompt }
        ];

        const audited = await executeGeminiWithFallback(ai, {
          contents: auditContents,
          schema: keySchema,
          temperature: 0.0,
          preferredModel: requestedModel,
          label: 'Server Pass 2 Answer Key Audit'
        });

        if (audited && audited.answers && audited.answers.length >= resultData.answers.length) {
          resultData = audited;
        }
      } catch (e) {
        console.warn('Pass 2 answer key verification pass skipped due to error:', e);
      }
    }

    res.json(resultData);
  } catch (error: any) {
    console.error('Error in extract-answer-key-pdf:', error);
    res.status(getErrorStatusCode(error)).json({ error: formatAiErrorMessage(error) });
  }
});

// API Route to extract Answer Key table from a dedicated page
app.post('/api/extract-answer-key-page', async (req, res) => {
  try {
    const { image, model: requestedModel } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Page image is required' });
    }

    const authHeader = req.headers.authorization;
    const clientApiKey = authHeader ? authHeader.replace('Bearer ', '').trim() : null;
    const apiKey = clientApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(401).json({ error: 'Gemini API key is required. Please set it in Settings.' });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    const isJpeg = image.startsWith('data:image/jpeg');
    const inlineData = {
      data: image.replace(/^data:image\/\w+;base64,/, ''),
      mimeType: isJpeg ? 'image/jpeg' : 'image/png'
    };

    const keySchema: Schema = {
      type: Type.OBJECT,
      properties: {
        answers: {
          type: Type.ARRAY,
          description: "Extracted question-to-answer mappings",
          items: {
            type: Type.OBJECT,
            properties: {
              qNo: { type: Type.INTEGER, description: "Question number" },
              answer: { type: Type.STRING, description: "Answer option(s) e.g. '1', 'A', '1,3', '5.2', 'A->P; B->Q'" },
              subject: { type: Type.STRING, description: "Subject name if listed in the table" }
            },
            required: ["qNo", "answer"]
          }
        },
        tableName: { type: Type.STRING, description: "Title or header of the answer key table" }
      },
      required: ["answers"]
    };

    const prompt = `Extract all answers from this answer key table page image.
Parse all question numbers (1, 2, 3...) and their corresponding answers (A, B, C, D or 1, 2, 3, 4 or numerical values).
Support multi-column tables, grids, and matrix match keys. Output complete and accurate answer pairs.`;

    let resultData = await executeGeminiWithFallback(ai, {
      contents: [{ inlineData }, { text: prompt }],
      schema: keySchema,
      temperature: 0.1,
      preferredModel: requestedModel,
      label: 'Server Extract Answer Key Page'
    });

    // PASS 2: VERIFICATION AUDIT RESCAN
    if (req.body.options?.enableDoublePass !== false && resultData.answers && resultData.answers.length > 0) {
      try {
        const auditPrompt = `PASS 2 VERIFICATION & RESCAN AUDIT FOR MAXIMUM ACCURACY:
Below is the initial answer key extracted from Pass 1:
${JSON.stringify(resultData.answers.slice(0, 150))}

Verify that NO question numbers are missing, fix OCR typos, and return the audited, complete answer key table.`;

        const audited = await executeGeminiWithFallback(ai, {
          contents: [{ inlineData }, { text: auditPrompt }],
          schema: keySchema,
          temperature: 0.0,
          preferredModel: requestedModel,
          label: 'Server Pass 2 Answer Key Page Audit'
        });

        if (audited && audited.answers && audited.answers.length >= resultData.answers.length) {
          resultData = audited;
        }
      } catch (e) {
        // ignore
      }
    }

    res.json(resultData);
  } catch (error: any) {
    console.error('Error in extract-answer-key-page:', error);
    res.status(getErrorStatusCode(error)).json({ error: formatAiErrorMessage(error) });
  }
});

// API Route for generic Gemini generation requests
app.post('/api/gemini/generate', async (req, res) => {
  try {
    const { contents, config, model: requestedModel } = req.body;
    if (!contents || !contents.length) {
      return res.status(400).json({ error: 'Contents are required' });
    }

    const authHeader = req.headers.authorization;
    const clientApiKey = authHeader ? authHeader.replace('Bearer ', '').trim() : null;
    const apiKey = clientApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(401).json({ error: 'Gemini API key is required. Please set it in Settings.' });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    const resultText = await executeGeminiWithFallback(ai, {
      contents,
      temperature: config?.temperature ?? 0.1,
      preferredModel: requestedModel,
      label: 'Server Gemini Generate'
    });

    res.json({ text: resultText, candidates: [{ content: { parts: [{ text: resultText }] } }] });
  } catch (error: any) {
    console.error('Error in /api/gemini/generate:', error);
    res.status(getErrorStatusCode(error)).json({ error: formatAiErrorMessage(error) });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (process.env.VERCEL !== '1') {
  startServer();
}

export default app;
