import {
  generateGate,
  type GateGenerationOptions,
  type GateGenerationOptionsV1,
  type GateGeometryV1,
  type GateGeometryV2,
} from "../../src/core/index.js";
import {
  gateFrame as domGateFrame,
  type GateFrameController as DomGateFrameController,
  type GateGeometryV1 as DomGateGeometryV1,
  type GateGeometryV2 as DomGateGeometryV2,
  type GateOptionUpdate as DomGateOptionUpdate,
  type GateOptions as DomGateOptions,
  type GateOptionsV1 as DomGateOptionsV1,
  type GateOptionsV2 as DomGateOptionsV2,
  type GateSnapshot as DomGateSnapshot,
} from "../../src/dom/index.js";
import {
  gateFrame as rootGateFrame,
  type GateFrameController as RootGateFrameController,
  type GateFamily as RootGateFamily,
  type GateGenerationVersion as RootGateGenerationVersion,
  type GateGeometry as RootGateGeometry,
  type GateOptionUpdate as RootGateOptionUpdate,
  type GateOptions as RootGateOptions,
  type GateOptionsV1 as RootGateOptionsV1,
  type GateOptionsV2 as RootGateOptionsV2,
  type GateSnapshot as RootGateSnapshot,
} from "../../src/index.js";

const dimensions = { width: 600, height: 360 };

const v1Options = {
  seed: "type-v1",
  family: "courtyard",
} satisfies GateGenerationOptions;
const v2Options = {
  generationVersion: 2,
  seed: "type-v2",
  family: "arcade",
  symmetry: 0.5,
  peakHeight: 0.4,
  sideComplexity: 0.6,
  crest: "diamond",
} satisfies GateGenerationOptions;

const v1Geometry: Readonly<GateGeometryV1> = generateGate(dimensions, v1Options);
const v2Geometry: Readonly<GateGeometryV2> = generateGate(dimensions, v2Options);
void v1Geometry;
void v2Geometry;

// Core option-type guards: each V2-only key is proved independently for omitted and explicit v1.
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
const coreOptionsOmittedSymmetry: GateGenerationOptions = {
  seed: "x",
  family: "courtyard",
  symmetry: 0.5,
};
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
const coreOptionsV1Symmetry: GateGenerationOptions = {
  seed: "x",
  family: "courtyard",
  generationVersion: 1,
  symmetry: 0.5,
};
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
const coreOptionsOmittedPeakHeight: GateGenerationOptions = {
  seed: "x",
  family: "courtyard",
  peakHeight: 0.4,
};
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
const coreOptionsV1PeakHeight: GateGenerationOptions = {
  seed: "x",
  family: "courtyard",
  generationVersion: 1,
  peakHeight: 0.4,
};
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
const coreOptionsOmittedSideComplexity: GateGenerationOptions = {
  seed: "x",
  family: "courtyard",
  sideComplexity: 0.6,
};
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
const coreOptionsV1SideComplexity: GateGenerationOptions = {
  seed: "x",
  family: "courtyard",
  generationVersion: 1,
  sideComplexity: 0.6,
};
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
const coreOptionsOmittedCrest: GateGenerationOptions = {
  seed: "x",
  family: "courtyard",
  crest: "diamond",
};
const coreOptionsV1Crest: GateGenerationOptions = {
  seed: "x",
  family: "courtyard",
  generationVersion: 1,
  // @ts-expect-error crest requires explicit generationVersion 2
  crest: "diamond",
};
void coreOptionsOmittedSymmetry;
void coreOptionsV1Symmetry;
void coreOptionsOmittedPeakHeight;
void coreOptionsV1PeakHeight;
void coreOptionsOmittedSideComplexity;
void coreOptionsV1SideComplexity;
void coreOptionsOmittedCrest;
void coreOptionsV1Crest;

// Core API guards use otherwise-valid courtyard calls so no unrelated error can mask a key.
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
generateGate(dimensions, { seed: "x", family: "courtyard", symmetry: 0.5 });
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
generateGate(dimensions, { seed: "x", family: "courtyard", generationVersion: 1, symmetry: 0.5 });
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
generateGate(dimensions, { seed: "x", family: "courtyard", peakHeight: 0.4 });
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
generateGate(dimensions, { seed: "x", family: "courtyard", generationVersion: 1, peakHeight: 0.4 });
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
generateGate(dimensions, { seed: "x", family: "courtyard", sideComplexity: 0.6 });
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
generateGate(dimensions, {
  seed: "x",
  family: "courtyard",
  generationVersion: 1,
  sideComplexity: 0.6,
});
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
generateGate(dimensions, { seed: "x", family: "courtyard", crest: "diamond" });
generateGate(dimensions, {
  seed: "x",
  family: "courtyard",
  generationVersion: 1,
  // @ts-expect-error crest requires explicit generationVersion 2
  crest: "diamond",
});

// @ts-expect-error v1 excludes every non-courtyard family
const v1WithArcade: GateGenerationOptionsV1 = { seed: "x", family: "arcade" };
void v1WithArcade;

const rootFamily: RootGateFamily = "volute";
const rootVersion: RootGateGenerationVersion = 2;
declare const rootGeometry: RootGateGeometry;
const rootGeneration: 1 | 2 | 3 = rootGeometry.generationVersion;
const domV1OnlyControlsAreExplicitlyExcluded: "crest" extends keyof DomGateOptions ? true : false =
  true;
void rootFamily;
void rootVersion;
void rootGeneration;
void domV1OnlyControlsAreExplicitlyExcluded;

// Root GateOptions guards.
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
const rootOptionsOmittedSymmetry: RootGateOptions = { family: "courtyard", symmetry: 0.5 };
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
const rootOptionsV1Symmetry: RootGateOptions = {
  family: "courtyard",
  generationVersion: 1,
  symmetry: 0.5,
};
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
const rootOptionsOmittedPeakHeight: RootGateOptions = { family: "courtyard", peakHeight: 0.4 };
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
const rootOptionsV1PeakHeight: RootGateOptions = {
  family: "courtyard",
  generationVersion: 1,
  peakHeight: 0.4,
};
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
const rootOptionsOmittedSideComplexity: RootGateOptions = {
  family: "courtyard",
  sideComplexity: 0.6,
};
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
const rootOptionsV1SideComplexity: RootGateOptions = {
  family: "courtyard",
  generationVersion: 1,
  sideComplexity: 0.6,
};
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
const rootOptionsOmittedCrest: RootGateOptions = { family: "courtyard", crest: "diamond" };
const rootOptionsV1Crest: RootGateOptions = {
  family: "courtyard",
  generationVersion: 1,
  // @ts-expect-error crest requires explicit generationVersion 2
  crest: "diamond",
};
void rootOptionsOmittedSymmetry;
void rootOptionsV1Symmetry;
void rootOptionsOmittedPeakHeight;
void rootOptionsV1PeakHeight;
void rootOptionsOmittedSideComplexity;
void rootOptionsV1SideComplexity;
void rootOptionsOmittedCrest;
void rootOptionsV1Crest;

declare const target: HTMLElement;

// Root gateFrame API guards.
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
rootGateFrame(target, { family: "courtyard", symmetry: 0.5 });
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
rootGateFrame(target, { family: "courtyard", generationVersion: 1, symmetry: 0.5 });
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
rootGateFrame(target, { family: "courtyard", peakHeight: 0.4 });
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
rootGateFrame(target, { family: "courtyard", generationVersion: 1, peakHeight: 0.4 });
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
rootGateFrame(target, { family: "courtyard", sideComplexity: 0.6 });
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
rootGateFrame(target, { family: "courtyard", generationVersion: 1, sideComplexity: 0.6 });
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
rootGateFrame(target, { family: "courtyard", crest: "diamond" });
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
rootGateFrame(target, { family: "courtyard", generationVersion: 1, crest: "diamond" });

// Direct DOM GateOptions guards.
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
const domOptionsOmittedSymmetry: DomGateOptions = { family: "courtyard", symmetry: 0.5 };
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
const domOptionsV1Symmetry: DomGateOptions = {
  family: "courtyard",
  generationVersion: 1,
  symmetry: 0.5,
};
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
const domOptionsOmittedPeakHeight: DomGateOptions = { family: "courtyard", peakHeight: 0.4 };
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
const domOptionsV1PeakHeight: DomGateOptions = {
  family: "courtyard",
  generationVersion: 1,
  peakHeight: 0.4,
};
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
const domOptionsOmittedSideComplexity: DomGateOptions = {
  family: "courtyard",
  sideComplexity: 0.6,
};
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
const domOptionsV1SideComplexity: DomGateOptions = {
  family: "courtyard",
  generationVersion: 1,
  sideComplexity: 0.6,
};
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
const domOptionsOmittedCrest: DomGateOptions = { family: "courtyard", crest: "diamond" };
const domOptionsV1Crest: DomGateOptions = {
  family: "courtyard",
  generationVersion: 1,
  // @ts-expect-error crest requires explicit generationVersion 2
  crest: "diamond",
};
void domOptionsOmittedSymmetry;
void domOptionsV1Symmetry;
void domOptionsOmittedPeakHeight;
void domOptionsV1PeakHeight;
void domOptionsOmittedSideComplexity;
void domOptionsV1SideComplexity;
void domOptionsOmittedCrest;
void domOptionsV1Crest;

// Direct DOM gateFrame API guards.
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
domGateFrame(target, { family: "courtyard", symmetry: 0.5 });
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
domGateFrame(target, { family: "courtyard", generationVersion: 1, symmetry: 0.5 });
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
domGateFrame(target, { family: "courtyard", peakHeight: 0.4 });
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
domGateFrame(target, { family: "courtyard", generationVersion: 1, peakHeight: 0.4 });
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
domGateFrame(target, { family: "courtyard", sideComplexity: 0.6 });
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
domGateFrame(target, { family: "courtyard", generationVersion: 1, sideComplexity: 0.6 });
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
domGateFrame(target, { family: "courtyard", crest: "diamond" });
// @ts-expect-error the named V2-only key requires explicit generationVersion 2
domGateFrame(target, { family: "courtyard", generationVersion: 1, crest: "diamond" });

const rootArcade: RootGateFamily = "arcade";
const rootVersion2: RootGateGenerationVersion = 2;
const domV2: DomGateOptions = { generationVersion: 2, family: "arcade" };
void rootArcade;
void rootVersion2;
void domV2;

const rootV2: RootGateOptions = { generationVersion: 2, family: "arcade" };
const rootV2Options: RootGateOptionsV2 = {
  generationVersion: 2,
  family: "volute",
  symmetry: 0.75,
  peakHeight: 0.4,
  sideComplexity: 0.65,
  crest: "fleur",
};
const domV2Options: DomGateOptionsV2 = rootV2Options;
const rootV1Options: RootGateOptionsV1 = { family: "courtyard" };
const domV1Options: DomGateOptionsV1 = rootV1Options;
const rootController: RootGateFrameController = rootGateFrame(target, rootV2Options);
const domController: DomGateFrameController = domGateFrame(target, domV2Options);
const rootUpdate: RootGateOptionUpdate = { density: 0.8 };
const domSwitch: DomGateOptionUpdate = { generationVersion: 1, family: "courtyard" };
rootController.update(rootUpdate);
domController.update(domSwitch);

declare const rootSnapshot: RootGateSnapshot;
if (rootSnapshot.generationVersion === 1) {
  const family: "courtyard" = rootSnapshot.geometry.options.family;
  void family;
} else if (rootSnapshot.generationVersion === 2) {
  const geometry: Readonly<DomGateGeometryV2> = rootSnapshot.geometry;
  const family: RootGateFamily = geometry.options.family;
  void family;
}

declare const domSnapshot: DomGateSnapshot;
if (domSnapshot.generationVersion === 1) {
  const geometry: Readonly<DomGateGeometryV1> = domSnapshot.geometry;
  void geometry;
} else if (domSnapshot.generationVersion === 2) {
  const geometry: Readonly<DomGateGeometryV2> = domSnapshot.geometry;
  void geometry;
}

// @ts-expect-error a V2-only control still requires explicit generationVersion 2
const invalidRootOmittedV2: RootGateOptions = { family: "courtyard", crest: "diamond" };
// @ts-expect-error a V2-only control still requires explicit generationVersion 2
const invalidDomV1Control: DomGateOptions = {
  generationVersion: 1,
  family: "courtyard",
  symmetry: 0.5,
};
void rootV2;
void rootV1Options;
void domV1Options;
void invalidRootOmittedV2;
void invalidDomV1Control;
