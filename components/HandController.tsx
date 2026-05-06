
import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, DrawingUtils } from '@mediapipe/tasks-vision';
import { ControlRefs, GestureType, MoveDirection } from '../types';

interface HandControllerProps {
  controlRef: React.MutableRefObject<ControlRefs>;
  onStateChange: (gesture: GestureType, direction: MoveDirection, isDragging: boolean) => void;
}

// Simple Low-Pass Filter for smoothing coordinates
const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;

const HandController: React.FC<HandControllerProps> = ({ controlRef, onStateChange }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  // Keep latest callback to avoid stale closures in RAF loop
  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  // Smoothing refs
  const smoothRightPinchRef = useRef({ x: 0.5, y: 0.5 });
  const smoothLeftFingerCenterRef = useRef({ x: 0.5, y: 0.5 });

  // Previous contact state for hysteresis
  const wasContactingRef = useRef(false);

  // Store previous position for Delta calculation (Rotation)
  const prevLeftPosRef = useRef<{ x: number, y: number } | null>(null);

  // Smoothed rotation velocity (EMA)
  const smoothRotVelRef = useRef({ x: 0, y: 0 });

  // Constants
  const PINCH_THRESHOLD = 0.05;
  const FINGER_CONTACT_THRESHOLD = 0.05;
  const CONTACT_THRESHOLD = 0.12;

  // INCREASED SENSITIVITY: 0.15 -> 0.35
  const ZOOM_SENSITIVITY = 0.35;

  // Adjusted for better range of motion
  const DRAG_SCALE_X = 7.0;
  const DRAG_SCALE_Y = 5.5;
  const ROTATION_SENSITIVITY = 4.0;

  const SMOOTHING_FACTOR_ROTATION = 0.15;
  const ROTATION_DEADZONE = 0.005;
  const ROTATION_VEL_SMOOTHING = 0.25;

  const stopWebcam = () => {
    cancelAnimationFrame(requestRef.current);
    if (videoRef.current) {
      videoRef.current.onloadeddata = null;
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    let mounted = true;

    const setupMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "/mediapipe/wasm"
        );

        if (!mounted) return;

        try {
          handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: "/mediapipe/hand_landmarker.task",
              delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 2
          });
        } catch (gpuErr) {
          console.warn("MediaPipe GPU delegate failed, retrying with CPU:", gpuErr);
          handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: "/mediapipe/hand_landmarker.task",
              delegate: "CPU"
            },
            runningMode: "VIDEO",
            numHands: 2
          });
        }

        startWebcam();
      } catch (err) {
        console.error("Error initializing MediaPipe:", err);
        setError("AI 引擎加载失败，请刷新后重试");
        setLoading(false);
      }
    };

    setupMediaPipe();

    return () => {
      mounted = false;
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
      }
      stopWebcam();
    };
  }, []);

  const startWebcam = async () => {
    try {
      setError(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia is not available in this browser or context");
      }

      if (!window.isSecureContext) {
        throw new Error("Camera access requires HTTPS or localhost");
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 320 },
            height: { ideal: 240 },
            facingMode: { ideal: "user" }
          },
          audio: false
        });
      } catch (constraintErr) {
        console.warn("Preferred webcam constraints failed, retrying with default camera:", constraintErr);
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadeddata = predictWebcam;
        await videoRef.current.play();
      }
      setLoading(false);
    } catch (err) {
      console.error("Webcam error:", err);
      stopWebcam();
      setError("无法访问摄像头，请允许权限并使用 HTTPS 或 localhost 打开");
      setLoading(false);
    }
  };

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

  const predictWebcam = () => {
    if (!videoRef.current || !handLandmarkerRef.current || !canvasRef.current) return;
    if (videoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      requestRef.current = requestAnimationFrame(predictWebcam);
      return;
    }

    const startTimeMs = performance.now();
    let result;
    try {
      result = handLandmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);
    } catch (err) {
      console.error("Hand detection error:", err);
      requestRef.current = requestAnimationFrame(predictWebcam);
      return;
    }

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
        const drawingUtils = new DrawingUtils(ctx);

        // 1. Identify Hands & Visuals
        for (let i = 0; i < result.landmarks.length; i++) {
          const landmarks = result.landmarks[i];
          const handedness = result.handedness[i][0].categoryName;

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

        // 2. DUAL HAND LOGIC: Contact Detection with Hysteresis
        let isContacting = false;
        if (leftHandLandmarks && rightHandLandmarks) {
          const leftWrist = leftHandLandmarks[0];
          const rightWrist = rightHandLandmarks[0];
          const dist = getDistance(leftWrist, rightWrist);

          // Hysteresis: Require larger distance to exit contact state than to enter it
          // This prevents flickering when hands are near the threshold
          const threshold = wasContactingRef.current ? CONTACT_THRESHOLD * 1.3 : CONTACT_THRESHOLD;

          if (dist < threshold) {
            newGesture = GestureType.DUAL_HAND_CONTACT;
            isContacting = true;
          }
        }
        wasContactingRef.current = isContacting;

        // 3. INDIVIDUAL HAND LOGIC (Only if not contacting)
        if (!isContacting) {

          // --- 左手: 食指+中指并拢旋转 OR 捏合拆解零件 ---
          if (leftHandLandmarks) {
            const indexTip = leftHandLandmarks[8];
            const middleTip = leftHandLandmarks[12];
            const fingersDist = getDistance(indexTip, middleTip);

            const isIndexUp = isFingerExtended(leftHandLandmarks, 8, 6);
            const isMiddleUp = isFingerExtended(leftHandLandmarks, 12, 10);

            const rawFingerCenterX = (indexTip.x + middleTip.x) / 2;
            const rawFingerCenterY = (indexTip.y + middleTip.y) / 2;

            smoothLeftFingerCenterRef.current.x = lerp(smoothLeftFingerCenterRef.current.x, rawFingerCenterX, SMOOTHING_FACTOR_ROTATION);
            smoothLeftFingerCenterRef.current.y = lerp(smoothLeftFingerCenterRef.current.y, rawFingerCenterY, SMOOTHING_FACTOR_ROTATION);

            // 1. 食指 + 中指并拢 → 旋转画面
            if (fingersDist < FINGER_CONTACT_THRESHOLD && isIndexUp && isMiddleUp) {
              newGesture = GestureType.LEFT_TWO_FINGER_ROTATE;

              if (prevLeftPosRef.current) {
                const deltaX = smoothLeftFingerCenterRef.current.x - prevLeftPosRef.current.x;
                const deltaY = smoothLeftFingerCenterRef.current.y - prevLeftPosRef.current.y;

                if (Math.abs(deltaX) > ROTATION_DEADZONE || Math.abs(deltaY) > ROTATION_DEADZONE) {
                  rotVelY = -deltaX * ROTATION_SENSITIVITY;
                  rotVelX = deltaY * ROTATION_SENSITIVITY;
                }
              }
              prevLeftPosRef.current = { ...smoothLeftFingerCenterRef.current };
            }
            // 2. 食指 + 拇指捏合 → 拆解零件
            else {
              prevLeftPosRef.current = null;

              const pinchDist = getPinchDistance(leftHandLandmarks);
              if (pinchDist < PINCH_THRESHOLD) {
                isDragging = true;
                newGesture = GestureType.RIGHT_PINCH_DRAG;

                const thumbTip = leftHandLandmarks[4];
                const rawX = (thumbTip.x + indexTip.x) / 2;
                const rawY = (thumbTip.y + indexTip.y) / 2;

                const dx = rawX - smoothRightPinchRef.current.x;
                const dy = rawY - smoothRightPinchRef.current.y;
                const movementDelta = Math.sqrt(dx * dx + dy * dy);
                const adaptiveFactor = Math.min(0.85, Math.max(0.1, movementDelta * 15));

                smoothRightPinchRef.current.x = lerp(smoothRightPinchRef.current.x, rawX, adaptiveFactor);
                smoothRightPinchRef.current.y = lerp(smoothRightPinchRef.current.y, rawY, adaptiveFactor);

                const targetX = (0.5 - smoothRightPinchRef.current.x) * DRAG_SCALE_X;
                const targetY = (0.5 - smoothRightPinchRef.current.y) * DRAG_SCALE_Y;
                controlRef.current.panPosition = { x: targetX, y: targetY };
              } else {
                const wrist = leftHandLandmarks[0];
                smoothRightPinchRef.current = { x: wrist.x, y: wrist.y };
              }
            }
          }

          // --- 右手: 放大/缩小 (Open Palm = Zoom In, Fist = Zoom Out) ---
          if (rightHandLandmarks) {
            const isIndexUp = isFingerExtended(rightHandLandmarks, 8, 6);
            const isMiddleUp = isFingerExtended(rightHandLandmarks, 12, 10);
            const isRingUp = isFingerExtended(rightHandLandmarks, 16, 14);
            const isPinkyUp = isFingerExtended(rightHandLandmarks, 20, 18);

            // ZOOM IN: Open Palm (Check all fingers for reliability)
            if (isIndexUp && isMiddleUp && isRingUp && isPinkyUp) {
              newGesture = GestureType.ZOOM_IN_PALM;
              newZoomSpeed = ZOOM_SENSITIVITY;
            }
            // ZOOM OUT: Fist (Check if fingers are folded)
            else if (!isIndexUp && !isMiddleUp && !isRingUp && !isPinkyUp) {
              newGesture = GestureType.ZOOM_OUT_FIST;
              newZoomSpeed = -ZOOM_SENSITIVITY;
            }
          }
        }
      }

      // Smooth the rotation velocity with EMA to remove jitter
      smoothRotVelRef.current.x = lerp(smoothRotVelRef.current.x, rotVelX, ROTATION_VEL_SMOOTHING);
      smoothRotVelRef.current.y = lerp(smoothRotVelRef.current.y, rotVelY, ROTATION_VEL_SMOOTHING);

      // Apply deadzone on smoothed output
      const finalRotX = Math.abs(smoothRotVelRef.current.x) > 0.001 ? smoothRotVelRef.current.x : 0;
      const finalRotY = Math.abs(smoothRotVelRef.current.y) > 0.001 ? smoothRotVelRef.current.y : 0;

      controlRef.current.rotationVelocity = { x: finalRotX, y: finalRotY };
      controlRef.current.zoomSpeed = newZoomSpeed;
      controlRef.current.isDragging = isDragging;

      // 传递手部关节数据到3D场景
      controlRef.current.handLandmarks = {
        left: leftHandLandmarks ? leftHandLandmarks.map((lm: any) => ({ x: lm.x, y: lm.y, z: lm.z || 0 })) : null,
        right: rightHandLandmarks ? rightHandLandmarks.map((lm: any) => ({ x: lm.x, y: lm.y, z: lm.z || 0 })) : null
      };

      // Use ref to call the latest callback
      if (onStateChangeRef.current) {
        onStateChangeRef.current(newGesture, newDirection, isDragging);
      }

      ctx.restore();
    }
    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  if (error) return <div className="absolute inset-0 flex items-center justify-center bg-red-50 text-red-400 text-[10px] font-black">{error}</div>;

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
