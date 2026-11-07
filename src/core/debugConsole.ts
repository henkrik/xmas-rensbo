/**
 * General on-screen debug console (shown only when `?debug` is present in the URL).
 *
 * Usage from anywhere in the codebase:
 *   import { debugLog } from '../core/debugConsole';
 *   debugLog('Loaded level: level-outside');
 *
 * Also registered globally as `globalThis.debugLog`.
 */
export class DebugConsole {
  private lines: string[] = [];
  private readonly maxLines: number;
  private element: HTMLPreElement | null = null;

  constructor(maxLines = 50) {
    this.maxLines = maxLines;
  }

  public log(message: string): void {
    this.lines.push(message);
    if (this.lines.length > this.maxLines) {
      this.lines.splice(0, this.lines.length - this.maxLines);
    }
    this.render();
  }

  public getLines(): readonly string[] {
    return this.lines;
  }

  public clear(): void {
    this.lines = [];
    this.render();
  }

  public attach(frame: HTMLElement | null): () => void {
    if (!frame || typeof document === 'undefined') {
      return () => {};
    }

    frame.classList.add('debug');
    const el = document.createElement('pre');
    el.id = 'viewport-debug-text';
    frame.appendChild(el);
    this.element = el;
    this.render();

    return () => {
      if (this.element === el) {
        this.element = null;
      }
      el.remove();
      frame.classList.remove('debug');
    };
  }

  private render(): void {
    if (this.element) {
      this.element.textContent = this.lines.join('\n');
    }
  }
}

export const debugConsole = new DebugConsole();

export function debugLog(message: string): void {
  debugConsole.log(message);
}

export function attachDebugConsole(frame: HTMLElement | null): () => void {
  return debugConsole.attach(frame);
}

declare global {
  // eslint-disable-next-line no-var
  var debugLog: ((message: string) => void) | undefined;
}

if (typeof globalThis !== 'undefined') {
  globalThis.debugLog = debugLog;
}
