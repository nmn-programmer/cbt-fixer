import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { QuestionPaperArchive } from '../types/cbt';

interface CBTStudioDB extends DBSchema {
  archives: {
    key: string;
    value: {
      id: string;
      fileName: string;
      title: string;
      format: string;
      metadata: any;
      subjects: any[];
      rawFilesEntries: Array<{ path: string; blob: Blob; size: number }>;
      lastModified: number;
    };
  };
  checkpoints: {
    key: string;
    value: {
      id: string;
      fileName: string;
      testTitle: string;
      totalPages: number;
      completedPages: number[];
      extractedQuestions: any[];
      answerKeys: any[];
      timestamp: number;
    };
  };
  settings: {
    key: string;
    value: any;
  };
}

const DB_NAME = 'cbt_question_paper_studio_v1';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<CBTStudioDB>> | null = null;

function getDb(): Promise<IDBPDatabase<CBTStudioDB>> {
  if (!dbPromise) {
    dbPromise = openDB<CBTStudioDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains('archives')) {
          db.createObjectStore('archives', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('checkpoints')) {
          db.createObjectStore('checkpoints', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      },
    });
  }
  return dbPromise;
}

export async function saveArchiveToDB(archive: QuestionPaperArchive): Promise<void> {
  try {
    const db = await getDb();
    const rawFilesEntries: Array<{ path: string; blob: Blob; size: number }> = [];

    for (const [path, item] of archive.rawFiles.entries()) {
      rawFilesEntries.push({
        path,
        blob: item.blob,
        size: item.size,
      });
    }

    // Clean subjects of transient blob URLs before storing
    const cleanedSubjects = archive.subjects.map((sub) => ({
      ...sub,
      sections: sub.sections.map((sec) => ({
        ...sec,
        questions: sec.questions.map((q) => ({
          ...q,
          images: q.images.map((img) => ({
            id: img.id,
            partIndex: img.partIndex,
            fileName: img.fileName,
            mimeType: img.mimeType,
            sizeBytes: img.sizeBytes,
          })),
        })),
      })),
    }));

    await db.put('archives', {
      id: archive.id,
      fileName: archive.fileName,
      title: archive.title,
      format: archive.format,
      metadata: archive.metadata,
      subjects: cleanedSubjects,
      rawFilesEntries,
      lastModified: archive.lastModified || Date.now(),
    });
  } catch (err) {
    console.warn('Failed to auto-save archive to IndexedDB:', err);
  }
}

export async function loadAllArchivesFromDB(): Promise<QuestionPaperArchive[]> {
  try {
    const db = await getDb();
    const storedList = await db.getAll('archives');
    const archives: QuestionPaperArchive[] = [];

    for (const stored of storedList) {
      const rawFiles = new Map<string, { blob: Blob; url: string; size: number }>();

      for (const entry of stored.rawFilesEntries) {
        const url = URL.createObjectURL(entry.blob);
        rawFiles.set(entry.path, {
          blob: entry.blob,
          url,
          size: entry.size,
        });
      }

      // Rehydrate blob URLs for images
      const rehydratedSubjects = stored.subjects.map((sub: any) => ({
        ...sub,
        sections: sub.sections.map((sec: any) => ({
          ...sec,
          questions: sec.questions.map((q: any) => ({
            ...q,
            images: q.images.map((img: any) => {
              const fileEntry =
                rawFiles.get(img.fileName) ||
                Array.from(rawFiles.entries()).find(([k]) => k.endsWith(img.fileName) || img.fileName?.endsWith(k))?.[1];
              return {
                ...img,
                blobUrl: fileEntry ? fileEntry.url : '',
                rawBlob: fileEntry ? fileEntry.blob : undefined,
              };
            }),
          })),
        })),
      }));

      archives.push({
        id: stored.id,
        fileName: stored.fileName,
        title: stored.title,
        format: stored.format as any,
        metadata: stored.metadata,
        subjects: rehydratedSubjects,
        rawFiles,
        isDirty: false,
        lastModified: stored.lastModified,
      });
    }

    return archives;
  } catch (err) {
    console.warn('Failed to load archives from IndexedDB:', err);
    return [];
  }
}

export async function deleteArchiveFromDB(archiveId: string): Promise<void> {
  try {
    const db = await getDb();
    await db.delete('archives', archiveId);
  } catch (err) {
    console.warn('Failed to delete archive from IndexedDB:', err);
  }
}

export async function clearAllArchivesFromDB(): Promise<void> {
  try {
    const db = await getDb();
    await db.clear('archives');
  } catch (err) {
    console.warn('Failed to clear archives in IndexedDB:', err);
  }
}

export interface ConversionCheckpointData {
  id: string;
  fileName: string;
  testTitle: string;
  totalPages: number;
  completedPages: number[];
  extractedQuestions: any[];
  answerKeys: any[];
  timestamp: number;
}

export async function saveConversionCheckpoint(checkpoint: ConversionCheckpointData): Promise<void> {
  try {
    const db = await getDb();
    await db.put('checkpoints', checkpoint);
  } catch (err) {
    console.warn('Failed to save conversion checkpoint to IndexedDB:', err);
  }
}

export async function getConversionCheckpoint(id: string): Promise<ConversionCheckpointData | undefined> {
  try {
    const db = await getDb();
    return await db.get('checkpoints', id);
  } catch (err) {
    console.warn('Failed to get conversion checkpoint from IndexedDB:', err);
    return undefined;
  }
}

export async function getAllConversionCheckpoints(): Promise<ConversionCheckpointData[]> {
  try {
    const db = await getDb();
    return await db.getAll('checkpoints');
  } catch (err) {
    console.warn('Failed to get all conversion checkpoints from IndexedDB:', err);
    return [];
  }
}

export async function deleteConversionCheckpoint(id: string): Promise<void> {
  try {
    const db = await getDb();
    await db.delete('checkpoints', id);
  } catch (err) {
    console.warn('Failed to delete conversion checkpoint from IndexedDB:', err);
  }
}

