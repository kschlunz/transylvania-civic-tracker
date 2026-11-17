import type { ListedMeeting } from "../county";
import type { Extraction, Llm, Review } from "../extraction";
import type { RosterEntry } from "../roster";
import type { PipelineState } from "../state";

export const ROSTER: RosterEntry[] = [
  { id: "mccall", name: "Teresa McCall", terms: [{ start: "2020-12-07" }] },
  { id: "chapman", name: "Larry Chapman", terms: [{ start: "2010-12-06" }] },
  { id: "dalton", name: "Jake Dalton", terms: [{ start: "2020-12-07", end: "2026-12-07" }] },
];

export function listed(date: string, overrides: Partial<ListedMeeting> = {}): ListedMeeting & { minutesUrl: string } {
  return {
    date,
    title: `Commissioners' Meeting ${date}`,
    type: "regular",
    time: "4:00 PM",
    pageUrl: `https://www.transylvaniacounty.org/meetings/${date}`,
    minutesUrl: `https://www.transylvaniacounty.org/sites/default/files/minutes/${date}%20reg%20mtg.pdf`,
    ...overrides,
  };
}

export function extraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    duration: "2 hours",
    audienceSize: 0,
    attendees: ["mccall", "chapman", "dalton"],
    tldr: "The board approved a paving contract and heard a budget update.",
    keyVotes: [
      {
        description: "Approve consent agenda",
        consent: true,
        mover: "dalton",
        seconder: "chapman",
        ayes: ["mccall", "chapman", "dalton"],
        nays: [],
        abstained: [],
        absent: [],
        rollCallKnown: true,
        passed: true,
        background: "",
        discussion: "",
        page: 2,
      },
      {
        description: "Approve paving contract ($120,000)",
        consent: false,
        mover: "chapman",
        seconder: "dalton",
        ayes: ["chapman", "dalton"],
        nays: ["mccall"],
        abstained: [],
        absent: [],
        rollCallKnown: true,
        passed: true,
        background: "Staff recommended the low bidder.",
        discussion: "McCall objected to the cost.",
        page: 4,
      },
    ],
    commissionerActivity: [{ commissioner: "mccall", topics: [{ text: "Questioned the paving cost.", categories: ["fiscal"] }], externalRoles: [] }],
    publicComments: [{ speaker: "Pat Doe", summary: "Asked for sidewalk repairs." }],
    staffActivity: [{ name: "Jaime Laughter", role: "County Manager", items: ["Presented the paving bids."] }],
    newFollowUps: [{ owner: "staff", description: "Bring back a sidewalk plan.", type: "report", categories: ["infrastructure"] }],
    followUpUpdates: [],
    newThreads: [{ id: "sidewalk-plan", title: "Sidewalk Plan", categories: ["infrastructure"], summary: "Requested by the public." }],
    threadUpdates: [],
    ...overrides,
  };
}

export function emptyState(overrides: Partial<PipelineState> = {}): PipelineState {
  return { meetingIds: new Set(), openFollowUps: [], activeThreads: [], ...overrides };
}

/** A stand-in model: answers each task from a queue and records what it was asked. */
export function fakeLlm(answers: { extract?: Extraction[]; revise?: Extraction[]; review?: Review[] }) {
  const calls: { task: string; instructions: string; system: string }[] = [];
  const queues = { extract: [...(answers.extract ?? [])], revise: [...(answers.revise ?? [])], review: [...(answers.review ?? [])] };
  // Extraction comes in three part requests ("extract:meeting", "extract:people",
  // "extract:followUps"); each part reads the same queued answer, which moves on
  // after the last part.
  const llm: Llm = async (request) => {
    calls.push({ task: request.task, instructions: request.instructions, system: request.system });
    const [task, part] = request.task.split(":");
    const queue = queues[task as keyof typeof queues];
    const answer = queue.length > 0 ? (part && part !== "followUps" ? queue[0] : queue.shift()) : task === "review" ? { issues: [] } : undefined;
    if (answer === undefined) throw new Error(`fakeLlm: no answer queued for "${request.task}"`);
    return request.schema.parse(answer);
  };
  /** The sequence of tasks with the three parts of an extraction counted once. */
  const steps = () => calls.map((c) => c.task.split(":")[0]).filter((t, i, all) => !(t !== "review" && all[i - 1] === t));
  return { llm, calls, steps };
}

export const PDF = Buffer.from("%PDF-1.7 test");
