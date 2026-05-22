
// 模型类型
export interface HandLandmarkPoint {
  x: number;
  y: number;
  z: number;
}

export type HandLandmarks = HandLandmarkPoint[] | null;

export type ModelType = 'glb' | 'gltf' | 'fbx';
export type InteractionMode = 'dual' | 'single';

export enum GestureType {
  NONE = 'NONE',
  RIGHT_PINCH_DRAG = 'RIGHT_PINCH_DRAG', // Right Hand: Pinch -> Drag Position
  RIGHT_TWO_FINGER_ROTATE = 'RIGHT_TWO_FINGER_ROTATE', // Right Hand: Index + Middle -> Free 360 Rotation
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

export interface InteractionSettings {
  zoomSpeed: number;     // 0.1 - 5.0, default 0.8
  rotationSpeed: number; // 0.1 - 5.0, default 0.5
}

export interface AgentDisassemblyControl {
  enabled: boolean;
  strength: number;      // 0 - 1, how far parts spread from the center
  spacing: number;       // minimum visual spacing between targets
  avoidOverlap: boolean;
  actionId: number;      // increment to force recalculating target positions
  label: string;
}

// Shared ref object to communicate between React components without re-renders
export interface ControlRefs {
  rotationVelocity: { x: number; y: number }; // x = pitch (up/down), y = yaw (left/right)
  zoomSpeed: number; // -1 to 1
  panPosition: { x: number; y: number }; // Target position for dragging
  isDragging: boolean;
  // 3D虚拟手数据
  handLandmarks: {
    left: HandLandmarks;
    right: HandLandmarks;
  };
  interactionHandLandmarks: HandLandmarks;
  interactionSettings: InteractionSettings;
  agentDisassembly: AgentDisassemblyControl;
}

export type TeachingModelId = 'heart' | 'biodigital_heart' | 'hiv' | 'diamond' | 'diamond_unit_cell' | 'pubchem_6233' | 'earth_layers' | 'terrain' | 'nacl' | 'sio2' | 'nitrobenzene';
export type AgentRole = 'planner' | 'executor' | 'evaluator';
export type AgentStatus = 'idle' | 'thinking' | 'running' | 'done' | 'error';

export type AgentToolName =
  | 'load_model'
  | 'auto_rotate'
  | 'auto_zoom'
  | 'explode_model'
  | 'reset_model_layout'
  | 'enable_gesture'
  | 'set_teacher_log';

export interface AgentToolCall {
  id: string;
  name: AgentToolName;
  label: string;
  args: Record<string, unknown>;
}

export interface AgentPlanStep {
  id: string;
  title: string;
  narration: string;
  toolCalls: AgentToolCall[];
}

export interface AgentPlan {
  topic: string;
  modelId: TeachingModelId;
  steps: AgentPlanStep[];
  summaryFocus: string[];
}

export interface AgentTimelineItem {
  id: string;
  agent: AgentRole;
  title: string;
  detail: string;
  status: 'pending' | 'running' | 'done' | 'error';
}
