import { GoogleGenAI, Type, Schema } from '@google/genai';
import { executeGeminiWithFallback } from './aiModelConfig';

/**
 * Direct client-side execution for Gemini AI endpoints
 * Used as automatic fallback when server endpoint returns 404 (e.g. on Vercel static, GitHub Pages, Netlify)
 */
export async function executeGeminiClientSide(
  endpoint: string,
  body: any,
  apiKey: string
): Promise<any> {
  if (!apiKey) {
    throw new Error('Gemini API Key is required for client-side AI processing.');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build-client' } }
  });

  if (endpoint.endsWith('/api/extract-test-blueprint')) {
    return handleExtractTestBlueprint(ai, body);
  } else if (endpoint.endsWith('/api/extract-pdf-structure')) {
    return handleExtractPdfStructure(ai, body);
  } else if (endpoint.endsWith('/api/extract-questions-pass1')) {
    return handleExtractQuestionsPass1(ai, body);
  } else if (endpoint.endsWith('/api/detect-question-box')) {
    return handleDetectQuestionBox(ai, body);
  } else if (endpoint.endsWith('/api/analyze-question-image')) {
    return handleAnalyzeQuestionImage(ai, body);
  } else if (endpoint.endsWith('/api/extract-answer-key-pdf')) {
    return handleExtractAnswerKeyPdf(ai, body);
  } else if (endpoint.endsWith('/api/extract-answer-key-page')) {
    return handleExtractAnswerKeyPage(ai, body);
  } else if (endpoint.endsWith('/api/gemini/generate')) {
    return handleGeminiGenerate(ai, body);
  } else {
    throw new Error(`Unsupported client-side AI endpoint: ${endpoint}`);
  }
}

async function handleGeminiGenerate(ai: GoogleGenAI, body: any) {
  const { contents, config, model } = body;
  const resultText = await executeGeminiWithFallback(ai, {
    contents,
    temperature: config?.temperature ?? 0.1,
    preferredModel: model,
    label: 'Client Direct Gemini Generate'
  });
  return { text: resultText, candidates: [{ content: { parts: [{ text: resultText }] } }] };
}

async function handleExtractTestBlueprint(ai: GoogleGenAI, body: any) {
  const { image, images, text, documentSummary } = body;
  const rawImages: string[] = images && Array.isArray(images) && images.length > 0
    ? images
    : (image ? [image] : []);

  if (rawImages.length === 0 && !text && !documentSummary) {
    throw new Error('Instruction page image or text is required');
  }

  const blueprintSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      testTitle: { type: Type.STRING, description: "Official test name/title from cover or instructions" },
      durationMinutes: { type: Type.INTEGER, description: "Total test duration in minutes (e.g. 60, 180, 200)" },
      totalMarks: { type: Type.INTEGER, description: "Maximum aggregate marks (e.g. 96, 300, 360, 720)" },
      totalQuestions: { type: Type.INTEGER, description: "Total number of questions in booklet (e.g. 24, 75, 90, 180)" },
      hasInstructedMarkingScheme: { type: Type.BOOLEAN, description: "True if explicit marking scheme rules are written in the instructions" },
      markingSchemeSummary: { type: Type.STRING, description: "Concise human-readable summary of the exact instructed marking scheme" },
      defaultMarkingScheme: {
        type: Type.OBJECT,
        properties: {
          cm: { type: Type.NUMBER },
          im: { type: Type.NUMBER },
          pm: { type: Type.NUMBER },
          max: { type: Type.NUMBER }
        },
        required: ["cm", "im"]
      },
      sections: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            subjectName: { type: Type.STRING },
            sectionName: { type: Type.STRING },
            fromQNo: { type: Type.INTEGER },
            toQNo: { type: Type.INTEGER },
            type: { type: Type.STRING },
            marks: {
              type: Type.OBJECT,
              properties: {
                cm: { type: Type.NUMBER },
                im: { type: Type.NUMBER },
                pm: { type: Type.NUMBER },
                max: { type: Type.NUMBER }
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
Examine this Instructions / Cover page or text thoroughly and extract Test Title, Duration, Marks, Total Questions, and Subject Sections with marking scheme rules.`;

  const contents: any[] = [];
  rawImages.forEach((imgStr) => {
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

  return executeGeminiWithFallback(ai, {
    contents,
    schema: blueprintSchema,
    temperature: 0.1,
    label: 'Extract Test Blueprint'
  });
}

async function handleExtractPdfStructure(ai: GoogleGenAI, body: any) {
  const { images, pageOffset = 0, options = {} } = body;
  const { hasAnswerKey = true, extractEnglishOnly = false, enableDoublePass = true } = options;
  if (!images || !images.length) throw new Error('No images provided');

  const contents = images.map((base64: string) => ({
    inlineData: {
      data: base64.replace(/^data:image\/\w+;base64,/, ''),
      mimeType: base64.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png'
    }
  }));

  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      testTitle: { type: Type.STRING },
      durationMinutes: { type: Type.INTEGER },
      totalMarks: { type: Type.INTEGER },
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            pageIndex: { type: Type.INTEGER },
            qNo: { type: Type.INTEGER },
            subject: { type: Type.STRING },
            type: { type: Type.STRING },
            box: { type: Type.ARRAY, items: { type: Type.NUMBER } },
            optionsFound: { type: Type.ARRAY, items: { type: Type.STRING } },
            completeness: { type: Type.STRING },
            isSplit: { type: Type.BOOLEAN },
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
            continuationForQNo: { type: Type.INTEGER }
          },
          required: ["pageIndex", "qNo", "subject", "type", "box"]
        }
      },
      answerKeys: {
        type: Type.ARRAY,
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

  const prompt = `You are an expert exam layout parser specializing in JEE / NEET / CBSE test papers.
Analyze the provided page images (Pages ${pageOffset + 1} to ${pageOffset + images.length}).
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
   - CRITICAL BOUNDING DIRECTIVE: A question's bounding box MUST encompass the question number, complete text prompt, any attached diagrams/tables/figures, and all associated multiple-choice options until the exact start of the next question.

3. DYNAMIC COLUMN OVERFLOW & MULTI-PAGE SPLIT EXCEPTION:
   - If Question Q_n ends before listing all options (or Q_(n+1) is in a different column or next page):
     * Mark "isSplit": true, "completeness": "split".
     * Set Part 1 Y_MAX to the bottom line of the current column.
     * Locate Part 2 at the top of the next column or next page (from top margin line down to Q_(n+1) label).
   - If the top of a column starts with orphaned options without a new Q-number, mark "isOrphanContinuation": true and "continuationForQNo" to preceding Q-number.

${extractEnglishOnly ? 'BILINGUAL PAPER: Extract ONLY the English version of questions.' : ''}

Output normalized bounding box [ymin, xmin, ymax, xmax] between 0.0 and 1.0 for each question.
${hasAnswerKey ? 'Extract printed answer key table if present on these pages.' : ''}`;

  contents.push({ text: prompt });

  const parsed = await executeGeminiWithFallback(ai, {
    contents,
    schema: responseSchema,
    temperature: 0.1,
    label: 'Client Direct Extract PDF Structure (Pass 1)'
  });

  // PASS 2 GAP-FILL & SEQUENCE AUDIT RESCAN (NON-DESTRUCTIVE)
  if (enableDoublePass !== false && parsed.questions && parsed.questions.length > 0) {
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
        label: 'Client Direct Pass 2 Audit'
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
            pass1Map.set(auditedQ.qNo, auditedQ);
          } else {
            if (auditedQ.splitParts && Array.isArray(auditedQ.splitParts) && auditedQ.splitParts.length > 0) {
              existing.splitParts = auditedQ.splitParts;
              existing.isSplit = true;
            }
            if (auditedQ.completeness && auditedQ.completeness !== 'missing_options') {
              existing.completeness = auditedQ.completeness;
            }
          }
        });
        parsed.questions = Array.from(pass1Map.values()).sort((a, b) => a.qNo - b.qNo);
      }
    } catch (e) {
      console.warn('Client Pass 2 pdf structure audit skipped:', e);
    }
  }

  // Adjust pageIndex by pageOffset (for both main question and splitParts)
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

  return parsed;
}

async function handleDetectQuestionBox(ai: GoogleGenAI, body: any) {
  const { image, questionText, pageOffset, qNo } = body;
  if (!image) throw new Error('Image is required');

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      box: { type: Type.ARRAY, items: { type: Type.NUMBER } },
      confidence: { type: Type.NUMBER },
      explanation: { type: Type.STRING }
    },
    required: ["box"]
  };

  const inlineData = {
    data: image.replace(/^data:image\/\w+;base64,/, ''),
    mimeType: image.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png'
  };

  const prompt = `Find the precise normalized bounding box [ymin, xmin, ymax, xmax] (0.0 to 1.0) enclosing Question ${qNo || ''} on this page.
CRITICAL: A question's bounding box MUST encompass the question number, complete text prompt, any attached diagrams/tables/figures, and all associated multiple-choice options until the exact start of the next question.
Text context: "${questionText ? questionText.slice(0, 150) : ''}"`;

  return executeGeminiWithFallback(ai, {
    contents: [{ inlineData }, { text: prompt }],
    schema,
    temperature: 0.1,
    label: 'Detect Question Box'
  });
}

async function handleAnalyzeQuestionImage(ai: GoogleGenAI, body: any) {
  const { images, image, currentQuestion = {}, qNo, currentType, model: requestedModel } = body;
  const rawImages = images && Array.isArray(images) && images.length > 0 ? images : (image ? [image] : []);
  if (!rawImages.length) throw new Error('Question image is required');

  const repairSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      detectedType: { 
        type: Type.STRING, 
        description: "Strictly one of: mcq (Single Correct), msq (Multiple Correct), nat (Numerical / Integer), msm (Matrix Match)" 
      },
      detectedQNo: { type: Type.INTEGER, description: "Question sequence number if visible" },
      detectedAnswer: { type: Type.STRING, description: "Detected answer key or options if discernible, else empty string" },
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
        description: "Any detected quality problems",
        items: { type: Type.STRING }
      },
      isClean: { type: Type.BOOLEAN, description: "Whether the question image is complete and clear" },
      recommendations: { type: Type.STRING, description: "Helpful recommendations for the editor" }
    },
    required: ["detectedType", "marks", "latexSummary", "isClean"]
  };

  const contents = rawImages.map((base64: string) => {
    const isJpeg = base64.startsWith('data:image/jpeg');
    return {
      inlineData: {
        data: base64.replace(/^data:image\/\w+;base64,/, ''),
        mimeType: isJpeg ? 'image/jpeg' : 'image/png'
      }
    };
  });

  const targetContext = { ...currentQuestion, qNo: qNo || currentQuestion.que, currentType: currentType || currentQuestion.type };

  const prompt = `You are a senior exam paper reviewer and OCR specialist for JEE Advanced / NEET / CBT exams.
Examine this question slice carefully.
Current question metadata: ${JSON.stringify(targetContext)}.

Perform a thorough diagnostic:
1. Determine the EXACT Question Type ('mcq', 'msq', 'nat', 'msm').
2. Transcribe question & options into crisp LaTeX.
3. Check for flaws or clippings.
4. Recommend standard marking scheme.`;

  return executeGeminiWithFallback(ai, {
    contents: [...contents, { text: prompt }],
    schema: repairSchema,
    temperature: 0.1,
    preferredModel: requestedModel,
    label: 'Client Direct Analyze Question Image'
  });
}

async function handleExtractAnswerKeyPdf(ai: GoogleGenAI, body: any) {
  const { pdfText, text = '', images, options = {}, context = {}, model: requestedModel } = body;
  const rawText = text || pdfText || '';

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
      tableName: { type: Type.STRING, description: "Title or header of the answer key table" },
      totalQuestionsDetected: { type: Type.INTEGER, description: "Total number of answer entries identified" },
      summary: { type: Type.STRING, description: "Concise summary of detected subjects, total answers, and type breakdown" }
    },
    required: ["answers"]
  };

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
  if (rawText) {
    contents.push({ text: `Raw Answer Key Text / OCR:\n${rawText}` });
  }

  const prompt = `You are an expert exam key parser and question type validator for JEE Advanced, JEE Main, NEET, and CBT exam papers.
Analyze this Answer Key document / page images thoroughly.
Extract ALL question numbers and their corresponding answer keys with inferred types.
${context?.totalQuestions ? `Expected Question Count: ${context.totalQuestions}.` : ''}`;

  contents.push({ text: prompt });

  let resultData = await executeGeminiWithFallback(ai, {
    contents,
    schema: keySchema,
    temperature: 0.1,
    preferredModel: requestedModel,
    label: 'Client Direct Extract Answer Key PDF'
  });

  // PASS 2: CLIENT DOUBLE-PASS VERIFICATION AUDIT
  if (body.options?.enableDoublePass !== false && resultData.answers && resultData.answers.length > 0) {
    try {
      const pass1Summary = resultData.answers.map((a: any) => `Q${a.qNo}:${a.answer}`).join(', ');
      const auditPrompt = `PASS 2 VERIFICATION & RESCAN AUDIT FOR MAXIMUM ACCURACY:
Below is the initial raw answer key extracted from Pass 1:
${pass1Summary}

CRITICAL VERIFICATION TASKS FOR PASS 2:
1. MISSING QUESTION DETECTIVE: Scan the image/text to ensure NO question numbers were skipped in the sequence (e.g. Q1 to Q100). If any question number is missing, locate it and add it.
2. OPTION & TYPE AUDIT:
   - MCQ: Normalize A->1, B->2, C->3, D->4
   - MSQ: Ensure multi-option keys (e.g. A,C -> 1,3) are accurate and comma-separated.
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
        label: 'Client Pass 2 Answer Key Audit'
      });

      if (audited && audited.answers && Array.isArray(audited.answers)) {
        const pass1Map = new Map<number, any>();
        resultData.answers.forEach((a: any) => {
          if (a && a.qNo != null) pass1Map.set(a.qNo, a);
        });
        audited.answers.forEach((auditedA: any) => {
          if (!auditedA || auditedA.qNo == null) return;
          const existing = pass1Map.get(auditedA.qNo);
          if (!existing) {
            pass1Map.set(auditedA.qNo, auditedA);
          } else {
            if (auditedA.answer && auditedA.answer.trim()) existing.answer = auditedA.answer;
            if (auditedA.inferredType) existing.inferredType = auditedA.inferredType;
            if (auditedA.normalizedAnswer) existing.normalizedAnswer = auditedA.normalizedAnswer;
            if (auditedA.subject && !existing.subject) existing.subject = auditedA.subject;
          }
        });
        resultData.answers = Array.from(pass1Map.values()).sort((a, b) => a.qNo - b.qNo);
      }
    } catch (e) {
      console.warn('Client Pass 2 answer key verification pass skipped:', e);
    }
  }

  return resultData;
}

async function handleExtractAnswerKeyPage(ai: GoogleGenAI, body: any) {
  const { image } = body;
  if (!image) throw new Error('Page image is required');

  const keySchema: Schema = {
    type: Type.OBJECT,
    properties: {
      answers: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            qNo: { type: Type.INTEGER },
            answer: { type: Type.STRING },
            subject: { type: Type.STRING }
          },
          required: ["qNo", "answer"]
        }
      },
      tableName: { type: Type.STRING }
    },
    required: ["answers"]
  };

  const inlineData = {
    data: image.replace(/^data:image\/\w+;base64,/, ''),
    mimeType: image.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png'
  };

  const prompt = `Extract all answers from this answer key table page image.`;

  let resultData = await executeGeminiWithFallback(ai, {
    contents: [{ inlineData }, { text: prompt }],
    schema: keySchema,
    temperature: 0.1,
    label: 'Extract Answer Key Page'
  });

  // PASS 2: CLIENT DOUBLE-PASS VERIFICATION AUDIT
  if (body.options?.enableDoublePass !== false && resultData.answers && resultData.answers.length > 0) {
    try {
      const pass1Summary = resultData.answers.map((a: any) => `Q${a.qNo}:${a.answer}`).join(', ');
      const auditPrompt = `PASS 2 VERIFICATION & RESCAN AUDIT:
Below is the initial answer key extracted from Pass 1:
${pass1Summary}

Verify that NO question numbers are missing, fix OCR typos, and return the audited, complete answer key table.`;

      const audited = await executeGeminiWithFallback(ai, {
        contents: [{ inlineData }, { text: auditPrompt }],
        schema: keySchema,
        temperature: 0.0,
        label: 'Client Pass 2 Answer Key Page Audit'
      });

      if (audited && audited.answers && Array.isArray(audited.answers)) {
        const pass1Map = new Map<number, any>();
        resultData.answers.forEach((a: any) => {
          if (a && a.qNo != null) pass1Map.set(a.qNo, a);
        });
        audited.answers.forEach((auditedA: any) => {
          if (!auditedA || auditedA.qNo == null) return;
          const existing = pass1Map.get(auditedA.qNo);
          if (!existing) {
            pass1Map.set(auditedA.qNo, auditedA);
          } else {
            if (auditedA.answer && auditedA.answer.trim()) existing.answer = auditedA.answer;
            if (auditedA.subject && !existing.subject) existing.subject = auditedA.subject;
          }
        });
        resultData.answers = Array.from(pass1Map.values()).sort((a, b) => a.qNo - b.qNo);
      }
    } catch (e) {
      // ignore
    }
  }

  return resultData;
}

async function handleExtractQuestionsPass1(ai: GoogleGenAI, body: any) {
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
    model
  } = body;

  if (!image) {
    throw new Error('Page image is required');
  }

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
   - CRITICAL BOUNDING DIRECTIVE: A question's bounding box MUST encompass the question number, complete text prompt, any attached diagrams/tables/figures, and all associated multiple-choice options until the exact start of the next question.

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
    preferredModel: model || options.model,
    label: `Client Extract Questions Pass 1 (Page ${pageIndex})`
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
        preferredModel: model || options.model,
        label: `Client Pass 2 Audit (Page ${pageIndex})`
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
      console.warn(`Client Pass 2 verification audit on page ${pageIndex} skipped:`, e);
    }
  }

  if (parsed.questions && Array.isArray(parsed.questions)) {
    parsed.questions = parsed.questions.map((q: any) => ({
      ...q,
      pageIndex: typeof q.pageIndex === 'number' ? q.pageIndex : pageIndex
    }));
  }

  return parsed;
}

