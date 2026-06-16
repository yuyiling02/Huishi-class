import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, DrawingUtils } from '@mediapipe/tasks-vision';
import { ControlRefs, GestureType, HandLandmarkPoint, InteractionMode, MoveDirection } from '../types';

interface HandControllerProps {
  controlRef: React.MutableRefObject<ControlRefs>;
  onStateChange: (gesture: GestureType, direction: MoveDirection, isDragging: boolean) => void;
  interactionMode: InteractionMode;
  quizMode?: boolean;  // 新增：是否处于答题模式
}

// Simple Low-Pass Filter for smoothing coordinates
const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;
const toPointList = (landmarks: any[] | null | undefined): HandLandmarkPoint[] =>
  (landmarks ?? []).map((landmark: any) => ({
    x: landmark.x,
    y: landmark.y,
    z: landmark.z || 0,
  }));

const toUserFacingHandedness = (categoryName: string) => (
  categoryName === 'Left' ? 'Right' : 'Left'
);

const LOCAL_VISION_WASM_PATH = '/mediapipe/wasm';
const LOCAL_HAND_MODEL_PATH = '/mediapipe/hand_landmarker.task';
const CDN_VISION_WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm';
const CDN_HAND_MODEL_PATH = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const createHandLandmarker = async (wasmPath: string, modelAssetPath: string) => {
  const vision = await FilesetResolver.forVisionTasks(wasmPath);
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath,
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numHands: 2
  });
};

const HandController: React.FC<HandControllerProps> = ({ controlRef, onStateChange, interactionMode, quizMode = false }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  const lastVideoTimeRef = useRef(-1);
  const drawingUtilsRef = useRef<DrawingUtils | null>(null);

  // Keep latest callback to avoid stale closures in RAF loop
  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);
  const interactionModeRef = useRef(interactionMode);
  useEffect(() => {
    interactionModeRef.current = interactionMode;
    prevRotatePosRef.current = null;
    smoothRotVelRef.current = { x: 0, y: 0 };
    smoothZoomRef.current = 0;
    wasContactingRef.current = false;
    controlRef.current.rotationVelocity = { x: 0, y: 0 };
    controlRef.current.zoomSpeed = 0;
    controlRef.current.isDragging = false;
    controlRef.current.interactionHandLandmarks = null;
  }, [controlRef, interactionMode]);

  // Keep latest quizMode to avoid stale closures in RAF loop
  const quizModeRef = useRef(quizMode);
  useEffect(() => {
    quizModeRef.current = quizMode;
  }, [quizMode]);

  // Smoothing refs
  const smoothDragPinchRef = useRef({ x: 0.5, y: 0.5 });
  const smoothRotateFingerCenterRef = useRef({ x: 0.5, y: 0.5 });

  // Previous contact state for hysteresis
  const wasContactingRef = useRef(false);

  // Store previous position for Delta calculation (Rotation)
  const prevRotatePosRef = useRef<{ x: number, y: number } | null>(null);

  // Smoothed rotation velocity (EMA)
  const smoothRotVelRef = useRef({ x: 0, y: 0 });
  const smoothZoomRef = useRef(0);
  const lastPublishedStateRef = useRef<{
    gesture: GestureType | null;
    direction: MoveDirection | null;
    isDragging: boolean | null;
  }>({ gesture: null, direction: null, isDragging: null });

  // Constants
  const PINCH_THRESHOLD = 0.05;
  const FINGER_CONTACT_THRESHOLD = 0.05;
  const CONTACT_THRESHOLD = 0.12;

  // INCREASED SENSITIVITY: 0.15 -> 0.35
  const ZOOM_SENSITIVITY = 0.35;

  // Adjusted for better range of motion
  const DRAG_SCALE_X = 7.0;
  const DRAG_SCALE_Y = 5.5;
  const ROTATION_SENSITIVITY = 4.6;

  const SMOOTHING_FACTOR_ROTATION = 0.28;
  const ROTATION_DEADZONE = 0.0015;
  const ROTATION_VEL_SMOOTHING = 0.34;
  const ZOOM_VEL_SMOOTHING = 0.22;

  useEffect(() => {
    let mounted = true;
    let mediaStream: MediaStream | null = null;

    // 1. 先启动摄像头（不依赖 AI 模型加载）
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 320 },
            height: { ideal: 240 },
            frameRate: { ideal: 60, max: 60 },
            facingMode: "user"
          }
        });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener("loadeddata", predictWebcam);
        }
        setLoading(false);
      } catch (err) {
        console.error("Webcam error:", err);
        if (!mounted) return;
        setError("无法访问摄像头，请检查摄像头权限（需 HTTPS/localhost）");
        setLoading(false);
      }
    };

    // 2. 同时加载 MediaPipe AI 模型（不阻塞摄像头）
    const loadAIEngine = async () => {
      try {
        handLandmarkerRef.current = await createHandLandmarker(
          LOCAL_VISION_WASM_PATH,
          LOCAL_HAND_MODEL_PATH
        );
        if (!mounted) return;
      } catch (err) {
        console.warn("Local MediaPipe init failed, falling back to CDN:", err);
        try {
          handLandmarkerRef.current = await createHandLandmarker(
            CDN_VISION_WASM_PATH,
            CDN_HAND_MODEL_PATH
          );
          if (!mounted) return;
          return;
        } catch (fallbackErr) {
          console.error("MediaPipe init failed (camera still works):", fallbackErr);
        }
        // 摄像头已启动，AI 引擎加载失败仅影响手势识别，不影响摄像头
        if (!mounted) return;
        controlRef.current.handLandmarks = { left: null, right: null };
        controlRef.current.interactionHandLandmarks = null;
      }
    };

    startCamera();
    loadAIEngine();

    return () => {
      mounted = false;
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
      }
      mediaStream?.getTracks().forEach((track) => track.stop());
      cancelAnimationFrame(requestRef.current);

      if (controlRef.current) {
        controlRef.current.handLandmarks = { left: null, right: null };
        controlRef.current.interactionHandLandmarks = null;
        controlRef.current.rotationVelocity = { x: 0, y: 0 };
        controlRef.current.zoomSpeed = 0;
        controlRef.current.isDragging = false;
      }
      if (onStateChangeRef.current) {
        onStateChangeRef.current(GestureType.NONE, MoveDirection.CENTER, false);
      }
    };
  }, []);

  const isFingerExtended = (landmarks: any[], tipIdx: number, pipIdx: number) => {
    return landmarks[tipIdx].y < landmarks[pipIdx].y;
  };

  const getDistance = (p1: any, p2: any) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  };

  const getPinchDistance = (landmarks: any[]) => {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    return getDistance(thumbTip, indexTip);
  };

  const isTwoFingerRotationGesture = (landmarks: any[] | null) => {
    if (!landmarks) return false;
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const fingersDist = getDistance(indexTip, middleTip);
    const isIndexUp = isFingerExtended(landmarks, 8, 6);
    const isMiddleUp = isFingerExtended(landmarks, 12, 10);
    return fingersDist < FINGER_CONTACT_THRESHOLD && isIndexUp && isMiddleUp;
  };

  const predictWebcam = () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (videoRef.current.readyState < videoRef.current.HAVE_CURRENT_DATA) {
      requestRef.current = requestAnimationFrame(predictWebcam);
      return;
    }
    // AI 模型尚未加载完成时，继续重试（摄像头已独立启动，不阻塞）
    if (!handLandmarkerRef.current) {
      requestRef.current = requestAnimationFrame(predictWebcam);
      return;
    }

    if (videoRef.current.currentTime === lastVideoTimeRef.current) {
      requestRef.current = requestAnimationFrame(predictWebcam);
      return;
    }

    lastVideoTimeRef.current = videoRef.current.currentTime;
    const startTimeMs = performance.now();
    const result = handLandmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);

    const ctx = canvasRef.current.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-canvasRef.current.width, 0);

      // Default States
      let rotVelX = 0;
      let rotVelY = 0;
      let newZoomSpeed = 0;
      let newDirection = MoveDirection.CENTER;
      let newGesture = GestureType.NONE;
      let isDragging = false;

      // 手部landmarks声明在外部，以便传递到3D场景
      let leftHandLandmarks: any[] | null = null;
      let rightHandLandmarks: any[] | null = null;

      if (result.landmarks && result.landmarks.length > 0) {
        const drawingUtils = drawingUtilsRef.current ?? new DrawingUtils(ctx);
        drawingUtilsRef.current = drawingUtils;

        // 1. Identify Hands & Visuals
        for (let i = 0; i < result.landmarks.length; i++) {
          const landmarks = result.landmarks[i];
          const handedness = toUserFacingHandedness(result.handedness[i][0].categoryName);

          if (handedness === "Left") leftHandLandmarks = landmarks;
          if (handedness === "Right") rightHandLandmarks = landmarks;

          drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
            color: handedness === "Right" ? "#86e3ce" : "#ffddca",
            lineWidth: 3
          });
          drawingUtils.drawLandmarks(landmarks, {
            color: "#ffffff", lineWidth: 1, radius: 2
          });
        }

        // Keep semantic aliases available for single-hand fallback logic.
        const realLeftHandLandmarks = rightHandLandmarks;
        const realRightHandLandmarks = leftHandLandmarks;
        // Dual-hand behavior is mirrored in the current camera view.
        const dualZoomHandLandmarks = rightHandLandmarks;
        const dualManipulationHandLandmarks = leftHandLandmarks;

        const applySingleHandRotation = (landmarks: any[]) => {
          const indexTip = landmarks[8];
          const middleTip = landmarks[12];

          const rawFingerCenterX = (indexTip.x + middleTip.x) / 2;
          const rawFingerCenterY = (indexTip.y + middleTip.y) / 2;

          if (prevRotatePosRef.current) {
            smoothRotateFingerCenterRef.current.x = lerp(smoothRotateFingerCenterRef.current.x, rawFingerCenterX, SMOOTHING_FACTOR_ROTATION);
            smoothRotateFingerCenterRef.current.y = lerp(smoothRotateFingerCenterRef.current.y, rawFingerCenterY, SMOOTHING_FACTOR_ROTATION);
          } else {
            smoothRotateFingerCenterRef.current.x = rawFingerCenterX;
            smoothRotateFingerCenterRef.current.y = rawFingerCenterY;
          }

          if (!isTwoFingerRotationGesture(landmarks)) {
            prevRotatePosRef.current = null;
            return false;
          }

          newGesture = GestureType.RIGHT_TWO_FINGER_ROTATE;

          if (prevRotatePosRef.current) {
            const deltaX = smoothRotateFingerCenterRef.current.x - prevRotatePosRef.current.x;
            const deltaY = smoothRotateFingerCenterRef.current.y - prevRotatePosRef.current.y;

            if (Math.abs(deltaX) > ROTATION_DEADZONE || Math.abs(deltaY) > ROTATION_DEADZONE) {
              rotVelY = -deltaX * ROTATION_SENSITIVITY;
              rotVelX = deltaY * ROTATION_SENSITIVITY;
            }
          }
          prevRotatePosRef.current = { ...smoothRotateFingerCenterRef.current };
          return true;
        };

        const applySingleHandZoom = (landmarks: any[]) => {
          const isIndexUp = isFingerExtended(landmarks, 8, 6);
          const isMiddleUp = isFingerExtended(landmarks, 12, 10);
          const isRingUp = isFingerExtended(landmarks, 16, 14);
          const isPinkyUp = isFingerExtended(landmarks, 20, 18);

          if (isIndexUp && isMiddleUp && isRingUp && isPinkyUp) {
            newGesture = GestureType.ZOOM_IN_PALM;
            newZoomSpeed = ZOOM_SENSITIVITY;
            return true;
          }

          if (!isIndexUp && !isMiddleUp && !isRingUp && !isPinkyUp) {
            newGesture = GestureType.ZOOM_OUT_FIST;
            newZoomSpeed = -ZOOM_SENSITIVITY;
            return true;
          }

          return false;
        };

        const applyPinchDrag = (landmarks: any[], suppressZoom = true) => {
          const thumbTip = landmarks[4];
          const indexTip = landmarks[8];
          const pinchDist = getPinchDistance(landmarks);

          if (pinchDist < PINCH_THRESHOLD) {
            isDragging = true;
            newGesture = GestureType.RIGHT_PINCH_DRAG;
            if (suppressZoom) {
              newZoomSpeed = 0;
            }

            const rawX = (thumbTip.x + indexTip.x) / 2;
            const rawY = (thumbTip.y + indexTip.y) / 2;

            const dx = rawX - smoothDragPinchRef.current.x;
            const dy = rawY - smoothDragPinchRef.current.y;
            const movementDelta = Math.sqrt(dx * dx + dy * dy);
            const adaptiveFactor = Math.min(0.85, Math.max(0.1, movementDelta * 15));

            smoothDragPinchRef.current.x = lerp(smoothDragPinchRef.current.x, rawX, adaptiveFactor);
            smoothDragPinchRef.current.y = lerp(smoothDragPinchRef.current.y, rawY, adaptiveFactor);

            const targetX = (0.5 - smoothDragPinchRef.current.x) * DRAG_SCALE_X;
            const targetY = (0.5 - smoothDragPinchRef.current.y) * DRAG_SCALE_Y;
            controlRef.current.panPosition = { x: targetX, y: targetY };
            return true;
          }

          const wrist = landmarks[0];
          smoothDragPinchRef.current = { x: wrist.x, y: wrist.y };
          return false;
        };

        if (interactionModeRef.current === 'single') {
          wasContactingRef.current = false;
          const activeHandLandmarks = realLeftHandLandmarks || realRightHandLandmarks;

          if (activeHandLandmarks) {
            const isRotating = applySingleHandRotation(activeHandLandmarks);
            if (!isRotating) {
              const isDraggingPart = applyPinchDrag(activeHandLandmarks);
              if (!isDraggingPart) {
                applySingleHandZoom(activeHandLandmarks);
              }
            }
          }
        } else {

        // 2. DUAL HAND LOGIC: reference behavior - left zooms, right rotates/drags.
          const rotationHandLandmarks = dualManipulationHandLandmarks && isTwoFingerRotationGesture(dualManipulationHandLandmarks)
            ? dualManipulationHandLandmarks
            : null;
          const fullScreenRotationActive = Boolean(rotationHandLandmarks);
          if (rotationHandLandmarks) {
            applySingleHandRotation(rotationHandLandmarks);
            isDragging = false;
            wasContactingRef.current = false;
          }

          // Right hand: thumb + index pinch drag/disassemble.
          const isRightDragging = !fullScreenRotationActive && dualManipulationHandLandmarks
            ? applyPinchDrag(dualManipulationHandLandmarks, false)
            : false;

          // Left hand: open palm / fist zoom.
          const isLeftZooming = dualZoomHandLandmarks
            ? applySingleHandZoom(dualZoomHandLandmarks)
            : false;

          if (isRightDragging) {
            newGesture = GestureType.RIGHT_PINCH_DRAG;
          } else if (fullScreenRotationActive) {
            newGesture = GestureType.RIGHT_TWO_FINGER_ROTATE;
          }

          // Contact is only a fallback; it must not block independent two-hand control.
          let isContacting = false;
          if (!fullScreenRotationActive && !isRightDragging && !isLeftZooming && leftHandLandmarks && rightHandLandmarks) {
            const leftWrist = leftHandLandmarks[0];
            const rightWrist = rightHandLandmarks[0];
            const dist = getDistance(leftWrist, rightWrist);

            // Hysteresis: require larger distance to exit contact state than to enter it.
            const threshold = wasContactingRef.current ? CONTACT_THRESHOLD * 1.3 : CONTACT_THRESHOLD;

            if (dist < threshold) {
              newGesture = GestureType.DUAL_HAND_CONTACT;
              isContacting = true;
            }
          }
          wasContactingRef.current = isContacting;
        }
      }

      // Smooth the rotation velocity with EMA to remove jitter
      smoothRotVelRef.current.x = lerp(smoothRotVelRef.current.x, rotVelX, ROTATION_VEL_SMOOTHING);
      smoothRotVelRef.current.y = lerp(smoothRotVelRef.current.y, rotVelY, ROTATION_VEL_SMOOTHING);
      smoothZoomRef.current = lerp(smoothZoomRef.current, newZoomSpeed, ZOOM_VEL_SMOOTHING);

      // Apply deadzone on smoothed output
      const finalRotX = Math.abs(smoothRotVelRef.current.x) > 0.001 ? smoothRotVelRef.current.x : 0;
      const finalRotY = Math.abs(smoothRotVelRef.current.y) > 0.001 ? smoothRotVelRef.current.y : 0;
      const finalZoomSpeed = Math.abs(smoothZoomRef.current) > 0.01 ? smoothZoomRef.current : 0;

      // 答题模式下：冻结模型控制，但保留手势位置数据
      if (quizModeRef.current) {
        controlRef.current.rotationVelocity = { x: 0, y: 0 };
        controlRef.current.zoomSpeed = 0;
        controlRef.current.isDragging = false;
        controlRef.current.panPosition = { x: 0, y: 0 };
      } else {
        // 正常模式：按手势更新
        controlRef.current.rotationVelocity = { x: finalRotX, y: finalRotY };
        controlRef.current.zoomSpeed = finalZoomSpeed;
        controlRef.current.isDragging = isDragging;
        // panPosition 已在 applyPinchDrag 内部更新，这里不需要重复设置
      }

      // 传递手部关节数据到3D场景
      const isSingleMode = interactionModeRef.current === 'single';
      const realLeftHandLandmarks = rightHandLandmarks;
      const realRightHandLandmarks = leftHandLandmarks;
      const dualManipulationHandLandmarks = leftHandLandmarks;
      const activeSingleHandLandmarks = isSingleMode ? (realLeftHandLandmarks || realRightHandLandmarks) : null;
      const visibleLeftHandLandmarks = isSingleMode
        ? (activeSingleHandLandmarks === leftHandLandmarks ? leftHandLandmarks : null)
        : leftHandLandmarks;
      const visibleRightHandLandmarks = isSingleMode
        ? (activeSingleHandLandmarks === rightHandLandmarks ? rightHandLandmarks : null)
        : rightHandLandmarks;
      const interactionHandLandmarks = isSingleMode
        ? activeSingleHandLandmarks
        : dualManipulationHandLandmarks;

      // 手势位置数据始终更新（答题和非答题都需要）
      controlRef.current.handLandmarks = {
        left: visibleLeftHandLandmarks ? toPointList(visibleLeftHandLandmarks) : null,
        right: visibleRightHandLandmarks ? toPointList(visibleRightHandLandmarks) : null
      };
      controlRef.current.interactionHandLandmarks = interactionHandLandmarks ? toPointList(interactionHandLandmarks) : null;

      // Use ref to call the latest callback, only on state changes
      const lastPublishedState = lastPublishedStateRef.current;
      const shouldPublishState =
        lastPublishedState.gesture !== newGesture ||
        lastPublishedState.direction !== newDirection ||
        lastPublishedState.isDragging !== isDragging;

      if (shouldPublishState && onStateChangeRef.current) {
        lastPublishedStateRef.current = {
          gesture: newGesture,
          direction: newDirection,
          isDragging,
        };
        onStateChangeRef.current(newGesture, newDirection, isDragging);
      }

      ctx.restore();
    }
    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  if (error) return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50 text-red-400 p-4 text-center">
      <svg className="w-8 h-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
      <span className="text-xs font-black leading-tight">{error}</span>
    </div>
  );

  return (
    <div className="w-full h-full relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-30 bg-gray-900 text-white text-[10px] font-bold uppercase tracking-widest">
          AI Vision Init...
        </div>
      )}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover transform -scale-x-100"
      />
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
        width={320}
        height={240}
      />
    </div>
  );
};

export default HandController;
