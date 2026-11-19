"""Writes the promo and role-guide scripts, builds each video (16:9) with build_steps_video, and makes a 9:16 vertical version of the promos."""
import json, subprocess, sys
from pathlib import Path
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
LOGO = "NTSOne|One platform. Endless possibilities."


def scene(sid, text, images, title):
    return {"id": sid, "title": title, "images": images, "text": text}


PROMOS = {
    "promo_main": ("Main promo", [
        {"id": "intro", "card": LOGO, "logo": True, "text": "NTSOne. One platform for everything you run."},
        scene("a", "Build registration forms, share a link or a QR code, and manage every registration.", [["video_registrations/form_open", 1], ["video_registrations/public_filled", 1]], "Registrations"),
        scene("b", "Run secret ballot elections with live results.", [["video_voting/vote_selected", 1], ["video_voting/results", 1]], "Voting polls"),
        scene("c", "Put your business online, take orders, and send invoices.", [["video_business/store_products", 1], ["video_business/invoice_form", 1]], "Orders and invoices"),
        scene("d", "Accept mobile money and follow every payment and withdrawal.", [["video_payments/fund_top", 1.2], ["video_payments/fund_ledger", 1]], "Payments"),
        scene("e", "Keep your books, track contributions, and plan with wish lists.", [["video_books/books_home", 1], ["video_groups/c_tracker", 1]], "Bookkeeping and more"),
        {"id": "outro", "card": LOGO, "logo": True, "text": "NTSOne. One platform. Endless possibilities."},
    ]),
    "promo_registrations": ("Registrations promo", [
        scene("a", "Create a registration form in minutes. Drag and drop questions, add rules, and preview it on any screen.", [["video_registrations/form_open", 1], ["video_registrations/field_more", 1]], "Registrations"),
        scene("b", "Share a link or a QR code. Registrants see mistakes right under each question.", [["video_registrations/public_errors", 1], ["video_registrations/public_filled", 1]], "Easy for registrants"),
        scene("c", "Then search, filter, approve and export every registration.", [["video_registrations/regs_list", 1], ["video_registrations/status_done", 1]], "Easy for you"),
        {"id": "outro", "card": LOGO, "logo": True, "text": "NTSOne. Registrations made simple."},
    ]),
    "promo_voting": ("Voting promo", [
        scene("a", "Run an election in minutes. Add positions and candidates, then open voting.", [["video_voting/ballot_filled", 1], ["video_voting/open_voting", 1]], "Voting polls"),
        scene("b", "Voters choose a candidate and the ballot stays secret. Results update live.", [["video_voting/vote_selected", 1], ["video_voting/vote_done", 1]], "Secret and live"),
        scene("c", "Ask voters to sign up, or let anyone with the link vote.", [["video_voting/create_dialog", 1]], "Your choice"),
        {"id": "outro", "card": LOGO, "logo": True, "text": "NTSOne. Voting made simple."},
    ]),
    "promo_business": ("Business promo", [
        scene("a", "Give your business its own online order page.", [["video_business/store_open", 1], ["video_business/store_products", 1]], "Your shop online"),
        scene("b", "Customers order in a few taps, and you manage every order in one place.", [["video_business/store_checkout", 1], ["video_business/order_detail", 1]], "Orders"),
        scene("c", "Create invoices, receipts and quotations in minutes.", [["video_business/invoice_form", 1]], "Documents"),
        {"id": "outro", "card": LOGO, "logo": True, "text": "NTSOne. Your business, online."},
    ]),
    "promo_payments": ("Payments promo", [
        scene("a", "Accept mobile money for registrations, orders and votes.", [["video_payments/pay_fee", 1], ["video_payments/prog_payments", 1]], "Payments"),
        scene("b", "Follow your money in the payment fund, and withdraw to your own account.", [["video_payments/fund_top", 1], ["video_payments/fund_ledger", 1]], "Payment fund"),
        scene("c", "Turn on automatic withdrawal to be paid straight away.", [["video_payments/fund_auto", 1]], "Automatic withdrawal"),
        {"id": "outro", "card": LOGO, "logo": True, "text": "NTSOne. Get paid, simply."},
    ]),
    "promo_books": ("Bookkeeping promo", [
        scene("a", "Write down sales and spending with big, simple buttons.", [["video_books/entry_dialog", 1], ["video_books/books_summary", 1]], "Bookkeeping"),
        scene("b", "See your profit, your loans, and who owes you.", [["video_books/reports", 1], ["video_books/reports_owe", 1]], "Reports"),
        {"id": "outro", "card": LOGO, "logo": True, "text": "NTSOne. Know your numbers."},
    ]),
    "promo_groups": ("Contributions and wish lists promo", [
        scene("a", "Track monthly contributions and see at a glance who has paid.", [["video_groups/c_tracker", 1]], "Contributions"),
        scene("b", "Plan what you want with wish lists, and share them with family and friends.", [["video_groups/w_items", 1], ["video_groups/w_gotten", 1]], "Wish lists"),
        {"id": "outro", "card": LOGO, "logo": True, "text": "NTSOne. Plan together."},
    ]),
}

ROLES = {
    "role_admin": ("Guide for organization admins", [
        {"id": "intro", "card": "Organization admins|What you can do", "logo": True, "text": "This guide is for organization admins. You own your organization's workspace."},
        scene("a", "You see and manage everything: programs, voting polls, businesses, wish lists and contributions.", [["video_started/dash_top", 1], ["video_started/dash_sidebar", 1]], "Everything in your workspace"),
        scene("b", "You manage your team, giving each person access to the items they need, as a viewer or a program admin.", [["video_team/users_list", 1], ["video_team/access_dialog", 1]], "Your team"),
        scene("c", "You are the only one who manages the payment fund, withdrawals and refunds, and agrees to the platform fee.", [["video_payments/pay_fee", 1], ["video_payments/fund_top", 1]], "Money"),
        {"id": "outro", "card": LOGO, "logo": True, "text": "NTSOne. One platform. Endless possibilities."},
    ]),
    "role_program_admin": ("Guide for program admins", [
        {"id": "intro", "card": "Program admins and viewers|What you can do", "logo": True, "text": "This guide is for team members who were given access to programs, polls or businesses."},
        scene("a", "A program admin can manage only the items they were given. A viewer can only look at them.", [["video_team/access_dialog", 1], ["video_team/viewer_programs", 1]], "Access to what you were given"),
        scene("b", "A program admin cannot agree to the platform fee or make refunds. Those belong to an organization admin.", [["video_team/role_menu", 1]], "What stays with admins"),
        scene("c", "You can start a space of your own, where you are the admin, without losing the access you were invited to, and you can leave an organization at any time.", [["video_team/viewer_dashboard", 1], ["video_team/leave_org", 1]], "Your own space"),
        {"id": "outro", "card": LOGO, "logo": True, "text": "NTSOne. One platform. Endless possibilities."},
    ]),
    "role_voter": ("Guide for voters", [
        {"id": "intro", "card": "Voters|How to vote", "logo": True, "text": "This guide is for voters. You open the voting link you were given."},
        scene("a", "If the poll asks for an account, you sign in or create one. Some polls let anyone with the link vote straight away.", [["video_voting/account_login", 1]], "Sign in, if asked"),
        scene("b", "Choose one candidate for each position and press Vote. Your vote is secret.", [["video_voting/vote_open", 1], ["video_voting/vote_selected", 1]], "Choose and vote"),
        scene("c", "You are thanked straight away, and if the organizer allows it, you can watch the live results.", [["video_voting/vote_done", 1]], "Done"),
        {"id": "outro", "card": LOGO, "logo": True, "text": "NTSOne. Secure voting."},
    ]),
    "role_registrant": ("Guide for registrants and customers", [
        {"id": "intro", "card": "Registrants and customers|No account needed", "logo": True, "text": "This guide is for people who register for a program or order from a business. You do not need an account."},
        scene("a", "Open the link or scan the QR code, and fill in the form. If an answer is missing or wrong, the problem is shown right under that question.", [["video_registrations/public_errors", 1], ["video_registrations/public_filled", 1]], "Registering"),
        scene("b", "When you order, add items to your cart, check the total, and confirm your order.", [["video_business/store_cart", 1], ["video_business/store_review", 1]], "Ordering"),
        scene("c", "You then get a registration or order number, and a copy you can preview, print or download.", [["video_registrations/public_done", 1], ["video_business/store_done", 1]], "Your confirmation"),
        {"id": "outro", "card": LOGO, "logo": True, "text": "NTSOne. One platform. Endless possibilities."},
    ]),
    "role_super_admin": ("Guide for the platform team", [
        {"id": "intro", "card": "The platform team|What you can do", "logo": True, "text": "This guide is for the platform team, the super admins."},
        scene("a", "You see every organization, its users and programs, and set its payment terms.", [["video_platform/tenants_list", 1], ["video_platform/tenant_terms", 1]], "All organizations"),
        scene("b", "You approve large withdrawals and refunds, see what every organization has been paid, and look after the platform fund.", [["video_platform/payments_summary", 1], ["video_platform/platform_fund", 1]], "Money"),
        scene("c", "You read the inbox, switch maintenance mode on when needed, check backups, and review the audit log.", [["video_platform/inbox_open", 1], ["video_platform/maintenance", 1], ["video_platform/audit", 1]], "Care and oversight"),
        {"id": "outro", "card": LOGO, "logo": True, "text": "NTSOne. One platform. Endless possibilities."},
    ]),
}


def vertical(name, dest):
    out = ROOT / "out" / name
    srt = str(out / f"{name}.srt").replace("\\", "/").replace(":", "\\:")
    style = "FontName=Arial,Bold=1,FontSize=8,Outline=1,Shadow=0,MarginV=80,Alignment=2,PrimaryColour=&HFFFFFF&,OutlineColour=&H00000000&,BackColour=&HB0000000&,BorderStyle=3"
    fc = ("[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:5[bg];[b]scale=1080:-2[fg];"
          f"[bg][fg]overlay=(W-w)/2:(H-h)/2,subtitles='{srt}':force_style='{style}'[v]")
    r = subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(out / f"{name}.nosubs.mp4"), "-filter_complex", fc, "-map", "[v]", "-map", "0:a",
                        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "copy", str(dest)], capture_output=True, text=True)
    if r.returncode:
        print("vertical failed", name, r.stderr[:300])


if __name__ == "__main__":
    which = sys.argv[1]  # promos | roles
    table = PROMOS if which == "promos" else ROLES
    for name, (title, scenes) in table.items():
        (ROOT / "scripts" / f"{name}.json").write_text(json.dumps({"title": title, "steps_dir": "out/none", "scenes": scenes}, indent=1), encoding="utf-8")
        r = subprocess.run([sys.executable, str(ROOT / "build_steps_video.py"), name], capture_output=True, text=True, cwd=ROOT)
        if r.returncode:
            print("FAILED", name, r.stdout[-300:], r.stderr[-500:])
            continue
        final = ROOT / "out" / name / f"{name}.mp4"
        if which == "promos":
            (OUT / "promotional_video").mkdir(exist_ok=True)
            (OUT / "promotional_video" / f"NTSOne_{name}_16x9.mp4").write_bytes(final.read_bytes())
            vertical(name, OUT / "promotional_video" / f"NTSOne_{name}_9x16.mp4")
            (OUT / "subtitles" / f"NTSOne_{name}.srt").write_text((ROOT / "out" / name / f"{name}.srt").read_text(encoding="utf-8"), encoding="utf-8")
        else:
            (OUT / "feature_tutorials" / "role_guides").mkdir(exist_ok=True)
            (OUT / "feature_tutorials" / "role_guides" / f"NTSOne_{name}_1080p.mp4").write_bytes(final.read_bytes())
            (OUT / "subtitles" / f"NTSOne_{name}.srt").write_text((ROOT / "out" / name / f"{name}.srt").read_text(encoding="utf-8"), encoding="utf-8")
        print("done", name)
