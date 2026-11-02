"""Render original-size review overlays after timing. Never writes to source images."""
import argparse
import html
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


def main(args):
    cases = json.loads((args.study_run / "cases.json").read_text())
    results = {}
    for raw in args.results.read_text().splitlines():
        row = json.loads(raw)
        results[row["sha256"]] = row["result"]
    args.output.mkdir(parents=True, exist_ok=False)
    tiles = []
    links = []
    for index, case in enumerate(cases):
        image = case["image"]
        source = Path(image["path"])
        with Image.open(source) as opened:
            frame = ImageOps.exif_transpose(opened).convert("RGB")
        result = results[image["sha256"]]
        draw = ImageDraw.Draw(frame)
        if result["kind"] == "candidate":
            size = result["cellSize"]
            x = result["offsetX"]
            while x < frame.width:
                draw.line((x, 0, x, frame.height-1), fill="#ffce53", width=2); x += size
            y = result["offsetY"]
            while y < frame.height:
                draw.line((0, y, frame.width-1, y), fill="#ffce53", width=2); y += size
        full_name = f"{index+1:02d}-grid.jpg"
        frame.save(args.output/full_name, quality=93)
        cx, cy = frame.width//2, frame.height//2
        crop = frame.crop((max(0,cx-256), max(0,cy-256), min(frame.width,cx+256), min(frame.height,cy+256)))
        crop_name = f"{index+1:02d}-native.png"; crop.save(args.output/crop_name)
        thumb = ImageOps.contain(frame, (400,260))
        tile = Image.new("RGB", (420,310), "#f4f0e6"); tile.paste(thumb, ((420-thumb.width)//2, 4))
        label = f"{index+1:02d} {source.name[:45]}"
        td = ImageDraw.Draw(tile); td.text((10,270), label, fill="#171717")
        td.text((10,288), f"{result.get('cellSize',0):.6f} px estimate" if result["kind"] == "candidate" else "No grid", fill="#171717")
        tiles.append(tile)
        links.append(f'<li><a href="{full_name}">{html.escape(source.name)}</a> · <a href="{crop_name}">native center</a></li>')
    overview = Image.new("RGB", (420*3,310*9), "#ddd8ca")
    for index, tile in enumerate(tiles): overview.paste(tile, ((index%3)*420,(index//3)*310))
    overview.save(args.output/"overview.jpg", quality=93)
    (args.output/"index.html").write_text('<!doctype html><meta charset="utf-8"><title>Grid estimate review</title><h1>Unchanged reviewed estimates</h1><p>Rendered outside timing. Estimates require manual checking; this is not an accuracy evaluation.</p><ol>'+''.join(links)+'</ol><img src="overview.jpg" style="max-width:100%">')


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--study-run", required=True, type=Path)
    parser.add_argument("--results", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    main(parser.parse_args())
