const rawPropertyRuns = process.env.GATE_FRAME_PROPERTY_RUNS ?? "1000";
const parsedPropertyRuns = Number(rawPropertyRuns);

if (!Number.isSafeInteger(parsedPropertyRuns) || parsedPropertyRuns < 1) {
  throw new Error(
    `GATE_FRAME_PROPERTY_RUNS must be a positive integer; received ${JSON.stringify(rawPropertyRuns)}`,
  );
}

export const PROPERTY_RUNS = parsedPropertyRuns;
