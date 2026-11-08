import { debugLog } from './debugConsole';

/**
 * SecretSantaDB manages Secret Santa gift giver -> receiver mappings.
 *
 * File format: "Name1 -> Name2" on each non-empty line.
 * Key represents giftGiver, value represents giftReceiver.
 */
export class SecretSantaDB {
  private giverToReceiver = new Map<string, string>();
  public playerId: string | null = null;

  constructor(content?: string, playerId: string | null = null) {
    this.playerId = playerId;
    if (content) {
      this.loadFromText(content);
    }
  }

  /**
   * Base64 decodes the playerId. Returns atob(playerId) if playerId is non-null, null otherwise.
   */
  public get playerName(): string | null {
    if (!this.playerId) {
      return null;
    }
    try {
      return atob(this.playerId);
    } catch {
      return null;
    }
  }

  /**
   * Base64 encodes a name string using btoa.
   */
  public toPlayerId(name: string): string {
    return btoa(name);
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
   * Debug logs each gift giver's name and who they give presents to according to this map
   * in the format: "Gift Giver (PlayerID) -> Gift Receiver"
   * Followed by:
   * "Based on pid, the current player is <playerName> who should give a gift to <receiver>"
   */
  public debugLogAll(): void {
    for (const giver of this.giftGivers) {
      const receiver = this.getGiftReceiverOf(giver);
      const pid = this.toPlayerId(giver);
      debugLog(`${giver} (${pid}) -> ${receiver}`);
    }

    const currentName = this.playerName;
    const receiverOfPlayer = currentName ? this.getGiftReceiverOf(currentName) : undefined;
    debugLog(
      `Based on pid, the current player is ${currentName ?? 'null'} who should give a gift to ${receiverOfPlayer ?? 'null'}`
    );
  }
}

/**
 * Initializes SecretSantaDB by fetching secret.txt (or using embedded fallback content),
 * populating playerId from URL query parameter ?pid= or explicit argument,
 * and debug logging mappings and current player information.
 */
export async function initSecretSantaDB(
  initialContent?: string,
  playerId?: string | null
): Promise<SecretSantaDB> {
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

  let pid = playerId;
  if (pid === undefined) {
    if (typeof window !== 'undefined' && window.location?.search) {
      pid = new URLSearchParams(window.location.search).get('pid');
    } else {
      pid = null;
    }
  }

  const db = new SecretSantaDB(content, pid);
  db.debugLogAll();
  return db;
}
