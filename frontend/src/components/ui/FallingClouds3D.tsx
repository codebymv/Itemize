import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

interface FallingClouds3DProps {
  width?: number;
  height?: number;
  cloudCount?: number;
  isLightTheme?: boolean;
}

const FallingClouds3D: React.FC<FallingClouds3DProps> = ({
  width = 128,
  height = 128,
  cloudCount = 6,
  isLightTheme = false
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const animationIdRef = useRef<number>();

  const createCloudShape = () => {
    // Create a more cartoonish cloud shape with multiple spheres
    const group = new THREE.Group();

    // Main cloud body (larger sphere)
    const mainGeometry = new THREE.SphereGeometry(0.3, 12, 8);
    const mainSphere = new THREE.Mesh(mainGeometry);
    mainSphere.position.set(0, 0, 0);
    group.add(mainSphere);

    // Left puff
    const leftGeometry = new THREE.SphereGeometry(0.2, 10, 6);
    const leftSphere = new THREE.Mesh(leftGeometry);
    leftSphere.position.set(-0.25, -0.05, 0);
    group.add(leftSphere);

    // Right puff
    const rightGeometry = new THREE.SphereGeometry(0.25, 10, 6);
    const rightSphere = new THREE.Mesh(rightGeometry);
    rightSphere.position.set(0.3, 0.05, 0);
    group.add(rightSphere);

    // Top puff
    const topGeometry = new THREE.SphereGeometry(0.18, 8, 6);
    const topSphere = new THREE.Mesh(topGeometry);
    topSphere.position.set(0.05, 0.25, 0);
    group.add(topSphere);

    return group;
  };

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    mountRef.current.appendChild(renderer.domElement);

    // Minimal lighting to preserve pure blue colors
    scene.add(new THREE.AmbientLight(0xffffff, 0.3)); // Very low white ambient
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.2); // Very low white directional
    dirLight.position.set(2, 5, 3);
    scene.add(dirLight);

    const clouds: Array<{
      mesh: THREE.Mesh;
      speed: number;
      initialY: number;
      zDepth: number;
      verticalOffset: number;
      assignedRow: number;
      cellHeight: number;
      baseOpacity: number; // Store the original opacity
    }> = [];

    // Pure blue colors using MeshBasicMaterial to avoid lighting interference
    const cloudColor = isLightTheme ? 0x3b82f6 : 0x60a5fa; // Bright blue colors
    const cloudOpacity = isLightTheme ? 0.4 : 0.5; // Higher opacity to ensure visibility

    const cloudMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(cloudColor),
      transparent: true,
      opacity: cloudOpacity,
      side: THREE.DoubleSide
    });

    // Calculate visible width and height at camera.position.z
    const fovRad = (camera.fov / 2) * (Math.PI / 180);
    const viewHeight = 2 * Math.tan(fovRad) * camera.position.z;
    const viewWidth = viewHeight * (width / height);

    // Create a more intelligent distribution system
    const gridCols = Math.ceil(Math.sqrt(cloudCount * 1.5)); // Slightly wider grid
    const gridRows = Math.ceil(cloudCount / gridCols);
    const cellWidth = viewWidth * 1.4 / gridCols; // Wider area to cover
    const cellHeight = viewHeight * 1.0 / gridRows;

    for (let i = 0; i < cloudCount; i++) {
      const cloudGroup = createCloudShape();

      // Apply material to all meshes in the group
      cloudGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = cloudMaterial.clone();
        }
      });

      const size = 0.6 + Math.random() * 0.2; // Reduced max size: 0.6 to 0.8
      const z = (Math.random() - 0.5) * 6; // Reduced depth variation

      cloudGroup.scale.setScalar(size * (1 - Math.abs(z) * 0.02));

      // Intelligent grid-based positioning with randomization
      const col = i % gridCols;
      const row = Math.floor(i / gridCols);

      // Base position in grid cell
      const baseX = (col * cellWidth) - (viewWidth * 0.7) + (cellWidth * 0.5);
      const baseY = (row * cellHeight) - (viewHeight * 0.5) + (cellHeight * 0.5);

      // Add controlled randomization within the cell
      const randomOffsetX = (Math.random() - 0.5) * cellWidth * 0.6;
      const randomOffsetY = (Math.random() - 0.5) * cellHeight * 0.6;

      cloudGroup.position.set(
        baseX + randomOffsetX,
        baseY + randomOffsetY,
        z
      );

      clouds.push({
        mesh: cloudGroup,
        speed: 0.003 + Math.random() * 0.001, // Slower, more uniform speed: 0.003 to 0.004
        initialY: cloudGroup.position.y,
        assignedRow: row, // Remember which row this cloud belongs to
        cellHeight: cellHeight, // Store cell height for consistent positioning
        zDepth: z,
        verticalOffset: Math.random() * Math.PI * 2, // Initial phase for vertical oscillation
        baseOpacity: cloudOpacity, // Store the original opacity
      });
      scene.add(cloudGroup);
    }

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);

      for (const cloud of clouds) {
        const { mesh, speed, zDepth, assignedRow, cellHeight, verticalOffset, baseOpacity } = cloud;

        mesh.position.x += speed * (1 + Math.abs(zDepth) * 0.03); // Move right, slight parallax effect

        // Apply vertical oscillation
        mesh.position.y = cloud.initialY + Math.sin(performance.now() * 0.0005 + verticalOffset) * 0.1; // Subtle vertical movement

        // No-fly zone logic: fade clouds in central content area
        const centerX = 0; // Center of the screen
        const centerY = 0; // Center of the screen
        const noFlyZoneWidth = viewWidth * 0.4; // 40% of screen width
        const noFlyZoneHeight = viewHeight * 0.6; // 60% of screen height

        // Calculate distance from center
        const distanceFromCenterX = Math.abs(mesh.position.x - centerX);
        const distanceFromCenterY = Math.abs(mesh.position.y - centerY);

        // Check if cloud is in no-fly zone
        const inNoFlyZoneX = distanceFromCenterX < noFlyZoneWidth / 2;
        const inNoFlyZoneY = distanceFromCenterY < noFlyZoneHeight / 2;

        let targetOpacity = baseOpacity;

        if (inNoFlyZoneX && inNoFlyZoneY) {
          // Calculate fade factor based on distance from center (closer = more faded)
          const fadeFactorX = 1 - (distanceFromCenterX / (noFlyZoneWidth / 2));
          const fadeFactorY = 1 - (distanceFromCenterY / (noFlyZoneHeight / 2));
          const combinedFadeFactor = Math.max(fadeFactorX, fadeFactorY);

          // Reduce opacity significantly in the center area
          targetOpacity = baseOpacity * (1 - combinedFadeFactor * 0.8); // Fade up to 80%
        }

        // Apply opacity to all materials in the cloud group
        mesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
            child.material.opacity = targetOpacity;
          }
        });

        // Reset position when cloud moves off screen to the right
        if (mesh.position.x > viewWidth / 2 + 3) { // Reset when off-screen
          mesh.position.x = -viewWidth / 2 - 3; // Reset to left edge

          // Maintain consistent vertical distribution by staying in assigned row
          const baseY = (assignedRow * cellHeight) - (viewHeight * 0.5) + (cellHeight * 0.5);
          const randomOffsetY = (Math.random() - 0.5) * cellHeight * 0.6;
          cloud.initialY = baseY + randomOffsetY; // Update initialY for new oscillation cycle
          mesh.position.y = cloud.initialY; // Reset y position to new initialY
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      cloudMaterial.dispose();

      // Properly dispose of cloud geometries and materials
      clouds.forEach(cloud => {
        cloud.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(material => material?.dispose?.());
              } else {
                child.material?.dispose?.();
              }
            }
          }
        });
      });

      // Clean up any remaining scene objects
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          if (object.geometry) object.geometry.dispose();
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach(material => material?.dispose?.());
            } else {
              object.material?.dispose?.();
            }
          }
        }
      });
    };
  }, [width, height, cloudCount, isLightTheme]);

  return (
    <div
      ref={mountRef}
      style={{ width: `${width}px`, height: `${height}px`, display: 'inline-block' }}
    />
  );
};

export default FallingClouds3D;
