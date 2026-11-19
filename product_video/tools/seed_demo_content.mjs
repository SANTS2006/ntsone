// Adds fictitious demo content (poll, business, wish list, contribution) through the DEMO API at localhost:4000.
// The API process must have been started with the demo database (product_video/build/run_demo_api.mjs).
const API = "http://localhost:4000/api";
let token = "";

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? (method === "GET" ? undefined : "{}") : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json.data ?? json;
}

const login = await call("POST", "/auth/login", { email: "bootcamp.admin@example.com", password: "ProgramAdmin123!" });
token = login.accessToken;

// Voting poll
const existing = (await call("GET", "/polls?page=1&pageSize=50")).items?.find((p) => p.name === "Student Council Elections 2026");
const poll = existing ?? (await call("POST", "/polls", { name: "Student Council Elections 2026", description: "Choose your student council for the new academic year.", requireVoterAccount: true }));
await call("PUT", `/polls/${poll.id}/ballot`, {
  positions: [
    { title: "President", description: "Leads the council.", candidates: [{ name: "Aminata Kamara", description: "Final year, Computer Science" }, { name: "Joseph Conteh", description: "Third year, Business" }, { name: "Mariatu Sesay", description: "Third year, Education" }] },
    { title: "Secretary", description: "Keeps the records.", candidates: [{ name: "Ibrahim Bangura" }, { name: "Fatmata Koroma" }] },
  ],
});
await call("POST", `/polls/${poll.id}/open`);

// Business with contact details
const business = await call("POST", "/businesses", { name: "Sunrise Stationery", description: "School and office supplies, delivered across Freetown.", email: "orders@sunrise.example.com", phone: "076 123456", address: "12 Siaka Stevens Street, Freetown" });

// Wish list
const list = await call("POST", "/wishlists", { name: "Home office", description: "Things for the new home office.", budgetMinor: 1500000 });
await call("POST", `/wishlists/${list.id}/items`, {
  items: [
    { name: "Standing desk", quantity: 1, unitPriceMinor: 650000, priority: "high", category: "Furniture" },
    { name: "Desk lamp", quantity: 2, unitPriceMinor: 45000, priority: "medium", category: "Lighting" },
    { name: "Wireless keyboard", quantity: 1, unitPriceMinor: 120000, priority: "low", category: "Electronics" },
  ],
});

// Contribution
const now = new Date();
const contribution = await call("POST", "/contributions", {
  name: "Youth Club Monthly Dues",
  purpose: "Monthly dues to fund the youth club's activities.",
  kind: "recurring",
  fields: ["Name", "Phone"],
  startYear: now.getFullYear(),
  startMonth: Math.max(1, now.getMonth()),
  expectedMonthlyMinor: 20000,
});
for (const [name, phone] of [["Aminata Kamara", "076 000001"], ["Joseph Conteh", "076 000002"], ["Mariatu Sesay", "076 000003"]]) {
  await call("POST", `/contributions/${contribution.id}/records`, { values: { Name: name, Phone: phone } }).catch((e) => console.log("record:", e.message));
}
console.log("seeded", { poll: poll.id, business: business.id, wishlist: list.id, contribution: contribution.id });
