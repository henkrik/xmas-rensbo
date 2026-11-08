import { Player, Rect, rectsIntersect } from '../entities/player';
import { isRectCollidingWithMap, TileMap } from '../world/tilemap';

export interface Point2D {
  x: number;
  y: number;
}

export type DetectionCallback = (player: Player) => void;

/**
 * A line of sight that spawns bounding boxes (4x4 pixels) along a line
 * starting from `position` in `direction` for `distance` pixels.
 *
 * For each i in 0..9:
 *   p[i] = position + (distanceVector / 10) * i;
 *
 * We collision detection check on every i against the map/walls:
 * only spawn the (i + 1)-th bounding box if the i-th bounding box did not collide with a wall.
 */
export class LineOfSight {
  public position: Point2D;
  public direction: number;
  public distance: number;
  public map?: TileMap;
  public boxes: Rect[] = [];
  private callbacks: DetectionCallback[] = [];

  constructor(
    position: Point2D,
    direction: number,
    distance: number,
    map?: TileMap
  ) {
    this.position = { ...position };
    this.direction = direction;
    this.distance = distance;
    this.map = map;
    this.recomputeBoxes();
  }

  /**
   * Number of bounding boxes that were spawned (getter `n`).
   */
  public get n(): number {
    return this.boxes.length;
  }

  /**
   * Returns the point (center of the box) of the i-th box.
   */
  public points(i: number): Point2D {
    if (i < 0 || i >= this.boxes.length) {
      return { ...this.position };
    }
    const b = this.boxes[i];
    return {
      x: b.x + b.width / 2,
      y: b.y + b.height / 2,
    };
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
      const box: Rect = {
        x: px,
        y: py,
        width: 4,
        height: 4,
      };

      this.boxes.push(box);

      // Check collision with wall for this box
      // "We must only spawn the i + 1 bounding box if the i-th bounding box did not collide with a wall."
      if (
        this.map &&
        isRectCollidingWithMap(this.map, box.x, box.y, box.width, box.height)
      ) {
        break;
      }
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
 * A cone of sight that spawns five LineOfSight instances:
 * - direction - fieldOfView / 2
 * - direction - fieldOfView / 4
 * - direction (forward)
 * - direction + fieldOfView / 4
 * - direction + fieldOfView / 2
 *
 * It also computes the "sight polygon" formed by [position, ...line.points(line.n - 1) for each line].
 */
export class ConeOfSight {
  public position: Point2D;
  public direction: number;
  public distance: number;
  public fieldOfView: number;
  public map?: TileMap;
  public lines: LineOfSight[] = [];
  public sightPolygon: Point2D[] = [];
  private callbacks: DetectionCallback[] = [];

  constructor(
    position: Point2D,
    direction: number,
    distance: number,
    fieldOfView: number = (45 * Math.PI) / 180,
    map?: TileMap
  ) {
    this.position = { ...position };
    this.direction = direction;
    this.distance = distance;
    this.fieldOfView = fieldOfView;
    this.map = map;
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
    const angles = [
      this.direction - this.fieldOfView / 2,
      this.direction - this.fieldOfView / 4,
      this.direction,
      this.direction + this.fieldOfView / 4,
      this.direction + this.fieldOfView / 2,
    ];

    this.lines = angles.map(
      (ang) => new LineOfSight(this.position, ang, this.distance, this.map)
    );

    // Compute sight polygon:
    // First vertex is position, followed by the tip points(line.n - 1) of the 5 lines of sight
    this.sightPolygon = [
      { ...this.position },
      ...this.lines.map((line) => line.points(line.n - 1)),
    ];
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
