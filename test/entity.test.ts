import { describe, expect, test } from "bun:test";
import type { CommandRunner } from "../skills/last30days/src/core/command";
import { resolveEntity } from "../skills/last30days/src/core/entity";

const runner: CommandRunner = async (command) => ({
  command,
  exitCode: 0,
  stdout: command.includes("users/steipete")
    ? JSON.stringify({ twitter_username: "steipete" })
    : JSON.stringify({ data: { search: { nodes: [{ login: "steipete", name: "Peter Steinberger", bio: "Came back." }] } } }),
  stderr: "",
  timedOut: false,
});

describe("entity resolution", () => {
  test("trusts explicit handles without a network lookup", async () => {
    expect(await resolveEntity("@panda850819", runner)).toEqual({ kind: "person", xHandle: "panda850819", confidence: 1 });
  });

  test("resolves exact GitHub person identities", async () => {
    expect(await resolveEntity("Peter Steinberger", runner)).toEqual({
      kind: "person",
      githubAccountType: "user",
      githubLogin: "steipete",
      xHandle: "steipete",
      confidence: 0.8,
    });
  });

  test("resolves GitHub organizations through the organization profile", async () => {
    const commands: string[][] = [];
    const organizationRunner: CommandRunner = async (command) => {
      commands.push(command);
      return {
        command,
        exitCode: 0,
        stdout: command.includes("orgs/oven-sh")
          ? JSON.stringify({ twitter_username: "bunjavascript" })
          : JSON.stringify({ data: { search: { nodes: [{ __typename: "Organization", login: "oven-sh", name: "Oven", description: "Bun company" }] } } }),
        stderr: "",
        timedOut: false,
      };
    };
    expect(await resolveEntity("Oven", organizationRunner)).toEqual({
      kind: "company",
      githubAccountType: "organization",
      githubLogin: "oven-sh",
      xHandle: "bunjavascript",
      confidence: 0.8,
    });
    expect(commands.some((command) => command.includes("orgs/oven-sh"))).toBe(true);
  });
});
