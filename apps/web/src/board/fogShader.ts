import { Geometry, Mesh, Shader, type Texture } from "pixi.js";
import { FOG_DISTANCE_RANGE, FOG_FEATHER_CELLS, type Rgb } from "./fogTexture";

/**
 * The players' fog body (flowing-fog): one quad over the part of the board on screen, coloured by a
 * shader. It reads the fog bank twice, at two scales, and bends both reads by a third, slower read
 * drifting the other way, so the clouds curl and fold instead of sliding. Its opacity comes from the
 * fog's distance field (`fogDistanceField`): opaque inside every region, fading out past the edge
 * through the same curve as `fogEdgeAlpha`, which slow noise pushes in and out. GLSL only: the board
 * never asks Pixi for WebGPU.
 */

/** A fog bank tile spans this many grid cells, so its swirls are a few cells across. */
export const FOG_BANK_CELLS = 16;

const num = (n: number) => n.toFixed(4);

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vBoard;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uRect;

void main() {
  vBoard = uRect.xy + aPosition * uRect.zw;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(vBoard, 1.0)).xy, 0.0, 1.0);
}
`;

const fragment = /* glsl */ `
precision highp float;

in vec2 vBoard;
out vec4 finalColor;

uniform sampler2D uBank;
uniform sampler2D uDistance;
uniform vec4 uColor;
uniform float uTime;
uniform vec2 uDistanceScale;
uniform float uCell;
uniform vec3 uDark;
uniform vec3 uLight;

const float FEATHER = ${num(FOG_FEATHER_CELLS)};
const float RANGE = ${num(FOG_DISTANCE_RANGE)};
const float BILLOW = 0.25;

float bank(vec2 p) {
  return texture(uBank, p).r;
}

// fogEdgeAlpha in fogTexture.ts, kept the same.
float edgeAlpha(float d, float n) {
  if (d >= 0.0) return 1.0;
  float u = clamp(1.0 + d / FEATHER, 0.0, 1.0);
  float v = clamp(u + (n - 0.5) * 2.0 * BILLOW * 4.0 * u * (1.0 - u), 0.0, 1.0);
  return v * v * (3.0 - 2.0 * v);
}

void main() {
  float d = (texture(uDistance, vBoard * uDistanceScale).r - 0.5) * 2.0 * RANGE;
  if (d <= -FEATHER) discard;
  vec2 p = vBoard / (uCell * ${num(FOG_BANK_CELLS)});
  float t = uTime;
  // A slow field drifting against the wind bends where the clouds are read, so they curl and fold.
  vec2 warp = vec2(
    bank(p * 0.37 + vec2(-0.004, 0.009) * t),
    bank(p * 0.37 + vec2(0.31, 0.67) + vec2(0.007, -0.003) * t)
  ) - 0.5;
  float a = bank(p + warp * 0.3 + vec2(0.016, 0.0056) * t);
  float b = bank(p * 1.61 + vec2(0.5, 0.21) + warp * 0.45 + vec2(-0.011, 0.008) * t);
  float density = mix(a, b, 0.3);
  vec3 colour = mix(uDark, uLight, smoothstep(0.08, 0.92, density));
  // Edge noise about a cell across, so the fade reaches out and pulls back in tongues.
  float n = bank(vBoard / (uCell * 4.0) + warp * 0.3 + vec2(0.013, -0.009) * t);
  float alpha = edgeAlpha(d, n) * uColor.a;
  finalColor = vec4(colour * alpha, alpha);
}
`;

const rgb = (c: Rgb) => new Float32Array([c[0] / 255, c[1] / 255, c[2] / 255]);

export class FogBody {
  readonly mesh: Mesh<Geometry, Shader>;
  private shader: Shader;

  constructor(bank: Texture, distance: Texture) {
    this.shader = Shader.from({
      gl: { vertex, fragment, name: "fog-body" },
      resources: {
        uBank: bank.source,
        uDistance: distance.source,
        fogUniforms: {
          uRect: { value: new Float32Array([0, 0, 1, 1]), type: "vec4<f32>" },
          uTime: { value: 0, type: "f32" },
          uDistanceScale: { value: new Float32Array([1, 1]), type: "vec2<f32>" },
          uCell: { value: 1, type: "f32" },
          uDark: { value: new Float32Array(3), type: "vec3<f32>" },
          uLight: { value: new Float32Array(3), type: "vec3<f32>" },
        },
      },
    });
    // A unit square; the vertex shader stretches it over `uRect`.
    const geometry = new Geometry({
      attributes: { aPosition: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]) },
      indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    this.mesh = new Mesh({ geometry, shader: this.shader });
    this.mesh.eventMode = "none";
  }

  private get uniforms() {
    return this.shader.resources.fogUniforms.uniforms as {
      uRect: Float32Array;
      uTime: number;
      uDistanceScale: Float32Array;
      uCell: number;
      uDark: Float32Array;
      uLight: Float32Array;
    };
  }

  setBank(bank: Texture) {
    this.shader.resources.uBank = bank.source;
  }

  /** The distance field's texture and its size in samples, `scale` samples per board pixel. */
  setDistance(distance: Texture, cols: number, rows: number, scale: number, cell: number) {
    this.shader.resources.uDistance = distance.source;
    this.uniforms.uDistanceScale.set([scale / cols, scale / rows]);
    this.uniforms.uCell = cell;
  }

  setPalette(dark: Rgb, light: Rgb) {
    this.uniforms.uDark.set(rgb(dark));
    this.uniforms.uLight.set(rgb(light));
  }

  /** The board rectangle to cover, in board pixels. */
  setRect(x: number, y: number, width: number, height: number) {
    this.uniforms.uRect.set([x, y, width, height]);
  }

  setTime(seconds: number) {
    this.uniforms.uTime = seconds;
  }

  destroy() {
    this.mesh.destroy({ children: true });
    this.shader.destroy(true);
  }
}
