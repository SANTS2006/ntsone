"""Builds a tutorial video from step screenshots (steps.json + png files), narration (local voice), section titles,
a zoom toward each highlighted element, and burned-in subtitles. Usage: python build_steps_video.py video_registrations"""
import json, subprocess, sys
from pathlib import Path
import imageio_ffmpeg
from build_assets import card, speak, duration, stamp

ROOT = Path(__file__).resolve().parent
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
FONT = "C\\:/Windows/Fonts/arialbd.ttf"


def run(*args):
    r = subprocess.run([FFMPEG, "-y", "-loglevel", "error", *map(str, args)], capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-600:])
        raise SystemExit(1)


def main(name):
    script = json.loads((ROOT / "scripts" / f"{name}.json").read_text(encoding="utf-8"))
    out = ROOT / "out" / name
    out.mkdir(parents=True, exist_ok=True)
    steps_dir = ROOT / script["steps_dir"]
    focus = json.loads((steps_dir / "steps.json").read_text(encoding="utf-8"))["focus"] if (steps_dir / "steps.json").exists() else {}
    cache = {}

    def locate(step):
        """A step is "name" (this video's own steps) or "video_x/name" (a screenshot from another video)."""
        if "/" not in step:
            return steps_dir / f"{step}.png", focus.get(step, [0.5, 0.45])
        folder, name = step.split("/", 1)
        d = ROOT / "out" / folder / "steps"
        if folder not in cache:
            cache[folder] = json.loads((d / "steps.json").read_text(encoding="utf-8"))["focus"]
        return d / f"{name}.png", cache[folder].get(name, [0.5, 0.45])
    parts, srt, clock = [], [], 0.0
    for n, scene in enumerate(script["scenes"], 1):
        sid = scene["id"]
        wav = out / f"{sid}.wav"
        speak(scene["text"], wav.resolve())
        total = duration(wav) + 0.7
        final = out / f"{sid}.final.mp4"
        if "images" not in scene:
            png = out / f"{sid}.png"
            card(scene["card"], png, with_logo=scene.get("logo", False))
            run("-loop", "1", "-i", png, "-i", wav, "-t", f"{total:.2f}", "-af", "apad=pad_dur=0.7",
                "-vf", f"fade=t=in:d=0.4,fade=t=out:st={total - 0.4:.2f}:d=0.4,format=yuv420p", "-r", "30",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-shortest", final)
        else:
            weight = sum(w for _, w in scene["images"])
            clips = []
            for i, (step, w) in enumerate(scene["images"]):
                dur = total * w / weight
                frames = max(2, round(dur * 30))
                image, (fx, fy) = locate(step)
                zoom = f"1+0.10*on/{frames}"
                vf = (f"scale=3840:2160,zoompan=z='{zoom}':x='min(max(0,{fx}*iw-iw/zoom/2),iw-iw/zoom)':"
                      f"y='min(max(0,{fy}*ih-ih/zoom/2),ih-ih/zoom)':d={frames}:s=1920x1080:fps=30,"
                      f"drawbox=x=0:y=0:w=iw:h=110:color=0x1d4ed8@0.93:t=fill:enable='lt(t,3.2)*eq({i},0)',"
                      f"drawtext=fontfile='{FONT}':text='{scene['title'].replace(chr(39), '')}':fontcolor=white:fontsize=54:x=60:y=28:enable='lt(t,3.2)*eq({i},0)',"
                      "format=yuv420p")
                clip = out / f"{sid}_{i}.mp4"
                run("-loop", "1", "-framerate", "30", "-i", image, "-t", f"{dur:.2f}", "-vf", vf, "-r", "30",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", clip)
                clips.append(clip)
            lst = out / f"{sid}.txt"
            lst.write_text("\n".join(f"file '{c.as_posix()}'" for c in clips), encoding="utf-8")
            joined = out / f"{sid}.video.mp4"
            run("-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", joined)
            run("-i", joined, "-i", wav, "-af", "apad=pad_dur=0.7", "-vf", "fade=t=in:d=0.3,format=yuv420p", "-c:v", "libx264",
                "-preset", "veryfast", "-crf", "19", "-c:a", "aac", "-b:a", "160k", "-shortest", final)
        parts.append(final)
        import textwrap
        srt.append(f"{n}\n{stamp(clock + 0.2)} --> {stamp(clock + total - 0.4)}\n{textwrap.fill(scene['text'], 86)}\n")
        clock += total
        print("scene", sid, round(total, 1))
    (out / f"{name}.srt").write_text("\n".join(srt), encoding="utf-8")
    listing = out / "concat.txt"
    listing.write_text("\n".join(f"file '{p.as_posix()}'" for p in parts), encoding="utf-8")
    joined = out / f"{name}.nosubs.mp4"
    run("-f", "concat", "-safe", "0", "-i", listing, "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-c:a", "aac", "-b:a", "160k", joined)
    style = "FontName=Arial,Bold=1,FontSize=11,Outline=1,Shadow=0,MarginV=14,PrimaryColour=&HFFFFFF&,OutlineColour=&H00000000&,BackColour=&HB0000000&,BorderStyle=3"
    sub = str(out / f"{name}.srt").replace("\\", "/").replace(":", "\\:")
    final = out / f"{name}.mp4"
    run("-i", joined, "-vf", f"subtitles='{sub}':force_style='{style}'", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-c:a", "copy", final)
    print("wrote", final, "seconds", round(clock, 1))


if __name__ == "__main__":
    main(sys.argv[1])
