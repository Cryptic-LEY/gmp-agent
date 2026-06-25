from pathlib import Path

from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = PROJECT_ROOT / "public" / "simulation" / "players" / "black-knight"

SOURCE_FRAME_WIDTH = 128
SOURCE_FRAME_HEIGHT = 64
TARGET_FRAME_WIDTH = 240
TARGET_FRAME_HEIGHT = 128
GROUND_Y = 124

SHEETS = {
    "idle": 6,
    "run": 12,
    "jump": 6,
    "roll": 12,
    "crouch": 4,
    "attack": 20,
    "heavy-attack": 20,
    "hurt": 6,
    "death": 8,
}


def frame_bbox(frame: Image.Image) -> tuple[int, int, int, int]:
    bbox = frame.getchannel("A").point(lambda value: 255 if value > 20 else 0).getbbox()
    if bbox is None:
        raise RuntimeError("Black knight source frame is empty")
    return bbox


def collect_frames() -> dict[str, list[tuple[Image.Image, tuple[int, int, int, int]]]]:
    frames_by_sheet = {}
    for name, count in SHEETS.items():
        source = Image.open(SOURCE_DIR / f"{name}.png").convert("RGBA")
        frames = []
        for index in range(count):
            left = index * SOURCE_FRAME_WIDTH
            frame = source.crop((left, 0, left + SOURCE_FRAME_WIDTH, SOURCE_FRAME_HEIGHT))
            frames.append((frame, frame_bbox(frame)))
        frames_by_sheet[name] = frames
    return frames_by_sheet


def normalize() -> None:
    frames_by_sheet = collect_frames()
    all_boxes = [box for frames in frames_by_sheet.values() for _, box in frames]
    idle_heights = [box[3] - box[1] for _, box in frames_by_sheet["idle"]]
    target_scale = 78 / (sum(idle_heights) / len(idle_heights))
    fit_scale = min(
        (TARGET_FRAME_WIDTH - 20) / max(box[2] - box[0] for box in all_boxes),
        (TARGET_FRAME_HEIGHT - 8) / max(box[3] - box[1] for box in all_boxes),
    )
    scale = min(target_scale, fit_scale)

    for name, frames in frames_by_sheet.items():
        output = Image.new("RGBA", (TARGET_FRAME_WIDTH * len(frames), TARGET_FRAME_HEIGHT), (0, 0, 0, 0))
        for index, (frame, box) in enumerate(frames):
            pose = frame.crop(box)
            pose = pose.resize(
                (max(1, round(pose.width * scale)), max(1, round(pose.height * scale))),
                Image.Resampling.NEAREST,
            )
            source_center = ((box[0] + box[2]) / 2) - SOURCE_FRAME_WIDTH / 2
            x = round(index * TARGET_FRAME_WIDTH + TARGET_FRAME_WIDTH / 2 + source_center * scale - pose.width / 2)
            x = max(index * TARGET_FRAME_WIDTH + 2, min(index * TARGET_FRAME_WIDTH + TARGET_FRAME_WIDTH - pose.width - 2, x))
            bottom_gap = SOURCE_FRAME_HEIGHT - box[3]
            y = round(GROUND_Y - pose.height - bottom_gap * scale)
            y = max(0, min(TARGET_FRAME_HEIGHT - pose.height, y))
            output.alpha_composite(pose, (x, y))

        target = SOURCE_DIR / f"{name}-v2.png"
        output.save(target, optimize=True)
        print(f"created {target.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    normalize()
