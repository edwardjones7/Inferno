/**
 * World layout of the 6-max oval table. Seat 0 (hero) sits nearest the camera; play goes
 * clockwise, which from the hero's chair is to their left (screen left).
 */
import * as THREE from "three";

export const FELT = { rx: 4.1, rz: 2.45 } as const;
const SEAT_ANGLES_DEG = [90, 150, 210, 270, 330, 30];

const at = (deg: number, rx: number, rz: number, y = 0) => {
  const a = (deg * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(a) * rx, y, Math.sin(a) * rz);
};

export const seatAngle = (seat: number) => SEAT_ANGLES_DEG[seat];
/** label anchor just outside the rail */
export const seatLabelPos = (seat: number) => at(SEAT_ANGLES_DEG[seat], 4.75, 3.05, 0.25);
/** where a seat's two hole cards sit (centre) */
export const holePos = (seat: number) => (seat === 0 ? new THREE.Vector3(0, 0, 1.72) : at(SEAT_ANGLES_DEG[seat], 3.05, 1.72));
/** where a seat's current-street bet sits */
export const betPos = (seat: number) => (seat === 0 ? new THREE.Vector3(0, 0, 1.08) : at(SEAT_ANGLES_DEG[seat], 2.2, 1.12));
/** dealer button spot for a seat */
export const buttonPos = (seat: number) => {
  const p = betPos(seat);
  const a = ((SEAT_ANGLES_DEG[seat] + 90) * Math.PI) / 180;
  return new THREE.Vector3(p.x + Math.cos(a) * 0.45, 0, p.z + Math.sin(a) * 0.3);
};
export const POT_POS = new THREE.Vector3(0, 0, 0.55);
export const BOARD_Z = -0.25;
export const boardPos = (i: number): [number, number, number] => [(i - 2) * 0.74, 0.004, BOARD_Z];
/** cards fly in from the middle of the table, slightly raised */
export const DEAL_ORIGIN = new THREE.Vector3(0, 0.9, -0.6);
