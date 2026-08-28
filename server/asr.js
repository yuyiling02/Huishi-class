import fs from 'node:fs';
import path from 'node:path';
import sherpaOnnx from 'sherpa-onnx-node';
import { WebSocket, WebSocketServer } from 'ws';

export const ASR_MODEL_NAME = 'sherpa-onnx-streaming-paraformer-bilingual-zh-en';
export const ASR_SAMPLE_RATE = 16_000;

const errorPayload = (code, message, retryable = false) => ({
  type: 'error',
  code,
  message,
  retryable,
});

const positiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const positiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const modelFiles = (modelDir) => ({
  encoder: path.join(modelDir, 'encoder.int8.onnx'),
  decoder: path.join(modelDir, 'decoder.int8.onnx'),
  tokens: path.join(modelDir, 'tokens.txt'),
});

const hasModelFiles = (files) => Object.values(files).every((filename) => fs.existsSync(filename));

export function createAsrService(options = {}) {
  const enabled = options.enabled ?? process.env.ASR_ENABLED !== 'false';
  const modelDir = path.resolve(options.modelDir
    || process.env.ASR_MODEL_DIR
    || path.join(process.cwd(), 'models', 'asr', ASR_MODEL_NAME));
  const maxSessions = positiveInteger(options.maxSessions ?? process.env.ASR_MAX_SESSIONS, 3);
  const numThreads = positiveInteger(options.numThreads ?? process.env.ASR_NUM_THREADS, 1);
  const endpointSilenceSeconds = positiveNumber(
    options.endpointSilenceSeconds ?? process.env.ASR_ENDPOINT_SILENCE_SECONDS,
    2.5,
  );
  const maxUtteranceSeconds = positiveNumber(options.maxUtteranceSeconds, 20);
  const files = modelFiles(modelDir);
  const sessions = new Map();
  let recognizer = options.recognizer || null;
  let unavailableReason = '';

  if (!enabled) {
    unavailableReason = '语音识别已由服务器配置关闭';
  } else if (!recognizer && !hasModelFiles(files)) {
    unavailableReason = `缺少语音识别模型，请运行 scripts/download_asr_model.sh（目标目录：${modelDir}）`;
  } else if (!recognizer) {
    try {
      recognizer = new sherpaOnnx.OnlineRecognizer({
        featConfig: {
          sampleRate: ASR_SAMPLE_RATE,
          featureDim: 80,
        },
        modelConfig: {
          paraformer: {
            encoder: files.encoder,
            decoder: files.decoder,
          },
          tokens: files.tokens,
          numThreads,
          provider: 'cpu',
          debug: false,
        },
        enableEndpoint: true,
        rule1MinTrailingSilence: Math.max(3, endpointSilenceSeconds),
        rule2MinTrailingSilence: endpointSilenceSeconds,
        rule3MinUtteranceLength: maxUtteranceSeconds,
        decodingMethod: 'greedy_search',
        maxActivePaths: 1,
      });
    } catch (error) {
      unavailableReason = `语音识别模型加载失败：${error instanceof Error ? error.message : String(error)}`;
      console.error('[ASR] Model initialization failed:', error);
    }
  }

  if (unavailableReason) console.warn(`[ASR] ${unavailableReason}`);

  const getHealth = () => ({
    available: Boolean(recognizer),
    activeSessions: sessions.size,
    maxSessions,
    model: ASR_MODEL_NAME,
  });

  const checkAvailability = (userId) => {
    if (!recognizer) {
      return errorPayload('unavailable', '服务器语音识别暂不可用', true);
    }
    if (sessions.has(String(userId))) {
      return errorPayload('busy', '该账号已有一个语音识别连接', true);
    }
    if (sessions.size >= maxSessions) {
      return errorPayload('busy', '语音识别繁忙，请稍后再试', true);
    }
    return null;
  };

  const openSession = ({ userId, send, now = () => Date.now() }) => {
    const key = String(userId);
    const availabilityError = checkAvailability(key);
    if (availabilityError) return { error: availabilityError };

    let stream = recognizer.createStream();
    let started = false;
    let closed = false;
    let samplesInUtterance = 0;
    let lastText = '';
    let firstAudioAt = 0;
    let lastAudioAt = 0;
    const connectedAt = now();

    const resetUtterance = (replaceStream = false) => {
      if (replaceStream) stream = recognizer.createStream();
      else recognizer.reset(stream);
      samplesInUtterance = 0;
      lastText = '';
      firstAudioAt = 0;
      lastAudioAt = 0;
    };

    const emitFinal = (text) => {
      const normalized = String(text || '').trim();
      if (!normalized) return;
      send({ type: 'final', text: normalized });
      console.info(
        `[ASR] final user=${key} utterance_ms=${firstAudioAt ? lastAudioAt - firstAudioAt : 0} `
        + `endpoint_latency_ms=${lastAudioAt ? now() - lastAudioAt : 0}`,
      );
    };

    const decodeAvailable = () => {
      while (recognizer.isReady(stream)) recognizer.decode(stream);
      const result = recognizer.getResult(stream);
      const text = String(result?.text || '').trim();
      if (text && text !== lastText) {
        lastText = text;
        send({ type: 'partial', text });
      }

      if (recognizer.isEndpoint(stream)) {
        emitFinal(text);
        resetUtterance();
        return true;
      }
      return false;
    };

    const start = (sampleRate) => {
      if (closed) return errorPayload('unavailable', '语音连接已经关闭');
      if (sampleRate !== ASR_SAMPLE_RATE) {
        return errorPayload('invalid_audio', `仅支持 ${ASR_SAMPLE_RATE}Hz 音频`);
      }
      if (started) return errorPayload('invalid_audio', '语音识别已经启动');
      started = true;
      send({ type: 'ready' });
      return null;
    };

    const acceptAudio = (samples) => {
      if (closed || !started) return errorPayload('invalid_audio', '请先发送 start 消息');
      if (!(samples instanceof Float32Array) || samples.length === 0 || samples.length > ASR_SAMPLE_RATE) {
        return errorPayload('invalid_audio', '音频帧长度无效');
      }
      for (const sample of samples) {
        if (!Number.isFinite(sample) || sample < -1.01 || sample > 1.01) {
          return errorPayload('invalid_audio', '音频样本无效');
        }
      }

      const timestamp = now();
      if (!firstAudioAt) firstAudioAt = timestamp;
      lastAudioAt = timestamp;
      samplesInUtterance += samples.length;
      stream.acceptWaveform({ samples, sampleRate: ASR_SAMPLE_RATE });
      const reachedEndpoint = decodeAvailable();

      if (!reachedEndpoint && samplesInUtterance >= ASR_SAMPLE_RATE * maxUtteranceSeconds) {
        emitFinal(recognizer.getResult(stream)?.text);
        resetUtterance();
      }
      return null;
    };

    const finish = () => {
      if (closed || !started) return null;
      stream.inputFinished();
      while (recognizer.isReady(stream)) recognizer.decode(stream);
      emitFinal(recognizer.getResult(stream)?.text);
      resetUtterance(true);
      started = false;
      return null;
    };

    const close = (reason = 'closed') => {
      if (closed) return;
      closed = true;
      sessions.delete(key);
      console.info(`[ASR] close user=${key} duration_ms=${now() - connectedAt} reason=${reason}`);
    };

    const session = { start, acceptAudio, finish, close };
    sessions.set(key, session);
    console.info(`[ASR] open user=${key} active=${sessions.size}/${maxSessions}`);
    return { session };
  };

  return {
    getHealth,
    checkAvailability,
    openSession,
    unavailableReason: () => unavailableReason,
  };
}

const writeUpgradeError = (socket, status, message) => {
  if (!socket.writable) return socket.destroy();
  const body = JSON.stringify({ message });
  socket.end(
    `HTTP/1.1 ${status} ${status === 401 ? 'Unauthorized' : 'Forbidden'}\r\n`
    + 'Content-Type: application/json; charset=utf-8\r\n'
    + `Content-Length: ${Buffer.byteLength(body)}\r\n`
    + 'Connection: close\r\n\r\n'
    + body,
  );
};

const safeSend = (ws, payload) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
};

export function attachAsrWebSocketServer({
  server,
  asrService,
  authenticate,
  allowedOrigin,
  websocketPath = '/api/asr',
}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: ASR_SAMPLE_RATE * 4 });

  wss.on('connection', (ws, _request, user) => {
    const opened = asrService.openSession({
      userId: user.id,
      send: (payload) => safeSend(ws, payload),
    });
    if (opened.error) {
      safeSend(ws, opened.error);
      ws.close(1013, opened.error.code);
      return;
    }

    const { session } = opened;
    ws.on('message', (data, isBinary) => {
      let protocolError = null;
      try {
        if (isBinary) {
          if (data.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
            protocolError = errorPayload('invalid_audio', '音频帧必须是 Float32 PCM');
          } else {
            const copied = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            protocolError = session.acceptAudio(new Float32Array(copied));
          }
        } else {
          const message = JSON.parse(data.toString('utf8'));
          if (message?.type === 'start') protocolError = session.start(Number(message.sampleRate));
          else if (message?.type === 'finish') protocolError = session.finish();
          else protocolError = errorPayload('invalid_audio', '不支持的语音消息');
        }
      } catch (error) {
        console.error(`[ASR] message failed user=${user.id}:`, error);
        protocolError = errorPayload('invalid_audio', '无法处理语音数据');
      }

      if (protocolError) safeSend(ws, protocolError);
    });
    ws.on('close', (code) => session.close(`socket_${code}`));
    ws.on('error', (error) => {
      console.error(`[ASR] socket error user=${user.id}: ${error.message}`);
      session.close('socket_error');
    });
  });

  server.on('upgrade', async (request, socket, head) => {
    let pathname = '';
    try {
      pathname = new URL(request.url || '/', 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== websocketPath) return;

    if (allowedOrigin && request.headers.origin !== allowedOrigin) {
      writeUpgradeError(socket, 403, '不允许的请求来源');
      return;
    }

    let user;
    try {
      user = await authenticate(request);
    } catch {
      user = null;
    }
    if (!user) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        safeSend(ws, errorPayload('unauthorized', '登录已过期，请重新登录'));
        ws.close(1008, 'unauthorized');
      });
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, user);
    });
  });

  return wss;
}
