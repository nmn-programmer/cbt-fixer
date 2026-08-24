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
  } else {
    throw new Error(`Unsupported client-side AI endpoint: ${endpoint}`);
  }
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
  const { image, questionContext } = body;
  if (!image) throw new Error('Image is required');

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      qualityScore: { type: Type.NUMBER },
      isClipped: { type: Type.BOOLEAN },
      recommendedAction: { type: Type.STRING },
      suggestsCropAdjustment: {
        type: Type.OBJECT,
        properties: {
          topPaddingPx: { type: Type.NUMBER },
          bottomPaddingPx: { type: Type.NUMBER },
          leftPaddingPx: { type: Type.NUMBER },
          rightPaddingPx: { type: Type.NUMBER }
        }
      },
      summary: { type: Type.STRING }
    },
    required: ["qualityScore", "isClipped", "recommendedAction", "summary"]
  };

  const inlineData = {
    data: image.replace(/^data:image\/\w+;base64,/, ''),
    mimeType: image.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png'
  };

  const prompt = `Analyze this cropped question image for clarity, clipping, and completeness.
Context: "${questionContext || ''}"`;

  return executeGeminiWithFallback(ai, {
    contents: [{ inlineData }, { text: prompt }],
    schema,
    temperature: 0.1,
    label: 'Analyze Question Image'
  });
}

async function handleExtractAnswerKeyPdf(ai: GoogleGenAI, body: any) {
  const { pdfText, images, options = {} } = body;
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
      sourcePage: { type: Type.INTEGER },
      confidence: { type: Type.NUMBER }
    },
    required: ["answers"]
  };

  const contents: any[] = [];
  if (images && Array.isArray(images)) {
    images.forEach((img: string) => {
      contents.push({
        inlineData: {
          data: img.replace(/^data:image\/\w+;base64,/, ''),
          mimeType: img.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png'
        }
      });
    });
  }
  if (pdfText) {
    contents.push({ text: `Raw Answer Key Text:\n${pdfText}` });
  }

  const prompt = `Extract all question-to-answer mappings from this document.`;
  contents.push({ text: prompt });

  return executeGeminiWithFallback(ai, {
    contents,
    schema: keySchema,
    temperature: 0.1,
    label: 'Extract Answer Key PDF'
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

