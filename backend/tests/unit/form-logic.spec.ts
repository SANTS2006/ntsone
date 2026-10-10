import { describe, expect, it } from "vitest";
import { dropHiddenFileUploads, validateAndNormalizeResponses } from "../../src/modules/registrations/validation.js";
import type { FieldRow } from "../../src/modules/forms/repository.js";

function field(partial: Partial<FieldRow> & { fieldKey: string; type: string }): FieldRow {
  return {
    id: partial.fieldKey,
    formId: "f",
    sectionId: null,
    label: partial.fieldKey,
    description: null,
    placeholder: null,
    helpText: null,
    required: false,
    orderIndex: 0,
    config: {},
    conditionalLogic: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as unknown as FieldRow;
}

const check = (fields: FieldRow[], responses: Record<string, unknown>) => {
  try {
    return { ok: true as const, value: validateAndNormalizeResponses(fields, responses, []) };
  } catch (err) {
    return { ok: false as const, errors: ((err as { details?: string[] }).details ?? []) as string[] };
  }
};

describe("show a question only when another answer matches", () => {
  const fields = [
    field({ fieldKey: "employed", type: "yes_no" }),
    field({
      fieldKey: "employer",
      type: "short_text",
      required: true,
      conditionalLogic: [{ fieldKey: "employed", operator: "equals", value: "true" }],
    }),
  ];

  it("does not ask for a hidden required question", () => {
    expect(check(fields, { employed: false }).ok).toBe(true);
  });

  it("requires it once the answer matches", () => {
    const result = check(fields, { employed: true });
    expect(result.ok).toBe(false);
  });
});

describe("a chosen option can ask for more, in the kind of input the admin picked", () => {
  const withFollowUp = (followUp: Record<string, unknown>) => [
    field({
      fieldKey: "region",
      type: "single_choice",
      config: { options: ["North", "South"], followUps: { North: followUp } },
    }),
  ];

  it("checks numbers", () => {
    const fields = withFollowUp({ mode: "number", label: "How many?", required: true });
    expect(check(fields, { region: "North", region__other: "abc" }).ok).toBe(false);
    expect(check(fields, { region: "North", region__other: "12" }).ok).toBe(true);
  });

  it("requires an answer when asked to", () => {
    const fields = withFollowUp({ mode: "short_text", label: "Town", required: true });
    expect(check(fields, { region: "North" }).ok).toBe(false);
    expect(check(fields, { region: "South" }).ok).toBe(true);
  });

  it("only accepts the listed choices for a dropdown", () => {
    const fields = withFollowUp({ mode: "dropdown", label: "Size", options: ["Small", "Large"] });
    expect(check(fields, { region: "North", region__other: "Huge" }).ok).toBe(false);
    expect(check(fields, { region: "North", region__other: "Large" }).ok).toBe(true);
  });

  it("works on options that were filtered by another answer", () => {
    const fields = [
      field({ fieldKey: "district", type: "single_choice", config: { options: ["A", "B"] } }),
      field({
        fieldKey: "chiefdom",
        type: "single_choice",
        config: {
          options: ["A1", "B1"],
          optionsDependOn: { fieldKey: "district", map: { A: ["A1"], B: ["B1"] } },
          followUps: { A1: { mode: "email", label: "Chief's email", required: true } },
        },
      }),
    ];
    expect(check(fields, { district: "A", chiefdom: "A1", chiefdom__other: "nope" }).ok).toBe(false);
    expect(check(fields, { district: "A", chiefdom: "A1", chiefdom__other: "chief@example.com" }).ok).toBe(true);
    expect(check(fields, { district: "B", chiefdom: "B1" }).ok).toBe(true);
  });
});

describe("an extra input that only applies under conditions", () => {
  const fields = [
    field({ fieldKey: "phone_known", type: "yes_no" }),
    field({
      fieldKey: "region",
      type: "single_choice",
      config: {
        options: ["North", "South"],
        followUps: {
          North: {
            mode: "short_text",
            label: "Town",
            required: true,
            conditions: [{ fieldKey: "phone_known", operator: "equals", value: "true" }],
          },
        },
      },
    }),
  ];
  it("is not asked, or required, when its conditions do not match", () => {
    expect(check(fields, { phone_known: false, region: "North" }).ok).toBe(true);
  });
  it("is required once its conditions match", () => {
    expect(check(fields, { phone_known: true, region: "North" }).ok).toBe(false);
    expect(check(fields, { phone_known: true, region: "North", region__other: "Kono" }).ok).toBe(true);
  });
  it("can depend on whether another question is filled in", () => {
    const filled = [
      field({ fieldKey: "email", type: "short_text" }),
      field({
        fieldKey: "pick",
        type: "single_choice",
        config: {
          options: ["A"],
          followUps: { A: { mode: "short_text", required: true, conditions: [{ fieldKey: "email", operator: "is_not_empty" }] } },
        },
      }),
    ];
    expect(check(filled, { pick: "A" }).ok).toBe(true);
    expect(check(filled, { pick: "A", email: "x" }).ok).toBe(false);
  });
});

describe("multiple choice options that ask for more", () => {
  const fields = [
    field({
      fieldKey: "skills",
      type: "multiple_choice",
      config: {
        options: ["Cooking", "Driving", "Other"],
        followUps: {
          Cooking: { mode: "short_text", label: "Years of experience", required: true },
          Driving: { mode: "number", label: "Licence number" },
        },
      },
    }),
  ];
  it("keeps each ticked option's own answer", () => {
    const r = check(fields, { skills: ["Cooking", "Driving"], skills__fu__Cooking: "5", skills__fu__Driving: "42" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.skills__follow).toEqual({ Cooking: "5", Driving: "42" });
  });
  it("requires the answer only for options that are ticked", () => {
    expect(check(fields, { skills: ["Driving"] }).ok).toBe(true);
    expect(check(fields, { skills: ["Cooking"] }).ok).toBe(false);
  });
  it("checks the kind of input per option", () => {
    expect(check(fields, { skills: ["Driving"], skills__fu__Driving: "abc" }).ok).toBe(false);
  });
});

describe('the "Other" text box with conditions', () => {
  const fields = [
    field({ fieldKey: "adult", type: "yes_no" }),
    field({
      fieldKey: "job",
      type: "single_choice",
      config: { options: ["Teacher", "Other"], otherConditions: [{ fieldKey: "adult", operator: "equals", value: "true" }] },
    }),
  ];
  it("is not required when its conditions do not match", () => {
    expect(check(fields, { adult: false, job: "Other" }).ok).toBe(true);
  });
  it("is required once its conditions match", () => {
    expect(check(fields, { adult: true, job: "Other" }).ok).toBe(false);
    expect(check(fields, { adult: true, job: "Other", job__other: "Farmer" }).ok).toBe(true);
  });
});

describe("file upload questions with conditions", () => {
  const fields = [
    field({ fieldKey: "has_id", type: "yes_no" }),
    field({
      fieldKey: "id_scan",
      type: "image_upload",
      required: true,
      conditionalLogic: [{ fieldKey: "has_id", operator: "equals", value: "true" }],
    }),
  ];
  const file = { fieldKey: "id_scan", url: "https://res.cloudinary.com/x/a.png", publicId: "a", filename: "a.png", mimeType: "image/png", sizeBytes: 1 };
  it("is not required while hidden", () => {
    expect(check(fields, { has_id: false }).ok).toBe(true);
  });
  it("is required once shown", () => {
    expect(check(fields, { has_id: true }).ok).toBe(false);
  });
  it("drops an upload left over from a hidden question", () => {
    expect(dropHiddenFileUploads(fields, { has_id: false }, [file])).toEqual([]);
    expect(dropHiddenFileUploads(fields, { has_id: true }, [file])).toHaveLength(1);
  });
});

describe("required only when conditions match", () => {
  const fields = [
    field({ fieldKey: "employed", type: "yes_no" }),
    field({
      fieldKey: "employer",
      type: "short_text",
      required: true,
      config: { requiredConditions: [{ fieldKey: "employed", operator: "equals", value: "true" }] },
    }),
  ];
  it("is optional while the conditions do not match", () => {
    expect(check(fields, { employed: false }).ok).toBe(true);
  });
  it("is required once they match", () => {
    expect(check(fields, { employed: true }).ok).toBe(false);
    expect(check(fields, { employed: true, employer: "Acme" }).ok).toBe(true);
  });
});

describe("sections with conditions", () => {
  const sections = [{ id: "s1", conditionalLogic: [{ fieldKey: "adult", operator: "equals", value: "true" }] }];
  const fields = [
    field({ fieldKey: "adult", type: "yes_no" }),
    field({ fieldKey: "job", type: "short_text", required: true, sectionId: "s1" }),
  ];
  const run = (responses: Record<string, unknown>) => {
    try {
      return { ok: true as const, value: validateAndNormalizeResponses(fields, responses, [], sections) };
    } catch {
      return { ok: false as const };
    }
  };
  it("ignores a required question inside a hidden section", () => {
    const r = run({ adult: false, job: "stale" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.job).toBeNull();
  });
  it("requires it once the section is shown", () => {
    expect(run({ adult: true }).ok).toBe(false);
    expect(run({ adult: true, job: "Teacher" }).ok).toBe(true);
  });
});

describe("limits that apply only under conditions", () => {
  const fields = [
    field({ fieldKey: "paid", type: "yes_no" }),
    field({
      fieldKey: "dob",
      type: "date_of_birth",
      config: { minAge: 18, limitConditions: [{ fieldKey: "paid", operator: "equals", value: "true" }] },
    }),
    field({
      fieldKey: "nick",
      type: "short_text",
      config: { minLength: 5, limitConditions: [{ fieldKey: "paid", operator: "equals", value: "true" }] },
    }),
  ];
  const recent = new Date(Date.now() - 5 * 365 * 86_400_000).toISOString().slice(0, 10);
  it("does not apply the limits while the conditions are not met", () => {
    expect(check(fields, { paid: false, dob: recent, nick: "ab" }).ok).toBe(true);
  });
  it("applies them once the conditions are met", () => {
    expect(check(fields, { paid: true, dob: recent }).ok).toBe(false);
    expect(check(fields, { paid: true, nick: "ab" }).ok).toBe(false);
    expect(check(fields, { paid: true, dob: "1990-01-01", nick: "abcdef" }).ok).toBe(true);
  });
});

describe("choices offered only under conditions", () => {
  const fields = [
    field({ fieldKey: "region", type: "single_choice", config: { options: ["North", "South"] } }),
    field({
      fieldKey: "town",
      type: "single_choice",
      config: {
        options: ["Kono", "Bo"],
        optionConditions: { Kono: [{ fieldKey: "region", operator: "equals", value: "North" }] },
      },
    }),
  ];
  it("refuses a hidden choice", () => {
    expect(check(fields, { region: "South", town: "Kono" }).ok).toBe(false);
  });
  it("accepts it once its conditions match, and always accepts unconditional choices", () => {
    expect(check(fields, { region: "North", town: "Kono" }).ok).toBe(true);
    expect(check(fields, { region: "South", town: "Bo" }).ok).toBe(true);
  });
});
