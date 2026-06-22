import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../configs/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.resolve(__dirname, '../logs');

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    let msg = `[${timestamp}] ${level}: ${message}`;
    if (stack) {
      msg += `\nStack trace:\n${stack}`;
    }
    // Output correlationId if present in metadata
    if (meta.correlationId) {
      msg = `[${timestamp}] [CID:${meta.correlationId}] ${level}: ${message}`;
    }
    return msg;
  })
);

export const logger = winston.createLogger({
  level: config.logLevel,
  format: logFormat,
  transports: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log') 
    }),
    new winston.transports.Console({
      format: consoleFormat
    })
  ]
});
