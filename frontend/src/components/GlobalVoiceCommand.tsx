import { useCallback, useEffect, useRef, useState } from "react";
import { Button, TextArea, Toast } from "antd-mobile";
import { createCalendarEvent } from "../api/calendar";
import { listMembers } from "../api/members";
import { createTask } from "../api/tasks";
import { getVoiceJsapiConfig, interpretVoiceCommand, transcribeVoiceAudio } from "../api/voice";
import { useAuth } from "../hooks/useAuth";
import type { Member } from "../types/api";
import { isInLark } from "../utils/lark";

const toLocalIso = (value: Date) => {
  const pad = (num: number) => String(num).padStart(2, "0");
  const timezoneOffset = -value.getTimezoneOffset();
  const sign = timezoneOffset >= 0 ? "+" : "-";
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}${sign}${pad(Math.floor(Math.abs(timezoneOffset) / 60))}:${pad(Math.abs(timezoneOffset) % 60)}`;
};

const parseChineseDateTime = (text: string, fallbackHours = 1) => {
  const value = new Date();
  value.setMinutes(0, 0, 0);
  value.setHours(value.getHours() + fallbackHours);
  if (text.includes("后天")) value.setDate(value.getDate() + 2);
  else if (text.includes("明天")) value.setDate(value.getDate() + 1);
  const hourMatch = text.match(/(\d{1,2})\s*(点|:|：)(\d{1,2})?/);
  if (hourMatch) {
    let hour = Number(hourMatch[1]);
    const minute = hourMatch[3] ? Number(hourMatch[3]) : 0;
    if ((text.includes("下午") || text.includes("晚上")) && hour < 12) hour += 12;
    if (text.includes("中午") && hour < 11) hour += 12;
    value.setHours(Math.min(23, hour), Math.min(59, minute), 0, 0);
  } else if (text.includes("上午")) {
    value.setHours(10, 0, 0, 0);
  } else if (text.includes("下午")) {
    value.setHours(15, 0, 0, 0);
  } else if (text.includes("晚上")) {
    value.setHours(19, 0, 0, 0);
  }
  return value;
};

const stripCommandNoise = (text: string) =>
  text
    .replace(/^(请|帮我|帮忙|麻烦|现在|立即|给|向|为)+/, "")
    .replace(/(同步到飞书|发送通知|通知一下|通知|谢谢)$/g, "")
    .trim();

const normalizeNameText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[\s·•,，.。、;；:：/\\|"'“”‘’()（）[\]【】{}<>《》-]/g, "");

const findMentionedMembers = (text: string, members: Member[]) => {
  const normalizedText = normalizeNameText(text);
  const seen = new Set<string>();
  return members
    .filter((member) => {
      const names = [member.name, member.en_name]
        .filter((item): item is string => Boolean(item))
        .map(normalizeNameText)
        .filter(Boolean);
      const matched = names.some((name) => normalizedText.includes(name));
      if (!matched || seen.has(member.open_id)) return false;
      seen.add(member.open_id);
      return true;
    })
    .slice(0, 12);
};

const loadAllMembers = async () => {
  const items: Member[] = [];
  let page = 1;
  const pageSize = 100;
  while (page <= 20) {
    const response = await listMembers({ page, page_size: pageSize });
    items.push(...response.items);
    if (items.length >= response.total || response.items.length < pageSize) break;
    page += 1;
  }
  return items;
};

const extractTaskTitle = (text: string, members: Member[]) => {
  let title = stripCommandNoise(text);
  members.forEach((member) => {
    title = title.replace(member.name, "");
  });
  title = title
    .replace(/(布置|安排|派发|分配)?(一个|一项)?任务/g, "")
    .replace(/(今天|明天|后天|上午|下午|晚上|\d{1,2}\s*(点|:|：)\d{0,2}|前|之前|完成)/g, "")
    .trim();
  return title || "语音任务";
};

const extractMeetingTitle = (text: string, members: Member[]) => {
  let title = stripCommandNoise(text);
  members.forEach((member) => {
    title = title.replace(member.name, "");
  });
  title = title
    .replace(/(安排|创建|发起|开|约)?(一个|一场)?(会议|会|同步会|讨论)/g, "")
    .replace(/(今天|明天|后天|上午|下午|晚上|\d{1,2}\s*(点|:|：)\d{0,2}|在|会议室|教室|工作区)/g, "")
    .trim();
  return title || "语音会议";
};

const extractLocation = (text: string) => {
  const match = text.match(/在([^，。,.]*?(会议室|教室|工作区|线上|实验室))/);
  if (match?.[1]) return match[1].trim();
  if (text.includes("会议室")) return "会议室";
  if (text.includes("教室")) return "教室";
  if (text.includes("线上")) return "线上会议室";
  return "云实验室会议室";
};

const memberNamesById = (members: Member[]) =>
  members.reduce<Record<string, string>>((acc, member) => {
    acc[member.open_id] = member.name;
    return acc;
  }, {});

const errorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "unknown";
  }
};

const encodeWavBase64 = (chunks: Float32Array[], sampleRate: number) => {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const samples = new Float32Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    samples.set(chunk, offset);
    offset += chunk.length;
  });
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (position: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(position + index, value.charCodeAt(index));
    }
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let cursor = 44;
  samples.forEach((sample) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(cursor, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    cursor += 2;
  });
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return window.btoa(binary);
};

const panelStyle = `
  .global-voice-command {
    position: fixed;
    right: 16px;
    bottom: calc(82px + env(safe-area-inset-bottom));
    z-index: 1200;
    font-family: Arial, sans-serif;
  }
  .global-voice-button {
    min-width: 58px;
    height: 44px;
    border: 1px solid rgba(17,24,39,0.14);
    border-radius: 999px;
    background: #111827;
    color: #ffffff;
    box-shadow: 0 16px 34px rgba(15,23,42,0.22);
    font-size: 13px;
    font-weight: 900;
    cursor: pointer;
  }
  .global-voice-panel {
    position: absolute;
    right: 0;
    bottom: 54px;
    width: min(360px, calc(100vw - 24px));
    border: 1px solid rgba(156,163,175,0.45);
    border-radius: 14px;
    background: rgba(255,255,255,0.96);
    box-shadow: 0 20px 46px rgba(31,41,55,0.18);
    backdrop-filter: blur(12px);
    padding: 12px;
    color: #111827;
  }
  .global-voice-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 14px;
    font-weight: 900;
  }
  .global-voice-hint {
    margin: 8px 0;
    color: #6b7280;
    font-size: 12px;
    line-height: 1.55;
  }
  .global-voice-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-top: 10px;
  }
  .global-voice-close {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: 1px solid rgba(209,213,219,0.9);
    background: #ffffff;
    color: #374151;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
  }
`;

const GlobalVoiceCommand = () => {
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const recorderRef = useRef<LarkRecorderManager | null>(null);
  const recordingFormatRef = useRef<"wav" | "aac">("wav");
  const activeRecorderRef = useRef<"feishu" | "web" | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);

  useEffect(() => {
    if (!me || !open || members.length) return;
    loadAllMembers()
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [me, members.length, open]);

  const configureFeishuVoiceApi = useCallback(async () => {
    if (!window.h5sdk?.config) return;
    const config = await getVoiceJsapiConfig(window.location.href.split("#")[0]);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      const fail = (err: unknown) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      };
      window.h5sdk?.ready?.(finish);
      window.h5sdk?.error?.((err) => {
        console.error("Feishu h5sdk config failed", err);
        fail(err);
      });
      window.h5sdk?.config?.(config as unknown as Record<string, unknown>);
      setTimeout(finish, 1800);
    });
  }, []);

  const readFeishuFileAsBase64 = useCallback((filePath: string) =>
    new Promise<string>((resolve, reject) => {
      const fileSystem = window.tt?.getFileSystemManager?.();
      if (!fileSystem) {
        reject(new Error("飞书文件读取能力不可用"));
        return;
      }
      fileSystem.readFile({
        filePath,
        encoding: "base64",
        success: (res) => resolve(String(res.data || "")),
        fail: reject,
      });
    }), []);

  const authorizeFeishuRecord = useCallback(() =>
    new Promise<void>((resolve, reject) => {
      if (!window.tt?.authorize) {
        resolve();
        return;
      }
      window.tt.authorize({
        scope: "scope.record",
        success: () => resolve(),
        fail: (err) => reject(new Error(`麦克风权限未授权: ${errorMessage(err)}`)),
      });
    }), []);

  const stopFeishuRecording = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const stopWebRecording = useCallback(async () => {
    const context = audioContextRef.current;
    const processor = audioProcessorRef.current;
    const stream = audioStreamRef.current;
    audioContextRef.current = null;
    audioProcessorRef.current = null;
    audioStreamRef.current = null;
    activeRecorderRef.current = null;
    setRecording(false);
    processor?.disconnect();
    stream?.getTracks().forEach((track) => track.stop());
    const sampleRate = context?.sampleRate || 16000;
    await context?.close().catch(() => undefined);
    const chunks = audioChunksRef.current;
    audioChunksRef.current = [];
    if (!chunks.length) {
      Toast.show({ icon: "fail", content: "未采集到语音" });
      return;
    }
    setListening(true);
    try {
      const audioBase64 = encodeWavBase64(chunks, sampleRate);
      const result = await transcribeVoiceAudio({ audio_base64: audioBase64, format: "wav" });
      setText(result.text);
      Toast.show({ icon: "success", content: "语音已识别" });
    } catch (err) {
      Toast.show({ icon: "fail", content: `语音识别失败: ${errorMessage(err).slice(0, 42)}` });
    } finally {
      setListening(false);
    }
  }, []);

  const startWebRecording = useCallback(async (notice?: string) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      Toast.show({ icon: "fail", content: "当前环境不支持网页麦克风录音" });
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      const context = new AudioContextCtor();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      audioChunksRef.current = [];
      processor.onaudioprocess = (event) => {
        audioChunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(context.destination);
      audioContextRef.current = context;
      audioProcessorRef.current = processor;
      audioStreamRef.current = stream;
      activeRecorderRef.current = "web";
      setRecording(true);
      setListening(false);
      Toast.show({ icon: "success", content: notice || "开始录音" });
      return true;
    } catch (err) {
      Toast.show({ icon: "fail", content: `网页录音失败: ${errorMessage(err).slice(0, 42)}` });
      return false;
    }
  }, []);

  const startFeishuRecording = useCallback(async () => {
    const recorder = window.tt?.getRecorderManager?.();
    if (!recorder) return false;
    try {
      await configureFeishuVoiceApi();
      await authorizeFeishuRecord();
      recorderRef.current = recorder;
      const format: "wav" | "aac" = /iPhone|iPad|iPod/i.test(navigator.userAgent || "") ? "aac" : "wav";
      recordingFormatRef.current = format;
      const options = {
        duration: 60000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format,
      };
      let retryLeft = 2;
      const startRecorder = () => recorder.start(options);
      recorder.onStart?.(() => {
        activeRecorderRef.current = "feishu";
        setRecording(true);
        setListening(false);
      });
      recorder.onError?.((err) => {
        const message = errorMessage(err);
        console.error("Feishu recorder failed", err);
        if (retryLeft > 0 && (message.includes("1305003") || message.includes("OperateRecorder start failed"))) {
          retryLeft -= 1;
          try {
            recorder.stop();
          } catch {
            // ignore recorder stop errors before retry
          }
          setTimeout(startRecorder, 500);
          return;
        }
        setRecording(false);
        setListening(false);
        activeRecorderRef.current = null;
        void startWebRecording(`飞书录音不可用，已切换网页录音`);
      });
      recorder.onStop?.(async (res) => {
        setRecording(false);
        activeRecorderRef.current = null;
        const filePath = res.tempFilePath;
        if (!filePath) {
          Toast.show({ icon: "fail", content: "未获取到录音文件" });
          return;
        }
        setListening(true);
        try {
          const audioBase64 = await readFeishuFileAsBase64(filePath);
          const result = await transcribeVoiceAudio({ audio_base64: audioBase64, format: recordingFormatRef.current });
          setText(result.text);
          Toast.show({ icon: "success", content: "语音已识别" });
        } catch {
          Toast.show({ icon: "fail", content: "飞书语音识别失败" });
        } finally {
          setListening(false);
        }
      });
      startRecorder();
      return true;
    } catch (err) {
      setRecording(false);
      console.error("Feishu voice init failed", err);
      Toast.show({ icon: "fail", content: `飞书语音初始化失败: ${errorMessage(err).slice(0, 42)}` });
      return true;
    }
  }, [authorizeFeishuRecord, configureFeishuVoiceApi, readFeishuFileAsBase64, startWebRecording]);

  const startVoiceRecognition = useCallback(() => {
    if (recording) {
      if (activeRecorderRef.current === "web") {
        void stopWebRecording();
      } else {
        stopFeishuRecording();
      }
      return;
    }
    if (isInLark() && window.tt?.getRecorderManager) {
      startFeishuRecording();
      return;
    }
    const getUserMedia = navigator.mediaDevices?.getUserMedia as typeof navigator.mediaDevices.getUserMedia | undefined;
    if (getUserMedia) {
      void startWebRecording();
      return;
    }
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      Toast.show({ icon: "fail", content: "当前环境未提供语音能力，请先用文字输入" });
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      Toast.show({ icon: "fail", content: "语音识别失败" });
    };
    recognition.onresult = (event: any) => {
      const result = Array.from(event.results || [])
        .map((item: any) => item[0]?.transcript || "")
        .join("");
      setText(result);
    };
    recognition.start();
  }, [recording, startFeishuRecording, startWebRecording, stopFeishuRecording, stopWebRecording]);

  const executeCommand = useCallback(async () => {
    const command = text.trim();
    if (!command) {
      Toast.show({ icon: "fail", content: "请先输入或识别语音指令" });
      return;
    }
    let directory = members;
    if (!directory.length) {
      directory = await loadAllMembers().catch(() => []);
      setMembers(directory);
    }
    const localMentioned = findMentionedMembers(command, directory);
    if (!localMentioned.length) {
      Toast.show({ icon: "fail", content: "没有识别到成员姓名" });
      return;
    }
    setSubmitting(true);
    try {
      const interpreted = await interpretVoiceCommand(command);
      const names = memberNamesById(directory);
      if (interpreted.action === "event") {
        const fallbackStart = parseChineseDateTime(command, 2);
        const fallbackEnd = new Date(fallbackStart);
        fallbackEnd.setHours(fallbackEnd.getHours() + 1);
        const attendeeIds = interpreted.attendee_open_ids.length
          ? interpreted.attendee_open_ids
          : localMentioned.map((member) => member.open_id);
        await createCalendarEvent({
          event_type: "meeting",
          title: interpreted.title || extractMeetingTitle(command, localMentioned),
          description: interpreted.description || `语音创建: ${command}`,
          location: interpreted.location || extractLocation(command),
          start_at: interpreted.start_at || toLocalIso(fallbackStart),
          end_at: interpreted.end_at || toLocalIso(fallbackEnd),
          all_day: false,
          attendee_open_ids: Array.from(new Set([me?.open_id || "", ...attendeeIds])).filter(Boolean),
          sync_to_lark: true,
        });
        Toast.show({ icon: "success", content: `日程已创建: ${attendeeIds.map((id) => names[id]).filter(Boolean).join("、")}` });
      } else if (interpreted.action === "task") {
        const fallbackDue = parseChineseDateTime(command, 4);
        const assigneeIds = interpreted.assignee_open_ids.length
          ? interpreted.assignee_open_ids
          : localMentioned.map((member) => member.open_id);
        await Promise.all(
          assigneeIds.map((openId) =>
            createTask({
              title: interpreted.title || extractTaskTitle(command, localMentioned),
              description: interpreted.description || `语音创建: ${command}`,
              assignee_open_id: openId,
              due_date: interpreted.due_date || toLocalIso(fallbackDue),
              status: "todo",
              priority: interpreted.priority || (command.includes("紧急") ? "urgent" : command.includes("重要") ? "high" : "medium"),
            }),
          ),
        );
        Toast.show({ icon: "success", content: `任务已派发给 ${assigneeIds.length} 人` });
      } else {
        Toast.show({ icon: "fail", content: "AI 未能判断是任务还是日程" });
        return;
      }
      setText("");
      setOpen(false);
    } catch {
      Toast.show({ icon: "fail", content: "指令执行失败" });
    } finally {
      setSubmitting(false);
    }
  }, [me?.open_id, members, text]);

  if (!me) return null;

  return (
    <>
      <style>{panelStyle}</style>
      <div className="global-voice-command">
        {open ? (
          <div className="global-voice-panel">
            <div className="global-voice-title">
              <span>语音输入</span>
              <button type="button" className="global-voice-close" onClick={() => setOpen(false)}>×</button>
            </div>
            <div className="global-voice-hint">
              飞书内使用应用录音识别；普通浏览器使用系统语音识别。可说: 今天晚上九点找秦振凯、罗起宁开会。
            </div>
            <TextArea
              value={text}
              onChange={setText}
              placeholder="语音识别结果或手动输入指令"
              autoSize={{ minRows: 3, maxRows: 5 }}
              style={{ "--font-size": "13px" }}
            />
            <div className="global-voice-actions">
              <Button size="mini" color={recording ? "danger" : "primary"} loading={listening} onClick={startVoiceRecognition}>
                {recording ? "停止录音" : listening ? "识别中" : "开始语音"}
              </Button>
              <Button size="mini" fill="outline" loading={submitting} onClick={executeCommand}>
                执行指令
              </Button>
            </div>
          </div>
        ) : null}
        <button type="button" className="global-voice-button" onClick={() => setOpen((value) => !value)}>
          语音
        </button>
      </div>
    </>
  );
};

export default GlobalVoiceCommand;
