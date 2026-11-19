"""Joins title cards and real screen recordings with the narration into one video, with a section title on each screen
scene and burned-in subtitles. Usage: python assemble.py video1_overview"""
import json, subprocess, sys, shutil
from pathlib import Path
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
FONT = "C\\:/Windows/Fonts/arialbd.ttf"


def run(*args):
    r = subprocess.run([FFMPEG, "-y", "-loglevel", "error", *map(str, args)], capture_output=True, text=True)
    if r.returncode:
        print(r.stderr)
        raise SystemExit(1)


def main(name):
    script = json.loads((ROOT / "scripts" / f"{name}.json").read_text(encoding="utf-8"))
    out = ROOT / "out" / name
    parts = []
    for scene in script["scenes"]:
        sid = scene["id"]
        screen = out / f"{sid}.screen.mp4"
        wav = out / f"{sid}.wav"
        if screen.exists():
            title = scene["card"].split("|")[0].replace("'", "").replace(":", " -")
            final = out / f"{sid}.final.mp4"
            vf = (
                f"drawbox=x=0:y=0:w=iw:h=120:color=0x1d4ed8@0.92:t=fill:enable='lt(t,3.5)',"
                f"drawtext=fontfile='{FONT}':text='{title}':fontcolor=white:fontsize=56:x=60:y=32:enable='lt(t,3.5)',"
                "fade=t=in:d=0.4,format=yuv420p"
            )
            run("-i", screen, "-i", wav, "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-af", "apad=pad_dur=0.6", "-c:a", "aac", "-b:a", "160k", "-shortest", final)
            parts.append(final)
        else:
            parts.append(out / f"{sid}.mp4")
    listing = out / "concat.txt"
    listing.write_text("\n".join(f"file '{p.as_posix()}'" for p in parts), encoding="utf-8")
    joined = out / f"{name}.nosubs.mp4"
    run("-f", "concat", "-safe", "0", "-i", listing, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "160k", joined)
    srt = out / f"{name}.srt"
    final = out / f"{name}.mp4"
    style = "FontName=Arial,Bold=1,FontSize=11,Outline=1,Shadow=0,MarginV=14,PrimaryColour=&HFFFFFF&,OutlineColour=&H00000000&,BackColour=&HB0000000&,BorderStyle=3"
    sub = str(srt).replace("\\", "/").replace(":", "\\:")
    r = subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", joined, "-vf", f"subtitles='{sub}':force_style='{style}'", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "copy", final], capture_output=True, text=True)
    if r.returncode:
        print("burned-in subtitles unavailable, adding a subtitle track instead:", r.stderr[:200])
        run("-i", joined, "-i", srt, "-c", "copy", "-c:s", "mov_text", final)
    print("wrote", final)
    # Vertical 9:16 cut for social media: the screen sits on a blurred copy of itself, subtitles larger.
    vertical = out / f"{name}_9x16.mp4"
    vstyle = "FontName=Arial,Bold=1,FontSize=8,Outline=1,Shadow=0,MarginV=80,Alignment=2,PrimaryColour=&HFFFFFF&,OutlineColour=&H00000000&,BackColour=&HB0000000&,BorderStyle=3"
    fc = ("[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:5[bg];"
          "[b]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2," + f"subtitles='{sub}':force_style='{vstyle}'[v]")
    r = subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", joined, "-filter_complex", fc, "-map", "[v]", "-map", "0:a", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "copy", vertical], capture_output=True, text=True)
    print("wrote", vertical) if r.returncode == 0 else print("vertical failed:", r.stderr[:300])


if __name__ == "__main__":
    main(sys.argv[1])
