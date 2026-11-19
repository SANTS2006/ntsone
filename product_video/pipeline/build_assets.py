"""Builds the non-screen assets of a video from its script JSON: narration audio (local Windows voice),
title cards from the brand logo, subtitles (SRT) and a title-card video per scene. Usage: python build_assets.py video1_overview"""
import json, subprocess, sys, wave, textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent
LOGO = ROOT.parent.parent / "docs" / "brand" / "ntsone-logo.png"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
W, H = 1920, 1080


def font(size, bold=True):
    return ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf", size)


def gradient():
    img = Image.new("RGB", (W, H))
    px = img.load()
    a, b = (29, 78, 216), (14, 165, 233)
    for y in range(H):
        for x in range(0, W):
            t = (x / W * 0.6 + y / H * 0.4)
            px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
    return img


def card(text, path, with_logo=False):
    img = gradient()
    d = ImageDraw.Draw(img)
    y = 380
    if with_logo and LOGO.exists():
        logo = Image.open(LOGO).convert("RGBA")
        logo.thumbnail((520, 320))
        img.paste(logo, ((W - logo.width) // 2, 200), logo)
        y = 560
    title, _, sub = text.partition("|")
    lines = textwrap.wrap(title, 28) if not with_logo else [title]
    f = font(88 if not with_logo else 96)
    for line in lines:
        w = d.textlength(line, font=f)
        d.text(((W - w) / 2, y), line, font=f, fill="white")
        y += 110
    if sub:
        f2 = font(48, bold=False)
        w = d.textlength(sub, font=f2)
        d.text(((W - w) / 2, y + 20), sub, font=f2, fill=(224, 242, 254))
    img.save(path)


def speak(text, wav):
    script = (
        "Add-Type -AssemblyName System.Speech;"
        "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer;"
        "$s.SelectVoice('Microsoft Zira Desktop');$s.Rate=0;"
        f"$s.SetOutputToWaveFile('{wav}');$s.Speak([Console]::In.ReadToEnd());$s.Dispose()"
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", script], input=text.encode("utf-8"), check=True)


def duration(wav):
    with wave.open(str(wav)) as w:
        return w.getnframes() / w.getframerate()


def stamp(t):
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02}:{int(m):02}:{int(s):02},{int((s % 1) * 1000):03}"


def main(name):
    script = json.loads((ROOT / "scripts" / f"{name}.json").read_text(encoding="utf-8"))
    out = ROOT / "out" / name
    out.mkdir(parents=True, exist_ok=True)
    srt, clock, clips = [], 0.0, []
    for i, scene in enumerate(script["scenes"], 1):
        wav, png, mp4 = out / f"{scene['id']}.wav", out / f"{scene['id']}.png", out / f"{scene['id']}.mp4"
        speak(scene["text"], wav.resolve())
        card(scene["card"], png, with_logo=scene["id"] in ("intro", "outro"))
        dur = duration(wav) + 0.6
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-loop", "1", "-i", str(png), "-i", str(wav), "-t", f"{dur:.2f}",
                        "-vf", f"fade=t=in:d=0.4,fade=t=out:st={dur - 0.4:.2f}:d=0.4,format=yuv420p", "-r", "30",
                        "-c:v", "libx264", "-c:a", "aac", "-shortest", str(mp4)], check=True)
        srt.append(f"{i}\n{stamp(clock + 0.2)} --> {stamp(clock + dur - 0.3)}\n{textwrap.fill(scene['text'], 60)}\n")
        clock += dur
        clips.append(mp4)
    (out / f"{name}.srt").write_text("\n".join(srt), encoding="utf-8")
    print("scenes", len(clips), "seconds", round(clock, 1))


if __name__ == "__main__":
    main(sys.argv[1])
