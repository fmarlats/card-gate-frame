import { createLabelledSampler, type LabelledSampler } from "../labelled-sampler.js";

const sampler = createLabelledSampler(2);
export const sampleKeyBytes: LabelledSampler["sampleKeyBytes"] = sampler.sampleKeyBytes;
export const sampleUint32: LabelledSampler["sampleUint32"] = sampler.sampleUint32;
export const sampleScalar: LabelledSampler["sampleScalar"] = sampler.sampleScalar;
export const sampleIndex: LabelledSampler["sampleIndex"] = sampler.sampleIndex;
