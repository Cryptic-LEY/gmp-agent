from pathlib import Path
from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PLAYER_ROOT = PROJECT_ROOT / "public" / "simulation" / "players"

ROLL_SHEETS = (
    ("knight-hero", 128, 96),
    ("sprite-hero", 200, 200),
)

FRAME_COUNT = 12
ROLL_FRAME_ORDER = (0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 3, 1)
ROLL_Y_OFFSETS = (0, 2, 4, 6, 7, 7, 6, 4, 3, 2, 1, 0)
ROLL_X_OFFSETS = (-10, -8, -5, -2, 0, 2, 5, 8, 10, 7, 3, 0)


def visible_bbox(frame: Image.Image) -> tuple[int, int, int, int]:
    alpha = frame.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 24 else 0).getbbox()
    if bbox is None:
        raise RuntimeError("Generated roll frame is empty")
    return bbox


def rebuild_roll_sheet(model: str, frame_width: int, frame_height: int) -> None:
    run_sheet = Image.open(PLAYER_ROOT / model / "run.png").convert("RGBA")
    run_frame_count = max(1, run_sheet.width // frame_width)
    output = Image.new("RGBA", (frame_width * FRAME_COUNT, frame_height), (0, 0, 0, 0))

    for index, source_index in enumerate(ROLL_FRAME_ORDER):
        source_index = source_index % run_frame_count
        pose = run_sheet.crop((source_index * frame_width, 0, (source_index + 1) * frame_width, frame_height))
        box = visible_bbox(pose)
        pose = pose.crop(box)

        x = index * frame_width + round((frame_width - pose.width) / 2) + ROLL_X_OFFSETS[index]
        y = frame_height - pose.height + ROLL_Y_OFFSETS[index]
        x = max(index * frame_width, min(index * frame_width + frame_width - pose.width, x))
        y = max(0, min(frame_height - pose.height, y))
        output.alpha_composite(pose, (x, y))

    output_path = PLAYER_ROOT / model / "roll-dodge.png"
    output.save(output_path, optimize=True)
    print(f"rebuilt {output_path.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    for spec in ROLL_SHEETS:
        rebuild_roll_sheet(*spec)
