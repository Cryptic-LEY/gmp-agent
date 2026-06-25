from pathlib import Path
from statistics import median

from PIL import Image, ImageFilter


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REFERENCE_PATH = PROJECT_ROOT / "scripts" / "assets" / "knight-roll-motion-reference-v2.png"
PLAYER_ROOT = PROJECT_ROOT / "public" / "simulation" / "players"

ROLL_SHEETS = (
    ("knight-hero", 0, 128, 96, 42),
    ("sprite-hero", 1, 200, 200, 55),
)

FRAME_COUNT = 12
STANDING_FRAME_INDICES = (10, 11)


def remove_green_screen(image: Image.Image) -> Image.Image:
    pixels = []
    for red, green, blue, alpha in image.convert("RGBA").getdata():
        green_dominance = green - max(red, blue)
        if green > 120 and green_dominance > 34:
            edge_alpha = max(0, min(255, 255 - (green_dominance - 34) * 5))
            green = min(green, max(red, blue) + 4)
            pixels.append((red, green, blue, min(alpha, edge_alpha)))
        else:
            pixels.append((red, min(green, max(red, blue) + 10), blue, alpha))

    result = Image.new("RGBA", image.size)
    result.putdata(pixels)
    alpha = result.getchannel("A").filter(ImageFilter.MedianFilter(3))
    result.putalpha(alpha)
    return result


def visible_bbox(frame: Image.Image) -> tuple[int, int, int, int]:
    alpha = frame.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 24 else 0).getbbox()
    if bbox is None:
        raise RuntimeError("Generated roll frame is empty")
    return bbox


def extract_reference_frame(reference: Image.Image, row: int, index: int) -> Image.Image:
    column_left = round(reference.width * index / FRAME_COUNT)
    column_right = round(reference.width * (index + 1) / FRAME_COUNT)
    row_top = round(reference.height * row / 2)
    row_bottom = round(reference.height * (row + 1) / 2)
    cell = reference.crop((column_left, row_top, column_right, row_bottom))
    transparent = remove_green_screen(cell)
    return transparent.crop(visible_bbox(transparent))


def rebuild_roll_sheet(
    model: str,
    row: int,
    frame_width: int,
    frame_height: int,
    standing_height: int,
) -> None:
    reference = Image.open(REFERENCE_PATH).convert("RGBA")
    output = Image.new("RGBA", (frame_width * FRAME_COUNT, frame_height), (0, 0, 0, 0))
    poses = [extract_reference_frame(reference, row, index) for index in range(FRAME_COUNT)]

    reference_standing_height = median(poses[index].height for index in STANDING_FRAME_INDICES)
    scale = standing_height / reference_standing_height
    fit_scale = min(
        (frame_width - 4) / max(pose.width for pose in poses),
        (frame_height - 2) / max(pose.height for pose in poses),
    )
    scale = min(scale, fit_scale)

    for index, pose in enumerate(poses):
        rendered_size = (
            max(1, round(pose.width * scale)),
            max(1, round(pose.height * scale)),
        )
        pose = pose.resize(rendered_size, Image.Resampling.NEAREST)

        x = index * frame_width + round((frame_width - pose.width) / 2)
        y = frame_height - pose.height
        output.alpha_composite(pose, (x, y))

    output_path = PLAYER_ROOT / model / "roll-v4.png"
    output.save(output_path, optimize=True)
    print(f"rebuilt {output_path.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    for spec in ROLL_SHEETS:
        rebuild_roll_sheet(*spec)
