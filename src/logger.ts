import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('AI Skeleton');
  }
  return channel;
}

function timestamp(): string {
  return new Date().toISOString();
}

function formatArgs(args: any[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

function append(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', args: any[]) {
  const ch = getChannel();
  ch.appendLine(`${timestamp()} [${level}] ${formatArgs(args)}`);
}

export const logger = {
  info: (...args: any[]) => {
    append('INFO', args);
    console.log('[AI Skeleton]', ...args);
  },
  warn: (...args: any[]) => {
    append('WARN', args);
    console.warn('[AI Skeleton]', ...args);
  },
  error: (...args: any[]) => {
    append('ERROR', args);
    console.error('[AI Skeleton]', ...args);
  },
  debug: (...args: any[]) => {
    append('DEBUG', args);
    console.debug('[AI Skeleton]', ...args);
  },
};

export function getLoggerChannel(): vscode.OutputChannel {
  return getChannel();
}
