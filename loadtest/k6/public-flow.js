// Run against a STAGING copy only (never the live database):
//   k6 run -e BASE=https://staging.example.com -e SLUG=demo-program loadtest/k6/public-flow.js
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "1m", target: 50 },
    { duration: "3m", target: 200 },
    { duration: "1m", target: 0 },
  ],
  thresholds: { http_req_failed: ["rate<0.02"], http_req_duration: ["p(95)<1500"] },
};

const BASE = __ENV.BASE;
const SLUG = __ENV.SLUG;

export default function () {
  const page = http.get(`${BASE}/api/public/programs/${SLUG}`);
  check(page, { "program 200": (r) => r.status === 200 });
  const form = http.get(`${BASE}/api/public/programs/${SLUG}/form`);
  check(form, { "form 200": (r) => r.status === 200 });
  check(http.get(`${BASE}/ready`), { "ready 200": (r) => r.status === 200 });
  sleep(1);
}
