import fs from 'fs';
import { createWorker } from 'tesseract.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// Setup IPC listener
process.on('message', async (msg) => {
  const { action, filePath, mimeType, mock, mockType } = msg;

  if (action !== 'parse') {
    process.send({ success: false, error: 'Unknown action' });
    process.exit(1);
  }

  // Mock modes for offline testing
  if (mock) {
    if (mockType === 'success') {
      process.send({
        success: true,
        text: 'Kottakkal Municipality Official Document\nThis is a mock text extracted from the document for testing.'
      });
      process.exit(0);
    } else if (mockType === 'timeout') {
      // Simulate an infinite loop or delay to trigger parent watchdog timeout
      console.log('Worker simulating infinite loop...');
      while (true) {
        await new Promise(r => setTimeout(r, 1000));
      }
    } else if (mockType === 'crash') {
      // Simulate unhandled exception / crash
      console.log('Worker simulating crash...');
      throw new Error('Worker process encountered a critical memory/segmentation fault simulation.');
    } else {
      process.send({ success: false, error: `Unknown mock type: ${mockType}` });
      process.exit(1);
    }
  }

  try {
    if (!fs.existsSync(filePath)) {
      process.send({ success: false, error: `File not found at path: ${filePath}` });
      process.exit(1);
    }

    const fileBuffer = fs.readFileSync(filePath);
    let extractedText = '';

    if (mimeType === 'application/pdf') {
      // Parse PDF using pdf-parse
      const data = await pdfParse(fileBuffer);
      extractedText = data.text || '';
      process.send({ success: true, text: extractedText });
      process.exit(0);
    } else if (mimeType.startsWith('image/')) {
      // Parse Image using tesseract.js WebAssembly
      const worker = await createWorker('eng');
      const ret = await worker.recognize(filePath);
      extractedText = ret.data.text || '';
      await worker.terminate();
      process.send({ success: true, text: extractedText });
      process.exit(0);
    } else {
      process.send({ success: false, error: `Unsupported MIME type: ${mimeType}` });
      process.exit(1);
    }

  } catch (err) {
    process.send({ success: false, error: err.message });
    process.exit(1);
  }
});
