import dogSpriteUrl from '../../assets/sprites/dog.png';
import santaSpriteUrl from '../../assets/sprites/santa.png';
import snowballSpriteUrl from '../../assets/sprites/snowball.png';
import throwerSpriteUrl from '../../assets/sprites/thrower.png';
import zKeySpriteUrl from '../../assets/sprites/z-key.png';
import winterTilesUrl from '../../assets/tiles/winter-tiles.png';

export interface GameAssets {
  santaSprite: HTMLImageElement;
  dogSprite: HTMLImageElement;
  throwerSprite: HTMLImageElement;
  snowballSprite: HTMLImageElement;
  zKeySprite: HTMLImageElement;
  winterTiles: HTMLImageElement;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

export async function loadAllAssets(): Promise<GameAssets> {
  const [
    santaSprite,
    dogSprite,
    throwerSprite,
    snowballSprite,
    zKeySprite,
    winterTiles,
  ] = await Promise.all([
    loadImage(santaSpriteUrl),
    loadImage(dogSpriteUrl),
    loadImage(throwerSpriteUrl),
    loadImage(snowballSpriteUrl),
    loadImage(zKeySpriteUrl),
    loadImage(winterTilesUrl),
  ]);
  return {
    santaSprite,
    dogSprite,
    throwerSprite,
    snowballSprite,
    zKeySprite,
    winterTiles,
  };
}
