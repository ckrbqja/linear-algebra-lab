import * as THREE from 'three';

const DEGENERATE_AREA_RELATIVE_EPSILON = 1e-6;

export function setGeometryPositions(geometry, positions) {
  const next = new Float32Array(positions);
  const current = geometry.getAttribute('position');
  if (!current || current.array.length !== next.length) {
    geometry.setAttribute('position', new THREE.BufferAttribute(next, 3));
    return;
  }
  current.array.set(next);
  current.needsUpdate = true;
}

export function areaMagnitude(a, b) {
  return a.clone().cross(b).length();
}

export function isDegenerateArea(a, b) {
  const scale = Math.max(1, a.length() * b.length());
  return areaMagnitude(a, b) <= DEGENERATE_AREA_RELATIVE_EPSILON * scale;
}

export function updateAreaGeometry(meshGeometry, edgeGeometry, a, b) {
  const points = [
    new THREE.Vector3(0, 0, 0),
    a,
    a.clone().add(b),
    b,
  ];
  setGeometryPositions(meshGeometry, [
    ...points[0].toArray(), ...points[1].toArray(), ...points[2].toArray(),
    ...points[0].toArray(), ...points[2].toArray(), ...points[3].toArray(),
  ]);
  setGeometryPositions(edgeGeometry, [
    ...points[0].toArray(), ...points[1].toArray(),
    ...points[1].toArray(), ...points[2].toArray(),
    ...points[2].toArray(), ...points[3].toArray(),
    ...points[3].toArray(), ...points[0].toArray(),
  ]);
}

export function updateVolumeGeometry(meshGeometry, edgeGeometry, a, b, c) {
  const p0 = new THREE.Vector3(0, 0, 0);
  const p1 = a.clone();
  const p2 = b.clone();
  const p3 = c.clone();
  const p4 = a.clone().add(b);
  const p5 = a.clone().add(c);
  const p6 = b.clone().add(c);
  const p7 = a.clone().add(b).add(c);
  const quad = (pA, pB, pC, pD) => [
    ...pA.toArray(), ...pB.toArray(), ...pC.toArray(),
    ...pA.toArray(), ...pC.toArray(), ...pD.toArray(),
  ];
  setGeometryPositions(meshGeometry, [
    ...quad(p0, p1, p4, p2),
    ...quad(p0, p2, p6, p3),
    ...quad(p0, p3, p5, p1),
    ...quad(p7, p5, p3, p6),
    ...quad(p7, p6, p2, p4),
    ...quad(p7, p4, p1, p5),
  ]);
  setGeometryPositions(edgeGeometry, [
    ...p0.toArray(), ...p1.toArray(),
    ...p0.toArray(), ...p2.toArray(),
    ...p0.toArray(), ...p3.toArray(),
    ...p1.toArray(), ...p4.toArray(),
    ...p1.toArray(), ...p5.toArray(),
    ...p2.toArray(), ...p4.toArray(),
    ...p2.toArray(), ...p6.toArray(),
    ...p3.toArray(), ...p5.toArray(),
    ...p3.toArray(), ...p6.toArray(),
    ...p4.toArray(), ...p7.toArray(),
    ...p5.toArray(), ...p7.toArray(),
    ...p6.toArray(), ...p7.toArray(),
  ]);
}

export function updateLengthGeometry(meshGeometry, edgeGeometry, a) {
  setGeometryPositions(meshGeometry, []);
  setGeometryPositions(edgeGeometry, [
    0, 0, 0,
    a.x, a.y, a.z,
  ]);
}
