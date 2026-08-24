import { GoogleGenAI, Type, Schema } from '@google/genai';

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

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
        return JSON.parse(resp.text);
      }
    } catch (e: any) {
      console.warn(`[Client AI] Blueprint failed on model ${model}:`, e.message);
    }
  }
  throw new Error('Failed to extract test blueprint via client-side AI processing.');
}

async function handleExtractPdfStructure(ai: GoogleGenAI, body: any) {
  const { images, pageOffset = 0, options = {} } = body;
  const { hasAnswerKey = true, extractEnglishOnly = false } = options;
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
            qNo: { type: Type.INTEGER },
            type: { type: Type.STRING },
            subject: { type: Type.STRING },
            section: { type: Type.STRING },
            questionText: { type: Type.STRING },
            optionsText: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctAnswer: { type: Type.STRING },
            hasAnswerKeyGiven: { type: Type.BOOLEAN },
            boundingBox: { type: Type.ARRAY, items: { type: Type.NUMBER } },
            pageIndex: { type: Type.INTEGER },
            isSplitQuestion: { type: Type.BOOLEAN },
            isOptionSplit: { type: Type.BOOLEAN },
            splitPart: { type: Type.INTEGER },
            missingOptionsInThisPage: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["qNo", "type", "boundingBox", "pageIndex"]
        }
      }
    },
    required: ["questions"]
  };

  const prompt = `You are a high-precision OCR and document analysis AI specializing in JEE / NEET / Competitive Exam CBT Question Papers.
Analyze these page images (Absolute Page Numbers: ${pageOffset + 1} to ${pageOffset + images.length}).
Extract all question bounding boxes [ymin, xmin, ymax, xmax] normalized from 0.0 to 1.0, question text, type ('mcq', 'msq', 'nat', 'msm'), options, and correct answers.
${extractEnglishOnly ? 'CRITICAL: Extract ONLY ENGLISH text.' : ''}
${hasAnswerKey ? 'Extract answers if present.' : ''}`;

  contents.push({ text: prompt });

  let resultData: any = null;
  for (const model of MODELS) {
    try {
      const resp = await ai.models.generateContent({
        model,
        contents,
        config: {
          responseMimeType: 'application/json',
          responseSchema,
          temperature: 0.1
        }
      });
      if (resp.text) {
        resultData = JSON.parse(resp.text);
        break;
      }
    } catch (e: any) {
      console.warn(`[Client AI] Extract PDF structure failed on model ${model}:`, e.message);
    }
  }

  if (!resultData) {
    throw new Error('Client-side AI extraction failed across all models');
  }

  return resultData;
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

  for (const model of MODELS) {
    try {
      const resp = await ai.models.generateContent({
        model,
        contents: [{ inlineData }, { text: prompt }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.1
        }
      });
      if (resp.text) return JSON.parse(resp.text);
    } catch (e: any) {
      console.warn(`[Client AI] detectQuestionBox failed on model ${model}:`, e.message);
    }
  }
  throw new Error('Failed to detect question box via client-side AI.');
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

  for (const model of MODELS) {
    try {
      const resp = await ai.models.generateContent({
        model,
        contents: [{ inlineData }, { text: prompt }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.1
        }
      });
      if (resp.text) return JSON.parse(resp.text);
    } catch (e: any) {
      console.warn(`[Client AI] analyzeQuestionImage failed on model ${model}:`, e.message);
    }
  }
  throw new Error('Failed to analyze question image via client-side AI.');
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
      if (resp.text) return JSON.parse(resp.text);
    } catch (e: any) {
      console.warn(`[Client AI] extractAnswerKeyPdf failed on model ${model}:`, e.message);
    }
  }
  throw new Error('Failed to extract answer key PDF via client-side AI.');
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

  for (const model of MODELS) {
    try {
      const resp = await ai.models.generateContent({
        model,
        contents: [{ inlineData }, { text: prompt }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: keySchema,
          temperature: 0.1
        }
      });
      if (resp.text) return JSON.parse(resp.text);
    } catch (e: any) {
      console.warn(`[Client AI] extractAnswerKeyPage failed on model ${model}:`, e.message);
    }
  }
  throw new Error('Failed to extract answer key page via client-side AI.');
}
