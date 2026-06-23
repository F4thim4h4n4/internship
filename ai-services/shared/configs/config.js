import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try loading .env from local path and chatbot subfolder relative to config location
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../chatbot/.env') });

export const config = {
  port: parseInt(process.env.PORT || '5005', 10),
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  logLevel: process.env.LOG_LEVEL || 'info',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/kottakkal',
};

// Validate key configuration parameters
if (!config.geminiApiKey) {
  console.warn('WARNING: GEMINI_API_KEY is not set. The Gemini service calls will fail until configured.');
}
