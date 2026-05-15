import React, { useRef, useState } from 'react';
import { ControlRefs } from '../types';
import { Mic, MicOff, Loader2 } from 'lucide-react';

// ====== 豆包语音识别配置 ======
const DOUBAO_APPID = '9430818629';
const DOUBAO_TOKEN = '516504b5-521e-417f-a9d0-2109d9c6e732';
const DOUBAO_CLUSTER = 'volcengine_input_edu'; // 请在火山引擎控制台 → 语音识别服务中查看实际 Cluster ID
const DOUBAO_WS_URL = 'wss://openspeech.bytedance.com/api/v2/asr';

// ====== 二进制协议常量 ======
const PROTOCOL_VERSION = 0b0001;
const DEFAULT_HEADER_SIZE = 0b0001;

const CLIENT_FULL_REQUEST = 0b0001;
const CLIENT_AUDIO_ONLY_REQUEST = 0b0010;
const SERVER_FULL_RESPONSE = 0b1001;
const SERVER_ERROR_RESPONSE = 0b1111;

const NO_SEQUENCE = 0b0000;
const NEG_SEQUENCE = 0b0010;
const JSON_SERIALIZATION = 0b0001;
const NO_SERIALIZATION = 0b0000;
const GZIP_COMPRESSION = 0b0001;
const NO_COMPRESSION = 0b0000;

const SUCCESS_CODE = 1000;

interface VoiceControllerProps {
  controlRef: React.MutableRefObject<ControlRefs>;
  onStatusChange: (status: string) => void;
}

function generateHeader(
  messageType: number,
  messageTypeSpecificFlags: number = NO_SEQUENCE,
  serialMethod: number = JSON_SERIALIZATION,
  compressionType: number = GZIP_COMPRESSION,
): Uint8Array {
  const header = new Uint8Array(4);
  header[0] = (PROTOCOL_VERSION << 4) | DEFAULT_HEADER_SIZE;
  header[1] = (messageType << 4) | messageTypeSpecificFlags;
  header[2] = (serialMethod << 4) | compressionType;
  header[3] = 0x00;
  return header;
}

async function gzipCompress(data: Uint8Array): Promise<Uint8Array> {
  const blob = new Blob([data]);
  const compressed = blob.stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

async function gzipDecompress(data: Uint8Array): Promise<Uint8Array> {
  const blob = new Blob([data]);
  const decompressed = blob.stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(decompressed).arrayBuffer());
}

function parseServerMessage(data: ArrayBuffer): Record<string, any> {
  const view = new Uint8Array(data);
  const headerSize = (view[0] & 0x0f) * 4;
  const messageType = view[1] >> 4;
  const compression = view[2] & 0x0f;
  const serialization = view[2] >> 4;

  const payload = view.slice(headerSize);
  const result: Record<string, any> = { messageType };

  if (messageType === SERVER_FULL_RESPONSE) {
    const payloadSize = new DataView(payload.buffer, payload.byteOffset, 4).getInt32(0, false);
    let payloadData = payload.slice(4, 4 + payloadSize);
    if (compression === GZIP_COMPRESSION) {
      // decompress handled async below; store buffer for later
      result._compressedPayload = payloadData;
      result._compression = compression;
      result._serialization = serialization;
      return result;
    }
    if (serialization === JSON_SERIALIZATION) {
      result.payload = JSON.parse(new TextDecoder().decode(payloadData));
    }
  } else if (messageType === SERVER_ERROR_RESPONSE) {
    const code = new DataView(payload.buffer, payload.byteOffset, 4).getInt32(0, false);
    const msgSize = new DataView(payload.buffer, payload.byteOffset + 4, 4).getInt32(0, false);
    result.errorCode = code;
    result.errorMessage = new TextDecoder().decode(payload.slice(8, 8 + msgSize));
  }

  return result;
}

async function parseServerMessageAsync(data: ArrayBuffer): Promise<Record<string, any>> {
  const raw = parseServerMessage(data);
  if (raw._compressedPayload) {
    const decompressed = await gzipDecompress(raw._compressedPayload);
    delete raw._compressedPayload;
    delete raw._compression;
    if (raw._serialization === JSON_SERIALIZATION) {
      raw.payload = JSON.parse(new TextDecoder().decode(decompressed));
    }
    delete raw._serialization;
  }
  return raw;
}

function buildAudioOnlyRequest(audioData: Uint8Array, isLast: boolean): Uint8Array {
  const header = generateHeader(
    CLIENT_AUDIO_ONLY_REQUEST,
    isLast ? NEG_SEQUENCE : NO_SEQUENCE,
    NO_SERIALIZATION,
    NO_COMPRESSION,
  );
  const payloadSize = audioData.length;
  const message = new Uint8Array(4 + 4 + payloadSize);
  message.set(header, 0);
  new DataView(message.buffer, 4, 4).setInt32(0, payloadSize, false);
  message.set(audioData, 8);
  return message;
}

const COMMAND_PATTERNS: [RegExp, string, (ctrl: ControlRefs) => void][] = [
  [/放大|大一点|靠近|拉近/, 'zoom_in', (c) => { c.zoomSpeed = 0.015; setTimeout(() => { c.zoomSpeed = 0; }, 1500); }],
  [/缩小|小一点|远离|拉远/, 'zoom_out', (c) => { c.zoomSpeed = -0.015; setTimeout(() => { c.zoomSpeed = 0; }, 1500); }],
  [/旋转|转起来|转动/, 'rotate', (c) => { c.rotationVelocity = { x: 0, y: 0.02 }; }],
  [/停止|停|暂停|别转了/, 'stop', (c) => { c.zoomSpeed = 0; c.rotationVelocity = { x: 0, y: 0 }; }],
];

function extractCommands(text: string, controlRef: ControlRefs): string[] {
  const fired: string[] = [];
  for (const [pattern, name, action] of COMMAND_PATTERNS) {
    if (pattern.test(text)) {
      action(controlRef);
      fired.push(name);
    }
  }
  return fired;
}

const VoiceController: React.FC<VoiceControllerProps> = ({ controlRef, onStatusChange }) => {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const seqRef = useRef(0);

  const stopSession = () => {
    wsRef.current?.close();
    wsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    seqRef.current = 0;
    setIsActive(false);
    onStatusChange('语音助手已离线');
  };

  const startSession = async () => {
    setIsConnecting(true);
    onStatusChange('正在连接豆包语音识别...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ws = new WebSocket(DOUBAO_WS_URL);
      wsRef.current = ws;
      ws.binaryType = 'arraybuffer';

      const reqid = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

      ws.onopen = async () => {
        // Build and send full client request
        const requestParams = {
          app: {
            appid: DOUBAO_APPID,
            token: DOUBAO_TOKEN,
            cluster: DOUBAO_CLUSTER,
          },
          user: { uid: 'huiShiKeTang-web' },
          request: {
            reqid,
            nbest: 1,
            workflow: 'audio_in,resample,partition,vad,fe,decode,itn,nlu_punctuate',
            show_utterances: true,
            result_type: 'single',
            sequence: 1,
          },
          audio: {
            format: 'raw',
            rate: 16000,
            bits: 16,
            channel: 1,
            codec: 'raw',
            language: 'zh-CN',
          },
        };

        const jsonBytes = new TextEncoder().encode(JSON.stringify(requestParams));
        const compressed = await gzipCompress(jsonBytes);
        const header = generateHeader(CLIENT_FULL_REQUEST, NO_SEQUENCE, JSON_SERIALIZATION, GZIP_COMPRESSION);
        const message = new Uint8Array(4 + 4 + compressed.length);
        message.set(header, 0);
        new DataView(message.buffer, 4, 4).setInt32(0, compressed.length, false);
        message.set(compressed, 8);
        ws.send(message);

        // Set up audio pipeline
        const audioCtx = new AudioContext({ sampleRate: 16000 });
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const inputData = e.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            int16[i] = Math.max(-32768, Math.min(32767, Math.round(inputData[i] * 32767)));
          }
          const audioBytes = new Uint8Array(int16.buffer);
          seqRef.current++;
          // send as audio-only request (no compression for simplicity, raw PCM)
          const audioMsg = buildAudioOnlyRequest(audioBytes, false);
          ws.send(audioMsg);
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);

        setIsActive(true);
        setIsConnecting(false);
        onStatusChange('豆包语音识别已就绪，请说话（支持指令：放大/缩小/旋转/停止）');
      };

      ws.onmessage = async (event) => {
        const raw = parseServerMessage(event.data as ArrayBuffer);
        const result = raw._compressedPayload ? await parseServerMessageAsync(event.data as ArrayBuffer) : raw;

        if (result.errorCode) {
          console.error('Doubao ASR error:', result.errorCode, result.errorMessage);
          return;
        }

        const payload = result.payload;
        if (!payload) return;

        if (payload.code !== SUCCESS_CODE) {
          console.error('Doubao ASR error:', payload.code, payload.message);
          if (payload.code === 1002) {
            onStatusChange('豆包鉴权失败，请检查 AppID / Token / Cluster 配置。');
          }
          return;
        }

        const utterances = payload.result?.[0]?.utterances;
        if (utterances && utterances.length > 0) {
          const latest = utterances[utterances.length - 1];
          if (latest.definite) {
            // Final recognition result
            const text = latest.text;
            const commands = extractCommands(text, controlRef.current);
            if (commands.length > 0) {
              const cmdNames: Record<string, string> = { zoom_in: '放大', zoom_out: '缩小', rotate: '旋转', stop: '停止' };
              onStatusChange(`识别: "${text}" → 执行: ${commands.map((c) => cmdNames[c] || c).join('、')}`);
            } else {
              onStatusChange(`识别: "${text}"`);
            }
          }
        }
      };

      ws.onerror = () => {
        console.error('Doubao WS error');
        onStatusChange('豆包语音连接失败，请检查网络或配置。');
      };

      ws.onclose = () => {
        setIsActive(false);
        if (wsRef.current === ws) {
          onStatusChange('语音识别连接已断开');
        }
      };
    } catch (err) {
      console.error('Voice Setup Error:', err);
      setIsConnecting(false);
      onStatusChange('麦克风访问失败，请允许浏览器使用麦克风。');
    }
  };

  const toggleVoice = () => {
    if (isActive) {
      stopSession();
    } else {
      startSession();
    }
  };

  return (
    <div className="flex items-center gap-3">
      {isActive && (
        <div className="flex gap-1 h-4 items-center px-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="w-1 bg-[#86e3ce] rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.1}s`, height: `${40 + Math.random() * 60}%` }}
            />
          ))}
        </div>
      )}
      <button
        onClick={toggleVoice}
        disabled={isConnecting}
        className={`p-3 rounded-full shadow-lg transition-all active:scale-90 ${
          isActive ? 'bg-pink-400 text-white animate-pulse' : 'bg-white text-gray-400 hover:text-[#86e3ce]'
        }`}
        aria-label={isActive ? '关闭语音识别' : '开启豆包语音识别'}
        title={isActive ? '关闭语音识别' : '开启豆包语音识别'}
      >
        {isConnecting ? <Loader2 className="animate-spin" size={20} /> : isActive ? <Mic size={20} /> : <MicOff size={20} />}
      </button>
    </div>
  );
};

export default VoiceController;
