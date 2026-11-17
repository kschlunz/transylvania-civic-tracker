import { afterEach, describe, expect, it } from "vitest";
import { describeKeySetup } from "../supabase-store";

const jwt = (payload: object) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;
const URL_A = "https://abcdefgh.supabase.co";

describe("describeKeySetup", () => {
  afterEach(() => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("confirms a service_role key for the same project", () => {
    expect(describeKeySetup(URL_A, jwt({ role: "service_role", ref: "abcdefgh" }))).toEqual([
      'The key is a legacy JWT key with role "service_role".',
      "The key and the URL are for the same project.",
    ]);
  });

  it("spots the anon key and a key from another project", () => {
    const notes = describeKeySetup(URL_A, jwt({ role: "anon", ref: "zzzzzzzz" })).join("\n");
    expect(notes).toMatch(/not "service_role"/);
    expect(notes).toMatch(/DIFFERENT project/);
    expect(notes).not.toMatch(/zzzzzzzz|abcdefgh/);
  });

  it("spots publishable keys, non-keys, dashboard URLs and stray whitespace", () => {
    expect(describeKeySetup(URL_A, "sb_publishable_123").join()).toMatch(/publishable/);
    expect(describeKeySetup(URL_A, "super-secret-jwt-secret").join()).toMatch(/neither a Supabase secret key/);
    expect(describeKeySetup("https://supabase.com/dashboard/project/abc", "sb_secret_x").join()).toMatch(/does not look like <project>\.supabase\.co/);
    process.env.SUPABASE_SERVICE_ROLE_KEY = ' "sb_secret_x"\n';
    expect(describeKeySetup(URL_A, "sb_secret_x").join()).toMatch(/spaces or line breaks.*quotes/);
  });
});
