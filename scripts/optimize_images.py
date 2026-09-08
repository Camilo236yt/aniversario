from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "optimized"


def save_webp(source: Path, target: Path, max_size: tuple[int, int], quality: int = 84) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as original:
        image = ImageOps.exif_transpose(original)
        image.thumbnail(max_size, Image.Resampling.LANCZOS)
        image.save(target, "WEBP", quality=quality, method=6)


for source in sorted((ROOT / "x-meses").rglob("*")):
    if source.is_file() and source.suffix.lower() in {".png", ".jpg", ".jpeg"}:
        relative = source.relative_to(ROOT / "x-meses").with_suffix(".webp")
        save_webp(source, OUT / relative, (640, 800))

save_webp(ROOT / "fondo" / "Copilot_20260310_012828.png", OUT / "fondo-principal.webp", (1920, 1920), 86)
save_webp(ROOT / "fondo" / "anillos-promesa-mes-7.png", OUT / "anillos-promesa-mes-7.webp", (1920, 1280), 86)
save_webp(ROOT / "fondo" / "anillos-promesa-mes-7-mobile.png", OUT / "anillos-promesa-mes-7-mobile.webp", (960, 1600), 86)
save_webp(ROOT / "anillo.png", OUT / "anillo.webp", (640, 800), 88)
