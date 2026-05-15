import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import './NeuralMicInterface.css';

const THREADS = 260;
const PARTICLES_PER_THREAD = 420;
const PARTICLE_COUNT = THREADS * PARTICLES_PER_THREAD;

const vertexShader = `
  precision highp float;
  uniform float uTime;
  uniform float uLevel;
  uniform float uListening;
  attribute vec3 aRandom;
  varying float vAlpha;
  varying float vPulse;

  float radiusAtY(float y) {
    return 1.55 * sqrt(1.0 + (y * y) / 5.9);
  }

  void main() {
    float speed = 0.085 + 0.06 * aRandom.z + uLevel * 0.22;
    float progress = fract(aRandom.x + uTime * speed);
    float y = mix(4.2, -4.2, progress);
    float twist = progress * 3.1415926 + uTime * 0.08;
    float phi = 6.2831853 * aRandom.y + twist;
    float r = radiusAtY(y) * mix(0.72, 1.0, aRandom.z);
    float pulse = smoothstep(0.08, 0.0, abs(progress - fract(uTime * 0.42))) * uLevel;
    vec3 pos = vec3(r * cos(phi), y, r * sin(phi));
    pos += normalize(vec3(pos.x, 0.0, pos.z)) * pulse * 0.48;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = (7.5 + uLevel * 8.0 + pulse * 9.0) / max(0.001, -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;

    float neckGlow = 1.0 - smoothstep(0.0, 1.45, abs(y));
    float edgeFade = smoothstep(0.0, 0.08, progress) * (1.0 - smoothstep(0.92, 1.0, progress));
    vPulse = pulse;
    vAlpha = (0.22 + neckGlow * 0.58 + uListening * 0.14 + pulse * 0.42) * edgeFade;
  }
`;

const fragmentShader = `
  precision highp float;
  uniform vec3 uGold;
  uniform vec3 uFire;
  varying float vAlpha;
  varying float vPulse;

  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float r = dot(uv, uv);
    if (r > 1.0) discard;
    float falloff = pow(1.0 - r, 1.7);
    vec3 color = mix(uGold, uFire, clamp(vPulse * 1.6, 0.0, 1.0));
    color += vec3(1.0, 0.82, 0.34) * vPulse * 0.42;
    gl_FragColor = vec4(color, vAlpha * falloff);
  }
`;

function createParticleGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3));

  const randoms = new Float32Array(PARTICLE_COUNT * 3);
  let idx = 0;
  for (let t = 0; t < THREADS; t += 1) {
    const phiFrac = t / THREADS;
    const layer = Math.random();
    for (let j = 0; j < PARTICLES_PER_THREAD; j += 1) {
      const i3 = idx * 3;
      randoms[i3] = Math.random();
      randoms[i3 + 1] = phiFrac;
      randoms[i3 + 2] = layer;
      idx += 1;
    }
  }
  geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 3));
  return geometry;
}

const NeuralMicInterface = ({ isListening, isThinking }) => {
  const canvasRef = useRef(null);
  const threeRef = useRef({});
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(67, 1, 0.1, 160);
    camera.position.set(9.5, 0.2, 0.001);
    camera.lookAt(0, 0, 0);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uLevel: { value: 0 },
        uListening: { value: 0 },
        uGold: { value: new THREE.Color('#ffd86b') },
        uFire: { value: new THREE.Color('#ff6b35') },
      },
      vertexShader,
      fragmentShader,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });

    const particles = new THREE.Points(createParticleGeometry(), material);
    scene.add(particles);

    const core = new THREE.Points(
      new THREE.SphereGeometry(1.05, 42, 42),
      new THREE.PointsMaterial({
        size: 0.025,
        color: '#ffd86b',
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.84,
        depthWrite: false,
      })
    );
    scene.add(core);

    const state = {
      renderer,
      scene,
      camera,
      material,
      particles,
      core,
      timer: new THREE.Timer(),
      level: 0,
      listening: false,
      thinking: false,
      burstAccumulator: 0,
    };
    threeRef.current = state;

    const resize = () => {
      const parent = canvas.parentElement;
      const width = parent?.clientWidth || window.innerWidth * 0.5;
      const height = parent?.clientHeight || window.innerHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    };

    const animate = () => {
      const s = threeRef.current;
      s.timer.update();
      const t = s.timer.getElapsed();
      const target = s.listening
        ? 0.32 + Math.abs(Math.sin(t * 5.8)) * 0.18 + Math.random() * 0.08
        : s.thinking
          ? 0.22 + Math.abs(Math.sin(t * 2.2)) * 0.08
          : 0.06 + Math.abs(Math.sin(t * 1.1)) * 0.025;

      s.level += (target - s.level) * 0.08;
      s.material.uniforms.uTime.value = t;
      s.material.uniforms.uLevel.value = s.level;
      s.material.uniforms.uListening.value = s.listening ? 1 : 0;

      s.particles.rotation.y = t * 0.035;
      s.particles.rotation.x = Math.sin(t * 0.24) * 0.05;
      s.core.rotation.y = t * 0.18;
      s.core.rotation.x = Math.sin(t * 0.8) * 0.2;
      const coreScale = 1 + s.level * 0.34;
      s.core.scale.set(coreScale, coreScale, coreScale);

      s.renderer.render(s.scene, s.camera);
      rafRef.current = requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener('resize', resize);
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.current);
      particles.geometry.dispose();
      material.dispose();
      core.geometry.dispose();
      core.material.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (threeRef.current) {
      threeRef.current.listening = isListening;
      threeRef.current.thinking = isThinking;
    }
  }, [isListening, isThinking]);

  return (
    <section className="neural-mic-interface" aria-label="Neural microphone interface">
      <div className="mic-glow mic-glow-one" />
      <div className="mic-glow mic-glow-two" />
      <canvas ref={canvasRef} className="neural-mic-canvas" />
    </section>
  );
};

export default NeuralMicInterface;
