import os
from PIL import Image, ImageEnhance

PEOPLE = [
    'Albin',
    'Alex',
    'Anne-Marie',
    'Annelotte',
    'Diana',
    'Hanneloes',
    'Henrik',
    'Olexa',
    'Simon',
    'Sylvester',
    'Tanja',
    'Arjan',
]

def generate_portraits():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    inspiration_dir = os.path.join(root, 'inspiration')
    out_dir = os.path.join(root, 'assets', 'portraits')
    os.makedirs(out_dir, exist_ok=True)

    strip = Image.new('RGB', (len(PEOPLE) * 40, 40))

    for idx, name in enumerate(PEOPLE):
        # Find matching file in inspiration
        exts = ['.png', '.jpg', '.jpeg']
        found_path = None
        for ext in exts:
            p = os.path.join(inspiration_dir, f'{name}{ext}')
            if os.path.exists(p):
                found_path = p
                break
        if not found_path:
            raise FileNotFoundError(f'Could not find photo for {name} in {inspiration_dir}')

        im = Image.open(found_path)
        if im.mode == 'RGBA':
            bg = Image.new('RGB', im.size, (50, 55, 70))
            bg.paste(im, mask=im.split()[3])
            im = bg
        else:
            im = im.convert('RGB')

        w, h = im.size
        min_dim = min(w, h)
        left = (w - min_dim) // 2
        top = (h - min_dim) // 2
        cropped = im.crop((left, top, left + min_dim, top + min_dim))

        resized = cropped.resize((40, 40), Image.Resampling.LANCZOS)
        enhancer = ImageEnhance.Color(resized)
        enhanced = enhancer.enhance(1.2)
        enhancer = ImageEnhance.Contrast(enhanced)
        enhanced = enhancer.enhance(1.15)

        snes_pixel = enhanced.convert(
            'P',
            palette=Image.Palette.ADAPTIVE,
            colors=28,
            dither=Image.Dither.FLOYDSTEINBERG
        ).convert('RGB')

        snes_pixel.save(os.path.join(out_dir, f'{name.lower()}.png'))
        strip.paste(snes_pixel, (idx * 40, 0))

    strip.save(os.path.join(out_dir, 'portraits-atlas.png'))
    print(f'Generated {len(PEOPLE)} SNES pixel art portraits in {out_dir}')

if __name__ == '__main__':
    generate_portraits()
