
// 模型类型
export type ModelType = 'glb' | 'gltf' | 'fbx';

export enum GestureType {
  NONE = 'NONE',
  RIGHT_PINCH_DRAG = 'RIGHT_PINCH_DRAG', // Right Hand: Pinch -> Drag Position
  LEFT_TWO_FINGER_ROTATE = 'LEFT_TWO_FINGER_ROTATE', // Left Hand: Index + Middle -> Free 360 Rotation
  ZOOM_IN_PALM = 'ZOOM_IN_PALM', // Left Hand: Open Palm
  ZOOM_OUT_FIST = 'ZOOM_OUT_FIST', // Left Hand: Fist
  DUAL_HAND_CONTACT = 'DUAL_HAND_CONTACT', // Both Hands: Contact (Hold to show video)
}

export enum MoveDirection {
  CENTER = 'CENTER',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  UP = 'UP',
  DOWN = 'DOWN'
}

export interface ControlState {
  gesture: GestureType;
  direction: MoveDirection;
  isConnected: boolean;
}

// Shared ref object to communicate between React components without re-renders
export interface ControlRefs {
  rotationVelocity: { x: number; y: number }; // x = pitch (up/down), y = yaw (left/right)
  zoomSpeed: number; // -1 to 1
  panPosition: { x: number; y: number }; // Target position for dragging
  isDragging: boolean;
  // 3D虚拟手数据
  handLandmarks: {
    left: { x: number; y: number; z: number }[] | null;
    right: { x: number; y: number; z: number }[] | null;
  };
}
