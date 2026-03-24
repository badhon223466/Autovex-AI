/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { 
  Send, 
  Camera, 
  Image as ImageIcon, 
  Cpu, 
  Zap, 
  AlertTriangle, 
  Settings, 
  History,
  Terminal,
  X,
  Loader2,
  Mic,
  MicOff,
  Volume2,
  VolumeX
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Initialize Gemini API helper
const getGenAI = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface Message {
  role: 'user' | 'assistant';
  content: string;
  image?: string;
}

const getSystemPrompt = (lang: 'en' | 'bn') => `You are the Autovex Automation Expert AI, a highly skilled Industrial Automation Engineer.

Greeting Protocol:
- ALWAYS start your very first response to the user with "Assalamu Alaikum" (আসসালামু আলাইকুম).

Current Language Preference: ${lang === 'bn' ? 'Bengali/Bangla' : 'English'}.

Your expertise covers:
- PLC: Siemens TIA Portal (S7-1200/1500), Delta ISPSoft (DVP/AS), Mitsubishi GX Works.
- HMI: DOPSoft, EasyBuilder Pro.
- VFD: Parameter tuning, multi-speed setup, fault analysis (OC, OV, LU, SF).
- Sensors: 2-wire/3-wire, Load cells, Encoders, 4-20mA/0-10V analog signals.
- Electrical Control Panel wiring and troubleshooting.

Language Protocol:
- ${lang === 'bn' ? 'Respond primarily in Bengali (Bangla). Use English for technical terms only. Keep the tone professional and helpful.' : 'Respond primarily in English. Keep the tone professional and helpful.'}
- Keep responses concise and structured (bullet points).

Voice Interaction:
- Your responses will be spoken aloud. Keep them concise and clear for audio listening.
- Be direct, professional, and helpful.
- **STRICT PROTOCOL**: You are equipped with a high-precision human voice filter. Ignore all industrial background noise, machine hums, or non-human sounds unless the user explicitly asks you to "Listen to this machine".
- Focus exclusively on the user's speech commands.

Safety First:
- ALWAYS warn about high voltage and industrial safety standards (PPE/LOTO) when relevant.
- Remind users to turn off power before checking wiring.`;

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle');
  const [language, setLanguage] = useState<'en' | 'bn'>('bn');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Live API Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextStartTimeRef = useRef<number>(0);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  
  // Advanced Audio Processing Refs
  const noiseThresholdRef = useRef(0.015);
  const noiseFloorRef = useRef(0.005);
  const voiceActiveRef = useRef(false);
  const silenceCounterRef = useRef(0);
  const SILENCE_TIMEOUT = 15; // Number of frames to wait before closing gate

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() && !selectedImage) return;

    // Resume audio context on user interaction
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    const userMessage: Message = {
      role: 'user',
      content: input,
      image: selectedImage || undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    // If live session is active, send via live session
    if (isLiveActive && sessionRef.current) {
      try {
        sessionRef.current.sendRealtimeInput({
          text: userMessage.content || "Analyze this image."
        });
        setIsLoading(false);
        return;
      } catch (err) {
        console.error("Error sending to live session:", err);
      }
    }

    try {
      const ai = getGenAI();
      let fullContent = "";
      
      // Add an empty assistant message to start streaming into
      setMessages(prev => [...prev, { role: 'assistant', content: "" }]);

      if (userMessage.image) {
        const base64Data = userMessage.image.split(',')[1];
        const imagePart = {
          inlineData: {
            data: base64Data,
            mimeType: "image/jpeg"
          }
        };
        const textPart = {
          text: userMessage.content || "Analyze this image."
        };
        
        const result = await ai.models.generateContentStream({
          model: "gemini-3-flash-preview",
          contents: { parts: [textPart, imagePart] },
          config: { systemInstruction: getSystemPrompt(language) }
        });

        for await (const chunk of result) {
          const text = chunk.text;
          fullContent += text;
          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1].content = fullContent;
            return newMessages;
          });
          scrollToBottom();
        }
      } else {
        const result = await ai.models.generateContentStream({
          model: "gemini-3-flash-preview",
          contents: userMessage.content,
          config: { systemInstruction: getSystemPrompt(language) }
        });

        for await (const chunk of result) {
          const text = chunk.text;
          fullContent += text;
          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1].content = fullContent;
            return newMessages;
          });
          scrollToBottom();
        }
      }
      
      // Streaming finished
    } catch (error) {
      console.error("Gemini API Error:", error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Error: API connection failed. Please check your network or API key configuration."
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Live API Logic ---

  const playNextChunk = useCallback(() => {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      isPlayingRef.current = false;
      return;
    }

    const now = audioContextRef.current.currentTime;
    if (nextStartTimeRef.current < now) {
      nextStartTimeRef.current = now + 0.05; // Small buffer
    }

    isPlayingRef.current = true;
    const chunk = audioQueueRef.current.shift()!;
    const float32Data = new Float32Array(chunk.length);
    for (let i = 0; i < chunk.length; i++) {
      float32Data[i] = chunk[i] / 32768.0;
    }

    const sampleRate = 24000;
    const buffer = audioContextRef.current.createBuffer(1, float32Data.length, sampleRate);
    buffer.getChannelData(0).set(float32Data);
    
    const source = audioContextRef.current.createBufferSource();
    currentSourceRef.current = source;
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    
    const startTime = nextStartTimeRef.current;
    source.start(startTime);
    
    nextStartTimeRef.current += buffer.duration;

    source.onended = () => {
      currentSourceRef.current = null;
      if (audioQueueRef.current.length === 0) {
        isPlayingRef.current = false;
      }
      playNextChunk();
    };
  }, []);

  const startLiveSession = async () => {
    if (isLiveActive) return;
    
    setLiveStatus('connecting');
    setIsLiveActive(true);
    setIsVoiceMode(true);
    
      try {
        const ai = getGenAI();
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        streamRef.current = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: 24000
          } 
        });
        
        const session = await ai.live.connect({
          model: "gemini-2.5-flash-native-audio-preview-12-2025",
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } }
            },
            systemInstruction: getSystemPrompt(language),
          },
          callbacks: {
            onopen: () => {
              console.log("Live session opened");
              setLiveStatus('active');
              const source = audioContextRef.current!.createMediaStreamSource(streamRef.current!);
              
              // Create Advanced Audio Processing Chain
              
              // 1. High-pass filter to remove low-frequency industrial hum
              const highPass = audioContextRef.current!.createBiquadFilter();
              highPass.type = 'highpass';
              highPass.frequency.value = 250; 
              
              // 2. Low-pass filter to remove high-frequency machine noise
              const lowPass = audioContextRef.current!.createBiquadFilter();
              lowPass.type = 'lowpass';
              lowPass.frequency.value = 3500; 
              
              // 3. Dynamics Compressor to normalize voice levels
              const compressor = audioContextRef.current!.createDynamicsCompressor();
              compressor.threshold.setValueAtTime(-24, audioContextRef.current!.currentTime);
              compressor.knee.setValueAtTime(30, audioContextRef.current!.currentTime);
              compressor.ratio.setValueAtTime(12, audioContextRef.current!.currentTime);
              compressor.attack.setValueAtTime(0.003, audioContextRef.current!.currentTime);
              compressor.release.setValueAtTime(0.25, audioContextRef.current!.currentTime);

              // 4. Gain node for final normalization
              const gainNode = audioContextRef.current!.createGain();
              gainNode.gain.value = 1.5;
              
              processorRef.current = audioContextRef.current!.createScriptProcessor(2048, 1, 1);
              
              processorRef.current.onaudioprocess = (e) => {
                if (isMuted || !sessionRef.current) return;
                const inputData = e.inputBuffer.getChannelData(0);
                
                // Advanced VAD (Voice Activity Detection) with Hysteresis
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) {
                  sum += inputData[i] * inputData[i];
                }
                const rms = Math.sqrt(sum / inputData.length);
                
                // Adaptive noise floor estimation
                if (rms < noiseFloorRef.current) {
                  noiseFloorRef.current = noiseFloorRef.current * 0.95 + rms * 0.05;
                }
                
                // Dynamic threshold based on noise floor
                const dynamicThreshold = Math.max(noiseThresholdRef.current, noiseFloorRef.current * 2.5);
                
                if (rms > dynamicThreshold) {
                  voiceActiveRef.current = true;
                  silenceCounterRef.current = 0;
                } else {
                  silenceCounterRef.current++;
                  if (silenceCounterRef.current > SILENCE_TIMEOUT) {
                    voiceActiveRef.current = false;
                  }
                }
                
                // Only send if voice is active (Gate is open)
                if (!voiceActiveRef.current) return;

                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                  pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
                }
                
                const bytes = new Uint8Array(pcmData.buffer);
                let binary = '';
                for (let i = 0; i < bytes.byteLength; i++) {
                  binary += String.fromCharCode(bytes[i]);
                }
                const base64Data = btoa(binary);
                
                sessionRef.current?.sendRealtimeInput({
                  audio: { data: base64Data, mimeType: 'audio/pcm;rate=24000' }
                });
              };
              
              // Connect Chain: Source -> HighPass -> LowPass -> Compressor -> Gain -> Processor
              source.connect(highPass);
              highPass.connect(lowPass);
              lowPass.connect(compressor);
              compressor.connect(gainNode);
              gainNode.connect(processorRef.current);
              processorRef.current.connect(audioContextRef.current!.destination);
            },
          onmessage: async (message: LiveServerMessage) => {
            console.log("Live message received:", message);
            // Handle Model Output
            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  const base64Audio = part.inlineData.data;
                  const binaryString = atob(base64Audio);
                  const bytes = new Uint8Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  const pcmData = new Int16Array(bytes.buffer);
                  audioQueueRef.current.push(pcmData);
                  playNextChunk();
                }
                
                if (part.text) {
                  setMessages(prev => {
                    const lastMsg = prev[prev.length - 1];
                    if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.image) {
                      return [...prev.slice(0, -1), { ...lastMsg, content: lastMsg.content + " " + part.text }];
                    }
                    return [...prev, { role: 'assistant', content: part.text! }];
                  });
                }
              }
            }

            // Handle User Input Transcription
            const userTurn = (message.serverContent as any)?.userTurn;
            if (userTurn?.parts) {
              for (const part of userTurn.parts) {
                if (part.text) {
                  setMessages(prev => {
                    const lastMsg = prev[prev.length - 1];
                    if (lastMsg && lastMsg.role === 'user' && !lastMsg.image) {
                      return [...prev.slice(0, -1), { ...lastMsg, content: lastMsg.content + " " + part.text }];
                    }
                    return [...prev, { role: 'user', content: part.text! }];
                  });
                }
              }
            }
            
            if (message.serverContent?.interrupted) {
              console.log("Live session interrupted");
              audioQueueRef.current = [];
              isPlayingRef.current = false;
            }
          },
          onclose: () => {
            console.log("Live session closed");
            stopLiveSession();
          },
          onerror: (err) => {
            console.error("Live session error:", err);
            setLiveStatus('error');
            setMessages(prev => [...prev, { 
              role: 'assistant', 
              content: "Voice Agent Error: Connection failed. Please check your network connection." 
            }]);
            stopLiveSession();
          }
        }
      });
      
      sessionRef.current = session;
    } catch (err) {
      console.error("Failed to start live session:", err);
      setLiveStatus('error');
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "Failed to initialize Voice Agent. Please ensure microphone access is allowed." 
      }]);
      stopLiveSession();
    }
  };

  const stopLiveSession = () => {
    sessionRef.current?.close();
    sessionRef.current = null;
    
    processorRef.current?.disconnect();
    processorRef.current = null;
    
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    
    audioContextRef.current?.close();
    audioContextRef.current = null;
    
    setIsLiveActive(false);
    setIsVoiceMode(false);
    setLiveStatus('idle');
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    nextStartTimeRef.current = 0;
  };

  // --- UI Handlers ---

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const startCamera = async () => {
    setIsCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      setIsCameraOpen(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg');
        setSelectedImage(dataUrl);
        stopCamera();
      }
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach(track => track.stop());
    setIsCameraOpen(false);
  };

  return (
    <div className="flex flex-col h-[100dvh] max-w-5xl mx-auto p-0 md:p-6 gap-0 md:gap-4 overflow-hidden bg-zinc-50/50 safe-area-inset">
      {/* Header */}
      <header className="flex items-center justify-between hardware-card p-4 md:p-4 rounded-none md:rounded-2xl shrink-0 border-b md:border border-zinc-200 bg-white/80 backdrop-blur-md z-20">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center shadow-sm">
            <Cpu className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-zinc-900">Autovex Expert</h1>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${
                  liveStatus === 'active' ? 'bg-emerald-500 animate-pulse' : 
                  liveStatus === 'connecting' ? 'bg-amber-500 animate-pulse' : 
                  liveStatus === 'error' ? 'bg-rose-500' : 'bg-emerald-500'
                }`}></span>
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                  {liveStatus === 'active' ? 'Live Voice' : 
                   liveStatus === 'connecting' ? 'Connecting' :
                   liveStatus === 'error' ? 'System Error' : 'System Ready'}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          {/* Language Toggle */}
          <button 
            onClick={() => setLanguage(language === 'en' ? 'bn' : 'en')}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 transition-all font-bold text-[10px] uppercase tracking-wider"
          >
            <Zap size={14} className={language === 'bn' ? 'text-emerald-500' : 'text-zinc-400'} />
            <span>{language === 'bn' ? 'Bangla' : 'English'}</span>
          </button>

          <button 
            onClick={isLiveActive ? stopLiveSession : startLiveSession}
            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 font-bold text-xs uppercase tracking-tight ${
              isLiveActive 
                ? 'bg-rose-50 text-rose-600 border border-rose-200' 
                : 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm'
            }`}
          >
            {isLiveActive ? <MicOff size={16} /> : <Mic size={16} />}
            <span className="hidden sm:inline">
              {isLiveActive ? (language === 'bn' ? 'বন্ধ করুন' : 'Stop') : (language === 'bn' ? 'কথা বলুন' : 'Start Voice')}
            </span>
          </button>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 hardware-card rounded-none md:rounded-3xl overflow-hidden flex flex-col relative min-h-0 border-zinc-200 bg-white shadow-sm">
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 md:space-y-8 custom-scrollbar">
          {messages.length === 0 && !isLiveActive && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 md:p-12 space-y-8">
              <div className="w-24 h-24 rounded-3xl bg-zinc-50 flex items-center justify-center border border-zinc-100 shadow-inner">
                <Terminal className="text-zinc-900 w-12 h-12" />
              </div>
              <div className="space-y-3">
                <h2 className="text-3xl font-black text-zinc-900 tracking-tight">
                  {language === 'bn' ? 'আসসালামু আলাইকুম' : 'Assalamu Alaikum'}
                </h2>
                <p className="text-zinc-500 max-w-sm mx-auto text-lg leading-relaxed">
                  {language === 'bn' 
                    ? 'Autovex-এ স্বাগতম। আমি আপনার ইন্ডাস্ট্রিয়াল অটোমেশন বিশেষজ্ঞ। আজ আমি আপনাকে কীভাবে সাহায্য করতে পারি?' 
                    : 'Welcome to Autovex. I am your professional Industrial Automation Expert. How can I assist you today?'}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-xl">
                <button 
                  onClick={() => setInput(language === 'bn' ? "Siemens S7-1200 এ SF বাতি জ্বলছে, কি করবো?" : "SF light is on in Siemens S7-1200, what to do?")}
                  className="p-5 text-sm text-left bg-white border border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 transition-all rounded-2xl shadow-sm group"
                >
                  <span className="block font-bold text-zinc-900 mb-1">
                    {language === 'bn' ? 'PLC সমস্যা সমাধান' : 'Troubleshoot PLC'}
                  </span>
                  <span className="text-zinc-500">
                    {language === 'bn' ? '"Siemens S7-1200 এ SF বাতি..."' : '"SF light is on in Siemens..."'}
                  </span>
                </button>
                <button 
                  onClick={startLiveSession}
                  className="p-5 text-sm text-left bg-zinc-900 text-white hover:bg-zinc-800 transition-all rounded-2xl flex items-center justify-between shadow-lg group"
                >
                  <div>
                    <span className="block font-bold mb-1">
                      {language === 'bn' ? 'ভয়েস অ্যাসিস্ট্যান্ট' : 'Voice Assistant'}
                    </span>
                    <span className="text-zinc-400">
                      {language === 'bn' ? 'হ্যান্ডস-ফ্রি সেশন শুরু করুন' : 'Start hands-free session'}
                    </span>
                  </div>
                  <Mic size={24} className="group-hover:scale-110 transition-transform" />
                </button>
              </div>
            </div>
          )}

          <AnimatePresence>
            {isLiveActive && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 bg-white/95 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center"
              >
                <div className="relative mb-12">
                  <div className="w-40 h-40 rounded-full bg-zinc-50 flex items-center justify-center relative z-10 border border-zinc-100 shadow-inner">
                    <div className="w-32 h-32 rounded-full bg-zinc-100 flex items-center justify-center">
                      <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center shadow-2xl">
                        {isMuted ? <MicOff size={36} className="text-white" /> : <Mic size={36} className="text-white" />}
                      </div>
                    </div>
                  </div>
                  {!isMuted && (
                    <>
                      <div className="absolute inset-0 rounded-full border-2 border-zinc-900/10 animate-ping" />
                      <div className="absolute inset-0 rounded-full border-2 border-zinc-900/5 animate-ping [animation-delay:0.5s]" />
                    </>
                  )}
                </div>
                
                <h2 className="text-3xl font-black text-zinc-900 mb-3 tracking-tight">
                  {liveStatus === 'connecting' 
                    ? (language === 'bn' ? 'সংযুক্ত হচ্ছে...' : 'Connecting...') 
                    : (language === 'bn' ? 'ভয়েস অ্যাসিস্ট্যান্ট' : 'Voice Assistant')}
                </h2>
                <p className="text-zinc-500 mb-12 max-w-xs text-lg">
                  {liveStatus === 'connecting' 
                    ? (language === 'bn' ? 'সুরক্ষিত সংযোগ স্থাপন করা হচ্ছে...' : 'Establishing secure link...') : 
                   isMuted ? (language === 'bn' ? 'মাইক্রোফোন বন্ধ আছে' : "Microphone is muted.") : 
                   (language === 'bn' ? 'আমি শুনছি। কথা বলুন।' : "I'm listening. Speak naturally.")}
                </p>
                
                <div className="flex gap-6">
                  <button 
                    onClick={() => setIsMuted(!isMuted)}
                    className={`p-6 rounded-full transition-all shadow-md ${isMuted ? 'bg-rose-500 text-white' : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200'}`}
                  >
                    {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
                  </button>
                  <button 
                    onClick={stopLiveSession}
                    className="px-12 py-6 bg-zinc-900 text-white hover:bg-zinc-800 rounded-full font-black transition-all shadow-xl uppercase tracking-widest"
                  >
                    {language === 'bn' ? 'সেশন শেষ করুন' : 'End Session'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[90%] md:max-w-[80%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  {msg.image && (
                    <img 
                      src={msg.image} 
                      alt="User upload" 
                      className="rounded-2xl border border-zinc-200 max-h-48 md:max-h-72 object-contain shadow-sm"
                    />
                  )}
                  <div className={`p-4 md:p-5 rounded-2xl md:rounded-3xl ${
                    msg.role === 'user' 
                      ? 'bg-zinc-900 text-white shadow-md' 
                      : 'bg-zinc-50 border border-zinc-100 text-zinc-900 shadow-sm'
                  }`}>
                    <div className="markdown-body">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-3">
                    <span className="text-[9px] text-zinc-400 font-black uppercase tracking-widest">
                      {msg.role === 'user' ? (language === 'bn' ? 'ব্যবহারকারী' : 'User') : (language === 'bn' ? 'বিশেষজ্ঞ এআই' : 'Expert AI')}
                    </span>
                    <span className="text-[9px] text-zinc-300 font-mono">
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-zinc-100 p-5 rounded-3xl flex items-center gap-4 shadow-sm">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-zinc-900 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-zinc-900 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 bg-zinc-900 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
                <span className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">
                  {language === 'bn' ? 'চিন্তা করছি' : 'Thinking'}
                </span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Safety Warning Banner */}
        <div className="bg-zinc-50 border-y border-zinc-100 p-3 flex items-center justify-center gap-3">
          <AlertTriangle className="text-amber-500 w-4 h-4 shrink-0" />
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">
            {language === 'bn' 
              ? 'নিরাপত্তা প্রোটোকল: ওয়্যারিং করার আগে পাওয়ার সংযোগ বিচ্ছিন্ন করুন। PPE ব্যবহার করুন।' 
              : 'Safety Protocol: Disconnect power before wiring. Use PPE.'}
          </p>
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-6 bg-white border-t border-zinc-100 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-col gap-4">
            {selectedImage && (
              <div className="relative w-20 h-20 md:w-24 md:h-24">
                <img src={selectedImage} className="w-full h-full object-cover rounded-2xl border-2 border-zinc-900 shadow-md" />
                <button 
                  onClick={() => setSelectedImage(null)}
                  className="absolute -top-2 -right-2 bg-zinc-900 text-white rounded-full p-1.5 shadow-xl hover:scale-110 transition-transform"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3.5 hover:bg-zinc-50 rounded-2xl text-zinc-400 hover:text-zinc-900 transition-all border border-transparent hover:border-zinc-200"
                  title="Upload Image"
                >
                  <ImageIcon size={20} />
                </button>
                <button 
                  onClick={startCamera}
                  className="p-3.5 hover:bg-zinc-50 rounded-2xl text-zinc-400 hover:text-zinc-900 transition-all border border-transparent hover:border-zinc-200"
                  title="Take Photo"
                >
                  <Camera size={20} />
                </button>
              </div>
              
              <div className="flex-1 relative">
                <input 
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder={language === 'bn' ? "আপনার বার্তা লিখুন..." : "Type your message..."}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 px-6 focus:outline-none focus:border-zinc-900 focus:bg-white transition-all text-sm text-zinc-900 shadow-inner"
                />
              </div>

              <button 
                onClick={handleSend}
                disabled={isLoading || (!input.trim() && !selectedImage)}
                className="p-4 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 disabled:hover:bg-zinc-900 rounded-2xl text-white transition-all shadow-xl active:scale-95"
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Hidden Elements */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImageUpload} 
        accept="image/*" 
        className="hidden" 
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera Modal */}
      <AnimatePresence>
        {isCameraOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-white/95 backdrop-blur-xl flex flex-col items-center justify-center p-4"
          >
            <div className="relative w-full max-w-3xl aspect-video bg-zinc-900 rounded-[2rem] overflow-hidden shadow-2xl border-8 border-white">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 border-[40px] border-black/10 pointer-events-none">
                <div className="w-full h-full border-2 border-white/20 flex items-center justify-center">
                  <div className="w-16 h-16 border-t-4 border-l-4 border-white absolute top-6 left-6 rounded-tl-xl" />
                  <div className="w-16 h-16 border-t-4 border-r-4 border-white absolute top-6 right-6 rounded-tr-xl" />
                  <div className="w-16 h-16 border-b-4 border-l-4 border-white absolute bottom-6 left-6 rounded-bl-xl" />
                  <div className="w-16 h-16 border-b-4 border-r-4 border-white absolute bottom-6 right-6 rounded-br-xl" />
                </div>
              </div>
            </div>
            
            <div className="mt-12 flex gap-8 items-center">
              <button 
                onClick={stopCamera}
                className="p-5 bg-zinc-100 rounded-full text-zinc-900 hover:bg-zinc-200 transition-all shadow-md"
              >
                <X size={28} />
              </button>
              <button 
                onClick={capturePhoto}
                className="p-8 bg-zinc-900 rounded-full text-white hover:bg-zinc-800 transition-all shadow-2xl active:scale-90"
              >
                <Zap size={40} fill="currentColor" />
              </button>
            </div>
            <p className="mt-6 text-zinc-400 font-bold text-xs uppercase tracking-[0.2em]">Align component within frame</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <footer className="flex justify-between items-center px-4 py-2">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">24V DC</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">MODBUS TCP</span>
          </div>
        </div>
        <span className="text-[10px] text-zinc-300 font-bold tracking-widest uppercase">AUTOVEX © 2026</span>
      </footer>
    </div>
  );
}
