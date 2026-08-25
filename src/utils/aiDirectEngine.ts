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
  const { image, text } = body;
  if (!image && !text) {
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

CRITICAL BOUNDING BOX & COLUMN PROTOCOL:
1. Column Separation in 2-Column Papers:
   - Left Column: The bounding box MUST span from the left margin (~0.03 to 0.05) to the center column divider (~0.485). NEVER cross into the right column.
   - Right Column: The bounding box MUST start after the center divider (~0.515) and span to the right margin (~0.97).
   - Full-Width Questions: span from left margin (~0.035) to right margin (~0.97).

2. Zero-Clipping Rules:
   - Question Number Margin: The bounding box xmin MUST start to the LEFT of the question number (e.g. "Q.15", "15.").
   - Complete Options Enclosure: For MCQs, the bounding box ymax MUST comfortably enclose the entire bottom line of all options (A, B, C, D) or (1, 2, 3, 4).
   - Exclude page headers, subject header banners, and page numbers.

3. MANDATORY PROTOCOL FOR MULTI-COLUMN & MULTI-PAGE SPLIT QUESTIONS:
   - If a question near the bottom of a left column ends before listing all options, mark "isSplit": true, "completeness": "split", and locate the continuation at the top of the right column or next page.
   - Provide "splitParts" with ordered normalized boxes for each part.
   - If the top of a column starts with orphaned options (e.g. "(A)... (B)... (C)... (D)..." or "(C)... (D)...") without a new Q-number, mark "isOrphanContinuation": true, and set "continuationForQNo" to the preceding question number.

${extractEnglishOnly ? 'BILINGUAL PAPER: Extract ONLY the English version of questions.' : ''}

Output normalized bounding box [ymin, xmin, ymax, xmax] between 0.0 and 1.0 for each question.
${hasAnswerKey ? 'Extract printed answer key table if present on these pages.' : ''}`;

  contents.push({ text: prompt });

  const parsed = await executeGeminiWithFallback(ai, {
    contents,
    schema: responseSchema,
    temperature: 0.1,
    label: 'Client Direct Extract PDF Structure'
  });

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

  return executeGeminiWithFallback(ai, {
    contents,
    schema: keySchema,
    temperature: 0.1,
    preferredModel: requestedModel,
    label: 'Client Direct Extract Answer Key PDF'
  });
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

  return executeGeminiWithFallback(ai, {
    contents: [{ inlineData }, { text: prompt }],
    schema: keySchema,
    temperature: 0.1,
    label: 'Extract Answer Key Page'
  });
}

