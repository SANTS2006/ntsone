import { eq } from "drizzle-orm";
import { db, pool } from "./client.js";
import { formFields, formSections, forms, programMembers, programs, tenants, users } from "./schema/index.js";
import { hashPassword } from "../lib/password.js";
import { createRegistration, nextRegistrationSequence } from "../modules/registrations/repository.js";
import { formatRegistrationNumber, resolveNumberingConfig } from "../modules/registrations/numbering.js";

async function main() {
  console.log("Seeding database...");

  const superAdminPassword = await hashPassword("SuperAdmin123!");
  const programAdminPassword = await hashPassword("ProgramAdmin123!");
  const viewerPassword = await hashPassword("Viewer123!");

  // The platform super_admin sits above every tenant -- no tenantId of its own.
  const [superAdmin] = await db
    .insert(users)
    .values({
      name: "Super Admin",
      email: "admin@example.com",
      passwordHash: superAdminPassword,
      emailVerifiedAt: new Date(),
      role: "super_admin",
    })
    .returning();

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: "Acme Training Co",
      slug: "acme-training-co",
    })
    .returning();

  const [programAdmin] = await db
    .insert(users)
    .values({
      name: "Bootcamp Coordinator",
      email: "bootcamp.admin@example.com",
      passwordHash: programAdminPassword,
      emailVerifiedAt: new Date(),
      role: "admin",
      tenantId: tenant!.id,
    })
    .returning();

  const [viewer] = await db
    .insert(users)
    .values({
      name: "Leadership Viewer",
      email: "viewer@example.com",
      passwordHash: viewerPassword,
      emailVerifiedAt: new Date(),
      role: "viewer",
      tenantId: tenant!.id,
    })
    .returning();

  await db.update(tenants).set({ ownerUserId: programAdmin!.id }).where(eq(tenants.id, tenant!.id));

  console.log("Created users:", superAdmin!.email, programAdmin!.email, viewer!.email);

  // ---------- Program 1: Web Development Bootcamp (published, open) ----------
  const [bootcamp] = await db
    .insert(programs)
    .values({
      name: "Web Development Bootcamp",
      slug: "web-development-bootcamp",
      shortDescription: "A 12-week intensive bootcamp covering modern full-stack web development.",
      description:
        "Learn HTML, CSS, JavaScript, React, and Node.js in this hands-on bootcamp designed for career changers.",
      status: "published",
      registrationEnabled: true,
      registrationStartDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      registrationEndDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      startDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      createdBy: superAdmin!.id,
      tenantId: tenant!.id,
    })
    .returning();

  const [bootcampForm] = await db
    .insert(forms)
    .values({
      programId: bootcamp!.id,
      version: 1,
      status: "published",
      publishedAt: new Date(),
      title: "Web Development Bootcamp Registration",
      description: "Please complete all fields to register for the upcoming cohort.",
      confirmationMessage: "Thanks for registering! We'll be in touch with next steps shortly.",
    })
    .returning();

  const [bootcampSection] = await db
    .insert(formSections)
    .values({ formId: bootcampForm!.id, title: "Personal Information", orderIndex: 0 })
    .returning();

  await db.insert(formFields).values([
    {
      formId: bootcampForm!.id,
      sectionId: bootcampSection!.id,
      fieldKey: "full_name",
      type: "short_text",
      label: "Full Name",
      required: true,
      orderIndex: 0,
      config: { minLength: 2, maxLength: 200 },
    },
    {
      formId: bootcampForm!.id,
      sectionId: bootcampSection!.id,
      fieldKey: "email",
      type: "email",
      label: "Email Address",
      required: true,
      orderIndex: 1,
      config: {},
    },
    {
      formId: bootcampForm!.id,
      sectionId: bootcampSection!.id,
      fieldKey: "phone",
      type: "phone",
      label: "Phone Number",
      required: true,
      orderIndex: 2,
      config: {},
    },
    {
      formId: bootcampForm!.id,
      sectionId: bootcampSection!.id,
      fieldKey: "gender",
      type: "gender",
      label: "Gender",
      required: false,
      orderIndex: 3,
      config: { options: ["Male", "Female", "Other", "Prefer not to say"] },
    },
    {
      formId: bootcampForm!.id,
      sectionId: bootcampSection!.id,
      fieldKey: "date_of_birth",
      type: "date_of_birth",
      label: "Date of Birth",
      required: true,
      orderIndex: 4,
      config: {},
    },
  ]);

  // ---------- Program 2: Leadership Training (published, open, conditional logic) ----------
  const [leadership] = await db
    .insert(programs)
    .values({
      name: "Leadership Training",
      slug: "leadership-training",
      shortDescription: "An executive leadership development program for working professionals.",
      description: "A 6-week evening program covering strategic leadership, negotiation, and team management.",
      status: "published",
      registrationEnabled: true,
      registrationStartDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      registrationEndDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
      createdBy: superAdmin!.id,
      tenantId: tenant!.id,
    })
    .returning();

  await db.insert(programMembers).values({ userId: viewer!.id, programId: leadership!.id, roleOnProgram: "viewer" });

  const [leadershipForm] = await db
    .insert(forms)
    .values({
      programId: leadership!.id,
      version: 1,
      status: "published",
      publishedAt: new Date(),
      title: "Leadership Training Registration",
      confirmationMessage: "Your application has been received and is under review.",
    })
    .returning();

  const [personalSection] = await db
    .insert(formSections)
    .values({ formId: leadershipForm!.id, title: "Personal Information", orderIndex: 0 })
    .returning();
  const [employmentSection] = await db
    .insert(formSections)
    .values({ formId: leadershipForm!.id, title: "Employment Information", orderIndex: 1 })
    .returning();

  await db.insert(formFields).values([
    {
      formId: leadershipForm!.id,
      sectionId: personalSection!.id,
      fieldKey: "full_name",
      type: "short_text",
      label: "Full Name",
      required: true,
      orderIndex: 0,
      config: { minLength: 2, maxLength: 200 },
    },
    {
      formId: leadershipForm!.id,
      sectionId: personalSection!.id,
      fieldKey: "email",
      type: "email",
      label: "Email Address",
      required: true,
      orderIndex: 1,
      config: {},
    },
    {
      formId: leadershipForm!.id,
      sectionId: employmentSection!.id,
      fieldKey: "currently_employed",
      type: "yes_no",
      label: "Are you currently employed?",
      required: true,
      orderIndex: 0,
      config: {},
    },
    {
      formId: leadershipForm!.id,
      sectionId: employmentSection!.id,
      fieldKey: "employer_name",
      type: "short_text",
      label: "Name of Employer",
      required: true,
      orderIndex: 1,
      config: {},
      conditionalLogic: [{ fieldKey: "currently_employed", operator: "equals", value: true }],
    },
    {
      formId: leadershipForm!.id,
      sectionId: employmentSection!.id,
      fieldKey: "years_experience",
      type: "number",
      label: "Years of Experience",
      required: false,
      orderIndex: 2,
      config: { minNumber: 0, maxNumber: 60 },
      conditionalLogic: [{ fieldKey: "currently_employed", operator: "equals", value: true }],
    },
  ]);

  // ---------- Program 3: Scholarship Program (draft, no public form yet) ----------
  await db.insert(programs).values({
    name: "Scholarship Program",
    slug: "scholarship-program",
    shortDescription: "Merit-based scholarships for undergraduate students.",
    description: "Applications for the annual merit scholarship. Registration form is still being finalized.",
    status: "draft",
    registrationEnabled: false,
    createdBy: superAdmin!.id,
    tenantId: tenant!.id,
  });

  // ---------- Sample registrations ----------
  const year = new Date().getFullYear();

  const seq1 = await nextRegistrationSequence(bootcamp!.id, year);
  await createRegistration({
    programId: bootcamp!.id,
    formId: bootcampForm!.id,
    registrationNumber: formatRegistrationNumber(resolveNumberingConfig({}), year, seq1),
    applicantName: "Jane Doe",
    applicantEmail: "jane.doe@example.com",
    applicantPhone: "+1-555-0100",
    responses: {
      full_name: "Jane Doe",
      email: "jane.doe@example.com",
      phone: "+1-555-0100",
      gender: "Female",
      date_of_birth: "1998-04-12",
    },
    files: [],
  });

  const seq2 = await nextRegistrationSequence(bootcamp!.id, year);
  await createRegistration({
    programId: bootcamp!.id,
    formId: bootcampForm!.id,
    registrationNumber: formatRegistrationNumber(resolveNumberingConfig({}), year, seq2),
    applicantName: "John Smith",
    applicantEmail: "john.smith@example.com",
    applicantPhone: "+1-555-0101",
    responses: {
      full_name: "John Smith",
      email: "john.smith@example.com",
      phone: "+1-555-0101",
      gender: "Male",
      date_of_birth: "1995-11-02",
    },
    files: [],
  });

  const seq3 = await nextRegistrationSequence(leadership!.id, year);
  await createRegistration({
    programId: leadership!.id,
    formId: leadershipForm!.id,
    registrationNumber: formatRegistrationNumber(resolveNumberingConfig({}), year, seq3),
    applicantName: "Amara Okafor",
    applicantEmail: "amara.okafor@example.com",
    applicantPhone: null,
    responses: {
      full_name: "Amara Okafor",
      email: "amara.okafor@example.com",
      currently_employed: true,
      employer_name: "Globex Corp",
      years_experience: 7,
    },
    files: [],
  });

  console.log("Seed complete.");
  console.log("Login with:");
  console.log("  super_admin (platform, view-only across tenants): admin@example.com / SuperAdmin123!");
  console.log("  admin (owns the 'Acme Training Co' tenant):        bootcamp.admin@example.com / ProgramAdmin123!");
  console.log("  viewer (teammate in the same tenant):              viewer@example.com / Viewer123!");
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await pool.end();
    process.exit(1);
  });
