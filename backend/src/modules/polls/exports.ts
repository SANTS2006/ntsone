import { dateRangeQuery } from "../../lib/dateRange.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { date, EXPORT_ROW_LIMIT, exportFormatSchema, sendTableExport, type ExportSheet } from "../../lib/tableExport.js";
import { requirePollAccess } from "./access.js";
import * as pollsRepo from "./repository.js";
import * as pollsService from "./service.js";

type Voter = Awaited<ReturnType<typeof pollsRepo.listVoters>>["items"][number];
type Results = Awaited<ReturnType<typeof pollsService.buildResults>>;
type CandidateRow = { position: string; totalVotes: number; winner: boolean; tie: boolean } & Results["positions"][number]["candidates"][number];

/** CSV/Excel downloads of a poll's voters and its results. */
export async function pollExportRoutes(app: FastifyInstance) {
  const viewer = { preHandler: requirePollAccess("viewer") };

  app.get<{ Params: { pollId: string } }>("/:pollId/voters/export", viewer, async (request, reply) => {
    const query = exportFormatSchema.extend({ search: z.string().trim().min(1).optional(), ...dateRangeQuery }).parse(request.query);
    const [poll, { items }] = await Promise.all([
      pollsService.getPoll(request.params.pollId),
      pollsRepo.listVoters(request.params.pollId, query.search, { page: 1, pageSize: EXPORT_ROW_LIMIT }, { dateFrom: query.dateFrom, dateTo: query.dateTo }),
    ]);
    const sheet: ExportSheet<Voter> = {
      name: "Voters",
      rows: items,
      columns: [
        { label: "Name", value: (v) => v.name },
        { label: "Email", value: (v) => v.email },
        { label: "Role", value: () => "Voter" },
        { label: "Signs in with", value: (v) => (v.signInMethod === "google" ? "Google" : "Email") },
        { label: "Joined", value: (v) => date(v.joinedAt) },
        { label: "Votes cast", value: (v) => v.votes },
        { label: "Last voted", value: (v) => date(v.lastVotedAt) },
      ],
    };
    return sendTableExport(reply, query.format, `${poll.name} voters`, [sheet]);
  });

  app.get<{ Params: { pollId: string } }>("/:pollId/results/export", viewer, async (request, reply) => {
    const { format } = exportFormatSchema.parse(request.query);
    const [poll, results] = await Promise.all([pollsService.getPoll(request.params.pollId), pollsService.buildResults(request.params.pollId)]);

    const winners: ExportSheet<Results["positions"][number]> = {
      name: "Winners",
      rows: results.positions,
      columns: [
        { label: "Position", value: (p) => p.title },
        {
          label: pollsService.pollState(poll) === "closed" ? "Winner" : "Leading",
          value: (p) => p.candidates.filter((c) => p.winnerIds.includes(c.id)).map((c) => c.name).join(", ") || "No votes yet",
        },
        { label: "Tie", value: (p) => p.winnerIds.length > 1 },
        { label: "Winning votes", value: (p) => p.candidates.find((c) => p.winnerIds.includes(c.id))?.votes ?? 0 },
        { label: "Winning share (%)", value: (p) => p.candidates.find((c) => p.winnerIds.includes(c.id))?.percent ?? 0 },
        { label: "Total votes", value: (p) => p.totalVotes },
        { label: "Voters", value: (p) => p.voters },
      ],
    };
    const rows: CandidateRow[] = results.positions.flatMap((p) =>
      [...p.candidates]
        .sort((a, b) => a.rank - b.rank)
        .map((c) => ({ ...c, position: p.title, totalVotes: p.totalVotes, winner: p.winnerIds.includes(c.id), tie: p.winnerIds.length > 1 })),
    );
    const detail: ExportSheet<CandidateRow> = {
      name: "All candidates",
      rows,
      columns: [
        { label: "Position", value: (r) => r.position },
        { label: "Place", value: (r) => r.rank },
        { label: "Candidate", value: (r) => r.name },
        { label: "Votes", value: (r) => r.votes },
        { label: "Share (%)", value: (r) => r.percent },
        { label: "Leading", value: (r) => r.winner },
        { label: "Votes for the position", value: (r) => r.totalVotes },
      ],
    };
    const summary: ExportSheet<{ label: string; value: number }> = {
      name: "Summary",
      rows: [
        { label: "People who voted", value: results.voters },
        { label: "Voters signed up", value: results.registeredVoters },
        { label: "Turnout (%)", value: results.registeredVoters ? Math.round((results.voters / results.registeredVoters) * 100) : 0 },
        { label: "Votes cast", value: results.votes },
      ],
      columns: [
        { label: "Measure", value: (r) => r.label },
        { label: "Value", value: (r) => r.value },
      ],
    };
    return sendTableExport(reply, format, `${poll.name} results`, [summary, winners, detail]);
  });
}
