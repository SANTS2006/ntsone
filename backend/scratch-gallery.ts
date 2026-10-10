import fs from "node:fs";
import { qrMatrix, svgPagesToPdf } from "./src/modules/idcards/pdf.js";
import { code128, DEFAULT_ID_CARD_TERMS, ID_CARD_DESIGNS, renderIdCard, renderTicketSides, TICKET_DESIGNS } from "./src/shared/designs/index.js";

const [, , out, kind, filter] = process.argv;
const qr = qrMatrix("https://ntsone.ntsdigitalsolutions.com/verify/abc/REG-2026-000123?doc=ticket");
const wanted = (id: string) => !filter || filter.split(",").includes(id);
if (kind === "tickets") {
  const t = {
    logo: { image: null, orgName: "NTS Digital Solutions", tagline: "Youth Leadership Program 2026" },
    kicker: "NTS Digital Solutions presents", title: "Leadership Summit 2026", subtitle: "Ideas, people and partnerships",
    date: "20 May 2026", time: "09:00 AM - 05:00 PM", venue: "Freetown International Conference Centre", price: "Le 150",
    participantName: "Aminata Kamara", registrationNumber: "YLP-2026-000123",
    fields: [{ label: "District", value: "Bo" }, { label: "Seat", value: "A12" }], phone: "+232 76 000 000", website: "www.ntsdigitalsolutions.com",
    terms: "Non-transferable. Present this ticket at the entrance.", qr, barcode: code128("YLP-2026-000123"),
  };
  const pages: string[] = [];
  for (const d of TICKET_DESIGNS.filter((d) => wanted(d.id))) {
    const sides = renderTicketSides(d.id, t, d.defaults);
    pages.push(sides.front);
    if (sides.back) pages.push(sides.back);
  }
  fs.writeFileSync(`${out}/tickets.pdf`, await svgPagesToPdf(pages, 540, 180));
} else {
  const c = {
    logo: { image: null, orgName: "NTS Digital Solutions", tagline: "Youth Leadership Program 2026" },
    name: "Aminata Kamara", role: "Participant", registrationNumber: "YLP-2026-000123",
    fields: [{ label: "District", value: "Bo" }, { label: "Phone", value: "+232 76 123 456" }],
    issued: "12 Mar 2026", validUntil: "30 Nov 2026", photo: null, qr, barcode: code128("YLP-2026-000123"),
    terms: DEFAULT_ID_CARD_TERMS, contact: { phone: "+232 76 000 000", email: "info@ntsdigital.com", website: "www.nts.com" },
    signatureLabel: "Authorized Signature",
  };
  const pages: string[] = [];
  for (const d of ID_CARD_DESIGNS.filter((d) => wanted(d.id))) {
    const { front, back } = renderIdCard(d.id, c, d.defaults);
    pages.push(front, back);
  }
  fs.writeFileSync(`${out}/cards.pdf`, await svgPagesToPdf(pages, 153, 243));
}
console.log("ok");
