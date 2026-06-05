import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { TorusKnot, MeshTransmissionMaterial, Float, Environment } from '@react-three/drei';

const AnimatedShape = () => {
  const meshRef = useRef();

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.2;
      meshRef.current.rotation.y += delta * 0.3;
    }
  });

  return (
    <Float speed={2} rotationIntensity={1} floatIntensity={2}>
      <TorusKnot ref={meshRef} args={[1, 0.3, 128, 32]} scale={1.5}>
        <MeshTransmissionMaterial 
          backside
          backsideThickness={1}
          thickness={0.5}
          chromaticAberration={0.5}
          ior={1.5}
          color="#eff6ff"
          transmission={1}
          roughness={0.1}
        />
      </TorusKnot>
    </Float>
  );
};

const Hero3D = () => {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: '400px' }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} color="#2563eb" />
        <directionalLight position={[-10, -10, -5]} intensity={0.5} color="#60a5fa" />
        <AnimatedShape />
        <Environment preset="city" />
      </Canvas>
    </div>
  );
};

export default Hero3D;
