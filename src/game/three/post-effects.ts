import { DepthOfFieldEffect, Effect, MaskFunction } from "postprocessing";
import * as THREE from "three";

const gradeFragment = /* glsl */ `
uniform vec3 tint;
uniform float saturation;
uniform float contrast;
uniform float exposure;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = max(inputColor.rgb, 0.0) * tint * exposure;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, saturation), 0.0);
  // log-style contrast pivoting on mid grey; runs before ACES so highlights stay soft
  c = 0.18 * pow(c / 0.18, vec3(contrast));
  outputColor = vec4(c, inputColor.a);
}
`;

const sanitizeFragment = /* glsl */ `
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec4 c = inputColor;
  // NaN/Inf guard: a single bad pixel would otherwise be smeared over the whole frame by
  // the bloom mip chain and the DoF blur. Comparisons against NaN are always false.
  bool bad = !(c.r >= 0.0 || c.r < 0.0) || !(c.g >= 0.0 || c.g < 0.0) || !(c.b >= 0.0 || c.b < 0.0) || max(max(c.r, c.g), c.b) > 6.0e4;
  outputColor = bad ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(max(c.rgb, vec3(0.0)), c.a);
}
`;

/** Replaces NaN/Inf/negative pixels before any blur so one bad shader can't black out the frame. */
export class SanitizeEffect extends Effect {
  constructor() {
    super("SanitizeEffect", sanitizeFragment);
  }
}

/**
 * Small linear-HDR colour grade (tint, saturation, contrast, exposure). Neutral values
 * (tint 1, saturation 1, contrast 1, exposure 1) leave the image untouched. Place it
 * before tone mapping.
 */
export class GradeEffect extends Effect {
  constructor() {
    super("GradeEffect", gradeFragment, {
      uniforms: new Map<string, THREE.Uniform>([
        ["tint", new THREE.Uniform(new THREE.Vector3(1, 1, 1))],
        ["saturation", new THREE.Uniform(1)],
        ["contrast", new THREE.Uniform(1)],
        ["exposure", new THREE.Uniform(1)],
      ]),
    });
  }

  setGrade(tint: THREE.Vector3, saturation: number, contrast: number, exposure: number) {
    (this.uniforms.get("tint")!.value as THREE.Vector3).copy(tint);
    this.uniforms.get("saturation")!.value = saturation;
    this.uniforms.get("contrast")!.value = contrast;
    this.uniforms.get("exposure")!.value = exposure;
  }
}

/**
 * Depth of field driven by a single 0..1 amount (opacity + bokeh scale). Focus follows
 * a world-space target (the dealer's hand) via the built-in auto-focus.
 */
export class CinematicDof extends DepthOfFieldEffect {
  constructor(camera: THREE.Camera, focus: THREE.Vector3, focusRange: number) {
    super(camera, { focusRange, bokehScale: 0, resolutionScale: 0.5 });
    this.target = focus.clone();
    this.maskFunction = MaskFunction.MULTIPLY_RGB_SET_ALPHA;
    this.blendMode.opacity.value = 0;
  }

  /** 0 = off (free), 1 = full bokeh at `maxBokeh`. */
  setAmount(amount: number, maxBokeh: number) {
    const a = Math.min(1, Math.max(0, amount));
    this.blendMode.opacity.value = a < 0.002 ? 0 : Math.min(1, a * 1.6);
    this.bokehScale = a * maxBokeh;
  }

  // Note: the CoC/blur buffers must be rendered every frame even while faded out. The
  // composite shader still samples them, and uninitialised targets can hold NaNs on some
  // GPUs (NVIDIA), which survive a 0-opacity blend and turn the whole frame black.
}
