/* eslint-disable react/no-unknown-property */
// React Bits - Lanyard, adapted to be asset-free (procedural card + solid band)
// so it runs without the original card.glb / lanyard.png binaries.
// Requires: @react-three/fiber, @react-three/drei, @react-three/rapier, meshline, three
// TODO(photo): swap the light "photo" plane material below for a texture of your headshot.
import { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas, extend, useFrame } from '@react-three/fiber';
import { Environment, Lightformer, Text, RoundedBox } from '@react-three/drei';
import { BallCollider, CuboidCollider, Physics, RigidBody, useRopeJoint, useSphericalJoint } from '@react-three/rapier';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline';
import * as THREE from 'three';
import './Lanyard.css';

extend({ MeshLineGeometry, MeshLineMaterial });

// Fonts for the card text (troika loads .woff at runtime). Matches the site.
const FONT_GROTESK = 'https://cdn.jsdelivr.net/npm/@fontsource/space-grotesk@5/files/space-grotesk-latin-700-normal.woff';
const FONT_MONO = 'https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5/files/jetbrains-mono-latin-500-normal.woff';

export default function Lanyard({ position = [0, 0, 18], gravity = [0, -40, 0], fov = 20, transparent = true }) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="lanyard-wrapper">
      <Canvas
        camera={{ position, fov }}
        dpr={[1, isMobile ? 1.5 : 2]}
        gl={{ alpha: transparent }}
        onCreated={({ gl }) => gl.setClearColor(new THREE.Color(0x000000), transparent ? 0 : 1)}
      >
        <ambientLight intensity={Math.PI} />
        <Physics gravity={gravity} timeStep={isMobile ? 1 / 30 : 1 / 60}>
          <Band isMobile={isMobile} />
        </Physics>
        <Environment blur={0.75}>
          <Lightformer intensity={2} color="white" position={[0, -1, 5]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={3} color="white" position={[-1, -1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={3} color="white" position={[1, 1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={10} color="white" position={[-10, 0, 14]} rotation={[0, Math.PI / 2, Math.PI / 3]} scale={[100, 10, 1]} />
        </Environment>
      </Canvas>
    </div>
  );
}

function Band({ maxSpeed = 50, minSpeed = 0, isMobile = false }) {
  const band = useRef(), fixed = useRef(), j1 = useRef(), j2 = useRef(), j3 = useRef(), card = useRef();
  const vec = new THREE.Vector3(), ang = new THREE.Vector3(), rot = new THREE.Vector3(), dir = new THREE.Vector3();
  const segmentProps = { type: 'dynamic', canSleep: true, colliders: false, angularDamping: 4, linearDamping: 4 };
  const [curve] = useState(() => new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]));
  const [dragged, drag] = useState(false);
  const [hovered, hover] = useState(false);

  // clean uniform dot-grid block for the card (transparent background)
  const qrTex = useMemo(() => {
    const size = 120;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#2b2b38';
    const n = 6;
    const gap = 4;
    const cell = (size - gap * (n + 1)) / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) ctx.fillRect(gap + i * (cell + gap), gap + j * (cell + gap), cell, cell);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    return t;
  }, []);

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1]);
  useSphericalJoint(j3, card, [[0, 0, 0], [0, 1.5, 0]]);

  useEffect(() => {
    if (hovered) {
      document.body.style.cursor = dragged ? 'grabbing' : 'grab';
      return () => void (document.body.style.cursor = 'auto');
    }
  }, [hovered, dragged]);

  useFrame((state, delta) => {
    if (dragged) {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
      dir.copy(vec).sub(state.camera.position).normalize();
      vec.add(dir.multiplyScalar(state.camera.position.length()));
      [card, j1, j2, j3, fixed].forEach(ref => ref.current?.wakeUp());
      card.current?.setNextKinematicTranslation({ x: vec.x - dragged.x, y: vec.y - dragged.y, z: vec.z - dragged.z });
    }
    if (fixed.current) {
      [j1, j2].forEach(ref => {
        if (!ref.current.lerped) ref.current.lerped = new THREE.Vector3().copy(ref.current.translation());
        const clampedDistance = Math.max(0.1, Math.min(1, ref.current.lerped.distanceTo(ref.current.translation())));
        ref.current.lerped.lerp(ref.current.translation(), delta * (minSpeed + clampedDistance * (maxSpeed - minSpeed)));
      });
      curve.points[0].copy(j3.current.translation());
      curve.points[1].copy(j2.current.lerped);
      curve.points[2].copy(j1.current.lerped);
      curve.points[3].copy(fixed.current.translation());
      band.current.geometry.setPoints(curve.getPoints(isMobile ? 16 : 32));
      ang.copy(card.current.angvel());
      rot.copy(card.current.rotation());
      card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z });
    }
  });

  curve.curveType = 'chordal';

  return (
    <>
      <group position={[0, 4, 0]}>
        <RigidBody ref={fixed} {...segmentProps} type="fixed" />
        <RigidBody position={[0.5, 0, 0]} ref={j1} {...segmentProps}><BallCollider args={[0.1]} /></RigidBody>
        <RigidBody position={[1, 0, 0]} ref={j2} {...segmentProps}><BallCollider args={[0.1]} /></RigidBody>
        <RigidBody position={[1.5, 0, 0]} ref={j3} {...segmentProps}><BallCollider args={[0.1]} /></RigidBody>
        <RigidBody position={[2, 0, 0]} ref={card} {...segmentProps} type={dragged ? 'kinematicPosition' : 'dynamic'}>
          <CuboidCollider args={[0.8, 1.125, 0.01]} />
          <group
            onPointerOver={() => hover(true)}
            onPointerOut={() => hover(false)}
            onPointerUp={e => (e.target.releasePointerCapture(e.pointerId), drag(false))}
            onPointerDown={e => (e.target.setPointerCapture(e.pointerId), drag(new THREE.Vector3().copy(e.point).sub(vec.copy(card.current.translation()))))}
          >
            {/* card body - light, slim, rounded */}
            <RoundedBox args={[1.6, 2.25, 0.03]} radius={0.1} smoothness={6}>
              <meshPhysicalMaterial color="#f4f2ee" roughness={0.35} metalness={0} clearcoat={1} clearcoatRoughness={0.25} />
            </RoundedBox>
            {/* top code label */}
            <Text font={FONT_MONO} position={[-0.66, 0.74, 0.02]} fontSize={0.1} color="#7c3aed" anchorX="left" anchorY="middle" letterSpacing={0.16}>
              MOHAN.DOGRA
            </Text>
            {/* violet hairline accent */}
            <mesh position={[-0.4, 0.34, 0.018]}>
              <boxGeometry args={[0.5, 0.024, 0.008]} />
              <meshStandardMaterial color="#6d3cff" emissive="#6d3cff" emissiveIntensity={0.35} />
            </mesh>
            {/* big name */}
            <Text font={FONT_GROTESK} position={[-0.66, -0.04, 0.02]} fontSize={0.26} color="#1d1d1f" anchorX="left" anchorY="middle" lineHeight={1.05} maxWidth={1.4}>
              {'Data\nScientist'}
            </Text>
            {/* role */}
            <Text font={FONT_MONO} position={[-0.66, -0.52, 0.02]} fontSize={0.095} color="#6b6b70" anchorX="left" anchorY="middle" letterSpacing={0.05}>
              Bentonville, AR
            </Text>
            {/* QR grid */}
            <mesh position={[0.44, -0.74, 0.018]}>
              <planeGeometry args={[0.4, 0.4]} />
              <meshBasicMaterial map={qrTex} transparent toneMapped={false} />
            </mesh>
            {/* id */}
            <Text font={FONT_MONO} position={[-0.66, -0.98, 0.02]} fontSize={0.085} color="#a7a7b0" anchorX="left" anchorY="middle" letterSpacing={0.1}>
              ID-2026-MD
            </Text>
            {/* punch hole + clip */}
            <mesh position={[0, 1.05, 0]}>
              <torusGeometry args={[0.11, 0.028, 12, 24]} />
              <meshStandardMaterial color="#b7bac1" metalness={0.85} roughness={0.3} />
            </mesh>
          </group>
        </RigidBody>
      </group>
      <mesh ref={band}>
        <meshLineGeometry />
        <meshLineMaterial color="#6d3cff" depthTest={false} resolution={isMobile ? [1000, 2000] : [1000, 1000]} lineWidth={0.6} />
      </mesh>
    </>
  );
}
