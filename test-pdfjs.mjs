import * as pdfjsLib from 'pdfjs-dist';
console.log('Got pdfjsLib');
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'test';
  console.log('Set successfully');
} catch (e) {
  console.error('Failed to set:', e.message);
}
