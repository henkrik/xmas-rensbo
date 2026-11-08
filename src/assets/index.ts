import catSpriteUrl from '../../assets/sprites/cat.png';
import dogSpriteUrl from '../../assets/sprites/dog.png';
import santaSpriteUrl from '../../assets/sprites/santa.png';
import snowballSpriteUrl from '../../assets/sprites/snowball.png';
import throwerSpriteUrl from '../../assets/sprites/thrower.png';
import zKeySpriteUrl from '../../assets/sprites/z-key.png';
import basementTilesUrl from '../../assets/tiles/basement-tiles.png';
import upstairsTilesUrl from '../../assets/tiles/upstairs-tiles.png';
import winterTilesUrl from '../../assets/tiles/winter-tiles.png';

export interface GameAssets {
  santaSprite: HTMLImageElement;
  dogSprite: HTMLImageElement;
  catSprite: HTMLImageElement;
  throwerSprite: HTMLImageElement;
  snowballSprite: HTMLImageElement;
  zKeySprite: HTMLImageElement;
  winterTiles: HTMLImageElement;
  basementTiles: HTMLImageElement;
  upstairsTiles: HTMLImageElement;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (typeof img.decode === 'function') {
        img.decode().then(
          () => resolve(img),
          () => resolve(img)
        );
      } else {
        resolve(img);
      }
    };
    img.onload = finish;
    img.onerror = () => {
      if (settled) return;
      settled = true;
      reject(new Error(`Failed to load image: ${src}`));
    };
    img.src = src;
    if (img.complete && img.naturalWidth > 0) {
      finish();
    }
  });
}

export async function loadAllAssets(): Promise<GameAssets> {
  const [
    santaSprite,
    dogSprite,
    catSprite,
    throwerSprite,
    snowballSprite,
    zKeySprite,
    winterTiles,
    basementTiles,
    upstairsTiles,
  ] = await Promise.all([
    loadImage(santaSpriteUrl),
    loadImage(dogSpriteUrl),
    loadImage(catSpriteUrl),
    loadImage(throwerSpriteUrl),
    loadImage(snowballSpriteUrl),
    loadImage(zKeySpriteUrl),
    loadImage(winterTilesUrl),
    loadImage(basementTilesUrl),
    loadImage(upstairsTilesUrl),
  ]);
  return {
    santaSprite,
    dogSprite,
    catSprite,
    throwerSprite,
    snowballSprite,
    zKeySprite,
    winterTiles,
    basementTiles,
    upstairsTiles,
  };
}
