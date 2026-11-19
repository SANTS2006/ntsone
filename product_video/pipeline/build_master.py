"""Joins the finished tutorial videos into one master training video and writes a chapter list (for YouTube) and a combined SRT."""
import re, subprocess
from pathlib import Path
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent.parent
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
ORDER = [
    ("Product overview", ROOT / "master_product_tutorial/NTSOne_01_Product_Overview_1080p.mp4", ROOT / "subtitles/NTSOne_01_Product_Overview.srt"),
    ("Getting started", ROOT / "feature_tutorials/NTSOne_02_Getting_started_1080p.mp4", ROOT / "subtitles/NTSOne_02_Getting_started.srt"),
    ("Registrations, ID cards and tickets", ROOT / "feature_tutorials/NTSOne_03_Registrations_ID_cards_tickets_1080p.mp4", ROOT / "subtitles/NTSOne_03_Registrations_ID_cards_tickets.srt"),
    ("Voting polls", ROOT / "feature_tutorials/NTSOne_04_Voting_polls_1080p.mp4", ROOT / "subtitles/NTSOne_04_Voting_polls.srt"),
    ("Businesses, orders and invoices", ROOT / "feature_tutorials/NTSOne_05_Businesses_orders_invoices_1080p.mp4", ROOT / "subtitles/NTSOne_05_Businesses_orders_invoices.srt"),
    ("Payments, the payment fund and withdrawals", ROOT / "feature_tutorials/NTSOne_06_Payments_fund_withdrawals_1080p.mp4", ROOT / "subtitles/NTSOne_06_Payments_fund_withdrawals.srt"),
    ("Bookkeeping", ROOT / "feature_tutorials/NTSOne_07_Bookkeeping_1080p.mp4", ROOT / "subtitles/NTSOne_07_Bookkeeping.srt"),
    ("Contributions and wish lists", ROOT / "feature_tutorials/NTSOne_10_Contributions_wish_lists_1080p.mp4", ROOT / "subtitles/NTSOne_10_Contributions_wish_lists.srt"),
    ("Your team and account security", ROOT / "feature_tutorials/NTSOne_08_Team_and_security_1080p.mp4", ROOT / "subtitles/NTSOne_08_Team_and_security.srt"),
    ("The platform team", ROOT / "feature_tutorials/NTSOne_09_Platform_team_1080p.mp4", ROOT / "subtitles/NTSOne_09_Platform_team.srt"),
]


def duration(path):
    r = subprocess.run([FFMPEG, "-i", str(path)], capture_output=True, text=True)
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def stamp(t):
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02}:{int(m):02}:{int(s):02},{int(round((s % 1) * 1000)):03}"


def parse(t):
    h, m, rest = t.split(":")
    s, ms = rest.split(",")
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000


out = ROOT / "master_product_tutorial"
work = ROOT / "pipeline/out/master"
work.mkdir(parents=True, exist_ok=True)
listing = work / "concat.txt"
listing.write_text("\n".join(f"file '{p.as_posix()}'" for _, p, _ in ORDER), encoding="utf-8")
master = out / "NTSOne_Master_Training_Video_1080p.mp4"
r = subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listing), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                    "-c:a", "aac", "-b:a", "128k", "-r", "30", "-pix_fmt", "yuv420p", str(master)], capture_output=True, text=True)
if r.returncode:
    raise SystemExit(r.stderr[-800:])

clock, chapters, cues = 0.0, [], []
for title, video, srt in ORDER:
    chapters.append(f"{int(clock // 60):02}:{int(clock % 60):02} {title}")
    for block in srt.read_text(encoding="utf-8").strip().split("\n\n"):
        lines = block.split("\n")
        a, b = lines[1].split(" --> ")
        cues.append((parse(a) + clock, parse(b) + clock, "\n".join(lines[2:])))
    clock += duration(video)
(ROOT / "subtitles/NTSOne_Master_Training_Video.srt").write_text(
    "\n".join(f"{i}\n{stamp(a)} --> {stamp(b)}\n{t}\n" for i, (a, b, t) in enumerate(cues, 1)), encoding="utf-8")
(out / "NTSOne_Master_Training_Video_chapters.txt").write_text("\n".join(chapters) + "\n", encoding="utf-8")
print("master", round(clock / 60, 1), "min;", "\n".join(chapters))
