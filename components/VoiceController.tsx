
import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, Modality, Type, LiveServerMessage } from '@google/genai';
import { ControlRefs } from '../types';
import { Mic, MicOff, Loader2 } from 'lucide-react';

interface VoiceControllerProps {
  controlRef: React.MutableRefObject<ControlRefs>;
  onStatusChange: (status: string) => void;
}

const VoiceController: React.FC<VoiceControllerProps> = ({ controlRef, onStatusChange }) => {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const toggleVoice = async () => {
    if (isActive) {
      stopSession();
    } else {
      startSession();
    }
  };

  const stopSession = () => {
    sessionRef.current?.close();
    streamRef.current?.getTracks().forEach(track => track.stop());
    setIsActive(false);
    onStatusChange('语音助手已离线');
  };

  const startSession = async () => {
    setIsConnecting(true);
    onStatusChange('正在连接 AI 助教...');
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputAudioContext = new AudioContext({ sampleRate: 16000 });
      const outputAudioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = outputAudioContext;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: '你是一个专业的3D课堂助教。用户会通过语音要求你操作模型。你可以通过调用函数来：zoom_in(放大)、zoom_out(缩小)、rotate(开始旋转)、stop(停止所有动作)。回复要简洁且亲切，比如“好的，正在为您放大”。',
          tools: [{
            functionDeclarations: [
              {
                name: 'zoom_in',
                description: '放大3D模型',
                parameters: { type: Type.OBJECT, properties: {} }
              },
              {
                name: 'zoom_out',
                description: '缩小3D模型',
                parameters: { type: Type.OBJECT, properties: {} }
              },
              {
                name: 'rotate',
                description: '让模型开始自动旋转',
                parameters: { type: Type.OBJECT, properties: {} }
              },
              {
                name: 'stop',
                description: '停止旋转或缩放动作',
                parameters: { type: Type.OBJECT, properties: {} }
              }
            ]
          }]
        },
        callbacks: {
          onopen: () => {
            setIsActive(true);
            setIsConnecting(false);
            onStatusChange('AI 助教已就绪，请说话');
            
            const source = inputAudioContext.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const base64 = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)));
              sessionPromise.then(s => s.sendRealtimeInput({ 
                media: { data: base64, mimeType: 'audio/pcm;rate=16000' } 
              }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContext.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                let result = "ok";
                if (fc.name === 'zoom_in') controlRef.current.zoomSpeed = 0.015;
                if (fc.name === 'zoom_out') controlRef.current.zoomSpeed = -0.015;
                if (fc.name === 'rotate') controlRef.current.rotationVelocity = { x: 0, y: 0.02 };
                if (fc.name === 'stop') {
                  controlRef.current.zoomSpeed = 0;
                  controlRef.current.rotationVelocity = { x: 0, y: 0 };
                }
                
                sessionPromise.then(s => s.sendToolResponse({
                  functionResponses: { id: fc.id, name: fc.name, response: { result } }
                }));
                
                // 自动在2秒后停止缩放，防止无限放大
                if (fc.name.startsWith('zoom')) {
                  setTimeout(() => { controlRef.current.zoomSpeed = 0; }, 1500);
                }
              }
            }
            
            // 处理 AI 语音回馈
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              const binary = atob(base64Audio);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              
              const dataInt16 = new Int16Array(bytes.buffer);
              const buffer = outputAudioContext.createBuffer(1, dataInt16.length, 24000);
              const channelData = buffer.getChannelData(0);
              for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
              
              const source = outputAudioContext.createBufferSource();
              source.buffer = buffer;
              source.connect(outputAudioContext.destination);
              source.start();
            }
          },
          onclose: () => setIsActive(false),
          onerror: (e) => console.error("Voice Session Error:", e)
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error("Voice Setup Error:", err);
      setIsConnecting(false);
      onStatusChange('麦克风连接失败');
    }
  };

  return (
    <div className="flex items-center gap-3">
      {isActive && (
        <div className="flex gap-1 h-4 items-center px-2">
          {[1,2,3,4,5].map(i => (
            <div key={i} className={`w-1 bg-[#86e3ce] rounded-full animate-bounce`} style={{ animationDelay: `${i * 0.1}s`, height: `${Math.random() * 100}%` }}></div>
          ))}
        </div>
      )}
      <button
        onClick={toggleVoice}
        disabled={isConnecting}
        className={`p-3 rounded-full shadow-lg transition-all active:scale-90 ${
          isActive ? 'bg-pink-400 text-white animate-pulse' : 'bg-white text-gray-400 hover:text-[#86e3ce]'
        }`}
      >
        {isConnecting ? <Loader2 className="animate-spin" size={20} /> : isActive ? <Mic size={20} /> : <MicOff size={20} />}
      </button>
    </div>
  );
};

export default VoiceController;
