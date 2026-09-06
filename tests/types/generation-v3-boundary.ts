import {
  type GateGenerationOptionsV3,
  type GateGeometryV3,
  generateGate,
} from "../../src/core/index.js";
import {
  type GateOptionsV3,
  type GateSnapshot,
  gateFrame,
  type GateGeometryV3 as RootGeometryV3,
} from "../../src/index.js";

const options: GateGenerationOptionsV3 = {
  generationVersion: 3,
  seed: "typed-v3",
  family: "fleuron",
  symmetry: 0.5,
};
const geometry: Readonly<GateGeometryV3> = generateGate({ width: 600, height: 360 }, options);
const rootGeometry: RootGeometryV3 = geometry;
const domOptions: GateOptionsV3 = options;
declare const target: HTMLElement;
const controller = gateFrame(target, domOptions);
controller.update({ generationVersion: 2, family: "vine", crest: "fleur" });
controller.update({ generationVersion: 3, symmetry: 0.8 });
declare const snapshot: GateSnapshot;
if (snapshot.generationVersion === 3) {
  const v3: Readonly<GateGeometryV3> = snapshot.geometry;
  void v3.solidPaths;
}
// @ts-expect-error v3 requires an explicit version
const omittedVersion: GateOptionsV3 = { family: "fleuron" };
// @ts-expect-error normalized fixed widths are not public inputs
const invalidWidth: GateOptionsV3 = { generationVersion: 3, strokeWidth: 4 };
const v2Geometry = generateGate(
  { width: 600, height: 360 },
  { generationVersion: 2, seed: "x", family: "fleuron" },
);
// @ts-expect-error a v2 geometry does not expose v3 solid accents
void v2Geometry.solidPaths;
void rootGeometry;
void omittedVersion;
void invalidWidth;
