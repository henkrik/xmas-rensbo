import { Player, Rect, rectsIntersect } from '../entities/player';

export interface Point2D {
  x: number;
  y: number;
}

export type DetectionCallback = (player: Player) => void;

/**
 * A line of sight that spawns 10 bounding boxes (4x4 pixels) along a line
 * starting from `position` in `direction` for `distance` pixels.
 *
 * For each i in 0..9:
 *   p[i] = position + (distanceVector / 10) * i;
 */
export class LineOfSight {
  public position: Point2D;
  public direction: number; // in radians or degrees? We support radians, but can handle angle
  public distance: number;
  public boxes: Rect[] = [];
  private callbacks: DetectionCallback[] = [];

  constructor(position: Point2D, direction: number, distance: number) {
    this.position = { ...position };
    this.direction = direction;
    this.distance = distance;
    this.recomputeBoxes();
  }

  public onDetection(cb: DetectionCallback): () => void {
    this.callbacks.push(cb);
    return () => {
      const idx = this.callbacks.indexOf(cb);
      if (idx !== -1) {
        this.callbacks.splice(idx, 1);
      }
    };
  }

  public recomputeBoxes(): void {
    this.boxes = [];
    const dirX = Math.cos(this.direction);
    const dirY = Math.sin(this.direction);
    const distanceVector = {
      x: dirX * this.distance,
      y: dirY * this.distance,
    };

    for (let i = 0; i < 10; i++) {
      const px = this.position.x + (distanceVector.x / 10) * i;
      const py = this.position.y + (distanceVector.y / 10) * i;
      this.boxes.push({
        x: px,
        y: py,
        width: 4,
        height: 4,
      });
    }
  }

  public checkDetection(player: Player): boolean {
    for (const box of this.boxes) {
      if (rectsIntersect(player, box)) {
        for (const cb of this.callbacks) {
          cb(player);
        }
        return true;
      }
    }
    return false;
  }
}

/**
 * A cone of sight that spawns three LineOfSight instances:
 * - Forward direction: direction
 * - Right/plus direction: direction + fieldOfView / 2
 * - Left/minus direction: direction - fieldOfView / 2
 */
export class ConeOfSight {
  public position: Point2D;
  public direction: number;
  public distance: number;
  public fieldOfView: number;
  public lines: LineOfSight[] = [];
  private callbacks: DetectionCallback[] = [];

  constructor(
    position: Point2D,
    direction: number,
    distance: number,
    fieldOfView: number = (45 * Math.PI) / 180
  ) {
    this.position = { ...position };
    this.direction = direction;
    this.distance = distance;
    this.fieldOfView = fieldOfView;
    this.recomputeLines();
  }

  public onDetection(cb: DetectionCallback): () => void {
    this.callbacks.push(cb);
    return () => {
      const idx = this.callbacks.indexOf(cb);
      if (idx !== -1) {
        this.callbacks.splice(idx, 1);
      }
    };
  }

  public recomputeLines(): void {
    const forwardLine = new LineOfSight(
      this.position,
      this.direction,
      this.distance
    );
    const plusLine = new LineOfSight(
      this.position,
      this.direction + this.fieldOfView / 2,
      this.distance
    );
    const minusLine = new LineOfSight(
      this.position,
      this.direction - this.fieldOfView / 2,
      this.distance
    );

    this.lines = [forwardLine, plusLine, minusLine];

    for (const line of this.lines) {
      line.onDetection((_player) => {
        // notify cone callbacks (checkDetection handles de-duplication)
      });
    }
  }

  public getAllBoxes(): Rect[] {
    const all: Rect[] = [];
    for (const line of this.lines) {
      all.push(...line.boxes);
    }
    return all;
  }

  public checkDetection(player: Player): boolean {
    let detected = false;
    for (const line of this.lines) {
      if (line.checkDetection(player)) {
        detected = true;
      }
    }
    if (detected) {
      for (const cb of this.callbacks) {
        cb(player);
      }
    }
    return detected;
  }
}
