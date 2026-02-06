import React, { useRef, useEffect } from 'react';

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
  // Persist Three.js objects across prop changes so we can resize without teardown
  const sceneRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const cloudsRef = useRef<any[]>([]);
  const viewDimsRef = useRef<{ viewWidth: number; viewHeight: number }>({ viewWidth: 0, viewHeight: 0 });
  const initializedRef = useRef(false);

  // Handle resize without full teardown
  useEffect(() => {
    if (!rendererRef.current || !cameraRef.current) return;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;

    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    // Recalculate view dimensions
    const fovRad = (camera.fov / 2) * (Math.PI / 180);
    const viewHeight = 2 * Math.tan(fovRad) * camera.position.z;
    const viewWidth = viewHeight * (width / height);
    viewDimsRef.current = { viewWidth, viewHeight };
  }, [width, height]);

  // Initialize scene once, teardown only on unmount
  useEffect(() => {
    if (!mountRef.current || initializedRef.current) return;
    initializedRef.current = true;

    let cancelled = false;

    // Dynamic import Three.js to keep it out of the main bundle
    import('three').then((THREE) => {
      if (cancelled || !mountRef.current) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      camera.position.z = 5;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setClearColor(0x000000, 0);
      mountRef.current.appendChild(renderer.domElement);

      // Store refs for resize handler
      sceneRef.current = scene;
      rendererRef.current = renderer;
      cameraRef.current = camera;

      // Minimal lighting
      scene.add(new THREE.AmbientLight(0xffffff, 0.3));
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.2);
      dirLight.position.set(2, 5, 3);
      scene.add(dirLight);

      const createCloudShape = () => {
        const group = new THREE.Group();

        const mainGeometry = new THREE.SphereGeometry(0.3, 12, 8);
        const mainSphere = new THREE.Mesh(mainGeometry);
        mainSphere.position.set(0, 0, 0);
        group.add(mainSphere);

        const leftGeometry = new THREE.SphereGeometry(0.2, 10, 6);
        const leftSphere = new THREE.Mesh(leftGeometry);
        leftSphere.position.set(-0.25, -0.05, 0);
        group.add(leftSphere);

        const rightGeometry = new THREE.SphereGeometry(0.25, 10, 6);
        const rightSphere = new THREE.Mesh(rightGeometry);
        rightSphere.position.set(0.3, 0.05, 0);
        group.add(rightSphere);

        const topGeometry = new THREE.SphereGeometry(0.18, 8, 6);
        const topSphere = new THREE.Mesh(topGeometry);
        topSphere.position.set(0.05, 0.25, 0);
        group.add(topSphere);

        return group;
      };

      const cloudColor = isLightTheme ? 0x3b82f6 : 0x60a5fa;
      const cloudOpacity = isLightTheme ? 0.4 : 0.5;

      const cloudMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(cloudColor),
        transparent: true,
        opacity: cloudOpacity,
        side: THREE.DoubleSide
      });

      // Calculate visible dimensions
      const fovRad = (camera.fov / 2) * (Math.PI / 180);
      const viewHeight = 2 * Math.tan(fovRad) * camera.position.z;
      const viewWidth = viewHeight * (width / height);
      viewDimsRef.current = { viewWidth, viewHeight };

      const gridCols = Math.ceil(Math.sqrt(cloudCount * 1.5));
      const gridRows = Math.ceil(cloudCount / gridCols);
      const cellWidth = viewWidth * 1.4 / gridCols;
      const cellHeight = viewHeight * 1.0 / gridRows;

      const clouds: any[] = [];

      for (let i = 0; i < cloudCount; i++) {
        const cloudGroup = createCloudShape();
        cloudGroup.traverse((child: any) => {
          if (child.isMesh) {
            child.material = cloudMaterial.clone();
          }
        });

        const size = 0.6 + Math.random() * 0.2;
        const z = (Math.random() - 0.5) * 6;
        cloudGroup.scale.setScalar(size * (1 - Math.abs(z) * 0.02));

        const col = i % gridCols;
        const row = Math.floor(i / gridCols);
        const baseX = (col * cellWidth) - (viewWidth * 0.7) + (cellWidth * 0.5);
        const baseY = (row * cellHeight) - (viewHeight * 0.5) + (cellHeight * 0.5);
        const randomOffsetX = (Math.random() - 0.5) * cellWidth * 0.6;
        const randomOffsetY = (Math.random() - 0.5) * cellHeight * 0.6;

        cloudGroup.position.set(baseX + randomOffsetX, baseY + randomOffsetY, z);

        clouds.push({
          mesh: cloudGroup,
          speed: 0.003 + Math.random() * 0.001,
          initialY: cloudGroup.position.y,
          assignedRow: row,
          cellHeight,
          zDepth: z,
          verticalOffset: Math.random() * Math.PI * 2,
          baseOpacity: cloudOpacity,
        });
        scene.add(cloudGroup);
      }

      cloudsRef.current = clouds;

      const animate = () => {
        animationIdRef.current = requestAnimationFrame(animate);
        const { viewWidth: vw, viewHeight: vh } = viewDimsRef.current;

        for (const cloud of clouds) {
          const { mesh, speed, zDepth, assignedRow, cellHeight: ch, verticalOffset, baseOpacity } = cloud;

          mesh.position.x += speed * (1 + Math.abs(zDepth) * 0.03);
          mesh.position.y = cloud.initialY + Math.sin(performance.now() * 0.0005 + verticalOffset) * 0.1;

          // No-fly zone logic
          const noFlyZoneWidth = vw * 0.4;
          const noFlyZoneHeight = vh * 0.6;
          const distX = Math.abs(mesh.position.x);
          const distY = Math.abs(mesh.position.y);
          const inX = distX < noFlyZoneWidth / 2;
          const inY = distY < noFlyZoneHeight / 2;

          let targetOpacity = baseOpacity;
          if (inX && inY) {
            const fadeX = 1 - (distX / (noFlyZoneWidth / 2));
            const fadeY = 1 - (distY / (noFlyZoneHeight / 2));
            targetOpacity = baseOpacity * (1 - Math.max(fadeX, fadeY) * 0.8);
          }

          mesh.traverse((child: any) => {
            if (child.isMesh && child.material) {
              child.material.opacity = targetOpacity;
            }
          });

          // Wrap around using current view dimensions
          if (mesh.position.x > vw / 2 + 3) {
            mesh.position.x = -vw / 2 - 3;
            const baseY = (assignedRow * ch) - (vh * 0.5) + (ch * 0.5);
            const randomOffsetY = (Math.random() - 0.5) * ch * 0.6;
            cloud.initialY = baseY + randomOffsetY;
            mesh.position.y = cloud.initialY;
          }
        }

        renderer.render(scene, camera);
      };

      animate();
    });

    return () => {
      cancelled = true;
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);

      const renderer = rendererRef.current;
      if (mountRef.current && renderer?.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer?.dispose?.();

      // Dispose all scene objects
      sceneRef.current?.traverse((object: any) => {
        if (object.isMesh) {
          object.geometry?.dispose?.();
          if (Array.isArray(object.material)) {
            object.material.forEach((m: any) => m?.dispose?.());
          } else {
            object.material?.dispose?.();
          }
        }
      });

      sceneRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
      cloudsRef.current = [];
      initializedRef.current = false;
    };
    // Only run once on mount — resize is handled by the separate effect above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={mountRef}
      style={{ width: `${width}px`, height: `${height}px`, display: 'inline-block' }}
    />
  );
};

export default FallingClouds3D;
