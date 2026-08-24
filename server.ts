import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, Schema } from '@google/genai';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '200mb' }));
  app.use(express.urlencoded({ extended: true, limit: '200mb' }));

  // API Route to extract test paper instructions blueprint & question ranges from Cover / Instructions page
  app.post('/api/extract-test-blueprint', async (req, res) => {
    try {
      const { image, text } = req.body;
      if (!image && !text) {
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
      if (image) {
        const isJpeg = image.startsWith('data:image/jpeg');
        contents.push({
          inlineData: {
            data: image.replace(/^data:image\/\w+;base64,/, ''),
            mimeType: isJpeg ? 'image/jpeg' : 'image/png'
          }
        });
      }
      if (text) {
        contents.push({ text: `Instructions Text:\n${text}` });
      }
      contents.push({ text: prompt });

      const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
      let blueprintResult: any = null;

      for (const model of MODELS) {
        try {
          const resp = await ai.models.generateContent({
            model,
            contents,
            config: {
              responseMimeType: 'application/json',
              responseSchema: blueprintSchema,
              temperature: 0.1
            }
          });
          if (resp.text) {
            blueprintResult = JSON.parse(resp.text);
            break;
          }
        } catch (e: any) {
          console.warn(`extract-test-blueprint failed on model ${model}:`, e.message);
        }
      }

      if (!blueprintResult) {
        return res.status(500).json({ error: 'Failed to extract test blueprint from instructions page' });
      }

      res.json(blueprintResult);
    } catch (error: any) {
      console.error('Error extracting test blueprint:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  // API Route for Gemini Multi-modal PDF analysis
  app.post('/api/extract-pdf-structure', async (req, res) => {
    try {
      const { images, pageOffset = 0, options = {} } = req.body;
      const { hasAnswerKey = true, extractEnglishOnly = false } = options;
      
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

      const prompt = `You are a high-precision exam layout parser for JEE / NEET / CBSE test papers.
Analyze the provided page images (up to 2-3 pages per batch).
The document is a test paper with multiple subjects and sequential questions.

CRITICAL INSTRUCTIONS FOR READING ORDER & QUESTION SEQUENCE:
1. Two-Column Layout: Read columns strictly in top-to-bottom order for the LEFT column first, then top-to-bottom for the RIGHT column.
2. Extract questions in strict ascending sequence according to printed question numbers (e.g. Q1, Q2, Q3...).
3. Exclude headers, footers, subject banner titles, and page numbers from question bounding boxes.

MANDATORY PROTOCOL FOR MCQ OPTION COMPLETENESS & CONTINUATION CROSS-CHECK:
1. Option Completeness Verification:
   - For every MCQ (Single or Multiple Choice), an exam question MUST contain all its options (usually 4 options: (A), (B), (C), (D) or (1), (2), (3), (4)).
   - Always list detected options in "optionsFound", e.g. ["(A)", "(B)", "(C)", "(D)"].
   - If a question near the bottom of a column ends after the problem stem or only contains options (A) and (B):
     * DO NOT treat it as finished!
     * DO NOT ignore the rest of the question!
     * Set "completeness": "split" and "isSplit": true.
     * Check the top of the next column (or top of the next page) to find the remaining options (e.g. (C) and (D) or (A)–(D)).
     * Include BOTH parts in "splitParts" in sequence:
       - Part 1: [ymin, xmin, ymax, xmax] on the starting column/page (containing stem & diagram)
       - Part 2: [ymin, xmin, ymax, xmax] on the next column/page (containing options A-D / C-D)
     * For "box", provide the primary bounding box enclosing Part 1.

2. Orphaned Continuation & Top-of-Column Cross-Check:
   - When you start reading a new column or a new page from the top, BEFORE assuming a new question starts, check what is at the top of that column:
   - If the top of the column begins directly with options (e.g. "(C)... (D)..." or "(A)... (B)... (C)... (D)...") or continuation text WITHOUT a new question number like "Q15":
     * THIS CONTENT BELONGS TO THE PREVIOUS QUESTION (e.g. Q14)!
     * DO NOT discard or skip it!
     * DO NOT start the next question until you have linked this top block to the preceding question's "splitParts".
     * If the preceding question was already recorded, mark this block as "isOrphanContinuation": true, "continuationForQNo": <previous_question_number>, and attach it to that question's splitParts.

3. Cross-Check Before Starting Next Question:
   - When you encounter a new question number (e.g. Q15), verify that the space ABOVE it on that column was not an uncaptured continuation of Q14.
   - If the previous question (Q14) had missing options, link the text above Q15 to Q14.

${extractEnglishOnly ? 'BILINGUAL PAPER DETECTED: This paper contains questions in two languages (e.g. Hindi and English). You MUST extract ONLY the English version of the questions. Ensure your bounding box ONLY surrounds the English text and options.' : ''}

For each question, find its precise bounding box enclosing the question text, all math equations, diagrams, and options.
The bounding box format is [ymin, xmin, ymax, xmax] normalized between 0.0 and 1.0 (where 0,0 is top-left and 1,1 is bottom-right).

${hasAnswerKey ? 'If there is an answer key table present on these pages, extract those answers as well.' : 'Do NOT look for or extract answer keys, as they are not present.'}`;

      // Official supported model list in priority order
      const MODELS_TO_TRY = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
      let jsonStr = '';
      let lastError: any = null;

      for (const model of MODELS_TO_TRY) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            console.log(`Sending batch extraction request to model ${model} (attempt ${attempt})...`);
            const response = await ai.models.generateContent({
              model,
              contents: [
                ...contents,
                { text: prompt }
              ],
              config: {
                responseMimeType: 'application/json',
                responseSchema: responseSchema,
                temperature: 0.1,
              }
            });

            if (response.text) {
              jsonStr = response.text;
              break;
            }
          } catch (err: any) {
            lastError = err;
            const errStr = String(err?.message || '');
            const isTransient = err?.status === 503 || err?.code === 503 || err?.status === 429 || err?.code === 429 || errStr.includes('503') || errStr.includes('high demand') || errStr.includes('UNAVAILABLE') || errStr.includes('RESOURCE_EXHAUSTED');

            if (isTransient) {
              console.warn(`Model ${model} attempt ${attempt} failed with transient error: ${errStr}. Retrying in ${attempt * 1000}ms...`);
              await new Promise((r) => setTimeout(r, attempt * 1000));
            } else {
              console.warn(`Model ${model} failed with non-transient error: ${errStr}. Trying fallback model...`);
              break;
            }
          }
        }
        if (jsonStr) break;
      }

      if (!jsonStr) {
        throw lastError || new Error('All Gemini model fallback attempts failed');
      }

      const parsed = JSON.parse(jsonStr);

      // PASS 2 STRUCTURE VERIFICATION AUDIT RESCAN FOR QUESTION PAPERS
      if (options.enableDoublePass !== false && parsed.questions && parsed.questions.length > 0) {
        try {
          console.log(`Executing Pass 2 Structure Verification Audit for ${parsed.questions.length} detected questions...`);
          const rescanPrompt = `PASS 2 STRUCTURE VERIFICATION RESCAN AUDIT (PASS 2/2):
Below is the initial layout extraction from Pass 1 for this page batch:
${JSON.stringify(parsed.questions)}

CRITICAL VERIFICATION AUDIT TASKS:
1. SEQUENCE & MISSING QUESTION AUDIT: Inspect the numerical sequence of question numbers. If any question number was skipped or missed (e.g. Q1..Q5 are present but Q3 was missed), locate Q3 on the page image and include its bounding box and metadata.
2. OPTION COMPLETENESS: Confirm that every MCQ has all its options (e.g. (A), (B), (C), (D)). If options spill over into the next column/page, confirm 'isSplit' and 'splitParts'.
3. QUESTION TYPES: Verify MCQ vs MCQ_MULTIPLE vs NUMERICAL vs MATRIX_MATCH matches the section headers.
Return the complete, audited JSON structure.`;

          for (const model of MODELS_TO_TRY) {
            try {
              const rescanResp = await ai.models.generateContent({
                model,
                contents: [...contents, { text: rescanPrompt }],
                config: {
                  responseMimeType: 'application/json',
                  responseSchema: responseSchema,
                  temperature: 0.0,
                }
              });
              if (rescanResp.text) {
                const audited = JSON.parse(rescanResp.text);
                if (audited && audited.questions && audited.questions.length >= parsed.questions.length) {
                  console.log(`Pass 2 Structure Audit successful. Questions verified: ${audited.questions.length}`);
                  parsed.questions = audited.questions;
                  if (audited.testTitle) parsed.testTitle = audited.testTitle;
                  if (audited.answerKeys) parsed.answerKeys = audited.answerKeys;
                }
                break;
              }
            } catch (e: any) {
              console.warn(`Pass 2 structure audit failed on model ${model}:`, e.message);
            }
          }
        } catch (e) {
          console.warn('Pass 2 structure verification audit skipped due to error:', e);
        }
      }

      // Adjust pageIndex by pageOffset for seamless chunk merging
      if (parsed.questions && Array.isArray(parsed.questions)) {
        parsed.questions = parsed.questions.map((q: any) => ({
          ...q,
          pageIndex: (typeof q.pageIndex === 'number' ? q.pageIndex : 0) + pageOffset
        }));
      }

      res.json(parsed);
    } catch (error: any) {
      console.error('Error extracting PDF structure:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  // API Route to detect the precise bounding box of a single question on a page image
  app.post('/api/detect-question-box', async (req, res) => {
    try {
      const { image, qNo, promptHint = '' } = req.body;
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

      const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
      let resultData: any = null;

      for (const model of MODELS) {
        try {
          const resp = await ai.models.generateContent({
            model,
            contents: [
              { inlineData },
              { text: prompt }
            ],
            config: {
              responseMimeType: 'application/json',
              responseSchema: detectSchema,
              temperature: 0.1
            }
          });
          if (resp.text) {
            resultData = JSON.parse(resp.text);
            break;
          }
        } catch (e: any) {
          console.warn(`detect-question-box failed on model ${model}:`, e.message);
        }
      }

      if (!resultData) {
        return res.status(500).json({ error: 'Failed to detect question box with AI' });
      }

      res.json(resultData);
    } catch (error: any) {
      console.error('Error in detect-question-box:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  // API Route to analyze & repair a question image slice (OCR, Question Type, Answer Key, Marking Scheme)
  app.post('/api/analyze-question-image', async (req, res) => {
    try {
      const { images, currentQuestion = {} } = req.body;
      if (!images || !images.length) {
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

      const contents = images.map((base64: string) => {
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

      const prompt = `You are a senior exam paper reviewer and OCR specialist for JEE Advanced / NEET / CBT exams.
Examine this question slice carefully.
Current question metadata: ${JSON.stringify(currentQuestion)}.

Perform a thorough diagnostic:
1. Determine the EXACT Question Type:
   - 'mcq' for Single Correct Choice (Options 1, 2, 3, 4 or A, B, C, D)
   - 'msq' for Multiple Correct Options (One or More than One Correct)
   - 'nat' for Numerical Answer Type (Integer, Decimal or Range)
   - 'msm' for Matrix Match / List Match (Column I -> Column II)
2. Transcribe the question and options into crisp LaTeX.
3. Check for any flaws: is any part of the question text or options clipped off? Is the diagram incomplete?
4. Recommend standard marking scheme for this exam type.`;

      const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
      let resultData: any = null;

      for (const model of MODELS) {
        try {
          const resp = await ai.models.generateContent({
            model,
            contents: [
              ...contents,
              { text: prompt }
            ],
            config: {
              responseMimeType: 'application/json',
              responseSchema: repairSchema,
              temperature: 0.1
            }
          });
          if (resp.text) {
            resultData = JSON.parse(resp.text);
            break;
          }
        } catch (e: any) {
          console.warn(`analyze-question-image failed on model ${model}:`, e.message);
        }
      }

      if (!resultData) {
        return res.status(500).json({ error: 'Failed to analyze question with AI' });
      }

      res.json(resultData);
    } catch (error: any) {
      console.error('Error in analyze-question-image:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  // API Route to extract Answer Key table & verify types from single or multi-page Answer Key PDF images
  app.post('/api/extract-answer-key-pdf', async (req, res) => {
    try {
      const { images, text = '', context = {} } = req.body;
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

      const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
      let resultData: any = null;

      for (const model of MODELS) {
        try {
          const resp = await ai.models.generateContent({
            model,
            contents,
            config: {
              responseMimeType: 'application/json',
              responseSchema: keySchema,
              temperature: 0.1
            }
          });
          if (resp.text) {
            resultData = JSON.parse(resp.text);
            break;
          }
        } catch (e: any) {
          console.warn(`extract-answer-key-pdf failed on model ${model}:`, e.message);
        }
      }

      if (!resultData) {
        return res.status(500).json({ error: 'Failed to parse Answer Key PDF with AI' });
      }

      // PASS 2: VERIFICATION RESCAN AUDIT PASS FOR HIGH ACCURACY
      if (req.body.options?.enableDoublePass !== false && resultData.answers && resultData.answers.length > 0) {
        try {
          console.log(`Executing Pass 2 Answer Key Verification Audit Rescan on ${resultData.answers.length} extracted items...`);
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

          for (const model of MODELS) {
            try {
              const resp = await ai.models.generateContent({
                model,
                contents: auditContents,
                config: {
                  responseMimeType: 'application/json',
                  responseSchema: keySchema,
                  temperature: 0.0
                }
              });
              if (resp.text) {
                const audited = JSON.parse(resp.text);
                if (audited && audited.answers && audited.answers.length >= resultData.answers.length) {
                  console.log(`Pass 2 Verification Audit successful. Items verified: ${audited.answers.length}`);
                  resultData = audited;
                }
                break;
              }
            } catch (e: any) {
              console.warn(`Pass 2 audit failed on model ${model}:`, e.message);
            }
          }
        } catch (e) {
          console.warn('Pass 2 answer key verification pass skipped due to error:', e);
        }
      }

      res.json(resultData);
    } catch (error: any) {
      console.error('Error in extract-answer-key-pdf:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  // API Route to extract Answer Key table from a dedicated page
  app.post('/api/extract-answer-key-page', async (req, res) => {
    try {
      const { image } = req.body;
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

      const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
      let resultData: any = null;

      for (const model of MODELS) {
        try {
          const resp = await ai.models.generateContent({
            model,
            contents: [
              { inlineData },
              { text: prompt }
            ],
            config: {
              responseMimeType: 'application/json',
              responseSchema: keySchema,
              temperature: 0.1
            }
          });
          if (resp.text) {
            resultData = JSON.parse(resp.text);
            break;
          }
        } catch (e: any) {
          console.warn(`extract-answer-key-page failed on model ${model}:`, e.message);
        }
      }

      if (!resultData) {
        return res.status(500).json({ error: 'Failed to parse answer key page with AI' });
      }

      // PASS 2: VERIFICATION AUDIT RESCAN
      if (req.body.options?.enableDoublePass !== false && resultData.answers && resultData.answers.length > 0) {
        try {
          const auditPrompt = `PASS 2 VERIFICATION & RESCAN AUDIT FOR MAXIMUM ACCURACY:
Below is the initial answer key extracted from Pass 1:
${JSON.stringify(resultData.answers.slice(0, 150))}

Verify that NO question numbers are missing, fix OCR typos, and return the audited, complete answer key table.`;

          for (const model of MODELS) {
            try {
              const resp = await ai.models.generateContent({
                model,
                contents: [{ inlineData }, { text: auditPrompt }],
                config: {
                  responseMimeType: 'application/json',
                  responseSchema: keySchema,
                  temperature: 0.0
                }
              });
              if (resp.text) {
                const audited = JSON.parse(resp.text);
                if (audited && audited.answers && audited.answers.length >= resultData.answers.length) {
                  resultData = audited;
                }
                break;
              }
            } catch (e: any) {
              console.warn(`extract-answer-key-page Pass 2 audit failed on model ${model}:`, e.message);
            }
          }
        } catch (e) {
          // ignore
        }
      }

      res.json(resultData);
    } catch (error: any) {
      console.error('Error in extract-answer-key-page:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
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

startServer();
