import { Injectable, LoggerService, LogLevel } from '@nestjs/common';
import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { loggerContext } from './logger-context';

const SENSITIVE_KEYS = [
  /^password$/i,
  /^currentpassword$/i,
  /^newpassword$/i,
  /^confirmpassword$/i,
  /^token$/i,
  /^authorization$/i,
  /^cookie$/i,
  /^secret$/i,
  /^api[_-]?key$/i,
  /^access[_-]?token$/i,
  /^refresh[_-]?token$/i,
  /^credit[_-]?card$/i,
  /^ssn$/i,
  /^personidnumber$/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.some((rx) => rx.test(key));
}

export function redact(value: any): any {
  if (typeof value === 'string') {
    let s = value;
    s = s.replace(/(Authorization\s*[:=]\s*)Bearer\s+[^\s\"]*/gi, '$1[REDACTED]');
    s = s.replace(/(token=)[^&\s\"]*/gi, '$1[REDACTED]');
    return s;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = isSensitiveKey(k) ? '[REDACTED]' : redact(v);
    }
    return out;
  }
  return value;
}

const isVercel = !!process.env.VERCEL;
const logDir = process.env.LOG_DIR || './logs';

function buildPrintFormat() {
  return winston.format.printf((info) => {
    const { level, message, timestamp, stack, ...metadata } = info;
    const context = loggerContext.getStore();

    const payload: Record<string, any> = {
      timestamp,
      level,
      message: redact(message),
    };

    if (stack) payload.stack = stack;
    if (context) {
      payload.requestId = context.requestId;
      payload.method = context.method;
      payload.url = context.url;
      payload.ip = context.ip;
      payload.userAgent = context.userAgent;
      if (context.userId) payload.userId = context.userId;
    }

    const meta = redact(metadata);
    delete meta.splat;
    if (Object.keys(meta).length > 0) {
      payload.metadata = meta;
    }

    return JSON.stringify(payload);
  });
}

function createFileTransport(level?: string): DailyRotateFile {
  const transport = new DailyRotateFile({
    dirname: logDir,
    filename: level ? `${level}-%DATE%.log` : 'combined-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    level,
    maxFiles: '30d',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      buildPrintFormat(),
    ),
  });

  transport.on('error', (err) => {
    // Logging failures must not crash the application.
    console.error('[WinstonTransport] Logging transport error:', err.message);
  });

  return transport;
}

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      buildPrintFormat(),
    ),
  }),
];

if (!isVercel && logDir) {
  transports.push(createFileTransport('error'), createFileTransport());
}

const winstonLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  exitOnError: false,
  transports,
});

process.on('uncaughtException', (err) => {
  try {
    winstonLogger.error('Uncaught exception', err);
  } catch {
    console.error('Uncaught exception (logger failed):', err);
  }
});

process.on('unhandledRejection', (reason) => {
  try {
    winstonLogger.error('Unhandled promise rejection', { reason });
  } catch {
    console.error('Unhandled promise rejection (logger failed):', reason);
  }
});

@Injectable()
export class WinstonLogger implements LoggerService {
  log(message: any, context?: string): void {
    winstonLogger.info(message, { context });
  }

  error(message: any, stack?: string, context?: string): void {
    const meta: Record<string, any> = { context };
    if (stack) meta.stack = stack;
    winstonLogger.error(message, meta);
  }

  warn(message: any, context?: string): void {
    winstonLogger.warn(message, { context });
  }

  debug(message: any, context?: string): void {
    winstonLogger.debug(message, { context });
  }

  verbose(message: any, context?: string): void {
    winstonLogger.verbose(message, { context });
  }

  setLogLevels?(levels: LogLevel[]): void {
    // No-op: winston levels are fixed.
    void levels;
  }
}
