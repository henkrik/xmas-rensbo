import { debugLog } from './debugConsole';

/**
 * SecretSantaDB manages Secret Santa gift giver -> receiver mappings.
 *
 * File format: "Name1 -> Name2" on each non-empty line.
 * Key represents giftGiver, value represents giftReceiver.
 */
export class SecretSantaDB {
  private giverToReceiver = new Map<string, string>();

  constructor(content?: string) {
    if (content) {
      this.loadFromText(content);
    }
  }

  /**
   * Parses non-empty lines formatted as "Name1 -> Name2" and populates the map.
   */
  public loadFromText(content: string): void {
    this.giverToReceiver.clear();
    const lines = content.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const parts = line.split('->');
      if (parts.length === 2) {
        const giftGiver = parts[0].trim();
        const giftReceiver = parts[1].trim();
        if (giftGiver && giftReceiver) {
          this.giverToReceiver.set(giftGiver, giftReceiver);
        }
      }
    }
  }

  /**
   * Returns a list of all gift givers in insertion order.
   */
  public get giftGivers(): string[] {
    return Array.from(this.giverToReceiver.keys());
  }

  /**
   * Looks up the gift receiver for a given gift giver name.
   */
  public getGiftReceiverOf(giftGiver: string): string | undefined {
    return this.giverToReceiver.get(giftGiver);
  }

  /**
   * Debug logs each gift giver's name and who they give presents to according to this map.
   */
  public debugLogAll(): void {
    for (const giver of this.giftGivers) {
      const receiver = this.getGiftReceiverOf(giver);
      debugLog(`Secret Santa: ${giver} -> ${receiver}`);
    }
  }
}

/**
 * Initializes SecretSantaDB by fetching secret.txt (or using embedded fallback content),
 * and debug logs each gift giver's name and receiver.
 */
export async function initSecretSantaDB(initialContent?: string): Promise<SecretSantaDB> {
  let content = initialContent;

  if (content === undefined && typeof fetch === 'function') {
    try {
      const res = await fetch('./secret.txt');
      if (res.ok) {
        content = await res.text();
      }
    } catch {
      // Fallback or ignore network errors in tests/non-browser
    }
  }

  const db = new SecretSantaDB(content);
  db.debugLogAll();
  return db;
}
