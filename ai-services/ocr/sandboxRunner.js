import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Runs the OCR file parsing task inside an isolated child process sandbox.
 * Enforces memory and execution timeout constraints.
 * 
 * @param {string} filePath Path to the document file.
 * @param {string} mimeType MIME type of the document.
 * @param {object} options Sandbox options (mock, mockType, timeoutMs).
 * @returns {Promise<string>} Extracted text result.
 */
export function runOcrSandbox(filePath, mimeType, options = {}) {
  return new Promise((resolve, reject) => {
    const workerPath = path.resolve(__dirname, 'ocrWorker.js');
    const timeoutMs = options.timeoutMs || 30000; // 30s limit

    // Spawn isolated child worker process with memory cap
    const child = fork(workerPath, [], {
      execArgv: ['--max-old-space-size=256'],
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    let resolved = false;

    // Watchdog watchdog timer for execution timeout
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill('SIGKILL');
        reject(new Error(`Sandbox execution timeout exceeded: ${timeoutMs}ms`));
      }
    }, timeoutMs);

    // Send payload variables to child worker
    child.send({
      action: 'parse',
      filePath,
      mimeType,
      mock: options.mock || false,
      mockType: options.mockType || 'success'
    });

    // Listen for IPC response
    child.on('message', (msg) => {
      clearTimeout(timer);
      resolved = true;
      if (msg.success) {
        resolve(msg.text);
      } else {
        reject(new Error(msg.error || 'Unknown worker execution failure'));
      }
      child.kill('SIGTERM');
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (!resolved) {
        resolved = true;
        reject(new Error(`Worker process runtime error: ${err.message}`));
      }
    });

    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (!resolved) {
        resolved = true;
        if (signal === 'SIGKILL') {
          reject(new Error(`Worker process terminated by SIGKILL (likely timeout or memory limit exceeded)`));
        } else {
          reject(new Error(`Worker process exited prematurely with code ${code} and signal ${signal}`));
        }
      }
    });
  });
}
