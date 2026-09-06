import {
  type GateCrest,
  type GateFamily,
  type GateFrameController,
  type GateOptionsV3,
  gateFrame,
} from "card-gate-frame";

type PaletteName = "limestone" | "verdigris" | "oxblood" | "midnight";
type PlaygroundAspect = "standard" | "portrait" | "panorama";
type GalleryAspect = "wide" | "classic" | "tall";
type FamilyChoice = GateFamily | "auto";
type CrestChoice = GateCrest | "";

interface Variation {
  readonly title: string;
  readonly place: string;
  readonly seed: string;
  readonly family: GateFamily;
  readonly density: number;
  readonly curvature: number;
  readonly symmetry: number;
  readonly peakHeight: number;
  readonly sideComplexity: number;
  readonly palette: PaletteName;
  readonly aspect: GalleryAspect;
  readonly playgroundAspect: PlaygroundAspect;
}

interface GalleryMount {
  readonly variation: Variation;
  readonly article: HTMLElement;
  readonly controller: GateFrameController;
  readonly seedReadout: HTMLElement;
  currentSeed: string;
}

const PALETTES = Object.freeze({
  limestone: Object.freeze({
    label: "Limestone",
    stroke: "#20221e",
    surface: "rgba(143, 119, 79, 0.12)",
  }),
  verdigris: Object.freeze({
    label: "Verdigris",
    stroke: "#31534b",
    surface: "rgba(64, 103, 91, 0.12)",
  }),
  oxblood: Object.freeze({
    label: "Oxblood",
    stroke: "#7a352d",
    surface: "rgba(122, 53, 45, 0.11)",
  }),
  midnight: Object.freeze({
    label: "Midnight",
    stroke: "#303844",
    surface: "rgba(48, 56, 68, 0.1)",
  }),
});

const DEFAULTS = Object.freeze({
  seed: "family-workshop-example",
  family: "courtyard" as FamilyChoice,
  crest: "" as CrestChoice,
  density: 0.58,
  curvature: 0.72,
  symmetry: 1,
  peakHeight: 0.35,
  sideComplexity: 0.5,
  palette: "limestone" as PaletteName,
  aspect: "standard" as PlaygroundAspect,
});

const FAMILIES: ReadonlyArray<GateFamily> = Object.freeze([
  "courtyard",
  "fleuron",
  "arcade",
  "vine",
  "fan",
  "volute",
]);
const FAMILY_CRESTS = Object.freeze({
  courtyard: Object.freeze(["spear", "diamond", "none"]),
  fleuron: Object.freeze(["fleur", "spear", "none"]),
  arcade: Object.freeze(["diamond", "spear", "none"]),
  vine: Object.freeze(["fleur", "diamond", "none"]),
  fan: Object.freeze(["diamond", "spear", "none"]),
  volute: Object.freeze(["fleur", "spear", "none"]),
} satisfies Readonly<Record<GateFamily, ReadonlyArray<GateCrest>>>);
const AUTO_CRESTS: ReadonlyArray<GateCrest> = Object.freeze(["none"]);
const PRIMARY_TITLES = Object.freeze([
  "Cour intérieure",
  "Bouquet de pierre",
  "Galerie classique",
  "Vigne de pluie",
  "Éventail minéral",
  "Volutes du soir",
]);
const SECONDARY_TITLES = Object.freeze([
  "Passage calme",
  "Fleur de ferronnier",
  "Arcades du matin",
  "Canopée libre",
  "Rayons de minuit",
  "Couronne rocaille",
]);
const PLACES = Object.freeze(["Paris", "Lyon", "Arles", "Nantes", "Lille", "Bordeaux"]);
const FAMILY_PALETTES = Object.freeze([
  "limestone",
  "verdigris",
  "midnight",
  "verdigris",
  "midnight",
  "oxblood",
] as const);
const GALLERY_ASPECTS = Object.freeze(["wide", "classic", "tall"] as const);
const PLAYGROUND_ASPECTS = Object.freeze(["panorama", "standard", "portrait"] as const);

const VARIATIONS: ReadonlyArray<Variation> = Object.freeze(
  FAMILIES.flatMap((family, familyIndex) =>
    [0, 1].map((variant) =>
      Object.freeze({
        title:
          (variant === 0 ? PRIMARY_TITLES[familyIndex] : SECONDARY_TITLES[familyIndex]) ?? family,
        place: PLACES[familyIndex] ?? "France",
        seed: `${family}-workshop-${variant + 1}`,
        family,
        density: variant === 0 ? 0.28 + familyIndex * 0.07 : 0.72 - familyIndex * 0.045,
        curvature: variant === 0 ? 0.34 + familyIndex * 0.08 : 0.82 - familyIndex * 0.055,
        symmetry: variant === 0 ? 1 : 0.62,
        peakHeight: variant === 0 ? 0.3 + familyIndex * 0.05 : 0.68 - familyIndex * 0.04,
        sideComplexity: variant === 0 ? 0.25 + familyIndex * 0.08 : 0.82 - familyIndex * 0.05,
        palette: FAMILY_PALETTES[familyIndex] ?? "limestone",
        aspect: GALLERY_ASPECTS[(familyIndex + variant) % 3] ?? "classic",
        playgroundAspect: PLAYGROUND_ASPECTS[(familyIndex + variant) % 3] ?? "standard",
      }),
    ),
  ),
);

const requireElement = <ElementType extends Element>(selector: string): ElementType => {
  const element = document.querySelector<ElementType>(selector);
  if (element === null) throw new Error(`The family workshop is missing ${selector}`);
  return element;
};

const card = requireElement<HTMLElement>("#courtyard-card");
const visitButton = requireElement<HTMLButtonElement>("#visit-button");
const interactionStatus = requireElement<HTMLElement>("#interaction-status");
const controls = requireElement<HTMLFormElement>("#playground-controls");
const seedInput = requireElement<HTMLInputElement>("#seed-input");
const familySelect = requireElement<HTMLSelectElement>("#family-select");
const crestSelect = requireElement<HTMLSelectElement>("#crest-select");
const densityInput = requireElement<HTMLInputElement>("#density-input");
const densityOutput = requireElement<HTMLOutputElement>("#density-output");
const curvatureInput = requireElement<HTMLInputElement>("#curvature-input");
const curvatureOutput = requireElement<HTMLOutputElement>("#curvature-output");
const symmetryInput = requireElement<HTMLInputElement>("#symmetry-input");
const symmetryOutput = requireElement<HTMLOutputElement>("#symmetry-output");
const peakHeightInput = requireElement<HTMLInputElement>("#peak-height-input");
const peakHeightOutput = requireElement<HTMLOutputElement>("#peak-height-output");
const sideComplexityInput = requireElement<HTMLInputElement>("#side-complexity-input");
const sideComplexityOutput = requireElement<HTMLOutputElement>("#side-complexity-output");
const paletteSelect = requireElement<HTMLSelectElement>("#palette-select");
const aspectSelect = requireElement<HTMLSelectElement>("#aspect-select");
const randomizeButton = requireElement<HTMLButtonElement>("#randomize-button");
const resetButton = requireElement<HTMLButtonElement>("#reset-button");
const gallery = requireElement<HTMLElement>("#variation-gallery");
const shuffleGalleryButton = requireElement<HTMLButtonElement>("#shuffle-gallery");
const galleryStatus = requireElement<HTMLElement>("#gallery-status");

const isPaletteName = (value: string): value is PaletteName => Object.hasOwn(PALETTES, value);
const isFamilyChoice = (value: string): value is FamilyChoice =>
  value === "auto" || FAMILIES.includes(value as GateFamily);
const isCrestChoice = (value: string): value is CrestChoice =>
  value === "" || value === "spear" || value === "fleur" || value === "diamond" || value === "none";
const isPlaygroundAspect = (value: string): value is PlaygroundAspect =>
  value === "standard" || value === "portrait" || value === "panorama";
const syncCrestOptions = (): void => {
  if (!isFamilyChoice(familySelect.value)) throw new Error("Choose an available family.");
  const compatibleCrests =
    familySelect.value === "auto" ? AUTO_CRESTS : FAMILY_CRESTS[familySelect.value];
  const selectedCrest = crestSelect.value;
  if (
    selectedCrest !== "" &&
    (!isCrestChoice(selectedCrest) || !compatibleCrests.includes(selectedCrest))
  ) {
    crestSelect.value = "";
  }
  for (const option of crestSelect.options) {
    option.disabled =
      option.value !== "" &&
      (!isCrestChoice(option.value) || !compatibleCrests.includes(option.value));
  }
};
const formatControl = (value: number): string => value.toFixed(2);
const waitForLayout = async (): Promise<void> => {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};
const paletteOptions = (name: PaletteName): Pick<GateOptionsV3, "stroke" | "surface"> => {
  const palette = PALETTES[name];
  return { stroke: palette.stroke, surface: palette.surface };
};

const readPlaygroundOptions = (): GateOptionsV3 => {
  const seed = seedInput.value.trim();
  if (seed.length === 0) {
    seedInput.setCustomValidity("Enter a non-empty seed.");
    throw new Error("Enter a non-empty seed.");
  }
  seedInput.setCustomValidity("");
  if (!isFamilyChoice(familySelect.value)) throw new Error("Choose an available family.");
  if (!isCrestChoice(crestSelect.value)) throw new Error("Choose an available crest.");
  if (!isPaletteName(paletteSelect.value)) throw new Error("Choose an available paint palette.");
  return {
    generationVersion: 3,
    seed,
    family: familySelect.value,
    density: Number(densityInput.value),
    curvature: Number(curvatureInput.value),
    symmetry: Number(symmetryInput.value),
    peakHeight: Number(peakHeightInput.value),
    sideComplexity: Number(sideComplexityInput.value),
    ...(crestSelect.value === "" ? {} : { crest: crestSelect.value }),
    ...paletteOptions(paletteSelect.value),
  };
};

syncCrestOptions();
const controller = gateFrame(card, readPlaygroundOptions());
let playgroundAction = 0;
let currentCrestChoice: CrestChoice = DEFAULTS.crest;
const markPlaygroundPending = (): number => {
  const action = ++playgroundAction;
  card.dataset.gateFrameStatus = "updating";
  interactionStatus.textContent = "Frame status: updating…";
  return action;
};
const markPlaygroundReady = (
  action: number,
  snapshot: Awaited<ReturnType<GateFrameController["whenReady"]>>,
): void => {
  if (action !== playgroundAction) return;
  card.dataset.gateFrameStatus = "ready";
  card.dataset.seed = String(snapshot.seed);
  card.dataset.family = snapshot.geometry.options.family;
  card.dataset.crest = snapshot.geometry.options.crest;
  interactionStatus.textContent = `Frame ready · ${snapshot.geometry.options.family} · seed ${snapshot.seed}`;
};
const markPlaygroundError = (error: unknown): void => {
  card.dataset.gateFrameStatus = "error";
  interactionStatus.textContent =
    error instanceof Error ? error.message : "The frame could not be updated.";
};
const applyPlaygroundControls = async (waitForResize = false): Promise<void> => {
  const action = markPlaygroundPending();
  if (waitForResize) await waitForLayout();
  const options = readPlaygroundOptions();
  if (currentCrestChoice !== "" && crestSelect.value === "") {
    controller.update({ generationVersion: 1, family: "courtyard" });
  }
  controller.update(options);
  currentCrestChoice = crestSelect.value as CrestChoice;
  markPlaygroundReady(action, await controller.whenReady());
};
const runPlaygroundAction = (action: () => Promise<void>): void => {
  void action().catch(markPlaygroundError);
};
const syncRangeReadouts = (): void => {
  densityOutput.textContent = formatControl(Number(densityInput.value));
  curvatureOutput.textContent = formatControl(Number(curvatureInput.value));
  symmetryOutput.textContent = formatControl(Number(symmetryInput.value));
  peakHeightOutput.textContent = formatControl(Number(peakHeightInput.value));
  sideComplexityOutput.textContent = formatControl(Number(sideComplexityInput.value));
};

visitButton.addEventListener("click", () => {
  card.dataset.interaction = "clicked";
  interactionStatus.textContent = "Content interaction received.";
});
controls.addEventListener("submit", (event) => event.preventDefault());
seedInput.addEventListener("input", () => {
  seedInput.setCustomValidity(seedInput.value.trim().length === 0 ? "Enter a non-empty seed." : "");
});
seedInput.addEventListener("change", () => runPlaygroundAction(() => applyPlaygroundControls()));
for (const input of [
  densityInput,
  curvatureInput,
  symmetryInput,
  peakHeightInput,
  sideComplexityInput,
]) {
  input.addEventListener("input", () => {
    syncRangeReadouts();
    runPlaygroundAction(() => applyPlaygroundControls());
  });
}
familySelect.addEventListener("change", () => {
  syncCrestOptions();
  runPlaygroundAction(() => applyPlaygroundControls());
});
for (const select of [crestSelect, paletteSelect]) {
  select.addEventListener("change", () => runPlaygroundAction(() => applyPlaygroundControls()));
}
aspectSelect.addEventListener("change", () => {
  if (!isPlaygroundAspect(aspectSelect.value)) return;
  card.dataset.canvas = aspectSelect.value;
  runPlaygroundAction(() => applyPlaygroundControls(true));
});
randomizeButton.addEventListener("click", () => {
  runPlaygroundAction(async () => {
    const action = markPlaygroundPending();
    const seed = controller.randomize();
    seedInput.value = String(seed);
    seedInput.setCustomValidity("");
    markPlaygroundReady(action, await controller.whenReady());
  });
});
resetButton.addEventListener("click", () => {
  runPlaygroundAction(async () => {
    seedInput.value = DEFAULTS.seed;
    familySelect.value = DEFAULTS.family;
    crestSelect.value = DEFAULTS.crest;
    densityInput.value = String(DEFAULTS.density);
    curvatureInput.value = String(DEFAULTS.curvature);
    symmetryInput.value = String(DEFAULTS.symmetry);
    peakHeightInput.value = String(DEFAULTS.peakHeight);
    sideComplexityInput.value = String(DEFAULTS.sideComplexity);
    paletteSelect.value = DEFAULTS.palette;
    aspectSelect.value = DEFAULTS.aspect;
    card.dataset.canvas = DEFAULTS.aspect;
    seedInput.setCustomValidity("");
    syncCrestOptions();
    syncRangeReadouts();
    await applyPlaygroundControls(true);
  });
});

const galleryMounts: GalleryMount[] = [];
const setGalleryMountReady = async (mount: GalleryMount): Promise<void> => {
  try {
    const snapshot = await mount.controller.whenReady();
    mount.article.dataset.gateFrameStatus = "ready";
    mount.article.dataset.effectiveFamily = snapshot.geometry.options.family;
  } catch (error) {
    mount.article.dataset.gateFrameStatus = "error";
    mount.article.dataset.error = error instanceof Error ? error.message : "Unknown render error";
  }
};
const loadVariation = async (mount: GalleryMount): Promise<void> => {
  const variation = mount.variation;
  seedInput.value = mount.currentSeed;
  familySelect.value = variation.family;
  crestSelect.value = "";
  densityInput.value = String(variation.density);
  curvatureInput.value = String(variation.curvature);
  symmetryInput.value = String(variation.symmetry);
  peakHeightInput.value = String(variation.peakHeight);
  sideComplexityInput.value = String(variation.sideComplexity);
  paletteSelect.value = variation.palette;
  aspectSelect.value = variation.playgroundAspect;
  card.dataset.canvas = variation.playgroundAspect;
  seedInput.setCustomValidity("");
  syncCrestOptions();
  syncRangeReadouts();
  await applyPlaygroundControls(true);
  card.scrollIntoView({ block: "nearest" });
};

for (const [index, variation] of VARIATIONS.entries()) {
  const article = document.createElement("article");
  article.className = "variation-card";
  article.dataset.variationCard = "";
  article.dataset.gateFrameStatus = "mounting";
  for (const [key, value] of Object.entries(variation)) article.dataset[key] = String(value);
  const frame = document.createElement("div");
  frame.className = `variation-frame variation-frame-${variation.aspect}`;
  frame.dataset.variationFrame = "";
  const details = document.createElement("div");
  details.className = "variation-details";
  const heading = document.createElement("div");
  const place = document.createElement("p");
  place.className = "variation-place";
  place.textContent = `${String(index + 1).padStart(2, "0")} · ${variation.place} · ${variation.family}`;
  const title = document.createElement("h3");
  const titleId = `variation-title-${index + 1}`;
  title.id = titleId;
  title.className = "variation-label";
  title.textContent = variation.title;
  heading.append(place, title);
  const seedReadout = document.createElement("code");
  seedReadout.className = "variation-seed";
  seedReadout.textContent = variation.seed;
  const readout = document.createElement("p");
  const readoutId = `variation-readout-${index + 1}`;
  readout.id = readoutId;
  readout.className = "variation-readout";
  readout.textContent = `${variation.family} · Density ${formatControl(variation.density)} · Curve ${formatControl(variation.curvature)} · Symmetry ${formatControl(variation.symmetry)}`;
  const loadButton = document.createElement("button");
  loadButton.type = "button";
  loadButton.className = "load-variation";
  loadButton.textContent = "Load in playground";
  loadButton.setAttribute("aria-describedby", `${titleId} ${readoutId}`);
  const footer = document.createElement("div");
  footer.className = "variation-footer";
  footer.append(seedReadout, loadButton);
  details.append(heading, readout, footer);
  article.append(frame, details);
  gallery.append(article);

  const variationController = gateFrame(frame, {
    generationVersion: 3,
    seed: variation.seed,
    family: variation.family,
    density: variation.density,
    curvature: variation.curvature,
    symmetry: variation.symmetry,
    peakHeight: variation.peakHeight,
    sideComplexity: variation.sideComplexity,
    ...paletteOptions(variation.palette),
  });
  const mount: GalleryMount = {
    variation,
    article,
    controller: variationController,
    seedReadout,
    currentSeed: variation.seed,
  };
  galleryMounts.push(mount);
  loadButton.addEventListener("click", () => runPlaygroundAction(() => loadVariation(mount)));
  void setGalleryMountReady(mount);
}

shuffleGalleryButton.addEventListener("click", () => {
  shuffleGalleryButton.disabled = true;
  galleryStatus.textContent = "Shuffling the six-family collection.";
  void Promise.all(
    galleryMounts.map(async (mount) => {
      mount.article.dataset.gateFrameStatus = "updating";
      mount.currentSeed = String(mount.controller.randomize());
      mount.article.dataset.seed = mount.currentSeed;
      mount.seedReadout.textContent = mount.currentSeed;
      await setGalleryMountReady(mount);
    }),
  )
    .then(() => {
      galleryStatus.textContent = "The six-family collection has twelve new seeds.";
    })
    .catch((error: unknown) => {
      galleryStatus.textContent =
        error instanceof Error ? error.message : "The collection could not be shuffled.";
    })
    .finally(() => {
      shuffleGalleryButton.disabled = false;
    });
});

void controller.whenReady().then((snapshot) => {
  playgroundAction += 1;
  markPlaygroundReady(playgroundAction, snapshot);
}, markPlaygroundError);
window.addEventListener(
  "pagehide",
  () => {
    controller.destroy();
    for (const mount of galleryMounts) mount.controller.destroy();
  },
  { once: true },
);
