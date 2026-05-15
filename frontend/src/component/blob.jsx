import { useState, useEffect, useRef } from "react";
import * as THREE from "three";

const DOT_VERT = `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uMotion;
uniform float uPointSize;
attribute float aPhase;
attribute float aAmp;
varying float vGlow;
varying float vAudio;
varying vec3 vWorld;
void main(){
  vec3 dir=normalize(position);
  float slow=uTime*(0.65+uMotion*.5);
  float wave=sin((dir.y*4.4)+(dir.x*2.1)+slow+aPhase)*0.034;
  wave+=sin((dir.z*5.2)-slow*1.35+aPhase*.7)*0.026;
  float audio=(uBass*.34)+(uMid*.18)+(uTreble*.1);
  float pulse=sin(uTime*1.8+aPhase)*0.012;
  vec3 displaced=position+dir*((wave*aAmp)+pulse+audio);
  displaced.x+=sin(uTime*.7+aPhase)*0.012*aAmp*uMotion;
  displaced.y+=cos(uTime*.55+aPhase*.6)*0.018*aAmp*uMotion;
  vec4 mv=modelViewMatrix*vec4(displaced,1.);
  gl_Position=projectionMatrix*mv;
  float depth=clamp((displaced.z+1.0)*0.5,0.,1.);
  vGlow=depth*(0.62+aAmp*.42);
  vAudio=audio;
  vWorld=displaced;
  gl_PointSize=uPointSize*(1.0+audio*1.7+aAmp*.2)*(260.0/-mv.z);
}
`;

const DOT_FRAG = `
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform float uBass;
uniform float uTreble;
varying float vGlow;
varying float vAudio;
varying vec3 vWorld;
void main(){
  vec2 uv=gl_PointCoord-.5;
  float d=length(uv);
  float soft=smoothstep(.5,.05,d);
  if(soft<=0.01) discard;
  float latitude=clamp((vWorld.y+1.0)*0.5,0.,1.);
  vec3 col=mix(uC0,uC1,latitude);
  col=mix(col,uC2,smoothstep(.38,1.,vGlow+uTreble*.5));
  col=mix(col,uC2,smoothstep(.72,1.18,vGlow+vAudio));
  float alpha=soft*(.11+vGlow*.2+uBass*.16);
  gl_FragColor=vec4(col*(.68+vAudio*.9),alpha);
}
`;

export default function VoiceOrb({ blobSettings, setBlobSettings, isDragMode, setIsDragMode }) {
    const mountRef = useRef(null);
    const threeRef = useRef({});
    const audioRef = useRef({});
    const dragRef = useRef({ active: false, prev: { x: 0, y: 0 } });

    const colorHex = blobSettings?.color || '#0088ff';
    const size = blobSettings?.size || 1.0;
    const sensitivity = blobSettings?.sensitivity || 2.0;
    const motion = blobSettings?.motion || 1.0;
    const position = blobSettings?.position;

    const settingsRef = useRef({ sensitivity, motion });
    const dragModeRef = useRef(isDragMode);
    const colorRef = useRef(colorHex);

    const ORB_SIZE = 430;
    const [localPos, setLocalPos] = useState({
        x: Math.max(20, Math.round((window.innerWidth - ORB_SIZE) * 0.42)),
        y: Math.max(96, Math.round((window.innerHeight - ORB_SIZE) * 0.5))
    });

    useEffect(() => {
        settingsRef.current = { sensitivity, motion };
    }, [sensitivity, motion]);

    useEffect(() => {
        colorRef.current = colorHex;
    }, [colorHex]);

    useEffect(() => {
        dragModeRef.current = isDragMode;
    }, [isDragMode]);

    useEffect(() => {
        if (position && position.x !== null && position.y !== null) {
            setLocalPos(position);
        }
    }, [position]);

    // Apply color changes
    useEffect(() => {
        if (threeRef.current.dotMat) {
            const baseColor = new THREE.Color(colorHex);
            threeRef.current.dotMat.uniforms.uC0.value = baseColor.clone().multiplyScalar(0.16);
            threeRef.current.dotMat.uniforms.uC1.value = baseColor.clone().multiplyScalar(0.74);
            threeRef.current.dotMat.uniforms.uC2.value = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.32);
        }
    }, [colorHex]);

    // Apply size changes
    useEffect(() => {
        if (threeRef.current.group) {
            threeRef.current.group.scale.set(size, size, size);
        }
    }, [size]);

    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) return;

        const W = mount.clientWidth, H = mount.clientHeight;
        const scene = new THREE.Scene();

        const camera = new THREE.PerspectiveCamera(72, W / H, 0.1, 100);
        camera.position.z = 2.6;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(W, H);
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.domElement.style.display = "block";
        mount.appendChild(renderer.domElement);

        const group = new THREE.Group();
        group.position.y = 0.1; // Centered to golden ring
        scene.add(group);

        const pointCount = 980;
        const positions = new Float32Array(pointCount * 3);
        const phases = new Float32Array(pointCount);
        const amps = new Float32Array(pointCount);
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));

        for (let i = 0; i < pointCount; i++) {
            const t = i / Math.max(1, pointCount - 1);
            const y = 1 - t * 2;
            const radius = Math.sqrt(Math.max(0, 1 - y * y));
            const theta = i * goldenAngle;
            const shell = 0.78 + ((i % 7) / 6) * 0.12;
            positions[i * 3] = Math.cos(theta) * radius * shell;
            positions[i * 3 + 1] = y * shell;
            positions[i * 3 + 2] = Math.sin(theta) * radius * shell;
            phases[i] = (i * 0.37) % (Math.PI * 2);
            amps[i] = 0.62 + ((i * 19) % 100) / 100;
        }

        const dotGeo = new THREE.BufferGeometry();
        dotGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        dotGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
        dotGeo.setAttribute('aAmp', new THREE.BufferAttribute(amps, 1));

        const baseColor = new THREE.Color(colorRef.current);
        const dotMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uBass: { value: 0 },
                uMid: { value: 0 },
                uTreble: { value: 0 },
                uMotion: { value: settingsRef.current.motion },
                uPointSize: { value: 0.95 },
                uC0: { value: baseColor.clone().multiplyScalar(0.16) },
                uC1: { value: baseColor.clone().multiplyScalar(0.74) },
                uC2: { value: baseColor.clone().lerp(new THREE.Color(0xffffff), 0.32) },
            },
            vertexShader: DOT_VERT,
            fragmentShader: DOT_FRAG,
            transparent: true,
            blending: THREE.NormalBlending,
            depthWrite: false,
        });
        const dotSphere = new THREE.Points(dotGeo, dotMat);
        group.add(dotSphere);

        threeRef.current = { scene, camera, renderer, group, dotMat, dotGeo };

        // Mouse drag
        const el = renderer.domElement;
        const onDown = (e) => { 
            if (dragModeRef.current) return;
            dragRef.current = { active: true, prev: { x: e.clientX, y: e.clientY } }; 
        };
        const onMove = (e) => {
            if (!dragRef.current.active || dragModeRef.current) return;
            const dx = e.clientX - dragRef.current.prev.x;
            const dy = e.clientY - dragRef.current.prev.y;
            group.rotation.y += dx * 0.005;
            group.rotation.x += dy * 0.005;
            dragRef.current.prev = { x: e.clientX, y: e.clientY };
        };
        const onUp = () => { dragRef.current.active = false; };
        el.addEventListener("mousedown", onDown);
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);

        // Touch
        const onTouch = (e) => { 
            if (e.touches[0] && !dragModeRef.current) { 
                dragRef.current = { active: true, prev: { x: e.touches[0].clientX, y: e.touches[0].clientY } }; 
            } 
        };
        const onTouchMove = (e) => {
            if (!dragRef.current.active || !e.touches[0] || dragModeRef.current) return;
            const dx = e.touches[0].clientX - dragRef.current.prev.x;
            const dy = e.touches[0].clientY - dragRef.current.prev.y;
            group.rotation.y += dx * 0.005;
            group.rotation.x += dy * 0.005;
            dragRef.current.prev = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        };
        el.addEventListener("touchstart", onTouch, { passive: true });
        window.addEventListener("touchmove", onTouchMove, { passive: true });
        window.addEventListener("touchend", onUp);

        // Resize
        const onResize = () => {
            const w = mount.clientWidth, h = mount.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        };
        window.addEventListener("resize", onResize);

        // Animate
        let startTime = performance.now();
        let raf;
        const animate = () => {
            raf = requestAnimationFrame(animate);
            const t = (performance.now() - startTime) / 1000;

            const { analyser, dataArray } = audioRef.current;
            let bass = 0, mid = 0, treble = 0;

            if (analyser && dataArray) {
                analyser.getByteFrequencyData(dataArray);
                const len = dataArray.length;
                const be = Math.floor(len * 0.07);
                const me = Math.floor(len * 0.33);
                for (let i = 0; i < be; i++) bass += dataArray[i];
                bass /= be * 255;
                for (let i = be; i < me; i++) mid += dataArray[i];
                mid /= (me - be) * 255;
                for (let i = me; i < len; i++) treble += dataArray[i];
                treble /= (len - me) * 255;

                // Increase sensitivity only when sound is detected (above a noise floor)
                const noiseFloor = 0.005;
                const activeMultiplier = settingsRef.current.sensitivity;
                bass = bass > noiseFloor ? Math.min(0.5, bass * activeMultiplier) : bass;
                mid = mid > noiseFloor ? Math.min(0.5, mid * activeMultiplier) : mid;
                treble = treble > noiseFloor ? Math.min(0.5, treble * activeMultiplier) : treble;

                const lerp = 0.14;
                dotMat.uniforms.uBass.value += (bass - dotMat.uniforms.uBass.value) * lerp;
                dotMat.uniforms.uMid.value += (mid - dotMat.uniforms.uMid.value) * lerp;
                dotMat.uniforms.uTreble.value += (treble - dotMat.uniforms.uTreble.value) * lerp;
                dotMat.uniforms.uMotion.value = settingsRef.current.motion;
            } else {
                const breath = (Math.sin(t * 0.3) * 0.5 + 0.5) * 0.005;
                dotMat.uniforms.uBass.value = breath;
                dotMat.uniforms.uMid.value = breath * 0.2;
                dotMat.uniforms.uTreble.value = breath * 0.1;
                dotMat.uniforms.uMotion.value = settingsRef.current.motion;
            }

            dotMat.uniforms.uTime.value = t;

            if (!dragRef.current.active && !dragModeRef.current) {
                // Smooth rotation and floating hover effect
                group.rotation.y += 0.002 * settingsRef.current.motion;
                group.rotation.x = Math.sin(t * 0.5 * settingsRef.current.motion) * 0.05;
                group.position.y = 0.1 + Math.sin(t * 0.8 * settingsRef.current.motion) * 0.012;
            } else if (!dragModeRef.current) {
                // Return to stable center when interacting
                group.position.y += (0.1 - group.position.y) * 0.1;
            }

            renderer.render(scene, camera);
        };
        animate();

        return () => {
            cancelAnimationFrame(raf);
            el.removeEventListener("mousedown", onDown);
            el.removeEventListener("touchstart", onTouch);
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            window.removeEventListener("touchmove", onTouchMove);
            window.removeEventListener("touchend", onUp);
            window.removeEventListener("resize", onResize);
            dotGeo.dispose();
            dotMat.dispose();
            renderer.dispose();
            if (mount.contains(el)) mount.removeChild(el);
        };
    }, []);

    return (
        <div className="orb-stage" style={{ position: "relative", width: "100%", height: "100vh", background: "transparent", overflow: "hidden", fontFamily: "'Orbitron', sans-serif" }}>

            {/* Draggable Blob Container */}
            <div 
                className="voice-orb-shell"
                style={{
                    position: "absolute",
                    left: localPos.x,
                    top: localPos.y,
                    width: ORB_SIZE, 
                    height: ORB_SIZE,
                    border: isDragMode ? "2px dashed #00ffe1" : "none",
                    cursor: isDragMode ? "move" : "default",
                    zIndex: isDragMode ? 1000 : 1,
                    background: isDragMode ? "rgba(0, 255, 225, 0.05)" : "transparent",
                    borderRadius: "50%",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center"
                }}
                onMouseDown={(e) => {
                    if (!isDragMode) return;
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const startPos = { ...localPos };
                    
                    const onMouseMove = (eMove) => {
                        setLocalPos({
                            x: startPos.x + (eMove.clientX - startX),
                            y: startPos.y + (eMove.clientY - startY)
                        });
                    };
                    const onMouseUp = () => {
                        window.removeEventListener('mousemove', onMouseMove);
                        window.removeEventListener('mouseup', onMouseUp);
                    };
                    window.addEventListener('mousemove', onMouseMove);
                    window.addEventListener('mouseup', onMouseUp);
                }}
            >
                <div ref={mountRef} style={{ width: ORB_SIZE, height: ORB_SIZE }} />
                
                {isDragMode && (
                    <button 
                        onClick={() => {
                            if (setBlobSettings) {
                                setBlobSettings(prev => ({ ...prev, position: localPos }));
                            }
                            if (setIsDragMode) setIsDragMode(false);
                        }}
                        style={{
                            position: 'absolute', 
                            top: -40, 
                            background: '#00ffe1', 
                            color: '#000', 
                            border: 'none', 
                            padding: '8px 16px',
                            fontWeight: 'bold', 
                            cursor: 'pointer', 
                            borderRadius: 4, 
                            zIndex: 10,
                            pointerEvents: 'auto',
                            boxShadow: '0 0 15px rgba(0, 255, 225, 0.6)'
                        }}
                    >
                        SAVE POSITION
                    </button>
                )}
            </div>

        </div>
    );
}
