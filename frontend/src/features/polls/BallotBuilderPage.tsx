import { Loading } from "@/components/Loading";
import * as React from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ImagePlus, Plus, Save, Trash2, Upload, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { saveBallot, uploadPollImage, type BallotCandidate, type BallotPosition } from "./api";
import { useBallot, useInvalidatePolls } from "./hooks";
import { usePollOutletContext } from "./PollDetailLayout";

/** Local rows carry a stable key so React keeps inputs in place while items move. */
type Row<T> = T & { key: string };
type CandidateRow = Row<BallotCandidate>;
type PositionRow = Row<Omit<BallotPosition, "candidates"> & { candidates: CandidateRow[] }>;

let nextKey = 0;
const newKey = () => `new-${nextKey++}`;

function toRows(positions: BallotPosition[]): PositionRow[] {
  return positions.map((p) => ({
    ...p,
    key: p.id ?? newKey(),
    candidates: p.candidates.map((c) => ({ ...c, key: c.id ?? newKey() })),
  }));
}

function move<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  return copy;
}

function ImageButton({
  pollId,
  value,
  onChange,
  label,
  disabled,
}: {
  pollId: string;
  value: string | null;
  onChange: (url: string | null) => void;
  label: string;
  disabled: boolean;
}) {
  const [uploading, setUploading] = React.useState(false);
  const upload = async (file: File) => {
    setUploading(true);
    try {
      onChange(await uploadPollImage(pollId, file));
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted">
        {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-6 w-6 text-muted-foreground" aria-hidden="true" />}
      </div>
      {!disabled && (
        <div className="flex flex-col gap-1">
          <Button type="button" variant="outline" size="sm" className="relative" loading={uploading}>
            {value ? <ImagePlus className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
            {value ? "Replace" : "Photo"}
            <input
              type="file"
              accept="image/*"
              aria-label={label}
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = "";
              }}
            />
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X className="h-4 w-4" />
              Remove
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function BallotBuilderPage() {
  const { poll } = usePollOutletContext();
  const canEdit = poll.myRole === "admin";
  const { data, isLoading } = useBallot(poll.id);
  const invalidate = useInvalidatePolls();
  const [positions, setPositions] = React.useState<PositionRow[] | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (data && !dirty) setPositions(toRows(data));
  }, [data, dirty]);

  // Warn before leaving with unsaved changes.
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (isLoading || !positions) return <Loading label="Loading ballot" />;

  const update = (next: PositionRow[]) => {
    setPositions(next);
    setDirty(true);
  };
  const updatePosition = (index: number, patch: Partial<PositionRow>) =>
    update(positions.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  const updateCandidate = (pi: number, ci: number, patch: Partial<CandidateRow>) =>
    updatePosition(pi, { candidates: positions[pi]!.candidates.map((c, i) => (i === ci ? { ...c, ...patch } : c)) });

  const addPosition = () =>
    update([
      ...positions,
      {
        key: newKey(),
        title: "",
        description: null,
        imageUrl: null,
        candidates: [
          { key: newKey(), name: "", description: null, imageUrl: null },
          { key: newKey(), name: "", description: null, imageUrl: null },
        ],
      },
    ]);

  const save = async () => {
    const missingTitle = positions.findIndex((p) => !p.title.trim());
    if (missingTitle >= 0) return toast.error(`Position ${missingTitle + 1} needs a title`);
    const missingName = positions.find((p) => p.candidates.some((c) => !c.name.trim()));
    if (missingName) return toast.error(`Every candidate in "${missingName.title}" needs a name`);
    setSaving(true);
    try {
      const saved = await saveBallot(
        poll.id,
        positions.map(({ key: _key, candidates, ...p }) => ({
          ...p,
          title: p.title.trim(),
          candidates: candidates.map(({ key: _k, ...c }) => ({ ...c, name: c.name.trim() })),
        })),
      );
      setPositions(toRows(saved));
      setDirty(false);
      await invalidate();
      toast.success("Ballot saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save the ballot");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Ballot</h2>
          <p className="text-sm text-muted-foreground">
            Each position is its own poll with candidates to choose from. Voters pick one candidate per position.
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={addPosition}>
              <Plus className="h-4 w-4" />
              Add position
            </Button>
            <Button onClick={save} loading={saving} disabled={!dirty}>
              <Save className="h-4 w-4" />
              Save ballot
            </Button>
          </div>
        )}
      </div>

      {positions.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
            No positions yet. Add a position, such as President or Secretary, with the candidates people can vote for.
            {canEdit && (
              <Button onClick={addPosition}>
                <Plus className="h-4 w-4" />
                Add the first position
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {positions.map((position, pi) => (
        <Card key={position.key}>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                Position {pi + 1}
                {position.title ? `: ${position.title}` : ""}
              </CardTitle>
              <CardDescription>{position.candidates.length} candidate{position.candidates.length === 1 ? "" : "s"}</CardDescription>
            </div>
            {canEdit && (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" aria-label="Move position up" disabled={pi === 0} onClick={() => update(move(positions, pi, -1))}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Move position down" disabled={pi === positions.length - 1} onClick={() => update(move(positions, pi, 1))}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Delete position" onClick={() => update(positions.filter((_, i) => i !== pi))}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`title-${position.key}`}>Position title</Label>
                  <Input
                    id={`title-${position.key}`}
                    placeholder="e.g. President"
                    value={position.title}
                    onChange={(e) => updatePosition(pi, { title: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`desc-${position.key}`}>Description (optional)</Label>
                  <Textarea
                    id={`desc-${position.key}`}
                    rows={2}
                    value={position.description ?? ""}
                    onChange={(e) => updatePosition(pi, { description: e.target.value || null })}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Picture (optional)</span>
                <ImageButton
                  pollId={poll.id}
                  value={position.imageUrl}
                  onChange={(imageUrl) => updatePosition(pi, { imageUrl })}
                  label={`Picture for position ${pi + 1}`}
                  disabled={!canEdit}
                />
              </div>
            </fieldset>

            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">Candidates</h3>
              {position.candidates.map((candidate, ci) => (
                <div key={candidate.key} className="flex flex-col gap-3 rounded-xl border border-border/70 p-3 sm:flex-row sm:items-start">
                  <ImageButton
                    pollId={poll.id}
                    value={candidate.imageUrl}
                    onChange={(imageUrl) => updateCandidate(pi, ci, { imageUrl })}
                    label={`Photo for candidate ${ci + 1}`}
                    disabled={!canEdit}
                  />
                  <fieldset disabled={!canEdit} className="flex flex-1 flex-col gap-2">
                    <Input
                      aria-label={`Candidate ${ci + 1} name`}
                      placeholder="Candidate name"
                      value={candidate.name}
                      onChange={(e) => updateCandidate(pi, ci, { name: e.target.value })}
                    />
                    <Input
                      aria-label={`Candidate ${ci + 1} short description`}
                      placeholder="Short description, e.g. slogan or department (optional)"
                      value={candidate.description ?? ""}
                      onChange={(e) => updateCandidate(pi, ci, { description: e.target.value || null })}
                    />
                  </fieldset>
                  {canEdit && (
                    <div className="flex gap-1 sm:flex-col">
                      <Button variant="ghost" size="icon" aria-label="Move candidate up" disabled={ci === 0} onClick={() => updatePosition(pi, { candidates: move(position.candidates, ci, -1) })}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Move candidate down"
                        disabled={ci === position.candidates.length - 1}
                        onClick={() => updatePosition(pi, { candidates: move(position.candidates, ci, 1) })}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove candidate"
                        onClick={() => updatePosition(pi, { candidates: position.candidates.filter((_, i) => i !== ci) })}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() =>
                    updatePosition(pi, { candidates: [...position.candidates, { key: newKey(), name: "", description: null, imageUrl: null }] })
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add candidate
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      {canEdit && dirty && (
        <div className="sticky bottom-4 z-10 flex justify-end">
          <Button onClick={save} loading={saving} className="shadow-glow-lg">
            <Save className="h-4 w-4" />
            Save ballot
          </Button>
        </div>
      )}
    </div>
  );
}
